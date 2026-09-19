# Fix "OpenCode Not Found" Error (Npm Shadowing Resolution)

## Overview & Cause of Error

The UI error **"OpenCode not found"** occurs when the application checks system PATH for the `opencode` CLI binary by running `opencode --version`. 

Upon technical investigation:
1. **Official SST.opencode IS installed:** The official WinGet package `SST.opencode` (v1.18.21) is installed at `C:\Users\Ghing\AppData\Local\Microsoft\WinGet\Packages\SST.opencode_...`.
2. **Broken npm package is shadowing PATH:** A legacy global npm package (`opencode-ai` / `opencode`) located at `C:\Users\Ghing\AppData\Roaming\npm\opencode` takes precedence in your system `PATH`. When called, it fails with:
   `Program 'opencode.exe' failed to run: The specified executable is not a valid application for this OS platform.`
3. **Detection Failure:** Because the npm shim fails with a platform error code, the app's detection check (`check_opencode_installed`) marks OpenCode as not installed.

---

## User Review Required

> [!NOTE]
> We will remove the broken global npm package (`opencode-ai` / `opencode`) using `npm uninstall -g`. This will allow Windows to resolve `opencode` directly to the valid `SST.opencode` WinGet binary without requiring re-installation of OpenCode.

---

## Open Questions

- None. The root cause is confirmed via PATH examination and direct execution testing of the WinGet executable.

---

## Proposed Plan of Action

### 1. Remove Shadowing Global Npm Executable
- Run `npm uninstall -g opencode-ai opencode` to clean up the broken npm global shims in `C:\Users\Ghing\AppData\Roaming\npm\`.
- If any residual `opencode.cmd` or `opencode.ps1` files remain in `AppData\Roaming\npm\`, remove them.

### 2. Verify System PATH Resolution
- Execute `opencode --version` in PowerShell to confirm it now resolves to `1.18.21` from WinGet.
- Run `cargo test` / `check_opencode_installed` test if needed.

### 3. Verify App UI Status
- In the Local Study Notebook desktop application, click **Recheck** (or re-trigger detection).
- Confirm the warning banner disappears and the OpenCode agent sidecar initializes cleanly.

---

## Verification Plan

### Automated / CLI Verification
- Run `opencode --version` -> Expect output `1.18.21`.
- Run `where.exe opencode` -> Expect only the WinGet path `C:\Users\Ghing\AppData\Local\Microsoft\WinGet\Packages\SST.opencode_...`.

### Manual Verification
- In the desktop application interface, click the **Recheck** button in the Assistant Panel and confirm OpenCode connects.
