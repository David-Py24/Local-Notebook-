// Google Drive backup (BACKUP-0): OAuth 2.0 (PKCE) + Drive API client + token vault.
//
// Security model (per GOOGLE_DRIVE_BACKUP_PLAN.md):
// - Scope is `drive.file` (least privilege: only files this app creates) + OpenID profile/email.
// - Refresh token lives ONLY in the OS Credential Manager (keyring crate); never in SQLite
//   or localStorage. Short-lived access token is in-memory only.
// - The consent flow uses a loopback OAuth callback (PKCE with S256) so no deep-link /
//   registry changes are needed on Windows and dev vs. release behave identically.
// - No client secret: desktop (installed-app) OAuth uses a public client + PKCE.
//
// All commands are synchronous on purpose — `tiny_http::Server::recv()` (loopback loop) is
// blocking, and Tauri runs sync commands on a separate blocking thread pool.

use base64::Engine;
use rand::RngCore;
use serde::{Deserialize, Serialize};

/// OAuth client ID for the Local Study Notebook "desktop app" client type
/// (installed-app, public client), created in the Google Cloud Console.
/// Replace before shipping a real release.
const GOOGLE_CLIENT_ID: &str = "REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REVOKE_URL: &str = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL: &str = "https://openidconnect.googleapis.com/v1/userinfo";
const KEYRING_SERVICE: &str = "com.localstudynotebook.app.drive";
const KEYRING_USER: &str = "default";
const SCOPE: &str = "https://www.googleapis.com/auth/drive.file openid email profile";
/// How long the consent flow waits for the browser callback before giving up.
const CONSENT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

/// Account identity returned to the frontend. No tokens cross the command boundary.
#[derive(Debug, Clone, Serialize)]
pub struct GoogleAccount {
    pub name: String,
    pub email: String,
}

/// Signed-in account + a short-lived in-memory access token (never persisted).
struct DriveSession {
    access_token: String,
    refresh_token: String,
    account: GoogleAccount,
}

#[derive(Default)]
pub struct DriveState {
    session: std::sync::Mutex<Option<DriveSession>>,
}

fn load_refresh_token() -> Result<String, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|e| e.get_password())
        .map_err(|e| e.to_string())
}

fn store_refresh_token(refresh: &str) -> Result<(), String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|e| e.set_password(refresh))
        .map_err(|e| e.to_string())
}

fn erase_refresh_token() -> Result<(), String> {
    match keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|e| e.delete_credential())
    {
        Ok(()) => Ok(()),
        // No stored credential is the same as already signed out.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(keyring::Error::NoStorageAccess(_)) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct UserInfo {
    name: Option<String>,
    email: Option<String>,
}

#[derive(Deserialize)]
struct OAuthErrorBody {
    error: Option<String>,
    error_description: Option<String>,
}

fn loopback_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/")
}

/// Exchange an auth code for tokens (PKCE). Returns (access, refresh, id_token).
fn exchange_code(code: &str, code_verifier: &str, port: u16) -> Result<(String, String, String), String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .post(TOKEN_URL)
        .form(&[
            ("code", code),
            ("client_id", GOOGLE_CLIENT_ID),
            ("code_verifier", code_verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", loopback_uri(port).as_str()),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        let body: OAuthErrorBody = serde_json::from_str(&text).unwrap_or(OAuthErrorBody {
            error: None,
            error_description: None,
        });
        let msg = body
            .error_description
            .or(body.error)
            .unwrap_or_else(|| "unknown token endpoint error".into());
        return Err(format!("Token exchange failed ({status}): {msg}"));
    }
    let token: TokenResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let refresh = token
        .refresh_token
        .ok_or_else(|| "Google did not return a refresh token".to_string())?;
    Ok((token.access_token, refresh, token.id_token.unwrap_or_default()))
}

fn refresh_access_token(refresh_token: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .post(TOKEN_URL)
        .form(&[
            ("refresh_token", refresh_token),
            ("client_id", GOOGLE_CLIENT_ID),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Token refresh failed ({status}): {text}"));
    }
    let token: TokenResponse = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(token.access_token)
}

/// Derive account identity from the id_token (JWT) claims, falling back to the userinfo
/// endpoint. The id_token was just obtained over TLS directly from Google's token endpoint,
/// so we only read its name/email claims for display and do not verify the signature.
fn account_from_id_token(id_token: &str, access_token: &str) -> Result<GoogleAccount, String> {
    let mut name: Option<String> = None;
    let mut email: Option<String> = None;

    if let Some(payload) = id_token.split('.').nth(1) {
        use base64::engine::general_purpose::URL_SAFE_NO_PAD;
        if let Ok(decoded) = URL_SAFE_NO_PAD.decode(payload.as_bytes()) {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                name = json.get("name").and_then(|v| v.as_str()).map(String::from);
                email = json.get("email").and_then(|v| v.as_str()).map(String::from);
            }
        }
    }

    if name.is_none() || email.is_none() {
        let client = reqwest::blocking::Client::new();
        if let Ok(resp) = client.get(USERINFO_URL).bearer_auth(access_token).send() {
            if let Ok(ui) = resp.json::<UserInfo>() {
                name = name.or(ui.name);
                email = email.or(ui.email);
            }
        }
    }

    Ok(GoogleAccount {
        name: name.unwrap_or_else(|| "Google User".into()),
        email: email.unwrap_or_else(|| "unknown@google.com".into()),
    })
}

