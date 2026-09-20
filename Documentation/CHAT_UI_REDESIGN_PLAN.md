# Chat UI Redesign Plan — OpenChamber-style, Engine-Universal (OpenCode + BYOK)

Status: DRAFT · Owner: UI / AI wiring · Target: LSN v1.6.0

## 1. Goal

Redesign the fused Assistant chatbox (`AssistantPanel.tsx`) into an
OpenChamber-style **progressive chat**: turn-grouped messages, a
**part-based** message model (text / reasoning / tool / status rendered as
discrete timeline blocks), a CodeMirror-based composer, and live tool parts
with durations — applied **identically to the OpenCode and BYOK engines**, so
switching engines changes only payload plumbing, never the look.

This is a UX + data-shape project first, and a component-refactor project
second. The single most important design rule is borrowed from OpenChamber's
theme-system skill: **the renderer never branches on engine**; engine facts
(which engine, which model, server state) are data on the message, not
branches in the JSX.

## 2. Why (current state — verified against source)

| Dimension | Today (`AssistantPanel.tsx`, 935 lines) | OpenChamber target |
|---|---|---|
| Message model | `AssistantMessage { id, role, content, timestamp, steps? }` (useStore.ts:141). `steps` is **never populated** by producers; `AgentStepTimeline` re-parses `content` with regex (`parseContentToSteps`, AgentStepTimeline.tsx:289) | Typed `parts` per message: `AssistantTextPart`, `ReasoningPart`, `ToolPart`, `JustificationBlock`; turns grouped via `ProgressiveGroup` |
| Streaming | engines collapse everything to a string: OpenCode recombines text parts only (opencodeClient.ts:232-239, discards tool/reasoning structure); BYOK accumulates text deltas (aiProvider.ts:516-524); tool activity becomes a transient `assistantStatusText` ("🔧 tool · status") | Structured parts stream in-place; tool parts show live `pending → running → completed/error` + duration |
| User messages | plain `<div>` text, left accent border, `whitespace-pre-wrap` (AssistantPanel.tsx:610-616) — no markdown, no bubble | `UserTextPart` bubble with attachments, mentions, truncation |
| Assistant messages | `AgentStepTimeline` pill timeline parsed **after** the turn ends | parts rendered **live in order** as they arrive |
| Composer | plain `<textarea rows={2}>`; left toolbar branches on engine — OpenCode shows a static label, BYOK shows attach + model pill (AssistantPanel.tsx:775-920) | CodeMirror 6 composer, engine-agnostic footer (model controls + context chips + queue chips), slash commands |
| Thread switching | sessions **dropdown** in the header | session **sidebar** (or at least a tab strip) |
| Engine signals | status dot only in OpenCode mode (308-329); "Routed via BYOK fallback" appended into message content (useStore.ts:2364-2367) | per-message engine/model badge; shared StatusRow |
| Tool approval | amber banner, duplicated verbatim in AssistantPanel + AgentPanel | shared `PermissionCard`-style component |
| Tokens | mixed theme vars + hard-coded Tailwind (`emerald/red/amber`) | semantic tokens end-to-end |

## 3. Architecture: one shared model for both engines

### 3.1 Message = ordered `parts[]`

Extend `AssistantMessage` (keep old fields for compatibility):

```ts
export type ChatPartState = "pending" | "running" | "completed" | "error";

export type ChatPart =
  | { kind: "text";      id: string; text: string }
  | { kind: "reasoning"; id: string; text: string; state: ChatPartState; durationMs?: number }
  | { kind: "tool";      id: string; name: string; state: ChatPartState;
       args?: Record<string, unknown>; output?: string; title?: string; durationMs?: number }
  | { kind: "file";      id: string; path: string };   // OpenCode "file" part, optional Phase 2

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;            // kept as the text-only concat (RAG, memory, export, old renderers)
  parts?: ChatPart[];         // NEW — normalized part list; absent on legacy threads
  engine?: "opencode" | "byok";    // NEW — which engine produced this message
  model?: string | null;           // NEW — model label for the badge
  timestamp: string;
  steps?: ExecutionStep[];         // legacy path, unchanged
}
```

Rules that keep this engine-agnostic:

- **`content` stays authoritative for anything non-visual** (Memory-RAG persist, `serializeThread`, Markdown export, copy, legacy `AgentStepTimeline` fallback). New `parts` is strictly a rendering upgrade; it is derived *while streaming* and persisted alongside `content`.
- `serializeThread`/`deserializeThread` (useStore.ts:212-234) serialize the new fields as-is — the existing validator only checks `id/role/content`, so persisted `parts` passes through untouched. **No migration needed**; old threads render via the legacy path.
- `AgentStepTimeline` (and `parseContentToSteps`) is retained **only as the fallback renderer for threads with no `parts`**. New messages never reach it.

