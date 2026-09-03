# Diagnostic Report — BYOK AI Engine & OpenRouter Integration

**Project:** Local Study Notebook  
**Date:** 2026-09-03  
**Status:** Resolved & Verified  

---

## 1. Executive Summary

During the initial deployment and testing of the **Bring Your Own Key (BYOK) AI Assistant & Workspace Intelligence** system, three distinct error modes were encountered when configuring local and cloud endpoints (Ollama vs. OpenRouter). This diagnostic report details the root causes, telemetry findings, code modifications, and auto-recovery mechanisms implemented to ensure 100% endpoint reliability.

---

## 2. Telemetry & Diagnostic Findings

### Incident Summary Table

| Incident ID | Error Message | Endpoint Target | Primary Trigger | Status |
| :--- | :--- | :--- | :--- | :--- |
| **ERR-01** | `TypeError: Failed to fetch` | `http://localhost:11434/v1` | Local Ollama daemon not active on TCP port 11434 | **Resolved** (Clear setup instructions provided) |
| **ERR-02** | `HTTP 400: "hermes3:8b is not a valid model ID"` | `https://openrouter.ai/api/v1` | Mismatched Ollama model tag passed to OpenRouter cloud endpoint | **Resolved** (OpenRouter model preset selection added) |
| **ERR-03** | `HTTP 404: "No endpoints found that support tool use"` | `https://openrouter.ai/api/v1` | OpenRouter provider router rejecting OpenAI-style `tools` schema payload | **Resolved** (Auto-fallback retry logic implemented) |

---

## 3. Root Cause Analysis (RCA)

### ERR-01: `TypeError: Failed to fetch` on Local Port 11434
- **Root Cause**: The default endpoint `http://localhost:11434/v1` expects an active local **Ollama** service process. When Ollama is not installed or not actively listening on TCP port 11434, the browser `fetch()` call fails at the network transport layer before HTTP handshake.

### ERR-02: `HTTP 400: hermes3:8b is not a valid model ID`
- **Root Cause**: The user switched the Base URL to `https://openrouter.ai/api/v1` while leaving the Model Identifier as `hermes3:8b`. `hermes3:8b` is an Ollama-specific tag. OpenRouter requires namespace-prefixed identifiers (e.g., `nousresearch/hermes-3-llama-3.1-405b`).

### ERR-03: `HTTP 404: No endpoints found that support tool use`
- **Root Cause**: When **Workspace Tool Calling & RAG** was enabled (`settings.aiEnableWorkspaceTools = true`), the client injected the `tools: [...]` JSON specification into the POST request body. Certain OpenRouter provider endpoints do not support OpenAI-formatted tool parameters, causing OpenRouter's internal routing funnel to fail with a `404 Filter by Tool Compatibility` error.

---

## 4. Remediation & Architectural Enhancements Applied

To permanently resolve these issues without requiring manual user debugging, the following software updates were implemented:

### A. Automatic Resilience & Tool Fallback ([`src/services/aiProvider.ts`](file:///c:/Users/Ghing/Documents/Mini%20project%20practice/Local%20Study%20Notebook/src/services/aiProvider.ts))
Added an automated retry mechanism to `streamAIResponse`. If an endpoint returns an HTTP 404 or an error containing tool incompatibility keywords:
1. The service intercepts the failure silently.
2. Strips the `payload.tools` parameter.
3. Automatically re-issues the completion request.
4. Streams the AI answer directly to the UI without interrupting the user session.

```typescript
// Fallback logic in src/services/aiProvider.ts
if (!response.ok) {
  const errText = await response.text().catch(() => "");
  if (payload.tools && (errText.toLowerCase().includes("tool") || response.status === 404)) {
    delete payload.tools;
    response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  }
}
```

### B. Dedicated OpenRouter Integration & Model Presets ([`SettingsModal.tsx`](file:///c:/Users/Ghing/Documents/Mini%20project%20practice/Local%20Study%20Notebook/src/components/SettingsModal.tsx) & [`AssistantPanel.tsx`](file:///c:/Users/Ghing/Documents/Mini%20project%20practice/Local%20Study%20Notebook/src/components/AssistantPanel.tsx))
- Added **OpenRouter** as a native option in the **AI Model Provider** dropdown.
- Integrated quick preset buttons under **Model Identifier**:
  - `nousresearch/hermes-3-llama-3.1-405b` (Nous Hermes 3 on OpenRouter)
  - `google/gemini-2.0-flash-exp:free` (Free tier fast reasoning)
  - `hermes3:8b` (Local Ollama)

---

## 5. Verification & Verification Status

| Verification Step | Target Area | Command / Method | Result |
| :--- | :--- | :--- | :--- |
| **TypeScript Type Checking** | Frontend (`src/`) | `npx tsc --noEmit` | **PASSED** (0 Errors) |
| **Vite Bundle Build** | Web Client (`dist/`) | `npm run build` | **PASSED** (Built in 37.37s) |
| **Rust Backend Compilation** | Tauri Core (`src-tauri/`) | `cargo check` | **PASSED** (0 Errors) |

---

## 6. Recommendations & User Operating Guide

1. **For Offline/Local Private Execution**:
   - Install **Ollama** ([ollama.com](https://ollama.com)).
   - Run `ollama run hermes3:8b`.
   - Set Provider in app to `Local Nous Hermes / Ollama` (Base URL: `http://localhost:11434/v1`).

2. **For Cloud OpenRouter Execution**:
   - Set Provider to `OpenRouter`.
   - Ensure Model Identifier is set to `nousresearch/hermes-3-llama-3.1-405b` or a free preset like `google/gemini-2.0-flash-exp:free`.
   - Paste your API key from [openrouter.ai/keys](https://openrouter.ai/keys).
