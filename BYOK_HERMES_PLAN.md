# BYOK (Bring Your Own Key / Endpoint) Server & Hermes Workspace Intelligence Plan

An architectural and implementation specification for integrating a **BYOK (Bring Your Own Key / Bring Your Own Endpoint) AI Engine** into **Local Study Notebook**, supporting models like **Nous Hermes 3** (via Ollama, vLLM, LM Studio, or custom OpenAI-compatible endpoints) alongside cloud providers (OpenAI, Anthropic, Gemini, OpenRouter).

---

## Executive Summary & Analysis

### Would the workspace become smarter along with Hermes + BYOK AI model?

**Yes, significantly.** Combining a BYOK model (such as Nous Hermes) with the app's local workspace index dramatically improves application intelligence across four core dimensions:

1. **Structured Tool & Function Calling (Hermes Core Strength)**:
   - *Nous Hermes 3* and modern agentic models excel at multi-step function calling.
   - When provided with workspace tools (`search_vault`, `get_note_content`, `get_backlinks`, `create_summary_note`), Hermes can dynamically query notes, follow wiki-links (`[[Note]]`), and produce multi-note syntheses automatically.

2. **Context-Aware Retrieval (RAG via `vault_index.db`)**:
   - The app's SQLite `vault_index.db` (file hashes, backlinks, outgoing links, and FTS5 search) serves as a localized knowledge graph.
   - BYOK integration injects relevant note snippets directly into prompt payloads, grounding answers in actual user study notes rather than generic LLM hallucinations.

3. **100% Data Privacy & Zero Latency (Local Hermes / Ollama)**:
   - Running Hermes locally via BYOK (e.g. `http://localhost:11434/v1`) ensures that sensitive notes and study materials never leave the user's machine during inference.

4. **Model Flexibility & Cost Efficiency**:
   - Users select their preferred provider: offline open-weights (Hermes 3, Qwen 2.5) for private study sessions vs. frontier models (Claude 3.7 / GPT-4o) for high-reasoning tasks.

---

## Architecture Overview

```
+-----------------------------------------------------------------------+
|                         Local Study Notebook                          |
|                                                                       |
|  +---------------------+      +------------------------------------+  |
|  |   Assistant UI      | ---> |       Unified AI Provider          |  |
|  | (AssistantPanel.tsx)|      |    (OpenAI / Hermes / Anthropic)   |  |
|  +---------------------+      +------------------------------------+  |
|             |                                   |                     |
|             v                                   v                     |
|  +---------------------+              +-------------------+           |
|  | Workspace Tools     |              | BYOK Config Store |           |
|  | - search_vault      |              | - Base URL        |           |
|  | - read_active_note  |              | - API Key         |           |
|  | - get_backlinks     |              | - Model Name      |           |
|  +---------------------+              +-------------------+           |
|             |                                   |                     |
|             +-----------------+-----------------+                     |
|                               |                                       |
+-------------------------------|---------------------------------------+
                                v
               +----------------------------------+
               | External / Local AI Endpoint     |
               | - Ollama (hermes3:8b)            |
               | - vLLM / LM Studio / Custom      |
               | - OpenAI / Anthropic / Gemini    |
               +----------------------------------+
```

---

## Implementation Plan Breakdown

### Phase 1: BYOK Settings & Secure Storage

Add dedicated AI settings to the app's persistent state and configuration interface.

- **Storage state** (`aiConfig` in `useStore.ts`):
  - `aiEnabled`: toggle assistant features ON/OFF.
  - `aiProvider`: Provider selection (`ollama_hermes`, `openai`, `anthropic`, `gemini`, `custom`).
  - `aiBaseUrl`: Endpoint URL (default `http://localhost:11434/v1` for local Hermes).
  - `aiApiKey`: API key for cloud or authenticated endpoints.
  - `aiModelName`: Target model identifier (e.g. `hermes3:8b`, `gpt-4o-mini`).
  - `aiEnableWorkspaceTools`: Enable function calling access to `vault_index.db`.
  - `aiSystemPrompt`: Customized system prompt instructions.

- **UI Option in Settings Modal** (`SettingsModal.tsx`):
  - New tab: **AI & BYOK Model**.
  - Provider selector dropdown, masked key input, Base URL preset helpers, tool calling toggles, and connection health test button.

### Phase 2: Unified LLM Client Service

- **Streaming HTTP Handler** (`src/services/aiProvider.ts`):
  - Standardized Server-Sent Events (SSE) streaming reader.
  - Support for OpenAI-compatible `/v1/chat/completions` API format (natively supported by Ollama, vLLM, LM Studio, and Hermes proxies).
  - Stream live character-by-character tokens to `AssistantPanel.tsx`.

### Phase 3: Workspace Tool Suite (Hermes Agent Infrastructure)

- **Tool Definition Schemas** (`src/services/workspaceTools.ts`):
  - `search_vault(query: string)`: Searches local markdown notes in `vault_index.db`.
  - `read_current_note()`: Reads full markdown of the active tab.
  - `get_note_backlinks(note_path: string)`: Queries `links` table for incoming and outgoing connections.

- **Rust Backend Commands** (`src-tauri/src/commands.rs`):
  - SQLite context extraction helper for efficient index lookup.

### Phase 4: UI & Streaming Integration

- **Assistant Panel** (`AssistantPanel.tsx`):
  - Displays streaming tokens, active tool calls, and model indicator badges (`Hermes 3 (Local)` vs `Claude`).
  - Allows context attachment (`@[Note Title]`, `@folder/workspace`).

---

## Verification Plan

### Automated Tests
1. `npx tsc --noEmit` (TypeScript type correctness)
2. `npm run build` (Production Vite bundle compilation)
3. `cargo check` (Rust backend compilation)

### Manual Verification
1. Open **Settings -> AI & BYOK Model**, configure local Ollama endpoint (`http://localhost:11434/v1` with model `hermes3:8b`).
2. Test connection status.
3. Open **Assistant Panel**, send a study prompt attached with active note context, and observe real-time streaming response and tool calling.