### 3.2 Turn grouping

Add a lightweight view-layer turn model (not persisted — derived):

```
Turn = { user: AssistantMessage, assistant: AssistantMessage[] }
```

Continuous `user → assistant` pairs group into turns (mirrors OpenChamber's
`TurnGroupingContext` + `ProgressiveGroup`). Rendering invariant: **render the
current streaming turn's parts in arrival order** — never reorder text behind
tool/reasoning per OpenChamber's rationale (client reordering breaks the model's
intended chronology).

## 4. Engine emit layer — normalize both streams to `parts`

### 4.1 OpenCode (`src/services/opencodeClient.ts`)

`streamOpencodeReply` currently drops `part.type` and folds text parts into
`assistantBuffer`. New behavior:

- Add `onPart: (part: ChatPart) => void` to the options.
- On each `message.part.updated` (opencodeClient.ts:216-249) map by `type`:
  - `text` → text part (still maintains the existing id-keyed accumulation so
    `onChunk` keeps working for legacy callers and the reconnected-aggregate
    logic in `recomputeText` is untouched).
  - `reasoning` → reasoning part with `state` from `part.state` (`running`/`completed`).
  - `tool` → tool part: `{ name: part.tool, callID: part.callID, state: part.state.status, args: part.state.input, output: part.state.output, title: part.state.title }`.
  - `step-start` / `step-finish` → boundary markers the store can use to open/close a tool sub-sequence (optional refinement).
- Keep `onStatusChange`, `onFileEdit` and the settle/reconnect machinery
  (300ms settle, ≤3 reconnects) exactly as-is — those are load-bearing and
  verified (see comments at opencodeClient.ts:176-192).

### 4.2 BYOK (`src/services/aiProvider.ts`)

`streamAIResponse` already has the full tool loop (aiProvider.ts:527-598). Add
structured emit around the existing points:

- text delta → text part (throttled).
- `delta.tool_calls` accumulation → when a tool starts executing
  (`executeWorkspaceTool` at :574), emit a **running** tool part with `name`
  and `args`; when its result resolves, flip it to **completed** with `output`;
  `error` → error state.
- Approval gate interplay: file-write tools suspend in `executeWorkspaceTool`
  — the running tool part naturally shows "waiting for approval" (durations
  keep counting) — the `ApproveGateCard` sits on the composer row, not inline.
- Keep `onToolCall`/`onStatusChange` signatures for any external callers
  (goal orchestrator uses a separate `runGoalLoop` path; see §7).

### 4.3 Store (`sendAssistantMessage`, useStore.ts:2191)

Replace the `onChunk` body-mutation (`:2299-2304` and `:2338-2343`) with a
shared part pipeline:

```
onPart(part) → set(state => update assistantMsg.parts=[...(m.parts ?? []), part]);
               content = parts.filter(text).map(t=>t.text).join("")  // keeps RAG/export in sync
```

Both engine branches converge on the **same** `onPart` handler; the only thing
that differs is how the engine service fills parts. Engine + model get stamped
on the assistant message at creation (`engine: store.settings.assistantEngine`,
dropping `servedBy` footer text at :2364-2367 in favor of `engine: "byok"` +
fallback badge when the OpenCode path fails over).

## 5. Component extraction — the actual redesign

New folder `src/components/chat/`, mirroring OpenChamber's naming. Each file:
selector-based store reads, no new styling language beyond existing Tailwind +
new tokens.

| Component (new) | OpenChamber analog | Replaces / Role |
|---|---|---|
| `chat/ChatContainer.tsx` | `ChatContainer` | scroll container, auto-scroll, empty state (centered logo + title + body line, engine-aware copy but shared shell) |
| `chat/TurnGroup.tsx` | `TurnGroupingContext` + `ProgressiveGroup` | groups `user→assistant[]`, emits turn header (engine badge + model + time) |
| `chat/ChatMessage.tsx` | `ChatMessage`/`MessageBody` | role dispatch: user → `UserTextPart`; assistant → part loop |
| `chat/parts/UserTextPart.tsx` | `UserTextPart` | rounded bubble (card bg + border), markdown, hover copy/timestamp, truncated long bodies |
| `chat/parts/AssistantTextPart.tsx` | `AssistantTextPart` (throttled) | streamed ReactMarkdown **+ `remarkGfm`** (fixes the parity gap — AgentStepTimeline renders GFM-less today), selection actions |
| `chat/parts/ReasoningPart.tsx` | `ReasoningPart` | replaces the `thought` pill: collapsed "Thinking…"/summary preview (strip markdown), expand, duration + streaming cursor |
| `chat/parts/ToolPart.tsx` | `ToolPart` | status chip with `LiveDuration` timer, expandable args/output `<pre>`, error styling; sits on the timeline in arrival order |
| `chat/parts/FilePart.tsx` | `MessageFilesDisplay` | clickable path chip (OpenCode `file` parts) — optional Phase 2 |
| `chat/StatusRow.tsx` | `StatusRow` | replaces the pulsing `assistantStatusText` line: "Working… · current tool · elapsed" |
| `chat/Composer.tsx` | `ChatInput` / `ComposerEditor` | CodeMirror composer — see §6 |
| `chat/ModelControls.tsx` | `ModelControls` | one shared pill for **both** engines: BYOK → provider model dropdown; OpenCode → read-only "OpenCode Agent · <model>" with server state |
| `chat/ApproveGateCard.tsx` | `PermissionCard` | extracted shared approval UI (dedupe AssistantPanel + AgentPanel) |
| `chat/ChatBadge.tsx`, `chat/StatusChip.tsx` | `mountBadge` / `StatusChip` | small primitives: engine badge, status chips, durations |