/// Decode a urlsafe-base64 PKCE verifier/challenge without padding.
fn b64url(data: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

/// Open a URL in the OS default browser.
fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(url).spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(url).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ok_html(message: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    tiny_http::Response::from_string(format!(
        "<html><body style=\"font-family:sans-serif;padding:24px;color:#1f2937\"><h2 style=\"font-size:18px\">{message}</h2></body></html>"
    ))
    .with_header(
        tiny_http::Header::from_bytes(b"content-type", b"text/html; charset=utf-8").unwrap(),
    )
}

/// Run the consent flow. Blocks until the browser hits the loopback callback (or 5 min passes).
fn run_consent_flow(state: &DriveState) -> Result<GoogleAccount, String> {
    // PKE verifier: 32 random bytes, urlsafe-base64 (43 chars) — RFC 7636 compliant.
    let mut verifier_bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut verifier_bytes);
    let code_verifier = b64url(&verifier_bytes);

    use sha2::{Digest, Sha256};
    let code_challenge = b64url(&Sha256::digest(code_verifier.as_bytes()));

    let mut state_bytes = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut state_bytes);
    let state_token = b64url(&state_bytes);

    // Loopback listener on an ephemeral port, so we know the redirect URI before the browser opens.
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "Failed to get loopback port".to_string())?;

    let consent_url = format!(
        "{AUTH_URL}?{}",
        url::form_urlencoded::Serializer::new(String::new())
            .append_pair("client_id", GOOGLE_CLIENT_ID)
            .append_pair("redirect_uri", &loopback_uri(port))
            .append_pair("response_type", "code")
            .append_pair("scope", SCOPE)
            .append_pair("state", &state_token)
            .append_pair("code_challenge", &code_challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent")
            .finish()
    );

    open_in_browser(&consent_url)?;

    // Block until the browser redirects back to our loopback URI.
    let request = server
        .recv_timeout(CONSENT_TIMEOUT)
        .map_err(|e| format!("Sign-in timed out or failed: {e}"))?
        .ok_or_else(|| "Sign-in timed out after 5 minutes".to_string())?;

    let raw_url = request.url().to_string();
    let callback = format!("http://127.0.0.1:{port}{raw_url}");
    let parsed = url::Url::parse(&callback).map_err(|e| e.to_string())?;
    let query: std::collections::HashMap<String, String> = parsed.query_pairs().into_owned().collect();

    let _ = request.respond(ok_html("Success! Local Study Notebook is connected to Google Drive. You can close this tab."));

    if query.get("state").map(String::as_str) != Some(state_token.as_str()) {
        return Err("OAuth state mismatch (CSRF check failed)".into());
    }
    if let Some(error) = query.get("error") {
        return Err(format!("Google sign-in error: {error}"));
    }
    let code = query
        .get("code")
        .cloned()
        .ok_or_else(|| "No authorization code returned by Google".to_string())?;

    let (access, refresh, id_token) = exchange_code(&code, &code_verifier, port)?;
    store_refresh_token(&refresh)?;

    let account = account_from_id_token(&id_token, &access)?;

    *state.session.lock().unwrap() = Some(DriveSession {
        access_token: access,
        refresh_token: refresh,
        account: account.clone(),
    });
    Ok(account)
}

/// Ensure a valid in-memory access token exists (initiating from a stored refresh token if
/// the app just restarted). Returns the access token.
fn ensure_access_token(state: &DriveState) -> Result<String, String> {
    if let Some(s) = state.session.lock().unwrap().as_ref() {
        return Ok(s.access_token.clone());
    }
    let refresh = match load_refresh_token() {
        Ok(rt) if !rt.is_empty() => rt,
        _ => return Err("Not signed in to Google Drive".into()),
    };
    let access = refresh_access_token(&refresh)?;
    let account = account_from_id_token("", &access)?;
    *state.session.lock().unwrap() = Some(DriveSession {
        access_token: access.clone(),
        refresh_token: refresh,
        account,
    });
    Ok(access)
}

// ---------------------------------------------------------------------------
// Public #[tauri::command] surface
// ---------------------------------------------------------------------------

/// Returns the currently signed-in Google account, or None if not signed in.
#[tauri::command]
pub fn google_account(state: tauri::State<'_, DriveState>) -> Result<Option<GoogleAccount>, String> {
    let _ = ensure_access_token(&state);
    Ok(state.session.lock().unwrap().as_ref().map(|s| s.account.clone()))
}

/// Starts the OAuth consent flow, opens the browser, and returns the signed-in account.
#[tauri::command]
pub fn google_sign_in(state: tauri::State<'_, DriveState>) -> Result<GoogleAccount, String> {
    run_consent_flow(&state)
}

/// Clears the signed-in account and revokes the stored refresh token at Google.
#[tauri::command]
pub fn google_sign_out(state: tauri::State<'_, DriveState>) -> Result<(), String> {
    let refresh = state
        .session
        .lock()
        .unwrap()
        .take()
        .map(|s| s.refresh_token)
        .or_else(|| load_refresh_token().ok());
    if let Some(rt) = refresh {
        let _ = reqwest::blocking::Client::new()
            .post(REVOKE_URL)
            .form(&[("token", rt)])
            .send();
    }
    erase_refresh_token()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_verifier_is_rfc7636_compliant() {
        let mut bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        let verifier = b64url(&bytes);
        assert_eq!(verifier.len(), 43, "PKCE verifier must be 43 chars from 32 random bytes");
        let valid_chars = verifier
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '~'));
        assert!(valid_chars, "verifier contains invalid PKCE chars: {verifier}");
    }

    #[test]
    fn loopback_uri_is_localhost_only() {
        let uri = loopback_uri(47832);
        assert_eq!(uri, "http://127.0.0.1:47832/");
    }
}