`AssistantPanel.tsx` shrinks to a **layout shell**: header, engine/options
menus (unchanged behaviour), then `ChatContainer` + `StatusRow` + goal bar
(line 675-763 restyled only) + `Composer`. ~935 → ~250 lines.

## 6. Composer (universal, both engines)

Based on a **CodeMirror 6** textarea upgrade (reuse the existing CodeMirror
setup experience from `MarkdownEditor.tsx` / `markdownLivePreview.ts`).

- **Footer, engine-agnostic left-to-right:** `AttachContext (+)` → context chips
  (the existing `@[file]` token behaviour becomes removable chip rows) →
  `ModelControls` pill (BYOK dropdown **or** OpenCode read-only) →
  right side Send / Stop toggle (existing swap at :891-917).
- OpenCode specifics move **into** `ModelControls` (server status dot,
  "OpenCode Agent · <model>"), never into the composer layout.
- **Queue chips**: if a send happens while streaming, show a pending chip above
  the composer (W-2, OpenChamber queueing) that auto-sends when idle.
- Placeholder stays engine-aware but the shell is one component.
- Slash-command autocomplete (`/goal`, `/perspectives`, `/suggest`) is a
  Phase 4 nicety; the `handleSend`/keydown contract (Enter send, Shift+Enter
  newline) is preserved.

## 7. Goal/orchestrator parity

`runGoalLoop` (agentOrchestrator) has its own `onToolCall` callback and posts
status lines through the existing goal card (`goalRunning && agentRun` bar at
:675-763). **Keep the goal card as its own surface** (Phase 1) — it is a
supervisor view, not a conversation. If it posts assistant messages into the
thread, those messages should get `parts` too (empty `parts` → legacy renderer
is fine). Out of scope unless goal UI is explicitly folded into the chat.

## 8. Theming & tokens

Follow OpenChamber's theme-skill contract — semantic tokens, no new hard-coded
hex:

- Add to `src/themes.ts`/`applyThemeToDocument` + `@theme` in `src/index.css`:
  - `--chat-user-bubble` (subtle card/border shade),
  - `--chat-tool-running` / `--chat-tool-error` / `--chat-tool-ok` (status semantics),
  - `--chat-reasoning-bg`.
  - Map existing hard-coded `emerald/red/amber/sky` status dots to these
    tokens so the engine dots follow active themes.
- Keep existing theme vars (`bg/card/accent/text/muted/border`) as the base;
  new tokens are deltas on top so all 5 themes stay coherent.
- Light theme is out of scope (app is dark-first; tokens default to dark).

## 9. Migration & compatibility

1. **Old persisted threads** (no `parts`): `ChatMessage` sees `parts == null`
   → render via existing `AgentStepTimeline` path. Zero data changes.
2. **`content` maintained throughout**: RAG persist, session context, Markdown
   export, copy-to-clipboard, Navbar/Recents previews all keep working untouched.
3. **Callback signatures**: `streamOpencodeReply` / `streamAIResponse` keep
   `onChunk`/`onToolCall`/`onStatusChange`; `onPart` is additive → `aiProvider.test.ts`
   may stay green; add new part-unit tests rather than rewriting existing ones.
4. **Storage**: no new localStorage keys; `lsn_assistant_threads` mirror and
   `agent_session.context` carry the extended `AssistantMessage` via existing
   JSON path.

## 10. Implementation phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **P1 — Data model** | `ChatPart` union, `AssistantMessage` extension, serialize/validate pass-through, derivation of `content` from text parts | `npx tsc --noEmit` green; old threads still render; existing tests pass untouched |
| **P2 — Emit layer** | `streamOpencodeReply.onPart` (map SSE parts), `streamAIResponse` tool/text parts, store `onPart` pipeline + engine/model stamp + drop fallback footer | identical visual output for a canned prompt in both engines (raw data check: both produce ordered part arrays) |
| **P3 — Components** | New `src/components/chat/*`; `AssistantPanel` shell extraction; `ApproveGateCard` dedupe; GFM markdown parity | chat looks like §5; engine switch changes only the pill/badge, message rendering identical |
| **P4 — Composer & polish** | CodeMirror composer, context chips, model pill universal, queue chips, StatusRow, token polish | parity checklist (§11) passes for both engines |
| **P5 — Optional** | Session sidebar (replaces dropdown), `ToolPart` diff previews, virtualized list, slash commands, selection menu | by sign-off |

Recommended sequence: P1 + P2 land together (one deployable data-shape
change), P3 next (biggest visual win), P4 completes the look.

## 11. Testing & acceptance

- **Existing suites**: `npx tsc --noEmit`, `npm run build`, `npm test`
  (workspaceTools untouched), `cargo test`/`cargo check` (no Rust changes planned).
- **New Vitest** (`src/components/chat/**/*.test.ts` + services):
  - opencode SSE frame → `ChatPart[]` mapping (text/tool/reasoning/status).
  - BYOK delta → part mapping incl. approval-gated tool running→completed.
  - Turn grouping (user + multi-part assistant stays ordered).
  - `content` derivation (text parts concat == legacy string).
  - legacy thread (no parts) still renders (render smoke test).
- **Manual parity checklist** — run the same prompt on both engines and verify
  **identical** visual structure: reasoning pill (collapsed+expand), tool chips
  with live durations, streamed markdown, engine badge (not content footer),
  approval gate, error state, thread resume.

## 12. Files touched (map)

| File | Change |
|---|---|
| `src/stores/useStore.ts` | `ChatPart` + `ChatTextPart`-new fields in `AssistantMessage`; `onPart` pipeline in `sendAssistantMessage`; engine/model stamp; fallback badge vs footer |
| `src/services/opencodeClient.ts` | add `onPart`; map SSE parts; keep all existing callbacks/machinery |
| `src/services/aiProvider.ts` | add structured tool/text part emit around existing loop |
| `src/components/AssistantPanel.tsx` | decompose into shell (header/menus/goal) + `chat/*` |
| `src/components/AgentStepTimeline.tsx` | retained as legacy fallback only |
| `src/components/AgentPanel.tsx` | reuse `chat/ApproveGateCard` |
| `src/components/chat/*` | new components (§5) |
| `src/themes.ts`, `src/index.css` | chat token deltas |
| `src/services/aiProvider.test.ts` | extend (additive) for part mapping |
| `Documentation/AGENT_TOOLS_PLAN.md` | n/a (no tool schema change) |

## 13. Out of scope (backlog)

- Virtualized message list (threads are small today; revisit if large).
- Inline `ToolPart` diff previews (would need a diff-viewer dep; reuse
  `DiffView` for open-in-tab as a stopgap).
- Full session sidebar, multi-run review, image galleries, Mermaid in
  markdown, text-selection menu.
- Light theme.

## 14. Key OpenChamber references (for the implementer)

- `packages/ui/src/components/chat/` — `ChatContainer`, `ChatInput`,
  `composer/editor/ComposerEditor`, `message/MessageBody`,
  `message/parts/{AssistantTextPart,UserTextPart,ToolPart,ReasoningPart,ProgressiveGroup}`,
  `PermissionCard.tsx`.
- Design rules: semantic tokens only; shared Button/Icon primitives; animate
  only `transform`/`opacity`; status colours only for status; hover tokens only
  on interactive elements.
## 15. Implementation status (P1-P4 landed)

- P1 part model, P2 emit layers (OpenCode SSE + BYOK tool loop + store pipeline),
  P3 chat/* component tree + AssistantPanel shell + AgentPanel gate reuse, and
  P4 Composer are implemented and green: 
px tsc --noEmit, 
pm run build,
  and Vitest (95 tests, threads pool) all pass.
- New tests: src/services/opencodeClient.test.ts (SSE -> parts mapping, onFileEdit),
  src/components/chat/{chatUtils,TurnGroup}.test.ts, src/stores/parts.test.ts.
- Notes for future agents:
  - Renderer never branches on engine; boundaries are the parts pipeline
    (sendAssistantMessage -> pplyPart) and engine dot/placeholder only.
  - Legacy gentBuffer/AgentStepTimeline path is retained for old threads
    (no parts); do not remove.
  - onChunk still accumulates reasoning text into the legacy buffer (pre-existing).
  - Vitest default fork pool intermittently times out in sandboxed PowerShell;
    use ".\node_modules\.bin\vitest.cmd run --pool=threads" for local verification.
