# All Written Files - Local Study Notebook

Auto-compiled single-file reference containing every source file authored for this
project (Tauri v2 + React + TypeScript + SQLite). Generated from the working tree on 2026-09-09 05:38:37.

> Note: this is a snapshot document, not a build input. Edits here do not affect the
> app; edit the real files under src/ / src-tauri/ instead.

## Table of Contents

- [`CLAUDE.md`](#claudemd)
- [`CHANGELOG.md`](#changelogmd)
- [`package.json`](#packagejson)
- [`tsconfig.json`](#tsconfigjson)
- [`.gitignore`](#gitignore)
- [`src-tauri\tauri.conf.json`](#src-tauritauriconfjson)
- [`src-tauri\capabilities\default.json`](#src-tauricapabilitiesdefaultjson)
- [`src-tauri\src\lib.rs`](#src-taurisrclibrs)
- [`src-tauri\src\commands.rs`](#src-taurisrccommandsrs)
- [`src-tauri\src\db.rs`](#src-taurisrcdbrs)
- [`src-tauri\src\mcp.rs`](#src-taurisrcmcprs)
- [`src-tauri\src\embeddings.rs`](#src-taurisrcembeddingsrs)
- [`src-tauri\src\drive.rs`](#src-taurisrcdrivers)
- [`src-tauri\src\chunks.rs`](#src-taurisrcchunksrs)
- [`src-tauri\src\main.rs`](#src-taurisrcmainrs)
- [`src\main.tsx`](#srcmaintsx)
- [`src\App.tsx`](#srcapptsx)
- [`src\index.css`](#srcindexcss)
- [`src\themes.ts`](#srcthemests)
- [`src\types\index.ts`](#srctypesindexts)
- [`src\stores\useStore.ts`](#srcstoresusestorets)
- [`src\services\aiProvider.ts`](#srcservicesaiproviderts)
- [`src\services\providerPresets.ts`](#srcservicesproviderpresetsts)
- [`src\services\agentKnowledge.ts`](#srcservicesagentknowledgets)
- [`src\services\workspaceTools.ts`](#srcservicesworkspacetoolsts)
- [`src\components\Layout.tsx`](#srccomponentslayouttsx)
- [`src\components\Navbar.tsx`](#srccomponentsnavbartsx)
- [`src\components\SourcesPanel.tsx`](#srccomponentssourcespaneltsx)
- [`src\components\StudyBoard.tsx`](#srccomponentsstudyboardtsx)
- [`src\components\TopBar.tsx`](#srccomponentstopbartsx)
- [`src\components\WorkspaceLauncherModal.tsx`](#srccomponentsworkspacelaunchermodaltsx)
- [`src\components\WelcomeOnboarding.tsx`](#srccomponentswelcomeonboardingtsx)
- [`src\components\SettingsModal.tsx`](#srccomponentssettingsmodaltsx)
- [`src\components\ProjectsModal.tsx`](#srccomponentsprojectsmodaltsx)
- [`src\components\PanelLayoutModal.tsx`](#srccomponentspanellayoutmodaltsx)
- [`src\components\AssistantPanel.tsx`](#srccomponentsassistantpaneltsx)
- [`src\components\AgentPanel.tsx`](#srccomponentsagentpaneltsx)
- [`src\components\ArtifactsPanel.tsx`](#srccomponentsartifactspaneltsx)
- [`src\components\BacklinksPanel.tsx`](#srccomponentsbacklinkspaneltsx)
- [`src\components\EditorContextMenu.tsx`](#srccomponentseditorcontextmenutsx)
- [`src\components\MoveConfirmModal.tsx`](#srccomponentsmoveconfirmmodaltsx)
- [`src\components\MarkdownEditor.tsx`](#srccomponentsmarkdowneditortsx)
- [`src\components\markdownLivePreview.ts`](#srccomponentsmarkdownlivepreviewts)
- [`src\components\markdownListContinuation.ts`](#srccomponentsmarkdownlistcontinuationts)
- [`src\components\EdgeResizer.tsx`](#srccomponentsedgeresizertsx)
- [`src\components\PanelDragHandle.tsx`](#srccomponentspaneldraghandletsx)
- [`src\components\OpenCodeView.tsx`](#srccomponentsopencodeviewtsx)

## `CLAUDE.md`

```markdown
# CLAUDE.md

This file provides guidance to AI coding agents (Claude Code, opencode, etc.) working in the Local Study Notebook repository.

## What this project is

An Obsidian-style, local-first **study notebook** desktop app built with **Tauri v2** + **React** + **TypeScript** + **Vite** + **SQLite**. Users browse local folders as "vaults", read sources, take Markdown notes in a split/continuous editor, manage projects, and customize appearance with persistent dark themes.

The whole app talks to local files via Rust commands; user data (notes, links) lives in a SQLite DB in the app-data directory. Everything is local — there is no server.

## Tech stack / key files

- **Frontend** (`src/`): React 19 + Zustand 5 + Tailwind CSS 4 (`@tailwindcss/vite`) + `react-markdown`.
- **Desktop shell** (`src-tauri/`): Tauri v2 (Rust). Plugins: `tauri-plugin-dialog`, `tauri-plugin-fs`.
- **Build tooling**: Vite 6 + TypeScript 5.8.
- **State**: Single Zustand store in `src/stores/useStore.ts`.

### Frontend structure
- `src/main.tsx` — React entry point.
- `src/App.tsx` — root component; runs explorer refresh + global `reduce-motion` class toggle.
- `src/components/` — UI components:
  - `Layout.tsx` — top-level flex layout: `Navbar` + optional `AssistantPanel` + optional `SourcesPanel` + `StudyBoard` + resizers + modals.
  - `Navbar.tsx` — far-left icon rail (sources toggle, projects, new note, settings).
  - `SourcesPanel.tsx` — file/folder explorer (tree, filter, right-click context menu, New File/Folder).
  - `StudyBoard.tsx` — the split Markdown editor/preview pane.
  - `TopBar.tsx` — per-panel action bar.
  - `SettingsModal.tsx` — settings (tabbed sidebar layout).
  - `ProjectsModal.tsx` — project switcher.
  - `WorkspaceLauncherModal.tsx`, `PanelLayoutModal.tsx`, `AssistantPanel.tsx`, `Resizer.tsx`.
- `src/stores/useStore.ts` — the single Zustand store holding **all** app state and actions.
- `src/themes.ts` — dark theme definitions + `applyThemeToDocument()` (live CSS-var application).
- `src/types/index.ts` — shared TS types (including `Project`, `FileEntry`, `Tab`, settings types).
- `src/index.css` — Tailwind v4 entry + base theme CSS variables (`--color-bg` etc.).
- `src-tauri/src/` — Rust backend:
  - `lib.rs` — Tauri setup, DB init, `invoke_handler` registration.
  - `commands.rs` — all Tauri commands (notes/sources + local file CRUD).
  - `db.rs` — SQLite (`rusqlite`) connection/state.
  - `parsers.rs` — note/content parsing helpers.

## Commands (build / run)

Run from the project root:

```powershell
# Frontend dev server (HMR only, no Tauri window)
npm run dev

# Full desktop dev app (spawns a Tauri window)
npm run tauri dev

# Type-check + build the frontend bundle into dist/
npm run build

# Build installer bundles (NSIS + MSI) — slow; releases land under src-tauri/target/release/bundle/
npm run tauri build
```

## Requirements & conventions

- **Frontend build**: `npm run build` runs `tsc && vite build`. Run `npx tsc --noEmit` to type-check only. Keep it green before committing.
- **Rust backend check**: `cargo check` inside `src-tauri/`.
- **Shell is Windows PowerShell** — `grep` is not available; use `Select-String` (PowerShell) or the grep tool. Prefer backtick (`` ` ``) escaping over `&&` (not supported).
- **No comments in code unless requested.** Follow existing patterns (Zustand actions, Tauri `#[tauri::command]` with `Result<T, String>`, PascalCase components).

## Architecture / data flow (important)

- **All React state lives in the single Zustand store** (`useStore.ts`). Components read reactive slices via selectors like `useStore((s) => s.x)` and call actions (`useStore((s) => s.action)`).
- **Two persistence layers**:
  1. **SQLite DB** (notes + sources) — managed in Rust via `DbState` (`db.rs`), accessed through `#[tauri::command]`s registered in `lib.rs`. DB file and an app-data folder live in `%APPDATA%\com.localstudynotebook.app`.
  2. **localStorage** on the frontend — app settings (`lsn_settings`), themes, pinned vault paths (`lsn_pinned`), and projects (`lsn_projects`).
- **Local file vault** (the "explorer") is read/written through Rust commands in `commands.rs`:
  - Read: `read_local_dir`, `read_local_file`
  - Write: `write_local_file`, `create_local_file`, `create_local_dir`, `rename_local_entry`, `delete_local_entry
  - `
- **Note editing model**: the Study Board editor auto-saves on debounce. The note title is derived from the first heading (`# Title`). Editing a **source** creates an editable copy as a note (`copy_source_to_note`) — the original source is never modified.
- **Projects** are a frontend/localStorage concept that map a named `Project` (id, name, path, pinned?, lastOpened) onto the existing vault-folder model. Opening a project calls the existing `openFolder` flow.

## Tauri permissions/capabilities

Tauri v2 uses a capability file, `src-tauri/capabilities/default.json`. It currently grants:
- `core:default`
- `dialog:allow-open`, `dialog:allow-save`, `dialog:default` (folder/file pickers)

If you add a new Tauri plugin or native command that needs new permission scopes, update this file (and re-run the build). Quote-relative/`requireLiteralLeadingDot` behavior has affected the fs plugin in the past — verify dialog/fs permissions when debugging related issues.

## Common workflows / gotchas

- **Adding a Rust command**: implement `pub fn ... -> Result<T, String>` in `commands.rs`, register it in the `tauri::generate_handler![...]` list in `lib.rs`, then call it from the store via `invoke<T>("command_name", { args })`.
- **Adding state**: extend the store interface + initial state + an action in `useStore.ts`. Persist via `localStorage.setItem(...)`.
- **Changing a dark theme**: edit `src/themes.ts` (the five presets: Obsidian Dark default, Midnight Blue, Nord Dark, Dracula Dark, Tokyo Night). Themes apply live and persist via `applyThemeToDocument()`.
- **Rebuild traps**: a running dev/release instance will lock Rust build outputs (`os error 32`). Terminate `local-study-notebook.exe` (e.g. `Stop-Process -Id <pid> -Force`) before `tauri build`. A stale Vite/esbuild transform can cause a phantom "Expected ')' but found end of file"; delete `dist/` and rebuild if it recurs.
- **Version bump**: keep `src-tauri/tauri.conf.json` `"version"`, the About section in `SettingsModal.tsx`, and `CHANGELOG.md` in sync.

## Testing

There is no dedicated test framework configured. Rely on:
1. `npx tsc --noEmit` (frontend type-check),
2. `npm run build` (production frontend build),
3. `cargo check` in `src-tauri` (Rust),
4. A manual smoke test: launch the release exe and verify it runs without panicking and initializes the DB.
```


## `CHANGELOG.md`

```markdown
# Changelog

All notable changes to the Local Study Notebook are documented in this file.

## [1.4.0] - 2026-09-04

### Added
- **AI Agent Panel** (`AgentPanel.tsx`): dedicated panel for AI agent interactions.
- **Artifacts Panel** (`ArtifactsPanel.tsx`): view and manage AI-generated artifacts.
- **Editor Context Menu** (`EditorContextMenu.tsx`): right-click context menu in the markdown editor for quick formatting actions.
- **Move Confirm Modal** (`MoveConfirmModal.tsx`): confirmation dialog when moving files between folders.
- **Edge Resizer** (`EdgeResizer.tsx`): draggable edge component for panel resizing.
- **Provider Presets** (`providerPresets.ts`): pre-configured AI provider settings for common services.

### Changed
- **SourcesPanel**: significantly expanded with richer file/folder management and context menu support.
- **StudyBoard**: major expansion with improved editor integration and note handling.
- **WelcomeOnboarding**: expanded onboarding flow with additional guidance.
- **AssistantPanel**: refactored and improved AI assistant integration.
- **Layout**: restructured panel layout with improved resizer behavior.
- **TopBar**: updated action bar with new controls.
- **Navbar**: added new navigation items.
- **SettingsModal**: updated with new settings sections.

### Improved
- AI provider service hardened with provider presets and better error handling.
- Zustand store extended with new state slices and actions for expanded functionality.

### Documentation
- Added OpenRouter hardening report.
- Added sources table SQL schema reference.

---

## [1.3.0] - 2026-09-03

### Added
- **OpenCode Agent tab**: a new, opt-in "🤖 OpenCode Agent" mode alongside the existing Study Assistant chat, for agentic coding/file-editing/shell/git tasks powered by [OpenCode](https://opencode.ai). Spawns `opencode serve` as a local sidecar scoped to the current vault, authenticated with a random per-session password (`OPENCODE_SERVER_PASSWORD`, held only in memory) that is never written to disk. Your existing BYOK API key is injected into the sidecar's environment under OpenCode's own provider variable names (e.g. `GOOGLE_GENERATIVE_AI_API_KEY` for Gemini) — never duplicated into any OpenCode config file. Tool activity (file edits, shell commands) streams live via Server-Sent Events and automatically triggers a vault reindex so the file explorer stays in sync with changes the agent makes directly on disk.
- New Settings → AI & BYOK → **OpenCode Agent** section: install detection with platform-correct instructions, server port, and an auto-start toggle.

### Fixed
- **BYOK connection errors were shown as raw JSON dumps** (e.g. OpenRouter 402 "insufficient credits") instead of a readable message; provider errors are now parsed and given status-specific guidance (401/402/429).
- **"Test Connection: Successful!" was a false positive**: it only checked the public, keyless `/models` endpoint, so it reported success even with an invalid API key. It now also probes `/chat/completions` with the configured model.
- **Google Gemini connections were broken by two compounding bugs**: the default Base URL pointed at Gemini's native API (which has no `/chat/completions` route) instead of its OpenAI-compatibility endpoint, and the default model (`gemini-1.5-flash`) had been fully retired by Google. Both defaults are corrected, and a pre-flight check now catches a native Gemini URL before making a doomed request.
- **Gemini 3.x tool-calling failed with "Function call is missing a thought_signature"**: recognized as a known tool-support incompatibility and now falls back to a non-tool request — and that fallback now also strips leftover tool-call artifacts from the conversation *history*, not just the current request, since a poisoned earlier turn was continuing to trigger the same error on retry.
- **A successful-but-empty AI response** (e.g. silently blocked by a safety filter) now shows an explanatory message instead of leaving the chat bubble blank.
- Retired the default Anthropic model (`claude-3-5-sonnet-20241022`) in favor of a current one.

## [1.2.5] - 2026-09-02

### Fixed
- **Found the actual root cause of the missing `latest.json`** (1.2.1 through 1.2.4 were all chasing red herrings — MSI/NSIS target ambiguity, `tauri-action`'s version — neither was it): Tauri v2 requires an explicit opt-in, `bundle.createUpdaterArtifacts: true` in `tauri.conf.json`, to generate signed update packages and `.sig` files at all. It defaults to `false`. Without it, `tauri build` produces installers normally but never creates any updater signature — which is exactly why `tauri-action` correctly reported "Signature not found" every single time, regardless of which installer format or action version was used. Confirmed directly from the installed `@tauri-apps/cli` package's own changelog and config schema. Added the missing flag; this is expected to be the real fix.

## [1.2.4] - 2026-09-02

### Fixed
- **1.2.3's `--bundles nsis` CLI-arg fix did not fix it either**: the release still hit "Signature not found for the updater JSON. Skipping upload..." even with a confirmed clean single-bundle (NSIS-only) build — ruling out the MSI-ambiguity theory entirely. Root cause: a confirmed upstream bug in `tauri-apps/tauri-action`'s 0.x line (see [tauri-apps/tauri-action#983](https://github.com/tauri-apps/tauri-action/issues/983) and related issues) in the logic that locates signature files to build the update manifest — reproduced on the latest available 0.6.2. Fixed by switching the release workflow from `tauri-apps/tauri-action@v0` to `@v1`, whose 1.0.0 release notes describe an internal rewrite of exactly this asset-detection logic. No workflow inputs needed to change — none of v1's breaking changes touched fields this project uses. 1.2.2 and 1.2.3 were both caught as broken drafts before publishing — no user was ever exposed to either.

## [1.2.3] - 2026-09-02

### Fixed
- **1.2.2's `bundle.targets: ["nsis"]` config fix did not actually work**: the release build still produced an MSI installer alongside the NSIS one (confirmed in the workflow logs), so `latest.json` was skipped again for the same reason as 1.2.1. `tauri-action` does not appear to fully respect `tauri.conf.json`'s `bundle.targets` on its own. Fixed by forcing `--bundles nsis` as an explicit CLI argument in `.github/workflows/release.yml`, in addition to the config setting. 1.2.2 was never published (caught as a draft before release) — no user was affected by it.

## [1.2.2] - 2026-09-02

### Fixed
- **Auto-updater was silently non-functional in 1.2.1**: `bundle.targets: "all"` produced both an NSIS and an MSI installer for Windows, which left the release workflow unable to decide which one to reference in the signed update manifest (`latest.json`), so it skipped uploading it entirely — `.sig` files were generated correctly, only the manifest was missing. Restricted Windows builds to NSIS only (the format Tauri's updater plugin actually supports for silent in-place installs), which resolves the ambiguity. 1.2.1's release remains available as a manual download; its in-app update check does not work — install 1.2.2 manually once, and updates from there on should work normally.

## [1.2.1] - 2026-09-02

### Added
- **Real markdown editor**: replaced the hand-rolled per-line `<input>` editor with CodeMirror 6 — proper multi-line editing, native undo/redo, correct multi-line paste, and cross-line Backspace/arrow-key navigation.
- **Obsidian-style Live Preview mode**: headings, bold/italic, strikethrough, and inline code render styled with their markdown markers hidden — except on whichever line the cursor is on, which stays raw and editable. Bulleted lists render as real bullets, task checkboxes (`- [ ]` / `- [x]`) render as clickable checkboxes, horizontal rules (`---`) render as an actual line, and fenced code blocks / GFM tables render with proper formatting. A new Source / Live / Preview cycle button replaces the old two-way edit/preview toggle.
- **List editing automation**: pressing Enter inside a bullet item continues the list with the same marker on the next line (resetting a task checkbox to unchecked rather than duplicating its checked state); pressing Enter on an empty item exits the list instead of creating an endless empty bullet.
- **Editor settings actually apply live now**: tab size, line numbers, and auto-bracket-pairing are wired through CodeMirror and take effect immediately when changed in Settings, with no editor restart needed.
- **Drag-to-reorder side panels**: drag the Assistant/Explorer panel by its top-edge handle to swap their left-right order; persists across restarts.
- **Drag tabs between split panes**: drag a note's tab from one editor pane to the other (or to the pane edge, which auto-creates the split) to move it, preserving unsaved content.
- **Named custom layouts**: "Save Layout" in the Panel Layout Manager now actually saves your current panel arrangement (order, widths, split state) under a name you choose, selectable alongside the built-in presets, with a delete option.
- **In-app software updates**: a "Check for Updates" section in Settings → About checks for, downloads, and installs signed new releases, restarting the app automatically when done.
- **Wiki-style and markdown link tracking**: `[[links]]` and `[text](target.md)` links in notes are now indexed on save/rename/delete, powering backlink lookups (backend only — no panel surfaces this yet).

### Fixed
- **New Note creation** no longer fails with "File already exists" after the first note in a folder — the previous check compared a forward-slash-joined path against backend paths that use native OS separators, so it never actually detected an existing "Untitled.md" and always hit the same collision instead of picking the next available name.
- **Panel resize dragging** no longer gets stuck: the resizer used window-level mouse listeners that never received `mouseup` if the button was released outside the app window, leaving the drag permanently active and reacting to unrelated later mouse movement. Rebuilt on Pointer Capture, which is immune to this.
- **`excludedFolders` setting** (Files & Links settings) is now actually applied when listing a vault's contents — previously saved but silently ignored.

### Backend
- Consolidated the two unused SQLite databases (`study_notes.db`, `notes.db` — dead code, never called from the frontend) into a single `vault_index.db` with `files` and `links` tables; WAL journal mode enabled for durability. Removed the dead PDF/DOCX source-import command set and its `pdf-extract`/`docx-rs` dependencies, since files remain the single source of truth (see `DATA_ARCHITECTURE_PLAN.md`).
- All local-file commands (`create_local_file`, `write_local_file`, `rename_local_entry`, `delete_local_entry`, etc.) now validate the target path stays within the open vault root, rejecting path-traversal attempts.

## [1.2.0] - 2026-09-01

### Fixed
- **File/folder creation**: "Add" no longer forces a `.md` extension onto every file. `create_local_file` now only appends `.md` when the name has no extension, so files like `data.json` or `notes.txt` are created correctly instead of `data.json.md`. Added visible **New File** / **New Folder** buttons to the explorer header (in addition to the right-click context menu).
- **Explorer panel width** reduced: default 360px → 300px, and maximum resize allowance 550px → 500px so the file explorer no longer takes up excess horizontal space.

### Added
- **5 dark theme presets** (Obsidian Dark default, Midnight Blue, Nord Dark, Dracula Dark, Tokyo Night). Themes apply **live** and **persist** across sessions via `src/themes.ts`.
- **Custom accent color** override in Appearance settings, with a "Reset to theme" option.
- **Project management**: a project switcher (folders icon in the navbar) lets you name and save vault folders as projects, then open, rename, pin, or delete them. Pinned projects sort first, then by most recently opened. Project data persists locally.
- New **settings sections**: Appearance (theme grid, accent, font size, corner roundness, reduce motion), Editor (font family, line wrapping, tab size, line numbers, auto-pair brackets, word count, live-preview delay), Files & Links (attachments folder, excluded folders), Project, and About.
- **Reduce Motion** global toggle disables animations/transitions.
- Settings modal restructured into a proper sidebar+content layout.

### Changed
- Settings modal reorganized from a single vertical list into a **tabbed sidebar layout** with sections: General, Appearance, Editor, Files & Links, Project, About.
- `src/stores/useStore.ts` expanded with project state/actions and live theme/accent application in `updateSettings`.

### Backend
- No backend changes this release; project and theme data are handled entirely on the frontend (localStorage) while vault files continue to use the existing local file commands.

## [1.1.0] - 2026-08-31

### Added
- New app shell with a left icon **navbar** containing a **Sources** icon and a **New Note** action.
- **Top bar** with an action button group (view/preview toggle, edit mode, options, pin, and Save button) placed next to the back/file-navigation arrow.
- **Tab system** for opened notes. Opening a file reuses the same tab; `Ctrl+N` (or the `+` button) opens a new blank note tab.
- **File status metadata** (file icon, filename, Knowledge Base tag, and "All changes saved" indicator) shown in the top-right of the top bar.
- **Draggable resizer handle** between the Sources panel and the Study Board so panel widths can be adjusted dynamically.
- Rounded panel corners with small gaps between panels.

### Changed
- **Study Board** is now a continuous, Obsidian-style Markdown editor. Removed the note title dialog, preview/cancel/create buttons, and separate note list. Notes auto-save on change (debounced), with the title derived from the first heading.
- **Sources** are now preview-only in the Sources panel (read-only). Editing a source creates an editable copy as a Note, leaving the original untouched.
- Sources support **multiple-file** CRUD operations (import several files at once).
- Top bar **Save** button and **"All changes saved"** status now act as visual indicators of the auto-save state.

### Backend
- `notes` table extended with `pinned` (INTEGER) and `tags` (TEXT) columns; automatic migration adds them to existing databases without data loss.
- New commands: `copy_source_to_note` (edit source as note), `pin_note` (toggle pinned). `add_note`/`update_note` accept `pinned`/`tags` and auto-derive the title from the content's first heading.
```


## `package.json`

```json
{
  "name": "local-study-notebook",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@codemirror/autocomplete": "^6.20.3",
    "@codemirror/commands": "^6.11.0",
    "@codemirror/lang-markdown": "^6.5.2",
    "@codemirror/language": "^6.12.4",
    "@codemirror/language-data": "^6.5.2",
    "@codemirror/state": "^6.7.2",
    "@codemirror/view": "^6.43.10",
    "@lezer/common": "^1.5.2",
    "@lezer/highlight": "^1.2.3",
    "@lezer/markdown": "^1.7.2",
    "@tauri-apps/plugin-dialog": "^2.7.3",
    "@tauri-apps/plugin-process": "^2.3.1",
    "@tauri-apps/plugin-updater": "^2.11.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "zustand": "^5.0.5"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.8",
    "@tauri-apps/api": "^2.5.0",
    "@tauri-apps/cli": "^2.5.0",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.5.2",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.8",
    "typescript": "^5.8.3",
    "vite": "^6.3.5"
  }
}
```


## `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```


## `.gitignore`

```gitignore
node_modules/
dist/
target/
src-tauri/target/
src-tauri/gen/
*.db
*.db-shm
*.db-wal
*.log
.DS_Store
Thumbs.db
.vscode/
.claude/
*.session.sql
.obsidian/

# Tauri updater signing key — must never be committed; the real copy lives outside this
# repo (see the release-signing note below) and as GitHub Actions secrets.
*.key
*.key.pub
```


## `src-tauri\tauri.conf.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/nicegram/nicegram-ios/master/nicegram-assistant/nicegram-assistant/tauri.schema.json",
  "productName": "Local Study Notebook",
  "version": "1.4.0",
  "identifier": "com.localstudynotebook.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": false,
    "windows": [
      {
        "title": "Local Study Notebook",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "createUpdaterArtifacts": true,
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "fs": {
      "requireLiteralLeadingDot": false
    },
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/David-Py24/Local-Notebook-/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY3NEVDNTVBRUNBRkIzRjIKUldUeXM2L3NXc1ZPWjBXRUpEemUvWi96QStUZEpYNkdxaGtZYUUxZ0lCRTZpV29VOVlBbElLcFoK"
    }
  }
}
```


## `src-tauri\capabilities\default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:default",
    "updater:default",
    "process:default",
    "shell:allow-spawn",
    "shell:allow-kill",
    "shell:allow-execute"
  ]
}
```


## `src-tauri\src\lib.rs`

```rust
mod chunks;
mod commands;
mod db;
mod drive;
mod embeddings;
mod mcp;

use db::DbState;
use mcp::McpState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&app_dir)?;
            let db_state = DbState::new(&app_dir)?;
            app.manage(db_state);
            app.manage(drive::DriveState::default());
            app.manage(McpState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backlinks,
            commands::get_outgoing_links,
            commands::reindex_vault,
            commands::read_local_dir,
            commands::read_local_file,
            commands::write_local_file,
            commands::create_local_file,
            commands::create_local_dir,
            commands::rename_local_entry,
            commands::delete_local_entry,
            commands::search_vault,
            // Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1)
            commands::get_unembedded_chunks,
            commands::store_chunk_embeddings,
            // Memory-RAG (M2): hybrid retrieval + durable memory
            commands::search_rag,
            commands::add_memory,
            commands::recall_memory,
            commands::get_context_bundle,
            // OpenCode Agent process management
            commands::check_opencode_installed,
            commands::spawn_opencode_server,
            commands::kill_opencode_server,
            // Google Drive backup (BACKUP-0): OAuth sign-in/account/sign-out
            drive::google_account,
            drive::google_sign_in,
            drive::google_sign_out,
            // MCP connectors (MCP_CONNECTORS_PLAN.md): tool listing, calls, health, teardown
            mcp::list_connector_tools,
            mcp::call_connector_tool,
            mcp::test_connector,
            mcp::stop_connector
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```


## `src-tauri\src\commands.rs`

```rust
use crate::chunks;
use crate::db::{DbState, LinkItem};
use rusqlite::params;
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, State};

/// Tracks the project-local `opencode.json` we write for a connector export, so
/// `kill_opencode_server` can remove it when the sidecar stops. This keeps the
/// export non-destructive and leaves no artifact behind in the user's vault.
static OPENCODE_MCP_CONFIG: OnceLock<Mutex<Option<std::path::PathBuf>>> = OnceLock::new();

// Local version history (DATA-3): before overwriting a tracked file, the previous content
// is copied into <app_data_dir>/history/<hash-of-path>/<timestamp>.<ext>, capped at the
// last MAX_HISTORY_VERSIONS per file. This is deliberately keyed off a hash of the path
// itself rather than the vault_index `files` table (DATA-2), so it doesn't depend on that
// still-unfinished ticket — a save works the same whether or not the index is in sync.
const MAX_HISTORY_VERSIONS: usize = 20;

fn path_history_key(path: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn prune_history(history_dir: &std::path::Path) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(history_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    // Filenames are fixed-width zero-padded timestamps, so lexical sort == chronological.
    entries.sort_by_key(|e| e.file_name());
    if entries.len() > MAX_HISTORY_VERSIONS {
        let excess = entries.len() - MAX_HISTORY_VERSIONS;
        for entry in entries.into_iter().take(excess) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
    Ok(())
}

fn snapshot_previous_version(history_root: &std::path::Path, valid_path: &std::path::Path) -> Result<(), String> {
    if !valid_path.exists() {
        return Ok(()); // brand-new file — nothing to snapshot yet
    }
    let previous_content = std::fs::read(valid_path).map_err(|e| e.to_string())?;

    let key = path_history_key(&valid_path.to_string_lossy());
    let history_dir = history_root.join(key);
    std::fs::create_dir_all(&history_dir).map_err(|e| e.to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d%H%M%S%3f");
    let ext = valid_path.extension().and_then(|e| e.to_str()).unwrap_or("md");
    let snapshot_path = history_dir.join(format!("{timestamp}.{ext}"));
    std::fs::write(&snapshot_path, &previous_content).map_err(|e| e.to_string())?;

    prune_history(&history_dir)
}

// Vault index sync (DATA-2): keeps the `files` table's content_hash/size/mtime current
// incrementally on every create/write/rename/delete, plus a full rescan (`reindex_vault`)
// triggered once when a vault is opened. `refreshExplorer` (called far more often — after
// every file op already, and on every folder-path change) deliberately does NOT trigger a
// rescan itself, since those exact operations already get incremental updates below; a full
// re-hash on every refresh would be redundant work, not just "infrequent" background cost.

fn content_hash(content: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn format_system_time(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Local> = time.into();
    datetime.format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

fn now_iso() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%.3f").to_string()
}

fn upsert_file_index(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
    let path_str = path.to_string_lossy();
    let hash = content_hash(content);
    let size = content.len() as i64;
    let mtime = std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(format_system_time)
        .unwrap_or_else(|_| now_iso());

    conn.execute(
        "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(path) DO UPDATE SET
             content_hash = excluded.content_hash,
             size_bytes = excluded.size_bytes,
             mtime = excluded.mtime,
             last_indexed_at = excluded.last_indexed_at",
        params![path_str.as_ref(), hash, size, mtime, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn remove_from_index_recursive(conn: &rusqlite::Connection, path_str: &str) -> Result<(), String> {
    // Covers both a single file (exact match) and a directory (prefix match on everything
    // nested under it) with one statement, rather than needing the caller to know which.
    let prefix_pattern = format!("{}{}%", path_str, std::path::MAIN_SEPARATOR);
    conn.execute(
        "DELETE FROM files WHERE path = ?1 OR path LIKE ?2",
        params![path_str, prefix_pattern],
    )
    .map_err(|e| e.to_string())?;
    // Memory-RAG: drop this file's (or subtree's) chunks too; chunks_fts syncs itself.
    conn.execute(
        "DELETE FROM note_chunks WHERE path = ?1 OR path LIKE ?2",
        params![path_str, prefix_pattern],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn reindex_after_rename(conn: &rusqlite::Connection, old_str: &str, new_str: &str) -> Result<(), String> {
    // A rename can be a single file or an entire directory (rewriting every nested path's
    // prefix) — resolved in Rust rather than raw SQL string surgery so OS path separators
    // are handled correctly instead of assuming '/'.
    let prefix_pattern = format!("{}{}%", old_str, std::path::MAIN_SEPARATOR);
    let mut stmt = conn
        .prepare("SELECT path FROM files WHERE path = ?1 OR path LIKE ?2")
        .map_err(|e| e.to_string())?;
    let matching_paths: Vec<String> = stmt
        .query_map(params![old_str, prefix_pattern], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);

    for old_file_path in matching_paths {
        let new_file_path = if old_file_path == old_str {
            new_str.to_string()
        } else {
            format!("{}{}", new_str, &old_file_path[old_str.len()..])
        };
        conn.execute(
            "UPDATE files SET path = ?1 WHERE path = ?2",
            params![new_file_path, old_file_path],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE note_chunks SET path = ?1 WHERE path = ?2",
            params![new_file_path, old_file_path],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn reindex_dir_recursive(conn: &rusqlite::Connection, dir: &std::path::Path, depth: usize) -> Result<usize, String> {
    if depth > 8 {
        return Ok(0);
    }
    let mut count = 0;
    let read_entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in read_entries.filter_map(Result::ok) {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            count += reindex_dir_recursive(conn, &path, depth + 1)?;
        } else if let Ok(content) = std::fs::read_to_string(&path) {
            // Binary/non-UTF8 files are silently skipped — this index is for note content.
            if upsert_file_index(conn, &path, &content).is_ok() {
                if path.extension().and_then(|e| e.to_str()) == Some("md") {
                    // Memory-RAG: rebuild this file's text chunks. Embeddings stay NULL here;
                    // they're filled lazily by rebuild_embeddings once an embed server is up.
                    let _ = sync_chunks_for_file(conn, &path, &content);
                }
                count += 1;
            }
        }
    }
    Ok(count)
}

// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1): replace every stored chunk for a note with
// fresh chunks. The chunks_fts shadow table stays in sync automatically via the triggers
// declared in db.rs, so this function only touches note_chunks.
fn sync_chunks_for_file(conn: &rusqlite::Connection, path: &std::path::Path, content: &str) -> Result<(), String> {
    let path_str = path.to_string_lossy().into_owned();
    conn.execute("DELETE FROM note_chunks WHERE path = ?1", params![&path_str])
        .map_err(|e| e.to_string())?;

    for (i, chunk) in chunks::chunk_markdown(content).iter().enumerate() {
        conn.execute(
            "INSERT INTO note_chunks (path, chunk_index, chunk_text, char_offset, token_count, embed_model, embedding, indexed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6)",
            params![&path_str, i as i64, &chunk.text, chunk.char_offset as i64, chunk.token_count as i64, now_iso()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reindex_vault(state: State<DbState>, vault_root: String) -> Result<usize, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    reindex_dir_recursive(&conn, root, 0)
}

pub fn extract_links(source_path: &str, content: &str) -> Vec<LinkItem> {
    let mut links = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        let line_num = (line_idx + 1) as i64;

        // 1. Match [[WikiLink]] or [[WikiLink|Alias]]
        let mut start_search = 0;
        while let Some(start) = line[start_search..].find("[[") {
            let abs_start = start_search + start + 2;
            if let Some(end) = line[abs_start..].find("]]") {
                let inner = &line[abs_start..abs_start + end];
                let (target, alias) = if let Some(pipe_idx) = inner.find('|') {
                    (&inner[..pipe_idx], &inner[pipe_idx + 1..])
                } else {
                    (inner, inner)
                };
                let target_trimmed = target.trim();
                let alias_trimmed = alias.trim();
                if !target_trimmed.is_empty() {
                    links.push(LinkItem {
                        id: None,
                        source_path: source_path.to_string(),
                        target_path: target_trimmed.to_string(),
                        link_text: alias_trimmed.to_string(),
                        line_number: line_num,
                    });
                }
                start_search = abs_start + end + 2;
            } else {
                break;
            }
        }

        // 2. Match standard markdown links [text](target.md)
        let bytes = line.as_bytes();
        let mut idx = 0;
        while idx < bytes.len() {
            if bytes[idx] == b'[' {
                if let Some(close_bracket) = line[idx + 1..].find(']') {
                    let bracket_end = idx + 1 + close_bracket;
                    if bracket_end + 1 < bytes.len() && bytes[bracket_end + 1] == b'(' {
                        if let Some(close_paren) = line[bracket_end + 2..].find(')') {
                            let paren_end = bracket_end + 2 + close_paren;
                            let link_text = &line[idx + 1..bracket_end];
                            let target = &line[bracket_end + 2..paren_end];

                            let target_trimmed = target.trim();
                            if !target_trimmed.starts_with("http://")
                                && !target_trimmed.starts_with("https://")
                                && !target_trimmed.starts_with('#')
                                && !target_trimmed.is_empty()
                            {
                                links.push(LinkItem {
                                    id: None,
                                    source_path: source_path.to_string(),
                                    target_path: target_trimmed.to_string(),
                                    link_text: link_text.trim().to_string(),
                                    line_number: line_num,
                                });
                            }
                            idx = paren_end + 1;
                            continue;
                        }
                    }
                }
            }
            idx += 1;
        }
    }
    links
}

fn sync_links_internal(conn: &rusqlite::Connection, source_path: &str, content: &str) -> Result<(), String> {
    let parsed_links = extract_links(source_path, content);

    conn.execute(
        "DELETE FROM links WHERE source_path = ?1",
        params![source_path],
    )
    .map_err(|e| e.to_string())?;

    for link in parsed_links {
        conn.execute(
            "INSERT INTO links (source_path, target_path, link_text, line_number) VALUES (?1, ?2, ?3, ?4)",
            params![link.source_path, link.target_path, link.link_text, link.line_number],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// A wiki-link `[[Foo]]` or markdown link `[text](Foo.md)` stores a short, user-authored
// target string in `links.target_path` — not a resolved filesystem path. A real caller of
// get_backlinks passes the currently-open note's full canonical path, which is never a
// suffix of that short string (the previous `target_path LIKE '%' || ?1` query had the
// comparison backwards, so it could never match anything). Resolved instead by comparing
// basenames without extension, case-insensitively — matching Obsidian's own default
// wiki-link resolution (by filename/title anywhere in the vault, not by exact path).
fn link_target_basename(raw: &str) -> String {
    let trimmed = raw.trim();
    let last_segment = trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed);
    let without_ext = last_segment.strip_suffix(".md").unwrap_or(last_segment);
    without_ext.to_lowercase()
}

#[tauri::command]
pub fn get_backlinks(state: State<DbState>, target_path: String) -> Result<Vec<LinkItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let normalized_target = link_target_basename(&target_path);

    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links ORDER BY source_path, line_number")
        .map_err(|e| e.to_string())?;

    let rows: Vec<LinkItem> = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|link| link_target_basename(&link.target_path) == normalized_target)
        .collect();

    Ok(rows)
}

#[tauri::command]
pub fn get_outgoing_links(state: State<DbState>, source_path: String) -> Result<Vec<LinkItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links WHERE source_path = ?1 ORDER BY line_number")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![source_path], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[tauri::command]
pub fn read_local_dir(path: String, excluded_folders: Option<Vec<String>>) -> Result<Vec<FileEntry>, String> {
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let exclusions: Vec<String> = excluded_folders
        .unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect();

    read_local_dir_internal(root, 0, &exclusions)
}

fn read_local_dir_internal(path: &std::path::Path, depth: usize, exclusions: &[String]) -> Result<Vec<FileEntry>, String> {
    if depth > 4 {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;

    for entry in read_entries {
        if let Ok(entry) = entry {
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            
            // Skip hidden directories/files (e.g. .git, .vscode)
            if name.starts_with('.') {
                continue;
            }

            let name_lower = name.to_lowercase();
            if exclusions.iter().any(|ex| ex == &name_lower) {
                continue;
            }

            let is_dir = entry_path.is_dir();
            let children = if is_dir {
                Some(read_local_dir_internal(&entry_path, depth + 1, exclusions)?)
            } else {
                None
            };

            entries.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().into_owned(),
                is_dir,
                children,
            });
        }
    }

    // Sort: directories first, then files alphabetically (case-insensitive)
    entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

fn validate_vault_path(path_str: &str, vault_root_str: Option<&str>) -> Result<std::path::PathBuf, String> {
    let raw_path = std::path::Path::new(path_str);

    let vault_root_path = match vault_root_str {
        Some(v) if !v.trim().is_empty() => {
            let p = std::path::Path::new(v);
            if p.exists() {
                std::fs::canonicalize(p).map_err(|e| format!("Invalid vault root path: {}", e))?
            } else {
                p.to_path_buf()
            }
        }
        _ => return Ok(raw_path.to_path_buf()),
    };

    let canonical_target = if raw_path.exists() {
        std::fs::canonicalize(raw_path).map_err(|e| format!("Invalid path: {}", e))?
    } else if let Some(parent) = raw_path.parent() {
        if parent.exists() {
            let canonical_parent = std::fs::canonicalize(parent).map_err(|e| format!("Invalid parent path: {}", e))?;
            let file_name = raw_path.file_name().ok_or_else(|| "Invalid file name".to_string())?;
            canonical_parent.join(file_name)
        } else {
            return Err("Target parent directory does not exist".to_string());
        }
    } else {
        return Err("Invalid path structure".to_string());
    };

    if !canonical_target.starts_with(&vault_root_path) {
        return Err(format!(
            "Security Violation: Target path '{:?}' lies outside vault root '{:?}'",
            canonical_target, vault_root_path
        ));
    }

    Ok(canonical_target)
}

#[tauri::command]
pub fn read_local_file(path: String, vault_root: Option<String>) -> Result<String, String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    std::fs::read_to_string(valid_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_local_file(
    app_handle: tauri::AppHandle,
    state: State<DbState>,
    path: String,
    content: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;

    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let history_root = app_dir.join("history");
        if let Err(e) = snapshot_previous_version(&history_root, &valid_path) {
            // Never let a history-snapshot failure block the actual save.
            eprintln!("Failed to snapshot previous version of {:?}: {e}", valid_path);
        }
    }

    std::fs::write(&valid_path, &content).map_err(|e| e.to_string())?;

    let canon_str = valid_path.to_string_lossy();
    if let Ok(conn) = state.vault_index.lock() {
        let _ = sync_links_internal(&conn, &canon_str, &content);
        let _ = upsert_file_index(&conn, &valid_path, &content);
    }
    Ok(())
}

#[tauri::command]
pub fn create_local_file(
    state: State<DbState>,
    dir_path: String,
    name: String,
    vault_root: Option<String>,
) -> Result<String, String> {
    // Trim and guard against empty names
    let base = name.trim();
    if base.is_empty() {
        return Err("File name cannot be empty".to_string());
    }

    // Build the final file name. If the user did not include an extension,
    // default to .md; otherwise keep their extension exactly as given.
    let file_name = if base.contains('.') {
        base.to_string()
    } else {
        format!("{}.md", base)
    };

    let target_dir = validate_vault_path(&dir_path, vault_root.as_deref())?;
    if !target_dir.is_dir() {
        return Err("Target parent is not a directory".to_string());
    }

    let file_path = target_dir.join(&file_name);
    let valid_file_path = validate_vault_path(&file_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_file_path.exists() {
        return Err("File already exists".to_string());
    }

    let initial_content = if file_name.ends_with(".md") || file_name.ends_with(".markdown") {
        let title = file_name.trim_end_matches(".md").trim_end_matches(".markdown");
        format!("# {}\n", title)
    } else {
        String::new()
    };

    std::fs::write(&valid_file_path, &initial_content).map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = upsert_file_index(&conn, &valid_file_path, &initial_content);
    }

    Ok(valid_file_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn create_local_dir(parent_path: String, name: String, vault_root: Option<String>) -> Result<String, String> {
    let folder_name = name.trim();
    if folder_name.is_empty() {
        return Err("Folder name cannot be empty".to_string());
    }

    let parent_dir = validate_vault_path(&parent_path, vault_root.as_deref())?;
    if !parent_dir.is_dir() {
        return Err("Parent path is not a directory".to_string());
    }

    let new_dir_path = parent_dir.join(folder_name);
    let valid_dir_path = validate_vault_path(&new_dir_path.to_string_lossy(), vault_root.as_deref())?;

    if valid_dir_path.exists() {
        return Err("Directory already exists".to_string());
    }

    std::fs::create_dir_all(&valid_dir_path).map_err(|e| e.to_string())?;
    Ok(valid_dir_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn rename_local_entry(
    state: State<DbState>,
    old_path: String,
    new_path: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_old = validate_vault_path(&old_path, vault_root.as_deref())?;
    let valid_new = validate_vault_path(&new_path, vault_root.as_deref())?;

    if !valid_old.exists() {
        return Err("Target to rename does not exist".to_string());
    }

    let old_str = valid_old.to_string_lossy();
    let new_str = valid_new.to_string_lossy();

    std::fs::rename(&valid_old, &valid_new).map_err(|e| e.to_string())?;

    if let Ok(conn) = state.vault_index.lock() {
        let _ = conn.execute(
            "UPDATE links SET source_path = ?1 WHERE source_path = ?2",
            params![new_str.as_ref(), old_str.as_ref()],
        );
        let _ = conn.execute(
            "UPDATE links SET target_path = ?1 WHERE target_path = ?2",
            params![new_str.as_ref(), old_str.as_ref()],
        );
        let _ = reindex_after_rename(&conn, old_str.as_ref(), new_str.as_ref());
    }
    Ok(())
}

#[tauri::command]
pub fn delete_local_entry(
    state: State<DbState>,
    path: String,
    vault_root: Option<String>,
) -> Result<(), String> {
    let valid_path = validate_vault_path(&path, vault_root.as_deref())?;
    if !valid_path.exists() {
        return Err("Path to delete does not exist".to_string());
    }

    // Safety guard: Never allow deleting the vault root itself!
    if let Some(vr) = vault_root.as_deref() {
        if let Ok(vr_canon) = std::fs::canonicalize(vr) {
            if valid_path == vr_canon {
                return Err("Refusing to delete the root vault directory".to_string());
            }
        }
    }

    let path_str = valid_path.to_string_lossy();

    if valid_path.is_dir() {
        std::fs::remove_dir_all(&valid_path).map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(&valid_path).map_err(|e| e.to_string())?;
    }

    if let Ok(conn) = state.vault_index.lock() {
        let _ = conn.execute(
            "DELETE FROM links WHERE source_path = ?1 OR target_path = ?2",
            params![path_str.as_ref(), path_str.as_ref()],
        );
        let _ = remove_from_index_recursive(&conn, path_str.as_ref());
    }
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SearchResultItem {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub line_number: usize,
}

#[tauri::command]
pub fn search_vault(vault_root: String, query: String) -> Result<Vec<SearchResultItem>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Vault root is not a directory".to_string());
    }
    let query_lower = query.trim().to_lowercase();
    if query_lower.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }

            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let title = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| name.clone());
                    for (idx, line) in content.lines().enumerate() {
                        if line.to_lowercase().contains(&query_lower) {
                            results.push(SearchResultItem {
                                path: path.to_string_lossy().to_string(),
                                title: title.clone(),
                                snippet: line.trim().to_string(),
                                line_number: idx + 1,
                            });
                            if results.len() >= 30 {
                                break;
                            }
                        }
                    }
                }
            }
            if results.len() >= 30 {
                break;
            }
        }
        if results.len() >= 30 {
            break;
        }
    }

    Ok(results)
}

// Memory-RAG (M1): lazy embedding sync. The frontend pulls chunks whose embedding is
// still NULL, batches them to the embed server, then writes the vectors back here. This
// split keeps ALL AI HTTP in the frontend (consistent with aiProvider.ts) while the
// vectors and retrieval stay in SQLite.

#[derive(serde::Serialize)]
pub struct UnembeddedChunk {
    pub rowid: i64,
    pub path: String,
    pub chunk_index: i64,
    pub text: String,
}

#[tauri::command]
pub fn get_unembedded_chunks(state: State<DbState>, vault_root: String, limit: usize) -> Result<Vec<UnembeddedChunk>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let root_str = root.to_string_lossy();
    let prefix = format!(
        "{}{}%",
        root_str.trim_end_matches(std::path::MAIN_SEPARATOR),
        std::path::MAIN_SEPARATOR
    );

    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT rowid, path, chunk_index, chunk_text
             FROM note_chunks
             WHERE embedding IS NULL AND path LIKE ?1
             ORDER BY rowid
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![prefix, limit.max(0) as i64], |row| {
            Ok(UnembeddedChunk {
                rowid: row.get(0)?,
                path: row.get(1)?,
                chunk_index: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(serde::Deserialize)]
pub struct EmbeddedChunk {
    pub rowid: i64,
    pub embedding: Vec<f32>,
}

#[tauri::command]
pub fn store_chunk_embeddings(state: State<DbState>, items: Vec<EmbeddedChunk>, embed_model: String) -> Result<usize, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let mut updated = 0usize;
    for item in items.iter() {
        let bytes = crate::embeddings::pack_f32s(&item.embedding);
        updated += conn
            .execute(
                "UPDATE note_chunks SET embedding = ?1, embed_model = ?2 WHERE rowid = ?3",
                params![bytes.as_slice(), &embed_model, item.rowid],
            )
            .map_err(|e| e.to_string())?;
    }
    Ok(updated)
}

// ---------------------------------------------------------------------------
// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M2): hybrid retrieval + durable memory.
//
// Ranking model: FTS5 pre-filters candidates to a small set, then an optional query
// embedding re-ranks them by cosine similarity when the embed server was reachable.
// When no vectors exist (server down / index not built yet), results degrade gracefully
// to pure keyword ranking. All AI HTTP stays in the frontend; Rust owns storage + math.
// ---------------------------------------------------------------------------

fn vault_path_prefix(root: &std::path::Path) -> String {
    let root_str = root.to_string_lossy();
    format!(
        "{}{}%",
        root_str.trim_end_matches(std::path::MAIN_SEPARATOR),
        std::path::MAIN_SEPARATOR
    )
}

/// Splits a free-text query into sanitized FTS5 terms (alphanumeric only, lowercased).
/// Quoting each term neutralizes FTS5 operator syntax in user input.
fn fts_terms(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric())
        .map(|t| t.trim().to_lowercase())
        .filter(|t| !t.is_empty())
        .collect()
}

fn fts_match_query(query: &str) -> Option<String> {
    let terms = fts_terms(query);
    if terms.is_empty() {
        return None;
    }
    let quoted: Vec<String> = terms.into_iter().map(|t| format!("\"{t}\"")).collect();
    Some(quoted.join(" "))
}

#[derive(serde::Serialize)]
pub struct RagHit {
    pub path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub char_offset: i64,
}

fn title_from_path(path: &std::path::Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Untitled".to_string())
}

fn search_rag_internal(
    conn: &rusqlite::Connection,
    vault_root: &std::path::Path,
    query_text: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<RagHit>, String> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let match_query = match fts_match_query(query_text) {
        Some(q) => q,
        None => return Ok(Vec::new()),
    };
    let prefix = vault_path_prefix(vault_root);
    const CANDIDATES: i64 = 50;

    // 1. Keyword pre-filter (works fully offline).
    let mut stmt = conn
        .prepare(
            "SELECT rowid, rank FROM chunks_fts
             WHERE chunks_fts MATCH ?1
               AND rowid IN (SELECT rowid FROM note_chunks WHERE path LIKE ?2)
             ORDER BY rank
             LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let candidates: Vec<(i64, f32)> = stmt
        .query_map(params![match_query, prefix, CANDIDATES], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
    drop(stmt);
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // 2. Load chunk metadata + optional stored vector for each candidate.
    struct CandidateRow {
        chunk: RagHit,
        embedding: Option<Vec<f32>>,
    }
    let mut rows: Vec<CandidateRow> = Vec::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT path, chunk_index, chunk_text, char_offset, embedding
                 FROM note_chunks WHERE rowid = ?1",
            )
            .map_err(|e| e.to_string())?;
        for (rowid, rank) in candidates.iter() {
            let fetched = stmt
                .query_row(params![rowid], |row| {
                    let path: String = row.get(0)?;
                    let _chunk_index: i64 = row.get(1)?;
                    let chunk_text: String = row.get(2)?;
                    let char_offset: i64 = row.get(3)?;
                    let embedding: Option<Vec<u8>> = row.get(4)?;
                    Ok((
                        path,
                        chunk_text,
                        char_offset,
                        embedding.map(|b| crate::embeddings::unpack_f32s(&b)),
                    ))
                })
                .map_err(|e| e.to_string());
            if let Ok((path, text, char_offset, embedding)) = fetched {
                let snippet: String = text.chars().take(600).collect();
                rows.push(CandidateRow {
                    chunk: RagHit {
                        title: title_from_path(std::path::Path::new(&path)),
                        snippet,
                        path: path.clone(),
                        char_offset,
                        score: *rank,
                    },
                    embedding,
                });
            }
        }
    }

    // 3. Re-rank by cosine when possible; otherwise keep keyword (rank) order.
    if !query_embedding.is_empty() {
        for row in rows.iter_mut() {
            if let Some(vec) = &row.embedding {
                row.chunk.score = crate::embeddings::cosine(query_embedding, vec);
            } else {
                row.chunk.score = 0.0;
            }
        }
        // Embedded hits first (cosine desc), then unembedded in keyword order.
        rows.sort_by(|a, b| {
            b.chunk
                .score
                .partial_cmp(&a.chunk.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        // Recover stable keyword order for the unembedded tail.
        rows.sort_by(|a, b| {
            let a_embedded = a.embedding.is_some();
            let b_embedded = b.embedding.is_some();
            match (a_embedded, b_embedded) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                (true, true) => b
                    .chunk
                    .score
                    .partial_cmp(&a.chunk.score)
                    .unwrap_or(std::cmp::Ordering::Equal),
                (false, false) => a
                    .chunk
                    .score
                    .partial_cmp(&b.chunk.score)
                    .unwrap_or(std::cmp::Ordering::Equal),
            }
        });
    }

    Ok(rows
        .into_iter()
        .take(limit)
        .map(|r| r.chunk)
        .collect())
}

#[tauri::command]
pub fn search_rag(
    state: State<DbState>,
    vault_root: String,
    query_text: String,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<RagHit>, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    search_rag_internal(&conn, root, &query_text, &query_embedding, limit)
}

#[derive(serde::Serialize)]
pub struct MemoryItem {
    pub id: i64,
    pub scope: String,
    pub kind: String,
    pub content: String,
    pub source: String,
    pub topic_title: Option<String>,
    pub created_at: String,
    pub score: f32,
}

#[tauri::command]
pub fn add_memory(
    state: State<DbState>,
    scope: String,
    kind: String,
    content: String,
    source: String,
    topic_title: Option<String>,
    embedding: Vec<f32>,
) -> Result<i64, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    let bytes = if embedding.is_empty() {
        None
    } else {
        Some(crate::embeddings::pack_f32s(&embedding))
    };
    conn.execute(
        "INSERT INTO memory_entries (scope, kind, content, source, topic_title, created_at, embedding)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![scope, kind, content, source, topic_title, now_iso(), bytes.as_deref()],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

fn recall_memory_internal(
    conn: &rusqlite::Connection,
    scope: &str,
    query_text: &str,
    query_embedding: &[f32],
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let like = query_text.trim();
    let scope_filter = if scope.trim().is_empty() {
        "%".to_string()
    } else {
        scope.to_string()
    };

    struct Row {
        item: MemoryItem,
        embedding: Option<Vec<f32>>,
    }
    let mut rows: Vec<Row> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, scope, kind, content, source, topic_title, created_at, embedding
                 FROM memory_entries
                 WHERE active = 1
                   AND scope LIKE ?1
                   AND (?2 = '' OR content LIKE '%' || ?2 || '%')
                 ORDER BY created_at DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let collected = stmt
            .query_map(params![scope_filter, like, limit as i64], |row| {
                let id: i64 = row.get(0)?;
                let scope: String = row.get(1)?;
                let kind: String = row.get(2)?;
                let content: String = row.get(3)?;
                let source: String = row.get(4)?;
                let topic_title: Option<String> = row.get(5)?;
                let created_at: String = row.get(6)?;
                let embedding: Option<Vec<u8>> = row.get(7)?;
                Ok(Row {
                    item: MemoryItem {
                        id,
                        scope,
                        kind,
                        content,
                        source,
                        topic_title,
                        created_at,
                        score: 0.0,
                    },
                    embedding: embedding.map(|b| crate::embeddings::unpack_f32s(&b)),
                })
            })
            .map_err(|e| e.to_string())?;

        collected
            .filter_map(Result::ok)
            .take(limit)
            .collect()
    };

    if !query_embedding.is_empty() {
        for row in rows.iter_mut() {
            if let Some(vec) = &row.embedding {
                row.item.score = crate::embeddings::cosine(query_embedding, vec);
            }
        }
        rows.sort_by(|a, b| {
            b.item
                .score
                .partial_cmp(&a.item.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    Ok(rows.into_iter().take(limit).map(|r| r.item).collect())
}

#[tauri::command]
pub fn recall_memory(
    state: State<DbState>,
    scope: String,
    query_text: String,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<MemoryItem>, String> {
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;
    recall_memory_internal(&conn, &scope, &query_text, &query_embedding, limit)
}

fn backlinks_for_path(conn: &rusqlite::Connection, target_path: &str) -> Result<Vec<LinkItem>, String> {
    let normalized_target = link_target_basename(target_path);
    let mut stmt = conn
        .prepare("SELECT id, source_path, target_path, link_text, line_number FROM links ORDER BY source_path, line_number")
        .map_err(|e| e.to_string())?;
    let rows: Vec<LinkItem> = stmt
        .query_map([], |row| {
            Ok(LinkItem {
                id: Some(row.get(0)?),
                source_path: row.get(1)?,
                target_path: row.get(2)?,
                link_text: row.get(3)?,
                line_number: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .filter(|link| link_target_basename(&link.target_path) == normalized_target)
        .collect();
    Ok(rows)
}

#[derive(serde::Serialize)]
pub struct ActiveNoteContext {
    pub path: String,
    pub title: String,
    pub excerpt: String,
}

#[derive(serde::Serialize)]
pub struct ContextBundle {
    pub scope: String,
    pub memory: Vec<MemoryItem>,
    pub rag: Vec<RagHit>,
    pub active_note: Option<ActiveNoteContext>,
    pub backlinks: Vec<LinkItem>,
}

#[tauri::command]
pub fn get_context_bundle(
    state: State<DbState>,
    vault_root: String,
    scope: String,
    query_text: String,
    query_embedding: Vec<f32>,
    active_note_path: Option<String>,
    rag_limit: usize,
) -> Result<ContextBundle, String> {
    let root = std::path::Path::new(&vault_root);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }
    let conn = state.vault_index.lock().map_err(|e| e.to_string())?;

    let memory = recall_memory_internal(&conn, "", &scope, &query_embedding, rag_limit)?;
    let rag = search_rag_internal(&conn, root, &query_text, &query_embedding, rag_limit)?;

    let active_note = match &active_note_path {
        Some(path_str) if !path_str.trim().is_empty() => {
            std::fs::read_to_string(path_str).ok().map(|content| {
                let title = title_from_path(std::path::Path::new(path_str));
                let excerpt: String = content.chars().take(2500).collect();
                ActiveNoteContext {
                    path: path_str.clone(),
                    title,
                    excerpt,
                }
            })
        }
        _ => None,
    };

    let backlinks = match &active_note_path {
        Some(path_str) => backlinks_for_path(&conn, path_str)?,
        None => Vec::new(),
    };

    Ok(ContextBundle {
        scope,
        memory,
        rag,
        active_note,
        backlinks,
    })
}

#[cfg(test)]
mod backlink_tests {
    use super::*;

    #[test]
    fn matches_bare_wikilink_target_against_full_path() {
        let sep = std::path::MAIN_SEPARATOR;
        let full_path = format!("C:{sep}vault{sep}Notes{sep}Foo.md");
        // [[Foo]] stores target_path = "Foo"
        assert_eq!(link_target_basename("Foo"), link_target_basename(&full_path));
    }

    #[test]
    fn matches_markdown_link_target_with_extension_and_relative_prefix() {
        let sep = std::path::MAIN_SEPARATOR;
        let full_path = format!("C:{sep}vault{sep}Notes{sep}Foo.md");
        // [text](../Foo.md) stores target_path = "../Foo.md"
        assert_eq!(link_target_basename("../Foo.md"), link_target_basename(&full_path));
    }

    #[test]
    fn is_case_insensitive() {
        assert_eq!(link_target_basename("FOO"), link_target_basename("foo.md"));
    }

    #[test]
    fn distinguishes_different_notes() {
        assert_ne!(link_target_basename("Foo"), link_target_basename("Bar.md"));
    }
}

#[cfg(test)]
mod index_tests {
    use super::*;
    use rusqlite::Connection;

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE files (
                path            TEXT PRIMARY KEY,
                content_hash    TEXT NOT NULL,
                size_bytes      INTEGER NOT NULL,
                mtime           TEXT NOT NULL,
                last_indexed_at TEXT NOT NULL,
                last_backed_up_at TEXT,
                sync_status     TEXT NOT NULL DEFAULT 'not_tracked'
            );
            CREATE TABLE note_chunks (
                rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_text  TEXT NOT NULL,
                char_offset INTEGER NOT NULL,
                token_count INTEGER NOT NULL,
                embed_model TEXT,
                embedding   BLOB,
                indexed_at  TEXT NOT NULL,
                UNIQUE(path, chunk_index)
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn upsert_is_idempotent_for_unchanged_content() {
        let dir = std::env::temp_dir().join("lsn_test_index_idempotent");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("note.md");
        std::fs::write(&file_path, "unchanged content").unwrap();

        let conn = test_conn();
        // Simulates a full rescan followed by an incremental update for the same file
        // with the same content — the acceptance criterion this ticket specifies.
        upsert_file_index(&conn, &file_path, "unchanged content").unwrap();
        let hash_after_rescan: String = conn
            .query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();

        upsert_file_index(&conn, &file_path, "unchanged content").unwrap();
        let hash_after_incremental: String = conn
            .query_row("SELECT content_hash FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();

        assert_eq!(hash_after_rescan, hash_after_incremental, "hash must be identical for unchanged content");

        // Also confirms the ON CONFLICT path really is an update, not a duplicate row.
        let row_count: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(row_count, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn upsert_preserves_sync_status_on_update() {
        let dir = std::env::temp_dir().join("lsn_test_index_sync_status");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file_path = dir.join("note.md");
        std::fs::write(&file_path, "v1").unwrap();

        let conn = test_conn();
        upsert_file_index(&conn, &file_path, "v1").unwrap();
        conn.execute(
            "UPDATE files SET sync_status = 'synced' WHERE path = ?1",
            params![file_path.to_string_lossy().as_ref()],
        )
        .unwrap();

        std::fs::write(&file_path, "v2").unwrap();
        upsert_file_index(&conn, &file_path, "v2").unwrap();

        let sync_status: String = conn
            .query_row("SELECT sync_status FROM files WHERE path = ?1", params![file_path.to_string_lossy().as_ref()], |r| r.get(0))
            .unwrap();
        assert_eq!(sync_status, "synced", "an unrelated content update must not reset sync_status");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rename_updates_exact_and_nested_paths() {
        let sep = std::path::MAIN_SEPARATOR;
        let conn = test_conn();
        let old_dir = format!("C:{sep}vault{sep}Notes");
        let new_dir = format!("C:{sep}vault{sep}Renamed");
        let nested_old = format!("{old_dir}{sep}inner.md");
        let unrelated = format!("C:{sep}vault{sep}NotesButNotReally{sep}other.md");

        for p in [&old_dir, &nested_old, &unrelated] {
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES (?1, 'h', 0, 't', 't')",
                params![p],
            )
            .unwrap();
        }

        reindex_after_rename(&conn, &old_dir, &new_dir).unwrap();

        let remaining_old: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![old_dir], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining_old, 0, "old directory path must no longer exist");

        let nested_new = format!("{new_dir}{sep}inner.md");
        let nested_moved: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![nested_new], |r| r.get(0))
            .unwrap();
        assert_eq!(nested_moved, 1, "nested file must have its path prefix rewritten");

        let unrelated_untouched: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![unrelated], |r| r.get(0))
            .unwrap();
        assert_eq!(unrelated_untouched, 1, "a similarly-named but distinct directory must not be affected");
    }

    #[test]
    fn remove_from_index_recursive_removes_nested_but_not_unrelated() {
        let sep = std::path::MAIN_SEPARATOR;
        let conn = test_conn();
        let dir_path = format!("C:{sep}vault{sep}ToDelete");
        let nested = format!("{dir_path}{sep}child.md");
        let unrelated = format!("C:{sep}vault{sep}ToDeleteButNotReally{sep}other.md");

        for p in [&dir_path, &nested, &unrelated] {
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES (?1, 'h', 0, 't', 't')",
                params![p],
            )
            .unwrap();
        }

        remove_from_index_recursive(&conn, &dir_path).unwrap();

        let remaining: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap();
        assert_eq!(remaining, 1, "only the unrelated path should survive");

        let unrelated_survives: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE path = ?1", params![unrelated], |r| r.get(0))
            .unwrap();
        assert_eq!(unrelated_survives, 1);
    }
}

#[cfg(test)]
mod history_tests {
    use super::*;

    #[test]
    fn snapshots_previous_content_before_overwrite() {
        let dir = std::env::temp_dir().join("lsn_test_history_basic");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("note.md");

        std::fs::write(&file_path, "version one").unwrap();
        snapshot_previous_version(&history_root, &file_path).unwrap();
        std::fs::write(&file_path, "version two").unwrap();

        let key = path_history_key(&file_path.to_string_lossy());
        let versions_dir = history_root.join(&key);
        let entries: Vec<_> = std::fs::read_dir(&versions_dir).unwrap().collect();
        assert_eq!(entries.len(), 1, "expected exactly one snapshot after one overwrite");

        let snapshot_content = std::fs::read_to_string(entries[0].as_ref().unwrap().path()).unwrap();
        assert_eq!(snapshot_content, "version one", "snapshot must hold the PREVIOUS content, not the new one");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn new_file_produces_no_snapshot() {
        let dir = std::env::temp_dir().join("lsn_test_history_newfile");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("brand-new.md");

        // File doesn't exist yet — nothing to snapshot.
        snapshot_previous_version(&history_root, &file_path).unwrap();
        assert!(!history_root.exists(), "no history directory should be created for a file that never existed");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn prunes_to_max_history_versions() {
        let dir = std::env::temp_dir().join("lsn_test_history_prune");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let history_root = dir.join("history");
        let file_path = dir.join("note.md");

        std::fs::write(&file_path, "v0").unwrap();
        for i in 1..=(MAX_HISTORY_VERSIONS + 5) {
            snapshot_previous_version(&history_root, &file_path).unwrap();
            std::fs::write(&file_path, format!("v{i}")).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        let key = path_history_key(&file_path.to_string_lossy());
        let versions_dir = history_root.join(&key);
        let count = std::fs::read_dir(&versions_dir).unwrap().count();
        assert_eq!(count, MAX_HISTORY_VERSIONS, "history must be capped at MAX_HISTORY_VERSIONS");

        let _ = std::fs::remove_dir_all(&dir);
    }
}

// ---------------------------------------------------------------------------
// OpenCode Agent: process management commands
//
// These commands manage the lifecycle of an `opencode serve` sidecar process
// that powers the OpenCode Agent tab in the AI Assistant Panel.
//
// Security notes (spec §"Corrected: Secrets Handling"):
// - BYOK API keys are injected as env vars scoped to the child process only.
// - They are NEVER written to disk (no ~/.config/opencode/config.json writes).
// - A per-session random password (OPENCODE_SERVER_PASSWORD) is generated by the
//   frontend and passed here; held only in Zustand state (never localStorage).
// - Ollama/local provider needs no API key env var at all.
// ---------------------------------------------------------------------------

/// Checks whether the `opencode` binary is on PATH by running `opencode --version`.
/// Returns true if the exit code is 0 (installed + accessible), false otherwise.
#[tauri::command]
pub fn check_opencode_installed() -> bool {
    std::process::Command::new("opencode")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Spawns `opencode serve --port <port>` in the given workspace directory.
///
/// `provider_env` is a map of env var → value for the user's BYOK credentials
/// (e.g. {"OPENAI_API_KEY": "sk-...", "GOOGLE_GENERATIVE_AI_API_KEY": "AIza..."}).
/// `server_password` is injected as OPENCODE_SERVER_PASSWORD so the local HTTP
/// endpoint is authenticated even though it only binds to localhost.
/// Returns the child PID on success, or an error string on failure.
#[tauri::command]
pub fn spawn_opencode_server(
    port: u16,
    workspace_path: String,
    server_password: String,
    provider_env: std::collections::HashMap<String, String>,
    mcp_override: Option<String>,
    mcp_env: Option<std::collections::HashMap<String, String>>,
) -> Result<u32, String> {
    let workspace = std::path::Path::new(&workspace_path);
    if !workspace.exists() {
        return Err(format!(
            "Workspace path does not exist: {}",
            workspace_path
        ));
    }

    let mut cmd = std::process::Command::new("opencode");
    cmd.arg("serve")
        .arg("--port")
        .arg(port.to_string())
        // Scope OpenCode's file tools to the user's vault.
        .current_dir(workspace)
        // Authenticate the local HTTP endpoint per spec §"Corrected: Local Server Authentication"
        .env("OPENCODE_SERVER_PASSWORD", &server_password)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    // Inject BYOK credentials scoped to this child process only — never written to disk.
    for (key, value) in &provider_env {
        if !value.is_empty() {
            cmd.env(key, value);
        }
    }

    // OpenCode MCP export (§ MCP_CONNECTORS_PLAN 6.3): OpenCode has no CLI flag to
    // register MCP servers for `serve` (verified: v1.18 accepts only project/global
    // config), so we write a project-local `opencode.json` — but ONLY when the vault
    // has no existing opencode config, so a user's own config is never clobbered.
    // Secrets (headers/env) are exported as `{env:VAR}` placeholders; the real values
    // are injected into this child's environment only, so nothing secret hits disk.
    if let Some(override_str) = mcp_override.filter(|s| !s.trim().is_empty()) {
        let dot_opencode = workspace.join(".opencode");
        let candidates = [
            workspace.join("opencode.json"),
            workspace.join("opencode.jsonc"),
            dot_opencode.join("opencode.json"),
            dot_opencode.join("opencode.jsonc"),
        ];
        let has_existing = candidates.iter().any(|p| p.exists());
        if has_existing {
            eprintln!("[OpenCode] existing opencode config found; skipping connector export");
        } else {
            let config_file = workspace.join("opencode.json");
            std::fs::write(&config_file, &override_str).map_err(|e| {
                format!("Failed to write connector config for opencode serve: {e}")
            })?;
            if let Some(env) = mcp_env {
                for (key, value) in env {
                    if !value.is_empty() {
                        cmd.env(key, value);
                    }
                }
            }
            if let Some(lock) = OPENCODE_MCP_CONFIG.get() {
                lock.lock().map_err(|e| e.to_string())?.replace(config_file);
            } else {
                let _ = OPENCODE_MCP_CONFIG
                    .set(Mutex::new(Some(config_file)));
            }
        }
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn opencode serve: {e}"))?;

    Ok(child.id())
}

/// Kills a running OpenCode server process by PID.
/// Uses taskkill on Windows, SIGTERM on Unix for a clean shutdown.
#[tauri::command]
pub fn kill_opencode_server(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("taskkill failed: {e}"))?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("kill failed: {e}"))?;
    }

    // Remove the connector-export config we wrote into the vault (if any).
    let Ok(mut lock) = OPENCODE_MCP_CONFIG.get_or_init(Default::default).lock() else {
        return Ok(());
    };
    if let Some(path) = lock.take() {
        let _ = std::fs::remove_file(path);
    }
    Ok(())
}
```


## `src-tauri\src\db.rs`

```rust
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use rusqlite::Connection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub path: String,
    pub content_hash: String,
    pub size_bytes: i64,
    pub mtime: String,
    pub last_indexed_at: String,
    pub last_backed_up_at: Option<String>,
    pub sync_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkItem {
    pub id: Option<i64>,
    pub source_path: String,
    pub target_path: String,
    pub link_text: String,
    pub line_number: i64,
}

pub struct DbState {
    pub vault_index: Mutex<Connection>,
}

impl DbState {
    pub fn new(app_dir: &std::path::Path) -> Result<Self, String> {
        let vault_index_path = app_dir.join("vault_index.db");

        let conn = Connection::open(&vault_index_path)
            .map_err(|e| format!("Failed to open vault_index.db: {e}"))?;

        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;

             CREATE TABLE IF NOT EXISTS files (
                 path            TEXT PRIMARY KEY,
                 content_hash    TEXT NOT NULL,
                 size_bytes      INTEGER NOT NULL,
                 mtime           TEXT NOT NULL,
                 last_indexed_at TEXT NOT NULL,
                 last_backed_up_at TEXT,
                 sync_status     TEXT NOT NULL DEFAULT 'not_tracked'
             );

             CREATE TABLE IF NOT EXISTS links (
                 id            INTEGER PRIMARY KEY AUTOINCREMENT,
                 source_path   TEXT NOT NULL,
                 target_path   TEXT NOT NULL,
                 link_text     TEXT NOT NULL,
                 line_number   INTEGER NOT NULL DEFAULT 1
             );

             CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_path);
             CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_path);

             -- Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, Phase 0): chunked note text with
             -- lazy f32 embeddings, an FTS5 shadow table kept in sync via triggers, and
             -- durable agent memory + a context audit log. All additive / non-breaking.
             CREATE TABLE IF NOT EXISTS note_chunks (
                 rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
                 path        TEXT NOT NULL,
                 chunk_index INTEGER NOT NULL,
                 chunk_text  TEXT NOT NULL,
                 char_offset INTEGER NOT NULL,
                 token_count INTEGER NOT NULL,
                 embed_model TEXT,
                 embedding   BLOB,
                 indexed_at  TEXT NOT NULL,
                 UNIQUE(path, chunk_index)
             );

             CREATE INDEX IF NOT EXISTS idx_chunks_path ON note_chunks(path);

             CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                 chunk_text,
                 content='note_chunks',
                 content_rowid='rowid'
             );

             CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON note_chunks BEGIN
                 INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.rowid, new.chunk_text);
             END;
             CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON note_chunks BEGIN
                 INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.rowid, old.chunk_text);
             END;
             CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON note_chunks BEGIN
                 INSERT INTO chunks_fts(chunks_fts, rowid, chunk_text) VALUES('delete', old.rowid, old.chunk_text);
                 INSERT INTO chunks_fts(rowid, chunk_text) VALUES (new.rowid, new.chunk_text);
             END;

             CREATE TABLE IF NOT EXISTS memory_entries (
                 id               INTEGER PRIMARY KEY AUTOINCREMENT,
                 scope            TEXT NOT NULL,
                 kind             TEXT NOT NULL,
                 role             TEXT,
                 content          TEXT NOT NULL,
                 source           TEXT NOT NULL,
                 topic_title      TEXT,
                 active           INTEGER NOT NULL DEFAULT 1,
                 access_count     INTEGER NOT NULL DEFAULT 0,
                 last_accessed_at TEXT,
                 created_at       TEXT NOT NULL,
                 embedding        BLOB
             );

             CREATE INDEX IF NOT EXISTS idx_memory_scope  ON memory_entries(scope);
             CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_entries(active);

             CREATE TABLE IF NOT EXISTS context_log (
                 id          INTEGER PRIMARY KEY AUTOINCREMENT,
                 turn_hash   TEXT NOT NULL,
                 scope       TEXT NOT NULL,
                 bundle_json TEXT NOT NULL,
                 created_at  TEXT NOT NULL
             );",
        )
        .map_err(|e| format!("Failed to initialize vault_index tables: {e}"))?;

        Ok(Self {
            vault_index: Mutex::new(conn),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_vault_index_db() {
        let dir = std::env::temp_dir().join("lsn_test_vault_index");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let state = DbState::new(&dir).unwrap();

        // files & links tables usable
        {
            let conn = state.vault_index.lock().unwrap();
            conn.execute(
                "INSERT INTO files (path, content_hash, size_bytes, mtime, last_indexed_at) VALUES ('/test.md', 'hash123', 100, '2026-09-02T00:00:00Z', '2026-09-02T00:00:00Z')",
                [],
            ).unwrap();

            conn.execute(
                "INSERT INTO links (source_path, target_path, link_text, line_number) VALUES ('/test.md', '/target.md', 'Target Note', 5)",
                [],
            ).unwrap();

            // note_chunks rows auto-sync into the FTS5 shadow table via triggers
            conn.execute(
                "INSERT INTO note_chunks (path, chunk_index, chunk_text, char_offset, token_count, indexed_at)
                 VALUES ('/test.md', 0, 'Energy of a photon equals h times frequency.', 0, 10, '2026-09-05T00:00:00Z')",
                [],
            ).unwrap();
            let fts_count: i64 = conn
                .query_row("SELECT count(*) FROM chunks_fts", [], |r| r.get(0))
                .unwrap();
            assert_eq!(fts_count, 1);

            conn.execute("DELETE FROM note_chunks WHERE path = '/test.md'", []).unwrap();
            let fts_count_after_delete: i64 = conn
                .query_row("SELECT count(*) FROM chunks_fts", [], |r| r.get(0))
                .unwrap();
            assert_eq!(fts_count_after_delete, 0);
        }
        assert!(dir.join("vault_index.db").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```


## `src-tauri\src\mcp.rs`

```rust
// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) connector host.
//
// Manages the lifecycle of registered MCP servers so the frontend can treat any
// connector (local stdio binary or remote streamable-http server) as a source of
// tools for the AI assistant / agent. Mirrors the design in MCP_CONNECTORS_PLAN.md:
//   - lazy: connectors only start on first tool call / explicit enable
//   - offline-first: nothing connects unless a connector is enabled by the user
//   - per-connector processes are tracked in the managed `McpState` map so they can
//     be killed cleanly on disable / window interactions
//
// Transport notes:
//   - stdio uses LSP-style Content-Length framed JSON-RPC (the MCP stdio spec)
//   - http uses streamable-http: POST per request, Accept json + event-stream,
//     Mcp-Session-Id reused when the server issues one
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const MCP_READ_TIMEOUT: Duration = Duration::from_secs(20);
const MCP_CONNECT_TIMEOUT: Duration = Duration::from_secs(12);
const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

// ---------------------------------------------------------------------------
// Managed state
// ---------------------------------------------------------------------------

pub struct McpState(Arc<Mutex<HashMap<String, McpClient>>>);

impl Default for McpState {
    fn default() -> Self {
        McpState(Arc::new(Mutex::new(HashMap::new())))
    }
}

pub(crate) enum McpClient {
    Stdio(McpStdioClient),
    Http(McpHttpClient),
}

pub(crate) struct McpStdioClient {
    child: Child,
    stdin: Option<ChildStdin>,
    rx: mpsc::Receiver<Value>,
    seq: u64,
}

#[derive(Default, Clone)]
pub(crate) struct McpHttpClient {
    session_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Wire types (mirror the frontend `McpConnector` shape)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)] // `name`/`tools` are presentational/cache fields from the frontend contract
pub struct ConnectorConfig {
    pub id: String,
    pub name: Option<String>,
    pub kind: String, // "stdio" | "http"
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub cwd: Option<String>,
    pub url: Option<String>,
    pub headers: Option<HashMap<String, String>>,
    pub env: Option<HashMap<String, String>>,
    pub tools: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Serialize)]
pub struct McpContent {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct McpCallResult {
    pub content: Vec<McpContent>,
    pub is_error: bool,
}

#[derive(Debug, Serialize)]
pub struct ConnectorHealth {
    pub ok: bool,
    pub tool_count: usize,
    pub error: Option<String>,
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

fn jsonrpc_client_info() -> Value {
    json!({
        "protocolVersion": MCP_PROTOCOL_VERSION,
        "capabilities": {},
        "clientInfo": { "name": "local-study-notebook", "version": "1.4.0" }
    })
}

fn request(client: &mut McpStdioClient, method: &str, params: Value) -> Result<Value, String> {
    client.seq += 1;
    let id = client.seq;
    let req = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});

    let stdin = client
        .stdin
        .as_mut()
        .ok_or_else(|| format!("'{method}': connector stdin is closed"))?;
    write_frame(stdin, &req).map_err(|e| format!("Failed to write '{method}' request: {e}"))?;

    loop {
        let msg = client.rx.recv_timeout(MCP_READ_TIMEOUT).map_err(|_| {
            format!(
                "Timed out after {:.0}s waiting for '{method}' response (is the connector still running?)",
                MCP_READ_TIMEOUT.as_secs_f32()
            )
        })?;
        if msg.get("id").and_then(Value::as_u64) == Some(id) {
            if let Some(err) = msg.get("error") {
                return Err(format!("Connector returned an error for '{method}': {err}"));
            }
            return Ok(msg.get("result").cloned().unwrap_or_else(|| json!(null)));
        }
        // Notifications / unrelated responses are skipped
    }
}

fn notify(client: &mut McpStdioClient, method: &str) -> Result<(), String> {
    let n = json!({"jsonrpc": "2.0", "method": method});
    let stdin = client
        .stdin
        .as_mut()
        .ok_or_else(|| format!("'{method}': connector stdin is closed"))?;
    write_frame(stdin, &n).map_err(|e| format!("Failed to write '{method}' notification: {e}"))
}

fn stdio_initialize(client: &mut McpStdioClient) -> Result<Value, String> {
    let result = request(client, "initialize", jsonrpc_client_info())?;
    notify(client, "notifications/initialized")?;
    Ok(result)
}

// ---------------------------------------------------------------------------
// stdio transport
// ---------------------------------------------------------------------------

fn spawn_stdio_child(config: &ConnectorConfig) -> Result<Child, String> {
    let command = config
        .command
        .clone()
        .ok_or_else(|| "stdio connector is missing a command".to_string())?;
    let args: Vec<String> = config.args.clone().unwrap_or_default();
    let cwd = config.cwd.clone();
    let env = config.env.clone().unwrap_or_default();

    #[cfg(target_os = "windows")]
    let mut cmd = {
        // npx / python etc. are .cmd/.bat shims on Windows that need cmd /C.
        let mut c = Command::new("cmd");
        c.arg("/C").arg(&command).args(&args);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new(&command);
        c.args(&args);
        c
    };

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    cmd.envs(env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null()) // draining stderr would risk deadlock; drop it
        .spawn()
        .map_err(|e| format!("Failed to spawn connector '{command}': {e}"))
}

/// Frames a JSON-RPC message using LSP-style Content-Length headers.
fn write_frame(stream: &mut impl Write, value: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(value)?;
    write!(stream, "Content-Length: {}\r\n\r\n", body.len())?;
    stream.write_all(&body)?;
    stream.flush()
}

/// Reads one Content-Length framed message from the connector's stdout.
fn read_frame(reader: &mut impl BufRead) -> std::io::Result<Option<Value>> {
    let mut content_length: Option<usize> = None;
    let mut line_buf = Vec::new();
    loop {
        line_buf.clear();
        let n = reader.read_until(b'\n', &mut line_buf)?;
        if n == 0 {
            return Ok(None); // EOF — connector exited
        }
        let line = String::from_utf8_lossy(&line_buf).trim().to_string();
        if line.is_empty() {
            break; // end of headers
        }
        if let Some(rest) = line.strip_prefix("Content-Length:") {
            content_length = rest.trim().parse().ok();
        }
    }
    let len = content_length.ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidData, "missing Content-Length in frame")
    })?;
    let mut body = vec![0u8; len];
    reader.read_exact(&mut body)?;
    serde_json::from_slice(&body)
        .map(Some)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

fn spawn_stdio_reader(stdout: std::process::ChildStdout) -> mpsc::Receiver<Value> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_frame(&mut reader) {
                Ok(Some(msg)) => {
                    if tx.send(msg).is_err() {
                        break; // client dropped the receiver
                    }
                }
                _ => break, // EOF or framing error — connector is gone
            }
        }
    });
    rx
}

fn build_stdio_client(config: &ConnectorConfig) -> Result<McpStdioClient, String> {
    let mut child = spawn_stdio_child(config)?;
    let pid = child.id();
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "connector did not expose stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "connector did not expose stdout".to_string())?;
    let rx = spawn_stdio_reader(stdout);

    let mut client = McpStdioClient {
        child,
        stdin: Some(stdin),
        rx,
        seq: 0,
    };

    if let Err(e) = stdio_initialize(&mut client) {
        let _ = client.child.kill();
        let _ = client.child.wait();
        return Err(format!(
            "Failed to initialize stdio connector (pid {pid}): {e}"
        ));
    }
    Ok(client)
}

// ---------------------------------------------------------------------------
// http (streamable-http) transport
// ---------------------------------------------------------------------------

fn http_post(
    config: &ConnectorConfig,
    method: &str,
    params: Value,
    session_id: &mut Option<String>,
) -> Result<(Value, Option<String>), String> {
    let url = config
        .url
        .clone()
        .ok_or_else(|| "http connector is missing a URL".to_string())?;
    let req_id: u64 = rand_req_id();
    let payload = json!({"jsonrpc": "2.0", "id": req_id, "method": method, "params": params});

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(MCP_READ_TIMEOUT.as_secs().max(
            MCP_CONNECT_TIMEOUT.as_secs(),
        )))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req_builder = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream");
    if let Some(sid) = session_id.as_ref() {
        req_builder = req_builder.header("Mcp-Session-Id", sid);
    }
    for (key, value) in config.headers.clone().unwrap_or_default() {
        req_builder = req_builder.header(key.as_str(), value.as_str());
    }

    let response = req_builder
        .body(payload.to_string())
        .send()
        .and_then(|res| res.error_for_status())
        .map_err(|e| e.to_string())?;

    let new_session_id = response
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let body = response.text().map_err(|e| e.to_string())?;

    let value = if content_type.contains("text/event-stream") {
        parse_sse_response(&body, req_id)?
    } else {
        serde_json::from_str::<Value>(&body)
            .map_err(|e| format!("Connector '{method}' returned non-JSON: {e}"))?
    };

    if let Some(err) = value.get("error") {
        return Err(format!("Connector returned an error for '{method}': {err}"));
    }

    Ok((value, new_session_id))
}

fn rand_req_id() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(1)
}

/// Some streamable-http servers answer every POST with a single SSE frame holding
/// the response (id-tagged). Collect `data:` payloads and return the matching one.
fn parse_sse_response(body: &str, req_id: u64) -> Result<Value, String> {
    for line in body.lines() {
        let line = line.trim();
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<Value>(data.trim()) else {
            continue;
        };
        if v.get("jsonrpc").is_some() {
            if let Some(mid) = v.get("id").and_then(Value::as_u64) {
                if mid == req_id {
                    return Ok(v);
                }
            }
        }
    }
    // Fall back to treating the whole body as JSON (mislabeled mime).
    serde_json::from_str(body)
        .map_err(|e| format!("Did not find a response for request {req_id} in SSE stream: {e}"))
}

/// Streamable-http: the `initialized` notification is a separate empty POST that
/// carries the session id so the server transitions the session to "ready".
fn http_send_initialized_notification(config: &ConnectorConfig, session_id: &str) {
    let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(MCP_CONNECT_TIMEOUT)
        .build()
    else {
        return;
    };
    let Some(url) = config.url.clone() else {
        return;
    };
    let req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Mcp-Session-Id", session_id);
    let _ = req.send();
}

fn http_ensure_ready(config: &ConnectorConfig, client: &mut McpHttpClient) -> Result<(), String> {
    if client.session_id.is_none() {
        let (_result, sid) = http_post(config, "initialize", jsonrpc_client_info(), &mut client.session_id)?;
        if let Some(s) = sid {
            client.session_id = Some(s);
        }
        if let Some(sid) = client.session_id.as_ref() {
            http_send_initialized_notification(config, sid);
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Response extraction
// ---------------------------------------------------------------------------

fn extract_tools(v: &Value) -> Result<Vec<McpTool>, String> {
    let result = v.get("result").cloned().unwrap_or_default();
    let tools = result
        .get("tools")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(tools
        .into_iter()
        .map(|t| McpTool {
            name: t.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
            description: t
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
            input_schema: t.get("inputSchema").cloned().unwrap_or_else(|| json!({})),
        })
        .collect())
}

fn extract_call_result(v: &Value) -> McpCallResult {
    let result = v.get("result").cloned().unwrap_or_default();
    let content = result
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|c| McpContent {
            kind: c.get("type").and_then(Value::as_str).unwrap_or("text").to_string(),
            text: c.get("text").and_then(Value::as_str).map(str::to_string),
        })
        .collect();
    let is_error = result
        .get("isError")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    McpCallResult { content, is_error }
}

// ---------------------------------------------------------------------------
// Router helpers shared by the commands
// ---------------------------------------------------------------------------

fn ensure_client(
    map: &mut HashMap<String, McpClient>,
    config: &ConnectorConfig,
) -> Result<(), String> {
    if map.contains_key(&config.id) {
        return Ok(());
    }
    if config.kind == "http" {
        let mut client = McpHttpClient::default();
        http_ensure_ready(config, &mut client)?;
        map.insert(config.id.clone(), McpClient::Http(client));
    } else {
        let client = build_stdio_client(config)?;
        map.insert(config.id.clone(), McpClient::Stdio(client));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Returns the list of tools exposed by a connector (starting it if necessary).
/// Cached client state stays alive in `McpState` for subsequent calls.
#[tauri::command]
pub async fn list_connector_tools(
    state: tauri::State<'_, McpState>,
    config: ConnectorConfig,
) -> Result<Vec<McpTool>, String> {
    let arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        let mut map = arc.lock().map_err(|e| e.to_string())?;
        ensure_client(&mut map, &config)?;
        match map.get_mut(&config.id) {
            Some(McpClient::Stdio(client)) => {
                let v = request(client, "tools/list", json!({}))?;
                extract_tools(&v)
            }
            Some(McpClient::Http(client)) => {
                http_ensure_ready(&config, client)?;
                let (v, sid) = http_post(&config, "tools/list", json!({}), &mut client.session_id)?;
                if let Some(s) = sid {
                    client.session_id = Some(s);
                }
                extract_tools(&v)
            }
            None => Err("Connector was removed while starting".to_string()),
        }
    })
    .await
    .map_err(|e| format!("MCP tool listing task panicked: {e}"))?;
    inner
}

/// Invokes a tool on a connector and returns the rendered content blocks.
#[tauri::command]
pub async fn call_connector_tool(
    state: tauri::State<'_, McpState>,
    config: ConnectorConfig,
    name: String,
    args: Value,
) -> Result<McpCallResult, String> {
    let arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        let mut map = arc.lock().map_err(|e| e.to_string())?;
        ensure_client(&mut map, &config)?;
        match map.get_mut(&config.id) {
            Some(McpClient::Stdio(client)) => {
                let v = request(client, "tools/call", json!({"name": name, "arguments": args}))?;
                Ok(extract_call_result(&v))
            }
            Some(McpClient::Http(client)) => {
                http_ensure_ready(&config, client)?;
                let (v, sid) = http_post(
                    &config,
                    "tools/call",
                    json!({"name": name, "arguments": args}),
                    &mut client.session_id,
                )?;
                if let Some(s) = sid {
                    client.session_id = Some(s);
                }
                Ok(extract_call_result(&v))
            }
            None => Err("Connector was removed while starting".to_string()),
        }
    })
    .await
    .map_err(|e| format!("MCP tool call task panicked: {e}"))?;
    inner
}

/// Health check used by the Settings "Test" button: initialize + tools/list, then
/// tear the connector back down so the test never leaves a process running.
#[tauri::command]
pub async fn test_connector(
    state: tauri::State<'_, McpState>,
    config: ConnectorConfig,
) -> Result<ConnectorHealth, String> {
    let _arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        if config.kind == "http" {
            let mut client = McpHttpClient::default();
            http_ensure_ready(&config, &mut client)?;
            let (v, sid) = http_post(&config, "tools/list", json!({}), &mut client.session_id)?;
            if let Some(s) = sid {
                client.session_id = Some(s);
            }
            let tools = extract_tools(&v)?;
            return Ok(ConnectorHealth {
                ok: true,
                tool_count: tools.len(),
                error: None,
            });
        }

        let mut client = build_stdio_client(&config)?;
        let list = request(&mut client, "tools/list", json!({}));
        let tools = match list {
            Ok(v) => extract_tools(&v),
            Err(e) => {
                let _ = client.child.kill();
                let _ = client.child.wait();
                return Err(e);
            }
        };
        let _ = client.child.kill();
        let _ = client.child.wait();
        match tools {
            Ok(t) => Ok(ConnectorHealth {
                ok: true,
                tool_count: t.len(),
                error: None,
            }),
            Err(e) => Err(e),
        }
    })
    .await
    .map_err(|e| format!("Connector test task panicked: {e}"))?;
    inner
}

/// Stops a running connector by id (kills the stdio child if present).
#[tauri::command]
pub async fn stop_connector(
    state: tauri::State<'_, McpState>,
    id: String,
) -> Result<(), String> {
    let arc = state.0.clone();
    let inner = tauri::async_runtime::spawn_blocking(move || {
        let mut map = arc.lock().map_err(|e| e.to_string())?;
        if let Some(McpClient::Stdio(mut client)) = map.remove(&id) {
            let _ = client.child.kill();
            let _ = client.child.wait();
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Connector stop task panicked: {e}"))?;
    inner
}
```


## `src-tauri\src\embeddings.rs`

```rust
// Vector helpers for Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1).
// Embedding vectors are stored in SQLite as packed little-endian f32 BLOBs; cosine
// similarity and top-k are computed in Rust over candidate rows (FTS5 pre-filter +
// re-rank). The embedding HTTP calls run in the frontend (consistent with aiProvider.ts),
// which is why this module has no network client.

/// Packs f32 values into a contiguous little-endian byte blob for SQLite storage.
pub fn pack_f32s(values: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(values.len() * 4);
    for v in values {
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

/// Unpacks a blob produced by [`pack_f32s`]. Trailing bytes that don't form a complete
/// f32 are ignored.
#[allow(dead_code)]
pub fn unpack_f32s(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

/// Cosine similarity between two vectors. Returns 0.0 if either vector has no magnitude
/// or the lengths differ (zip truncates).
#[allow(dead_code)]
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let mut dot = 0.0f64;
    let mut na = 0.0f64;
    let mut nb = 0.0f64;
    for (x, y) in a.iter().zip(b.iter()) {
        let x = *x as f64;
        let y = *y as f64;
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    (dot / (na.sqrt() * nb.sqrt())) as f32
}

/// Returns the indices of the highest-scoring `(index, score)` pairs, descending.
#[allow(dead_code)]
pub fn top_k_scored<I: Iterator<Item = (usize, f32)>>(scores: I, k: usize) -> Vec<usize> {
    let mut list: Vec<(usize, f32)> = scores.collect();
    list.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    list.into_iter().take(k).map(|(idx, _)| idx).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_unpack_roundtrip() {
        let values = vec![0.0f32, -1.5, 3.25, f32::MIN, f32::MAX];
        let blob = pack_f32s(&values);
        assert_eq!(blob.len(), values.len() * 4);
        assert_eq!(unpack_f32s(&blob), values);
    }

    #[test]
    fn unpack_ignores_padding_bytes() {
        let mut blob = pack_f32s(&[1.0, 2.0]);
        blob.push(0xAA);
        assert_eq!(unpack_f32s(&blob), vec![1.0, 2.0]);
    }

    #[test]
    fn cosine_known_values() {
        assert!((cosine(&[1.0, 0.0], &[1.0, 0.0]) - 1.0).abs() < 1e-6);
        assert!((cosine(&[1.0, 0.0], &[0.0, 1.0]) - 0.0).abs() < 1e-6);
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 1.0]), 0.0);
        assert_eq!(cosine(&[1.0, 1.0], &[]), 0.0);
    }

    #[test]
    fn top_k_returns_highest_first() {
        let idxs = top_k_scored([(0usize, 0.1f32), (1, 0.9), (2, 0.5)].into_iter(), 2);
        assert_eq!(idxs, vec![1, 2]);
        assert!(top_k_scored([(0, 0.1), (1, 0.9)].into_iter(), 0).is_empty());
    }
}
```


## `src-tauri\src\drive.rs`

```rust
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
```


## `src-tauri\src\chunks.rs`

```rust
// Markdown chunking for the Memory-RAG index (AGENT_MEMORY_RAG_PLAN.md, M1).
// Splits note content into structurally aware ~MAX_TOKENS-token windows with a small
// overlap so retrieval candidates survive sentence/paragraph splits. Each chunk records
// the byte offset of its first character back into the source (used for snippet
// highlighting) and an estimated token count (chars / 4).

pub const MAX_TOKENS: usize = 512;
pub const OVERLAP_TOKENS: usize = 32;

#[derive(Debug, Clone, PartialEq)]
pub struct Chunk {
    pub text: String,
    /// Byte offset of the chunk's first character in the (frontmatter-stripped) source.
    pub char_offset: usize,
    pub token_count: usize,
}

struct Block {
    text: String,
    offset: usize,
}

/// Splits note content into chunks. Returns an empty vec for empty/whitespace-only input.
pub fn chunk_markdown(content: &str) -> Vec<Chunk> {
    let body = strip_frontmatter(content).unwrap_or(content);
    let blocks = split_blocks(body);

    let mut chunks: Vec<Chunk> = Vec::new();
    let mut current = String::new();
    let mut current_tokens = 0usize;
    let mut current_offset = 0usize;
    let mut overlap: Option<String> = None;

    for block in blocks {
        let block_tokens = est_tokens(&block.text);

        if !current.is_empty()
            && (block.text.starts_with('#') || current_tokens + block_tokens > MAX_TOKENS)
        {
            let tail = tail_tokens(&current, OVERLAP_TOKENS);
            chunks.push(Chunk {
                text: std::mem::take(&mut current),
                char_offset: current_offset,
                token_count: current_tokens,
            });
            current_tokens = 0;
            overlap = Some(tail);
        }

        // Oversized blocks (no natural paragraph boundary under the token budget) are
        // split into fixed windows of their own; they never mix with `current`.
        if block_tokens > MAX_TOKENS {
            if !current.is_empty() {
                chunks.push(Chunk {
                    text: std::mem::take(&mut current),
                    char_offset: current_offset,
                    token_count: current_tokens,
                });
                current_tokens = 0;
            }
            for window in split_long_block(&block) {
                chunks.push(window);
            }
            overlap = None;
            continue;
        }

        if current.is_empty() {
            current_offset = block.offset;
            if let Some(tail) = overlap.take() {
                current.push_str(tail.trim_end());
                if current.chars().next_back() != Some(' ') {
                    current.push(' ');
                }
                current_tokens = est_tokens(&current);
            }
        } else {
            current.push('\n');
        }

        current.push_str(&block.text);
        current_tokens += block_tokens;
    }

    if !current.is_empty() {
        chunks.push(Chunk {
            text: current,
            char_offset: current_offset,
            token_count: current_tokens,
        });
    }

    chunks
}

/// Removes a `---\n...\n---` YAML frontmatter block if present.
fn strip_frontmatter(content: &str) -> Option<&str> {
    let open = content.strip_prefix("---\n")?;
    let close_idx = open.find("\n---")?;
    let after_close = &open[close_idx + 4..];
    Some(after_close.strip_prefix('\n').unwrap_or(after_close))
}

/// Groups consecutive non-blank lines into blocks, recording each block's byte offset.
fn split_blocks(content: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut buf = String::new();
    let mut buf_offset = 0usize;
    let mut cursor = 0usize;

    for line in content.split_inclusive('\n') {
        if line.trim().is_empty() {
            if !buf.is_empty() {
                blocks.push(Block {
                    text: std::mem::take(&mut buf),
                    offset: buf_offset,
                });
            }
            cursor += line.len();
            continue;
        }
        let line_text = line.strip_suffix('\n').unwrap_or(line);
        if buf.is_empty() {
            buf_offset = cursor;
        } else {
            buf.push('\n');
        }
        buf.push_str(line_text);
        cursor += line.len();
    }

    if !buf.is_empty() {
        blocks.push(Block {
            text: buf,
            offset: buf_offset,
        });
    }
    blocks
}

/// Rough token estimate: 4 chars per token.
fn est_tokens(s: &str) -> usize {
    let chars = s.chars().count();
    if chars == 0 {
        0
    } else {
        (chars + 3) / 4
    }
}

fn tail_tokens(s: &str, n: usize) -> String {
    let max_chars = n.saturating_mul(4);
    let count = s.chars().count();
    if count <= max_chars {
        return s.to_string();
    }
    s.chars().skip(count - max_chars).collect()
}

fn split_long_block(block: &Block) -> Vec<Chunk> {
    let window_chars = MAX_TOKENS.saturating_mul(4);
    let chars: Vec<char> = block.text.chars().collect();
    let mut out = Vec::new();
    let mut start = 0usize;
    let mut window_offset = block.offset; // byte offset of `start` within the source
    let mut prev_tail: Option<String> = None;

    while start < chars.len() {
        let end = (start + window_chars).min(chars.len());
        let raw: String = chars[start..end].iter().collect();

        let (text, char_offset) = match prev_tail.take() {
            Some(tail) => {
                let offset = window_offset.saturating_sub(tail.len());
                (format!("{} {}", tail.trim_end(), raw), offset)
            }
            None => (raw.clone(), window_offset),
        };

        out.push(Chunk {
            char_offset,
            token_count: est_tokens(&text),
            text: text.clone(),
        });

        prev_tail = Some(tail_tokens(&text, OVERLAP_TOKENS));
        window_offset += raw.len();
        start = end;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_whitespace_produce_no_chunks() {
        assert!(chunk_markdown("").is_empty());
        assert!(chunk_markdown("\n\n   \n").is_empty());
    }

    #[test]
    fn small_note_is_a_single_chunk() {
        let content = "The mitochondria is the powerhouse of the cell.";
        let chunks = chunk_markdown(content);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].char_offset, 0);
        assert_eq!(chunks[0].text, content);
        assert!(chunks[0].token_count > 0);
    }

    #[test]
    fn frontmatter_is_stripped_and_offsets_stay_in_source() {
        let content = "---\ntitle: Test\ntags: [physics]\n---\n# Energy\n\nE = hf.";
        let chunks = chunk_markdown(content);
        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.starts_with("# Energy"));
        assert!(!chunks[0].text.contains("title:"));
    }

    #[test]
    fn heading_boundary_starts_a_new_chunk() {
        // Two sections under the budget; heading appears between them and must not merge.
        let content = format!(
            "# Section One\n\n{}\n\n# Section Two\n\n{}",
            "alpha ".repeat(300),
            "beta ".repeat(300)
        );
        let chunks = chunk_markdown(&content);
        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].text.starts_with("# Section One"));
        // chunk 1 leads with the ~OVERLAP_TOKENS overlap tail, then the new heading.
        assert!(chunks[1].text.contains("# Section Two"));
        assert!(chunks[1].char_offset > chunks[0].char_offset);
    }

    #[test]
    fn large_paragraph_splits_with_overlap() {
        // ~30 * 300 == 9000 chars (~2250 tokens) — well over MAX_TOKENS.
        let content = "lorem ipsum dolor sit amet ".repeat(300);
        let chunks = chunk_markdown(&content);
        assert!(chunks.len() >= 4, "expected multiple chunks, got {}", chunks.len());
        assert_eq!(chunks[0].char_offset, 0);

        // Consecutive chunks carry ~OVERLAP_TOKENS of shared tail text.
        let tail = tail_tokens(&chunks[0].text, OVERLAP_TOKENS);
        assert!(
            chunks[1].text.starts_with(tail.trim_end()),
            "chunk 1 should lead with chunk 0's overlap tail"
        );

        // Offsets strictly increase and stay within the source bounds.
        for pair in chunks.windows(2) {
            assert!(pair[1].char_offset > pair[0].char_offset);
            assert!(pair[1].char_offset < content.len());
        }
    }
}
```


## `src-tauri\src\main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    local_study_notebook_lib::run()
}
```


## `src\main.tsx`

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```


## `src\App.tsx`

```typescript
import { useEffect } from "react";
import { useStore } from "./stores/useStore";
import Layout from "./components/Layout";

function App() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const refreshExplorer = useStore((s) => s.refreshExplorer);
  const reduceMotion = useStore((s) => s.settings.reduceMotion);
  const onboardingComplete = useStore((s) => s.onboardingComplete);
  const refreshGoogleAccount = useStore((s) => s.refreshGoogleAccount);

  const startupFolder = useStore((s) => s.settings.startupFolder);
  const openFolder = useStore((s) => s.openFolder);

  // Restore the signed-in Google Drive account (refresh token lives in the OS Credential Manager)
  useEffect(() => {
    refreshGoogleAccount();
  }, [refreshGoogleAccount]);

  useEffect(() => {
    if (!onboardingComplete) return;
    if (!currentFolderPath && startupFolder) {
      openFolder(startupFolder);
    } else if (currentFolderPath) {
      refreshExplorer();
    }
  }, [currentFolderPath, startupFolder, openFolder, refreshExplorer, onboardingComplete]);

  // Apply reduce motion preference globally
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  // Register window close handler to flush pending saves before exit
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function registerCloseHandler() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          await useStore.getState().flushPendingSave();
          if (unlisten) {
            unlisten();
          }
          await appWindow.close();
        });
      } catch (err) {
        console.warn("Tauri close listener setup failed or not in Tauri environment", err);
      }
    }

    registerCloseHandler();

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useStore.getState();
      if (state.leftSaveStatus === "unsaved" || state.rightSaveStatus === "unsaved") {
        state.flushPendingSave();
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (unlisten) unlisten();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return <Layout />;
}

export default App;
```


## `src\index.css`

```css
@import "tailwindcss";

@theme {
  --color-bg: #141418;
  --color-card: #1b1b1b;
  --color-accent: #3b82f6;
  --color-accent-hover: #2563eb;
  --color-text: #eceff4;
  --color-muted: #788296;
  --color-border: #26272b;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

* {
  scrollbar-width: thin;
  scrollbar-color: #2c2d33 transparent;
}

*::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background: #2c2d33;
  border-radius: 4px;
}
*::-webkit-scrollbar-thumb:hover {
  background: #3e414d;
}

.panel-rounded {
  border-radius: var(--panel-roundness, 8px);
}

/* TopBar Session Tabs scrollbar hide */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Document Markdown Styling */
.markdown-preview {
  line-height: 1.75;
  color: var(--color-text);
  font-size: 0.925rem;
}

.markdown-preview h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 1.25rem 0 0.75rem;
  color: #ffffff;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.4rem;
}

.markdown-preview h2 {
  font-size: 1.35rem;
  font-weight: 600;
  margin: 1.2rem 0 0.6rem;
  color: #ffffff;
}

.markdown-preview h3 {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 1rem 0 0.5rem;
  color: #f1f3f9;
}

.markdown-preview p {
  margin: 0.65rem 0;
}

.markdown-preview strong {
  font-weight: 600;
  color: #ffffff;
}

.markdown-preview ul {
  list-style: disc;
  padding-left: 1.4rem;
  margin: 0.65rem 0;
}

.markdown-preview ol {
  list-style: decimal;
  padding-left: 1.4rem;
  margin: 0.65rem 0;
}

.markdown-preview li {
  margin: 0.25rem 0;
}

.markdown-preview a {
  color: var(--color-accent);
  text-decoration: none;
  border-bottom: 1px dashed var(--color-accent);
  transition: color 0.15s;
}

.markdown-preview a:hover {
  color: var(--color-accent-hover);
  border-bottom-style: solid;
}

.markdown-preview code {
  background: #24252a;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  color: #79c0ff;
  border: 1px solid #2d2f38;
}

.markdown-preview pre {
  background: #141416;
  padding: 0.85rem 1rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.85rem 0;
  border: 1px solid var(--color-border);
}

.markdown-preview pre code {
  background: transparent;
  padding: 0;
  border: none;
  color: #eceff4;
  font-size: 0.85em;
}

.markdown-preview blockquote {
  border-left: 3px solid var(--color-accent);
  padding-left: 1rem;
  margin: 1rem 0;
  color: var(--color-muted);
  font-style: italic;
  background: rgba(59, 130, 246, 0.05);
  border-radius: 0 4px 4px 0;
  padding-top: 0.4rem;
  padding-bottom: 0.4rem;
}

.markdown-preview table {
  border-collapse: collapse;
  margin: 0.85rem 0;
  width: auto;
}

.markdown-preview th,
.markdown-preview td {
  border: 1px solid var(--color-border);
  padding: 0.35rem 0.75rem;
  text-align: left;
}

.markdown-preview th {
  font-weight: 700;
  background: rgba(255, 255, 255, 0.03);
}

/* Document Editor Input */
.editor-input {
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  width: 100%;
  height: 100%;
  color: var(--color-text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 0.925rem;
  line-height: 1.75;
}

/* Hover Spin animation for Settings gear */
@keyframes hover-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.animate-hover-spin:hover {
  animation: hover-spin 4s linear infinite;
}
```


## `src\themes.ts`

```typescript
export type ThemeColorMap = {
  bg: string;
  card: string;
  accent: string;
  accentHover: string;
  text: string;
  muted: string;
  border: string;
  serif?: string;
};

export interface ThemeDef {
  id: string;
  name: string;
  description: string;
  colors: ThemeColorMap;
}

// Five dark preset themes
export const THEMES: ThemeDef[] = [
  {
    id: "obsidian-dark",
    name: "Obsidian Dark",
    description: "Classic deep charcoal with a blue accent.",
    colors: {
      bg: "#181818",
      card: "#191919",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      text: "#e5e5e5",
      muted: "#737373",
      border: "#2a2a2a",
    },
  },
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    description: "Cool navy-toned dark palette for night reading.",
    colors: {
      bg: "#0f1420",
      card: "#131a2a",
      accent: "#38bdf8",
      accentHover: "#0ea5e9",
      text: "#dbeafe",
      muted: "#64748b",
      border: "#1e293b",
    },
  },
  {
    id: "nord-dark",
    name: "Nord Dark",
    description: "Calm arctic-inspired palette from the Nord theme.",
    colors: {
      bg: "#2e3440",
      card: "#3b4252",
      accent: "#88c0d0",
      accentHover: "#81a1c1",
      text: "#eceff4",
      muted: "#8b93a5",
      border: "#4c566a",
    },
  },
  {
    id: "dracula-dark",
    name: "Dracula Dark",
    description: "Vivid purple/dark palette with a signature pink accent.",
    colors: {
      bg: "#191a21",
      card: "#21222c",
      accent: "#bd93f9",
      accentHover: "#ff79c6",
      text: "#f8f8f2",
      muted: "#6272a4",
      border: "#282a36",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    description: "Dark blue-black night palette with electric accents.",
    colors: {
      bg: "#1a1b26",
      card: "#1f2335",
      accent: "#7aa2f7",
      accentHover: "#bb9af7",
      text: "#c0caf5",
      muted: "#565f89",
      border: "#292e42",
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

export function getThemeById(id: string): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

export function applyThemeToDocument(colors: ThemeColorMap): void {
  const root = document.documentElement;
  root.style.setProperty("--color-bg", colors.bg);
  root.style.setProperty("--color-card", colors.card);
  root.style.setProperty("--color-accent", colors.accent);
  root.style.setProperty("--color-accent-hover", colors.accentHover);
  root.style.setProperty("--color-text", colors.text);
  root.style.setProperty("--color-muted", colors.muted);
  root.style.setProperty("--color-border", colors.border);
}
```


## `src\types\index.ts`

```typescript
export interface Source {
  id: number;
  title: string;
  file_type: string;
  file_path: string | null;
  raw_content: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: number;
  source_id: number | null;
  title: string;
  content: string;
  pinned: boolean;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface OpenTab {
  id: number; // note id, -1 for a new blank note
  title: string;
  sourceId: number | null;
  pinned: boolean;
  dirty: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  pinned?: boolean;
  lastOpened: string; // ISO timestamp
}

export type ConnectorKind = "stdio" | "http";

export interface McpConnector {
  id: string;
  name: string;
  kind: ConnectorKind;
  // stdio server (local binary)
  command?: string;
  args?: string[];
  cwd?: string;
  // http (streamable-http) server
  url?: string;
  headers?: Record<string, string>;
  // common
  enabled: boolean;
  env?: Record<string, string>;   // scoped child env vars (never persisted secrets)
  tools?: string[];               // cached list of tool names exposed by this server
}
```


## `src\stores\useStore.ts`

```typescript
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { getThemeById, applyThemeToDocument } from "../themes";
import type { Project, McpConnector } from "../types";
import { streamAIResponse, fetchAvailableModels } from "../services/aiProvider";

// Debounce window for the lazy Memory-RAG embedding pass that runs after vault reindex.
let pendingEmbedRebuildTimer: ReturnType<typeof setTimeout> | null = null;


// Built-in research connector presets (offline-first: shipped disabled). Users opt in
// per-connector in Settings -> Connectors & Research. Remote presets that need a key
// leave `headers` empty until the user supplies credentials.
export const CONNECTOR_PRESETS: McpConnector[] = [
  {
    id: "preset-wikipedia",
    name: "Wikipedia",
    kind: "http",
    url: "https://mcp-wikipedia.vdo.pub/sse",
    enabled: false,
    headers: {},
  },
  {
    id: "preset-arxiv",
    name: "Arxiv Research",
    kind: "http",
    url: "https://mcp-papers-api.arxiv.org/sse",
    enabled: false,
    headers: {},
  },
  {
    id: "preset-filesystem",
    name: "Filesystem",
    kind: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    enabled: false,
    env: {},
  },
  {
    id: "preset-fetch",
    name: "Fetch (raw URLs)",
    kind: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-fetch"],
    enabled: false,
    env: {},
  },
];


export type ViewMode = "source" | "live" | "preview";
export type SaveStatus = "saved" | "saving" | "unsaved";
export type SidePanelId = "assistant" | "sources" | "artifacts" | "agent";

export interface Artifact {
  id: string;
  title: string;
  type: "code" | "markdown" | "html";
  content: string;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}

export type AgentTask = "summarize" | "improve" | "assess" | "custom";

export interface CustomLayout {
  id: string;
  name: string;
  panelOrder: SidePanelId[];
  showAssistantPanel: boolean;
  showSourcesPanel: boolean;
  showArtifactsPanel: boolean;
  showAgentPanel: boolean;
  assistantWidth: number;
  sourcePanelWidth: number;
  artifactsWidth: number;
  agentWidth: number;
  splitActive: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

export interface Tab {
  id: string; // absolute file path
  title: string;
  pinned: boolean;
}

export interface SessionTab {
  id: string;
  title: string;
  active: boolean;
  openTabs: Tab[];
}

export interface UserAccount {
  name: string;
  email: string;
  avatarLetter: string;
  avatarColor: string;
}

export interface GoogleAccount {
  name: string;
  email: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Pending destructive file-write tool approval (Phase 2b approval gate). A tool call
// suspends in `executeWorkspaceTool` until the user approves or rejects it.
export interface PendingToolApproval {
  id: string;
  tool: string;
  args: Record<string, any>;
  summary: string;
  status: "pending" | "approved" | "rejected";
}

const INITIAL_ASSISTANT_MESSAGES: AssistantMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    timestamp: "12:00 PM",
    content: "Welcome to Local Study Notebook! I am your offline study assistant. You can ask me for study tips, markdown help, or note-taking advice.",
  },
];

export interface Settings {
  fontSize: number;
  theme: string;
  accentColor: string;
  cornerRoundness: "sm" | "md" | "lg" | "none";
  lineWrap: boolean;
  tabSize: number;
  fontFamily: string;
  showLineNumbers: boolean;
  livePreviewEnabled: boolean;
  livePreviewTimeout: number; // in ms
  startupFolder: string;
  newNoteLocation: string;
  excludedFolders: string;
  attachmentsFolder: string;
  confirmBeforeDelete: boolean;
  reduceMotion: boolean;
  autoPairBrackets: boolean;
  showWordCount: boolean;

  // BYOK AI Engine Settings
  aiEnabled: boolean;
  aiProvider: string; // "ollama_hermes" | "openai" | "anthropic" | "gemini" | "custom"
  aiBaseUrl: string;
  aiApiKey: string;
  aiModelName: string;
  aiEnableWorkspaceTools: boolean;
  aiSystemPrompt: string;

  // Memory-RAG (Agent Knowledge) settings
  embedBaseUrl: string; // Ollama HTTP root, e.g. http://localhost:11434
  embedModel: string;   // embedding model tag, e.g. nomic-embed-text
  ragTopK: number;      // RAG passages injected into context per turn
  memoryAutoSave: boolean; // persist Q&A turns and extracted facts to memory_entries

  // File-mutation tools (create/update/delete) — off by default
  aiEnableFileWrite: boolean;

  // OpenCode Agent Settings
  opencodePort: number;       // default 4096 (OpenCode's own default for `opencode serve`)
  opencodeAutoStart: boolean; // auto-start server when switching to OpenCode Agent tab

  // MCP Connectors
  connectors: McpConnector[];
}

const DEFAULT_SETTINGS: Settings = {
  fontSize: 14,
  theme: "obsidian-dark",
  accentColor: "",
  cornerRoundness: "md",
  lineWrap: true,
  tabSize: 4,
  fontFamily: "system",
  showLineNumbers: false,
  livePreviewEnabled: true,
  livePreviewTimeout: 1000,
  startupFolder: "",
  newNoteLocation: "",
  excludedFolders: "node_modules, .git",
  attachmentsFolder: "_attachments",
  confirmBeforeDelete: true,
  reduceMotion: false,
  autoPairBrackets: true,
  showWordCount: true,

  // BYOK AI Defaults
  aiEnabled: true,
  aiProvider: "ollama_hermes",
  aiBaseUrl: "http://localhost:11434/v1",
  aiApiKey: "",
  aiModelName: "hermes3:8b",
  aiEnableWorkspaceTools: true,
  aiSystemPrompt: "You are an intelligent study assistant for Local Study Notebook. Use workspace tools and context to provide accurate study summaries.",

  // Memory-RAG defaults
  embedBaseUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  ragTopK: 5,
  memoryAutoSave: true,

  // File-mutation tools (create/update/delete) are gated off by default
  aiEnableFileWrite: false,

  // OpenCode Agent defaults
  opencodePort: 4096,        // OpenCode's actual documented default port for `opencode serve`
  opencodeAutoStart: true,

  // MCP Connectors — all disabled by default (offline-first, opt-in). Ship with the
  // research presets below so the user can flip them on in Settings -> Connectors.
  connectors: [],
};

interface AppState {
  // Explorer States
  currentFolderPath: string | null;
  explorerEntries: FileEntry[];
  pinnedPaths: string[];
  showSourcesPanel: boolean; // Toggles the Sidebar Explorer panel
  sidebarTab: "sources" | "notes"; // "sources" represents Folder Explorer, "notes" is Pinned/Recent notes list

  // Panel ordering (left-to-right order of the two side panels, StudyBoard is always last/center)
  panelOrder: SidePanelId[];
  reorderPanels: (fromId: SidePanelId, toId: SidePanelId) => void;

  // Split-Screen Workspace States
  splitActive: boolean;
  activePanel: "left" | "right";
  leftTabs: Tab[];
  rightTabs: Tab[];
  activeLeftTabId: string | null;
  activeRightTabId: string | null;
  leftDraft: string;
  rightDraft: string;
  leftViewMode: ViewMode;
  rightViewMode: ViewMode;
  leftSaveStatus: SaveStatus;
  rightSaveStatus: SaveStatus;
  leftLivePreviewActive: boolean;
  rightLivePreviewActive: boolean;
  sourcePreviewHeight: number;
  sourcePanelWidth: number;
  splitLeftWidth: number;   // pixel width of the left split pane (right pane absorbs the rest)

  // Artifacts panel
  showArtifactsPanel: boolean;
  artifactsWidth: number;
  activeArtifact: Artifact | null;
  artifacts: Artifact[];

  // Agent panel
  showAgentPanel: boolean;
  agentWidth: number;
  agentMessages: AgentMessage[];
  agentContext: string | null;
  agentTask: AgentTask;

  // Settings
  showSettings: boolean;
  settings: Settings;

  // Projects
  projects: Project[];
  showProjectsPanel: boolean;
  addProject: (id: string, name: string, path: string) => void;
  renameProject: (id: string, name: string) => void;
  deleteProject: (id: string) => void;
  toggleProjectPinned: (id: string) => void;
  openProject: (id: string) => Promise<void>;
  setShowProjectsPanel: (show: boolean) => void;

  // Actions
  openFolder: (path: string) => Promise<void>;
  closeFolder: () => void;
  refreshExplorer: () => Promise<void>;
  createFile: (dirPath: string, name: string) => Promise<string>;
  createFolder: (parentPath: string, name: string) => Promise<string>;
  renameEntry: (oldPath: string, newPath: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  moveEntries: (entries: { oldPath: string; newPath: string }[]) => Promise<void>;

  openFile: (path: string, panel?: "left" | "right") => Promise<void>;
  openNewNote: () => Promise<void>;
  closeTab: (panel: "left" | "right", path: string) => Promise<void>;
  selectTab: (panel: "left" | "right", path: string) => Promise<void>;
  flushPendingSave: (panel?: "left" | "right") => Promise<void>;
  setDraftContent: (panel: "left" | "right", content: string) => void;
  saveFile: (panel: "left" | "right", path: string, content: string) => Promise<void>;
  togglePinPath: (path: string) => void;
  setPanelViewMode: (panel: "left" | "right", mode: ViewMode) => void;
  setPanelLivePreview: (panel: "left" | "right", active: boolean) => void;
  setActivePanel: (panel: "left" | "right") => void;
  splitScreen: () => void;
  closeSplit: () => void;
  moveTab: (fromPanel: "left" | "right", toPanel: "left" | "right", path: string) => Promise<void>;
  toggleSourcesPanel: () => void;
  setSidebarTab: (t: "sources" | "notes") => void;
  setSourcePreviewHeight: (h: number) => void;
  setSourcePanelWidth: (w: number) => void;
  setSplitLeftWidth: (w: number) => void;

  // Artifacts actions
  toggleArtifactsPanel: () => void;
  setArtifactsWidth: (w: number) => void;
  setActiveArtifact: (a: Artifact | null) => void;
  addArtifact: (a: Artifact) => void;

  // Agent actions
  toggleAgentPanel: () => void;
  setAgentWidth: (w: number) => void;
  setAgentMessages: (msgs: AgentMessage[]) => void;
  addAgentMessage: (msg: AgentMessage) => void;
  setAgentContext: (ctx: string | null) => void;
  setAgentTask: (task: AgentTask) => void;

  // Settings Actions
  setShowSettings: (show: boolean) => void;
  updateSettings: (s: Partial<Settings>) => void;

  // MCP Connector actions
  addConnector: (c: Omit<McpConnector, "id" | "enabled" | "tools">) => void;
  updateConnector: (id: string, patch: Partial<McpConnector>) => void;
  removeConnector: (id: string) => void;

  // Assistant / Co-pilot States & Actions
  showAssistantPanel: boolean;
  assistantWidth: number;
  assistantMessages: AssistantMessage[];
  selectedModel: string;
  assistantTopicTitle: string;
  filterQuery: string;
  isAssistantStreaming: boolean;
  assistantStatusText: string;
  availableModels: string[];                              // dynamically fetched from provider
  assistantAbortController: AbortController | null;       // never persisted to localStorage

  // OpenCode Agent runtime state (never persisted to localStorage)
  assistantMode: "study" | "opencode";                   // which tab is active
  opencodeInstalled: boolean;                            // result of check_opencode_installed
  opencodeServerPid: number | null;                      // PID of running opencode serve
  opencodeServerPassword: string | null;                 // in-memory only, never persisted

  // Destructive file-tool approval gate (Phase 2b)
  pendingToolApprovals: PendingToolApproval[];
  addPendingToolApproval: (approval: PendingToolApproval) => void;
  resolveToolApproval: (id: string, status: "approved" | "rejected") => void;
  clearToolApproval: (id: string) => void;

  sendAssistantMessage: (text: string) => Promise<void>;
  cancelAssistantMessage: () => void;
  clearAssistantMessages: () => void;
  setAssistantWidth: (w: number) => void;
  toggleAssistantPanel: () => void;
  setSelectedModel: (m: string) => void;
  setAssistantTopicTitle: (t: string) => void;
  setFilterQuery: (q: string) => void;
  fetchAndSetAvailableModels: () => Promise<void>;        // fetches live models from provider

  // OpenCode Agent actions
  setAssistantMode: (mode: "study" | "opencode") => void;
  checkOpencodeInstalled: () => Promise<void>;
  startOpencodeServer: () => Promise<void>;
  stopOpencodeServer: () => Promise<void>;

  // Google Drive backup (BACKUP-0): account + OAuth flow
  googleAccount: GoogleAccount | null;
  backupSigningIn: boolean;
  refreshGoogleAccount: () => Promise<void>;
  connectGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;

  // Session & Account States & Actions (TopBar)
  sessions: SessionTab[];
  activeSessionId: string;
  userAccount: UserAccount;
  showSearchModal: boolean;
  topbarViewMode: "grid" | "split" | "single";
  createSession: (title?: string) => void;
  closeSession: (id: string) => void;
  selectSession: (id: string) => void;
  setShowSearchModal: (show: boolean) => void;
  setTopbarViewMode: (mode: "grid" | "split" | "single") => void;

  // Onboarding
  onboardingComplete: boolean;
  completeOnboarding: () => void;

  // Launcher & Panel Arrangement States & Actions (Iteration 3)
  showLauncherModal: boolean;
  showPanelLayoutModal: boolean;
  panelPreset: "default" | "focus" | "assistant" | "explorer" | "custom";
  setShowLauncherModal: (show: boolean) => void;
  setShowPanelLayoutModal: (show: boolean) => void;
  applyPanelPreset: (preset: "default" | "focus" | "assistant" | "explorer") => void;
  scaffoldWorkspaceTemplate: (folderPath: string) => Promise<void>;

  // Custom saved layouts (TICKET-B4)
  customLayouts: CustomLayout[];
  saveCustomLayout: (name: string) => void;
  applyCustomLayout: (id: string) => void;
  deleteCustomLayout: (id: string) => void;
}

/**
 * Renders the enabled connector registry into the OpenCode config shape opencode actually
 * accepts (verified live on v1.18): "local" (stdio) and "remote" (streamable-http) entries.
 * Secrets (headers/env) become `{env:VAR}` placeholders and the real values are returned in
 * `env` so the Rust side can scope them to the sidecar child only — nothing secret is written
 * to disk. Offline http connectors are skipped, mirroring the workspace-tools router.
 */
export function buildOpencodeMcpExport(
  connectors: McpConnector[],
): { config: string | null; env: Record<string, string> } {
  const servers: Record<string, unknown> = {};
  const env: Record<string, string> = {};
  const used = new Set<string>();
  let envIdx = 0;

  const safeName = (raw: string, _id: string) => {
    let base = (raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!base) base = "connector";
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base}-${n++}`;
    }
    used.add(name);
    return name;
  };
  const secretToPlaceholder = (value: string) => {
    const varName = `LSN_MCP_${++envIdx}`;
    env[varName] = value;
    return `{env:${varName}}`;
  };

  for (const c of connectors) {
    if (!c.enabled) continue;
    if (c.kind === "http" && (typeof navigator === "undefined" || !navigator.onLine)) continue;

    if (c.kind === "stdio") {
      const command = (c.command || "").trim();
      if (!command) continue;
      const args = (c.args ?? []).filter((a) => a.trim() !== "");
      const entry: Record<string, unknown> = {
        type: "local",
        command: [command, ...args],
        enabled: true,
      };
      const cEnv = c.env ?? {};
      const envKeys = Object.keys(cEnv).filter((k) => cEnv[k].trim() !== "");
      if (envKeys.length > 0) {
        const mapped: Record<string, string> = {};
        for (const k of envKeys) {
          mapped[k] = secretToPlaceholder(cEnv[k]);
        }
        entry.env = mapped;
      }
      servers[safeName(c.name, c.id)] = entry;
    } else {
      const url = (c.url || "").trim();
      if (!url) continue;
      const entry: Record<string, unknown> = { type: "remote", url };
      const h = c.headers ?? {};
      const headerKeys = Object.keys(h).filter((k) => h[k].trim() !== "");
      if (headerKeys.length > 0) {
        const mapped: Record<string, string> = {};
        for (const k of headerKeys) {
          mapped[k] = secretToPlaceholder(h[k]);
        }
        entry.headers = mapped;
      }
      servers[safeName(c.name, c.id)] = entry;
    }
  }

  const config = Object.keys(servers).length > 0 ? JSON.stringify({ mcp: servers }) : null;
  return { config, env };
}

export const useStore = create<AppState>((set, get) => {
  // Load initial settings and pinned paths from localStorage
  const localSettings = localStorage.getItem("lsn_settings");
  const parsedSettings = localSettings ? JSON.parse(localSettings) : {};
  // Merge persisted settings over defaults; seed the connector registry with presets only
  // on a true first run (no `connectors` key at all). Once the registry exists — even as an
  // empty array — the user's choice is respected.
  const existingConnectors: McpConnector[] | undefined = parsedSettings?.connectors;
  const initialConnectors: McpConnector[] =
    Array.isArray(existingConnectors) ? existingConnectors : CONNECTOR_PRESETS;
  const initialSettings = { ...DEFAULT_SETTINGS, ...parsedSettings, connectors: initialConnectors };
  const initialPinned = localStorage.getItem("lsn_pinned");
  const pinnedPaths = initialPinned ? JSON.parse(initialPinned) : [];
  const savedFolder = localStorage.getItem("lsn_last_folder");
  const localProjects = localStorage.getItem("lsn_projects");
  const initialProjects: Project[] = localProjects ? JSON.parse(localProjects) : [];
  const localPanelOrder = localStorage.getItem("lsn_panel_order");
  const parsedPanelOrder: SidePanelId[] | null = localPanelOrder ? JSON.parse(localPanelOrder) : null;
  const VALID_PANEL_IDS: SidePanelId[] = ["assistant", "sources", "artifacts", "agent"];
  const isValidPanelOrder =
    parsedPanelOrder &&
    Array.isArray(parsedPanelOrder) &&
    parsedPanelOrder.length >= 1 &&
    parsedPanelOrder.length <= 4 &&
    parsedPanelOrder.every((id) => VALID_PANEL_IDS.includes(id)) &&
    parsedPanelOrder.includes("assistant") &&
    parsedPanelOrder.includes("sources");
  const initialPanelOrder: SidePanelId[] = isValidPanelOrder ? parsedPanelOrder! : ["assistant", "sources"];
  const localCustomLayouts = localStorage.getItem("lsn_custom_layouts");
  const initialCustomLayouts: CustomLayout[] = localCustomLayouts ? JSON.parse(localCustomLayouts) : [];
  const onboardingComplete = localStorage.getItem("lsn_onboarding_complete") === "true";
  const localSessions = localStorage.getItem("lsn_sessions");
  const initialSessions: SessionTab[] = localSessions
    ? JSON.parse(localSessions)
    : [{ id: "sess-default", title: "Default Session", active: true, openTabs: [] }];
  const initialActiveSessionId = initialSessions.find((s) => s.active)?.id || initialSessions[0].id;

  // Apply the persisted theme immediately (live colors)
  const themeColors = getThemeById(initialSettings.theme).colors;
  applyThemeToDocument({
    ...themeColors,
    accent: initialSettings.accentColor || themeColors.accent,
    accentHover: initialSettings.accentColor || themeColors.accentHover,
  });

  // Local write timer refs managed inside store callbacks
  let leftSaveTimer: number | null = null;
  let rightSaveTimer: number | null = null;

  return {
    // Explorer States
    currentFolderPath: savedFolder || null,
    explorerEntries: [],
    pinnedPaths: pinnedPaths,
    showSourcesPanel: true,
    sidebarTab: "sources",
    sourcePanelWidth: 200,
    panelOrder: initialPanelOrder,

    // Projects
    projects: initialProjects,
    showProjectsPanel: false,

    // Split-Screen Workspace States
    splitActive: false,
    activePanel: "left",
    leftTabs: [],
    rightTabs: [],
    activeLeftTabId: null,
    activeRightTabId: null,
    leftDraft: "",
    rightDraft: "",
    leftViewMode: "live",
    rightViewMode: "live",
    leftSaveStatus: "saved",
    rightSaveStatus: "saved",
    leftLivePreviewActive: false,
    rightLivePreviewActive: false,
    sourcePreviewHeight: 250,
    splitLeftWidth: 0,

    // Artifacts
    showArtifactsPanel: false,
    artifactsWidth: 340,
    activeArtifact: null,
    artifacts: [],

    // Agent
    showAgentPanel: false,
    agentWidth: 340,
    agentMessages: [],
    agentContext: null,
    agentTask: "custom",

    // Assistant States
    showAssistantPanel: true,
    assistantWidth: 380,
    assistantMessages: INITIAL_ASSISTANT_MESSAGES,
    selectedModel: "Big Pickle",
    assistantTopicTitle: "Local Study Notebook implementation plan",
    filterQuery: "",

    // Session & Account States
    sessions: initialSessions,
    activeSessionId: initialActiveSessionId,
    userAccount: {
      name: "Developer Workspace",
      email: "developer@localnotebook.app",
      avatarLetter: "D",
      avatarColor: "#7c3aed"
    },
    googleAccount: null,
    backupSigningIn: false,
    showSearchModal: false,
    topbarViewMode: "split",

    // Launcher & Panel Arrangement States (Iteration 3)
    showLauncherModal: false,
    showPanelLayoutModal: false,
    panelPreset: "default",
    customLayouts: initialCustomLayouts,

    // Onboarding
    onboardingComplete: onboardingComplete,

    // Settings
    showSettings: false,
    settings: initialSettings,

    // Folder Actions
    openFolder: async (path) => {
      set({ currentFolderPath: path });
      localStorage.setItem("lsn_last_folder", path);
      await get().refreshExplorer();
      // Full vault-index rescan (DATA-2) — fire-and-forget so a large vault's content
      // hashing doesn't delay the folder actually opening; incremental updates from
      // individual file operations keep the index current the rest of the time.
      // Once the rescan lands, kick the lazy Memory-RAG embedding pass (debounced) so
      // chunk rows written by this rescan get vectors without blocking the open.
      invoke("reindex_vault", { vaultRoot: path })
        .then(() => {
          if (pendingEmbedRebuildTimer !== null) clearTimeout(pendingEmbedRebuildTimer);
          pendingEmbedRebuildTimer = setTimeout(() => {
            pendingEmbedRebuildTimer = null;
            const s = get().settings;
            if (!s.aiEnabled) return;
            import("../services/agentKnowledge").then(({ rebuildEmbeddings }) => {
              rebuildEmbeddings(path, s).catch(() => {});
            });
          }, 800);
        })
        .catch((err) => {
          console.error("Failed to reindex vault:", err);
        });
    },

    closeFolder: () => {
      set({ currentFolderPath: null, explorerEntries: [], leftTabs: [], rightTabs: [], activeLeftTabId: null, activeRightTabId: null });
      localStorage.removeItem("lsn_last_folder");
    },

    refreshExplorer: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) return;
      try {
        const excludedList = get()
          .settings.excludedFolders.split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const entries = await invoke<FileEntry[]>("read_local_dir", {
          path: folderPath,
          excludedFolders: excludedList,
        });
        set({ explorerEntries: entries });
      } catch (err) {
        console.error("Failed to read local folder explorer directory:", err);
      }
    },

    createFile: async (dirPath, name) => {
      try {
        const path = await invoke<string>("create_local_file", {
          dirPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    createFolder: async (parentPath, name) => {
      try {
        const path = await invoke<string>("create_local_dir", {
          parentPath,
          name,
          vaultRoot: get().currentFolderPath || undefined,
        });
        await get().refreshExplorer();
        return path;
      } catch (err) {
        throw new Error(String(err));
      }
    },

    renameEntry: async (oldPath, newPath) => {
      try {
        await invoke("rename_local_entry", {
          oldPath,
          newPath,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Update tabs referencing this path
        const updateTabs = (tabs: Tab[]) =>
          tabs.map((t) => {
            if (t.id === oldPath) {
              const name = newPath.split(/[\\/]/).pop() ?? newPath;
              return { ...t, id: newPath, title: name.replace(/\.md$/, "") };
            }
            return t;
          });

        const leftTabs = updateTabs(get().leftTabs);
        const rightTabs = updateTabs(get().rightTabs);
        const activeLeft = get().activeLeftTabId === oldPath ? newPath : get().activeLeftTabId;
        const activeRight = get().activeRightTabId === oldPath ? newPath : get().activeRightTabId;

        set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    moveEntries: async (entries) => {
      try {
        for (const entry of entries) {
          await invoke("rename_local_entry", {
            oldPath: entry.oldPath,
            newPath: entry.newPath,
            vaultRoot: get().currentFolderPath || undefined,
          });

          // Update open tabs that reference the old path
          const updateTabs = (tabs: Tab[]) =>
            tabs.map((t) => {
              if (t.id === entry.oldPath) {
                const name = entry.newPath.split(/[\\/]/).pop() ?? entry.newPath;
                return { ...t, id: entry.newPath, title: name.replace(/\.md$/, "") };
              }
              return t;
            });

          const leftTabs = updateTabs(get().leftTabs);
          const rightTabs = updateTabs(get().rightTabs);
          const activeLeft = get().activeLeftTabId === entry.oldPath ? entry.newPath : get().activeLeftTabId;
          const activeRight = get().activeRightTabId === entry.oldPath ? entry.newPath : get().activeRightTabId;

          set({ leftTabs, rightTabs, activeLeftTabId: activeLeft, activeRightTabId: activeRight });
        }
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    deleteEntry: async (path) => {
      try {
        await invoke("delete_local_entry", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
        
        // Close tabs referencing this path
        get().closeTab("left", path);
        get().closeTab("right", path);
        
        await get().refreshExplorer();
      } catch (err) {
        throw new Error(String(err));
      }
    },

    // File Workspace Actions
    openFile: async (path, panel) => {
      const targetPanel = panel || get().activePanel;
      const isLeft = targetPanel === "left";
      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) return;

      await get().flushPendingSave(targetPanel);

      // Check if already open in this panel
      const existing = tabs.find((t) => t.id === path);
      if (existing) {
        if (isLeft) {
          set({ activeLeftTabId: path });
        } else {
          set({ activeRightTabId: path });
        }
        // Load contents into draft
        try {
          const content = await invoke<string>("read_local_file", {
            path,
            vaultRoot: get().currentFolderPath || undefined,
          });
          if (isLeft) set({ leftDraft: content, leftSaveStatus: "saved" }); else set({ rightDraft: content, rightSaveStatus: "saved" });
        } catch {}
        return;
      }

      // Read file content
      let content = "";
      try {
        content = await invoke<string>("read_local_file", {
          path,
          vaultRoot: get().currentFolderPath || undefined,
        });
      } catch (err) {
        console.error("Failed to read file", err);
        return;
      }

      const filename = path.split(/[\\/]/).pop() ?? "Note";
      const title = filename.replace(/\.md$/, "");
      const isPinned = get().pinnedPaths.includes(path);
      const newTab: Tab = { id: path, title, pinned: isPinned };

      const activeTab = tabs.find((t) => t.id === activeId);

      if (tabs.length === 0 || activeId === null || !activeTab || activeTab.pinned) {
        // Open in new tab
        const newTabs = [...tabs, newTab];
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      } else {
        // Reuse current active unpinned tab
        const newTabs = tabs.map((t) => (t.id === activeId ? newTab : t));
        if (isLeft) {
          set({ leftTabs: newTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
        } else {
          set({ rightTabs: newTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
        }
      }
    },

    openNewNote: async () => {
      const folderPath = get().currentFolderPath;
      if (!folderPath) {
        alert("Please open a local workspace folder first to create notes!");
        return;
      }

      const subFolder = get().settings.newNoteLocation.trim();
      let targetDir = folderPath;
      if (subFolder) {
        targetDir = `${folderPath}/${subFolder}`.replace(/[\\/]+/g, "/");
        try {
          await get().createFolder(folderPath, subFolder);
        } catch {
          // Subfolder may already exist
        }
      }

      // Try "Untitled", "Untitled 1", "Untitled 2", ... letting the backend's actual
      // filesystem check decide what already exists, rather than predicting it here —
      // `explorerEntries` is a flat, top-level-only, possibly-stale list, and comparing
      // its paths against a JS-joined `${dir}/${name}` string breaks on Windows anyway
      // (backend paths use `\`, this join always uses `/`), so a real pre-existing
      // "Untitled.md" was never detected and every click hit the backend's own
      // "File already exists" rejection instead of picking the next available name.
      const MAX_ATTEMPTS = 200;
      let lastErr: unknown = null;
      for (let index = 0; index <= MAX_ATTEMPTS; index++) {
        const name = index === 0 ? "Untitled" : `Untitled ${index}`;
        try {
          const path = await get().createFile(targetDir, name);
          await get().openFile(path);
          return;
        } catch (err) {
          lastErr = err;
          if (!String(err).toLowerCase().includes("already exists")) break;
        }
      }
      alert("Failed to create new file: " + lastErr);
    },

    closeTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;

      if (activeId === path) {
        await get().flushPendingSave(panel);
      }

      const tabs = isLeft ? get().leftTabs : get().rightTabs;
      const newTabs = tabs.filter((t) => t.id !== path);
      let nextActive = activeId;

      if (activeId === path) {
        nextActive = newTabs.length ? newTabs[newTabs.length - 1].id : null;
      }

      if (isLeft) {
        set({ leftTabs: newTabs, activeLeftTabId: nextActive });
        if (nextActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextActive });
            set({ leftDraft: c, leftSaveStatus: "saved" });
          } catch {}
        } else {
          set({ leftDraft: "", leftSaveStatus: "saved" });
        }
      } else {
        set({ rightTabs: newTabs, activeRightTabId: nextActive });
        if (nextActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextActive });
            set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }
    },

    selectTab: async (panel, path) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (activeId === path) return;

      await get().flushPendingSave(panel);

      if (isLeft) {
        set({ activeLeftTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ leftDraft: c, leftSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      } else {
        set({ activeRightTabId: path });
        try {
          const c = await invoke<string>("read_local_file", { path });
          set({ rightDraft: c, rightSaveStatus: "saved" });
        } catch (e) {
          console.error("Failed to read file on selectTab", e);
        }
      }
    },

    flushPendingSave: async (panel) => {
      if (!panel || panel === "left") {
        if (leftSaveTimer !== null) {
          window.clearTimeout(leftSaveTimer);
          leftSaveTimer = null;
        }
        const leftId = get().activeLeftTabId;
        if (leftId && get().leftSaveStatus === "unsaved") {
          await get().saveFile("left", leftId, get().leftDraft);
        }
      }
      if (!panel || panel === "right") {
        if (rightSaveTimer !== null) {
          window.clearTimeout(rightSaveTimer);
          rightSaveTimer = null;
        }
        const rightId = get().activeRightTabId;
        if (rightId && get().rightSaveStatus === "unsaved") {
          await get().saveFile("right", rightId, get().rightDraft);
        }
      }
    },

    setDraftContent: (panel, content) => {
      const isLeft = panel === "left";
      const activeId = isLeft ? get().activeLeftTabId : get().activeRightTabId;
      if (!activeId) return;

      if (isLeft) {
        set({ leftDraft: content, leftSaveStatus: "unsaved" });
        if (leftSaveTimer !== null) window.clearTimeout(leftSaveTimer);
        leftSaveTimer = window.setTimeout(async () => {
          leftSaveTimer = null;
          if (get().activeLeftTabId === activeId && get().leftSaveStatus === "unsaved") {
            await get().saveFile("left", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      } else {
        set({ rightDraft: content, rightSaveStatus: "unsaved" });
        if (rightSaveTimer !== null) window.clearTimeout(rightSaveTimer);
        rightSaveTimer = window.setTimeout(async () => {
          rightSaveTimer = null;
          if (get().activeRightTabId === activeId && get().rightSaveStatus === "unsaved") {
            await get().saveFile("right", activeId, content);
          }
        }, get().settings.livePreviewTimeout);
      }
    },

    saveFile: async (panel, path, content) => {
      const isLeft = panel === "left";
      if (isLeft) set({ leftSaveStatus: "saving" }); else set({ rightSaveStatus: "saving" });

      try {
        await invoke("write_local_file", {
          path,
          content,
          vaultRoot: get().currentFolderPath || undefined,
        });
        if (isLeft) set({ leftSaveStatus: "saved" }); else set({ rightSaveStatus: "saved" });
        
        // Refresh filename if user updated the first header
        const filename = path.split(/[\\/]/).pop() ?? "Note";
        let displayTitle = filename.replace(/\.md$/, "");
        
        const firstHeading = content
          .split(/\r?\n/)
          .map((str: string) => str.trim())
          .find((l: string) => l.startsWith('#'));
        
        if (firstHeading) {
          displayTitle = firstHeading.replace(/^#+\s*/, "").trim();
        }

        const updateTabTitle = (tabs: Tab[]) =>
          tabs.map((t) => (t.id === path ? { ...t, title: displayTitle } : t));

        if (isLeft) {
          set({ leftTabs: updateTabTitle(get().leftTabs) });
        } else {
          set({ rightTabs: updateTabTitle(get().rightTabs) });
        }
      } catch (err) {
        if (isLeft) set({ leftSaveStatus: "unsaved" }); else set({ rightSaveStatus: "unsaved" });
        console.error("Autosave failed", err);
      }
    },

    togglePinPath: (path) => {
      const pinned = get().pinnedPaths;
      const isPinned = pinned.includes(path);
      const nextPinned = isPinned ? pinned.filter((p) => p !== path) : [...pinned, path];
      
      set({ pinnedPaths: nextPinned });
      localStorage.setItem("lsn_pinned", JSON.stringify(nextPinned));

      const updatePin = (tabs: Tab[]) =>
        tabs.map((t) => (t.id === path ? { ...t, pinned: !isPinned } : t));

      set({ leftTabs: updatePin(get().leftTabs), rightTabs: updatePin(get().rightTabs) });
    },

    setPanelViewMode: (panel, mode) => {
      if (panel === "left") set({ leftViewMode: mode }); else set({ rightViewMode: mode });
    },

    setPanelLivePreview: (panel, active) => {
      if (panel === "left") set({ leftLivePreviewActive: active }); else set({ rightLivePreviewActive: active });
    },

    setActivePanel: (panel) => set({ activePanel: panel }),

    splitScreen: () => {
      // Set split to active and copy left tab structure into right if right is empty
      const leftActiveId = get().activeLeftTabId;
      const rightTabs = get().rightTabs;
      
      if (rightTabs.length === 0 && leftActiveId) {
        const leftTab = get().leftTabs.find((t) => t.id === leftActiveId);
        if (leftTab) {
          set({
            rightTabs: [leftTab],
            activeRightTabId: leftActiveId,
            rightDraft: get().leftDraft,
            rightViewMode: get().leftViewMode,
            rightSaveStatus: "saved"
          });
        }
      }
      set({ splitActive: true, activePanel: "right" });
    },

    closeSplit: () => {
      set({ splitActive: false, rightTabs: [], activeRightTabId: null, activePanel: "left" });
    },

    moveTab: async (fromPanel, toPanel, path) => {
      if (fromPanel === toPanel) return;
      const fromIsLeft = fromPanel === "left";
      const toIsLeft = toPanel === "left";

      const fromTabs = fromIsLeft ? get().leftTabs : get().rightTabs;
      const tab = fromTabs.find((t) => t.id === path);
      if (!tab) return;

      const fromActiveId = fromIsLeft ? get().activeLeftTabId : get().activeRightTabId;
      const isActiveInSource = fromActiveId === path;

      // Reuse the already-loaded draft when moving the source panel's active tab;
      // otherwise (a background tab) there's no in-memory copy, so read it from disk.
      let content: string;
      if (isActiveInSource) {
        await get().flushPendingSave(fromPanel);
        content = fromIsLeft ? get().leftDraft : get().rightDraft;
      } else {
        try {
          content = await invoke<string>("read_local_file", { path });
        } catch (err) {
          console.error("Failed to read file for tab move", err);
          return;
        }
      }

      // Remove from source panel, promoting another tab to active there if needed
      const newFromTabs = fromTabs.filter((t) => t.id !== path);
      const nextFromActive = isActiveInSource
        ? newFromTabs.length
          ? newFromTabs[newFromTabs.length - 1].id
          : null
        : fromActiveId;

      if (fromIsLeft) {
        set({ leftTabs: newFromTabs, activeLeftTabId: nextFromActive });
      } else {
        set({ rightTabs: newFromTabs, activeRightTabId: nextFromActive });
      }

      if (isActiveInSource) {
        if (nextFromActive) {
          try {
            const c = await invoke<string>("read_local_file", { path: nextFromActive });
            if (fromIsLeft) set({ leftDraft: c, leftSaveStatus: "saved" });
            else set({ rightDraft: c, rightSaveStatus: "saved" });
          } catch {}
        } else {
          if (fromIsLeft) set({ leftDraft: "", leftSaveStatus: "saved" });
          else set({ rightDraft: "", rightSaveStatus: "saved" });
        }
      }

      // Ensure the destination panel exists (auto-split when dropping into an unsplit view)
      if (!get().splitActive) {
        set({ splitActive: true });
      }

      const toTabs = toIsLeft ? get().leftTabs : get().rightTabs;
      const newToTabs = toTabs.some((t) => t.id === path) ? toTabs : [...toTabs, tab];

      if (toIsLeft) {
        set({ leftTabs: newToTabs, activeLeftTabId: path, leftDraft: content, leftSaveStatus: "saved" });
      } else {
        set({ rightTabs: newToTabs, activeRightTabId: path, rightDraft: content, rightSaveStatus: "saved" });
      }

      set({ activePanel: toPanel });
    },

    toggleSourcesPanel: () => set((s) => ({ showSourcesPanel: !s.showSourcesPanel })),
    setSidebarTab: (t) => set({ sidebarTab: t }),
    setSourcePreviewHeight: (h) => set({ sourcePreviewHeight: h }),
    setSourcePanelWidth: (w) => set({ sourcePanelWidth: w }),
    setSplitLeftWidth: (w) => set({ splitLeftWidth: Math.max(w, 200) }),
    toggleArtifactsPanel: () => set((s) => ({ showArtifactsPanel: !s.showArtifactsPanel })),
    setArtifactsWidth: (w) => set({ artifactsWidth: w }),
    setActiveArtifact: (a) => set({ activeArtifact: a }),
    addArtifact: (a) => set((s) => ({ artifacts: [...s.artifacts, a], activeArtifact: a })),
    toggleAgentPanel: () => set((s) => ({ showAgentPanel: !s.showAgentPanel })),
    setAgentWidth: (w) => set({ agentWidth: w }),
    setAgentMessages: (msgs) => set({ agentMessages: msgs }),
    addAgentMessage: (msg) => set((s) => ({ agentMessages: [...s.agentMessages, msg] })),
    setAgentContext: (ctx) => set({ agentContext: ctx }),
    setAgentTask: (task) => set({ agentTask: task }),
    reorderPanels: (fromId, toId) => {
      const order = get().panelOrder;
      const fromIndex = order.indexOf(fromId);
      const toIndex = order.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

      const nextOrder = [...order];
      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromId);

      set({ panelOrder: nextOrder });
      localStorage.setItem("lsn_panel_order", JSON.stringify(nextOrder));
    },
// Settings
    setShowSettings: (show) => set({ showSettings: show }),
    updateSettings: (updated) => {
      const nextSettings = { ...get().settings, ...updated };
      set({ settings: nextSettings });
      localStorage.setItem("lsn_settings", JSON.stringify(nextSettings));

      if (updated.excludedFolders !== undefined) {
        setTimeout(() => get().refreshExplorer(), 0);
      }

      // Apply theme colors live
      const theme = getThemeById(nextSettings.theme).colors;
      const accent = nextSettings.accentColor || theme.accent;
      applyThemeToDocument({
        ...theme,
        accent,
        accentHover: nextSettings.accentColor || theme.accentHover,
      });
    },

    // MCP Connector actions
    addConnector: (c) => {
      const connector: McpConnector = { ...c, id: "conn-" + Date.now(), enabled: false, tools: [] };
      const { updateSettings } = get();
      updateSettings({ connectors: [...get().settings.connectors, connector] });
    },
    updateConnector: (id, patch) => {
      const connectors = get().settings.connectors.map((c) => (c.id === id ? { ...c, ...patch } : c));
      get().updateSettings({ connectors });
      if (patch.enabled === false) {
        // Tear the child process / http session down so a disabled connector never lingers.
        invoke("stop_connector", { id }).catch(() => {});
      }
    },
    removeConnector: (id) => {
      const connectors = get().settings.connectors.filter((c) => c.id !== id);
      get().updateSettings({ connectors });
    },

    // Project actions
    addProject: (id, name, path) => {
      const project: Project = { id, name, path, lastOpened: new Date().toISOString() };
      const exists = get().projects.some((p) => p.path === path || p.id === id);
      const projects = exists
        ? get().projects.map((p) => (p.path === path || p.id === id ? project : p))
        : [...get().projects, project];
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false });
    },
    renameProject: (id, name) => {
      const projects = get().projects.map((p) => (p.id === id ? { ...p, name } : p));
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    deleteProject: (id) => {
      const projects = get().projects.filter((p) => p.id !== id);
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    toggleProjectPinned: (id) => {
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, pinned: !p.pinned } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
    },
    openProject: async (id) => {
      const project = get().projects.find((p) => p.id === id);
      if (!project) return;
      await get().openFolder(project.path);
      const projects = get().projects.map((p) =>
        p.id === id ? { ...p, lastOpened: new Date().toISOString() } : p
      );
      set({ projects });
      localStorage.setItem("lsn_projects", JSON.stringify(projects));
      set({ showProjectsPanel: false, currentFolderPath: project.path });
    },
    setShowProjectsPanel: (show) => set({ showProjectsPanel: show }),

    isAssistantStreaming: false,
    assistantStatusText: "",
    assistantAbortController: null,
    availableModels: [],

    // OpenCode Agent runtime state — never persisted (no localStorage)
    assistantMode: "study",
    opencodeInstalled: false,
    opencodeServerPid: null,
    opencodeServerPassword: null,

    // Destructive file-tool approval gate
    pendingToolApprovals: [],

    addPendingToolApproval: (approval) =>
      set((s) => ({ pendingToolApprovals: [...s.pendingToolApprovals, approval] })),

    resolveToolApproval: (id, status) =>
      set((s) => ({
        pendingToolApprovals: s.pendingToolApprovals.map((p) =>
          p.id === id && p.status === "pending" ? { ...p, status } : p
        ),
      })),

    clearToolApproval: (id) =>
      set((s) => ({ pendingToolApprovals: s.pendingToolApprovals.filter((p) => p.id !== id) })),


    sendAssistantMessage: async (text: string) => {
      if (!text.trim()) return;
      const store = get();

      const userMsg: AssistantMessage = {
        id: "msg-" + Date.now(),
        role: "user",
        content: text.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      const updatedMessages = [...store.assistantMessages, userMsg];
      set({ assistantMessages: updatedMessages, isAssistantStreaming: true, assistantStatusText: "Thinking..." });

      if (!store.settings.aiEnabled) {
        const disabledMsg: AssistantMessage = {
          id: "msg-" + (Date.now() + 1),
          role: "assistant",
          content: "AI Study Assistant is currently disabled. You can enable it in **Settings -> AI & BYOK Model**.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        set({ assistantMessages: [...updatedMessages, disabledMsg], isAssistantStreaming: false, assistantStatusText: "" });
        return;
      }

      // Build context attachments if present
      let contextPrefix = "";
      const activePath = store.activeLeftTabId || store.activeRightTabId;
      if (activePath && (text.includes("@") || text.includes("active"))) {
        const activeContent = store.activePanel === "left" ? store.leftDraft : store.rightDraft;
        const noteName = activePath.split(/[\\/]/).pop() || "Active Note";
        contextPrefix += `[Attached Context - Note: ${noteName}]\n${activeContent}\n\n`;
      }

      // Compose the AI payload from Memory-RAG context (memory digest + RAG passages +
      // backlinks fused into the system prompt) plus recent history and the attachment block.
      const scope = store.assistantTopicTitle || (store.currentFolderPath ? store.currentFolderPath.split(/[\\/]/).pop() || store.currentFolderPath : "global");
      const { buildPromptWithContext, persistConversationTurn } = await import("../services/agentKnowledge");
      const historyPayload = await buildPromptWithContext({
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        settings: store.settings,
        scope,
        vaultRoot: store.currentFolderPath || undefined,
        queryText: text,
        attachment: contextPrefix || undefined,
      });

      const assistantMsgId = "msg-" + (Date.now() + 1);
      const assistantMsg: AssistantMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      set({ assistantMessages: [...updatedMessages, assistantMsg] });

      const controller = new AbortController();
      set({ assistantAbortController: controller });

      try {
        const finalText = await streamAIResponse({
          messages: historyPayload,
          settings: store.settings,
          onChunk: (accumulatedText) => {
            set((state) => ({
              assistantMessages: state.assistantMessages.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
              ),
            }));
          },
          onStatusChange: (status) => {
            set({ assistantStatusText: status });
          },
          signal: controller.signal,
        });

        // A successful request with no visible text usually means the provider blocked or
        // filtered the output (e.g. Gemini safety filters) rather than the app failing —
        // surface that instead of leaving a permanently blank chat bubble.
        if (!finalText.trim()) {
          set((state) => ({
            assistantMessages: state.assistantMessages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content:
                      "⚠️ The AI provider returned an empty response. This can happen when a safety/content filter blocks the output, or the model produced nothing for this prompt. Try rephrasing your message.",
                  }
                : m
            ),
          }));
        } else if (store.settings.memoryAutoSave !== false) {
          persistConversationTurn(
            { userText: text, assistantText: finalText, scope },
            store.settings
          ).catch(() => {});
        }
      } catch (err) {
        const wasCancelled = err instanceof DOMException && err.name === "AbortError";
        set((state) => ({
          assistantMessages: state.assistantMessages.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: wasCancelled
                    ? m.content || "_Cancelled._"
                    : m.content ||
                      `⚠️ Unable to connect to AI server at \`${store.settings.aiBaseUrl}\` (${String(err)}).\n\nCheck your endpoint configuration in **Settings -> AI & BYOK Model**.`,
                }
              : m
          ),
        }));
      } finally {
        set({ isAssistantStreaming: false, assistantStatusText: "", assistantAbortController: null });
      }
    },
    cancelAssistantMessage: () => {
      get().assistantAbortController?.abort();
    },
    clearAssistantMessages: () => set({ assistantMessages: [] }),
    setAssistantWidth: (w) => set({ assistantWidth: w }),
    toggleAssistantPanel: () => set((s) => ({ showAssistantPanel: !s.showAssistantPanel })),
    setSelectedModel: (m) => set({ selectedModel: m }),
    setAssistantTopicTitle: (t) => set({ assistantTopicTitle: t }),
    setFilterQuery: (q) => set({ filterQuery: q }),

    fetchAndSetAvailableModels: async () => {
      const { settings } = get();
      const baseUrl = (settings.aiBaseUrl || "").replace(/\/+$/, "");
      if (!baseUrl) return;
      const models = await fetchAvailableModels(baseUrl, settings.aiApiKey || "");
      if (models.length > 0) {
        set({ availableModels: models });
      }
    },

    // ---------------------------------------------------------------------------
    // OpenCode Agent actions
    // ---------------------------------------------------------------------------

    setAssistantMode: (mode) => set({ assistantMode: mode }),

    checkOpencodeInstalled: async () => {
      try {
        const installed = await invoke<boolean>("check_opencode_installed");
        set({ opencodeInstalled: installed });
      } catch {
        set({ opencodeInstalled: false });
      }
    },

    startOpencodeServer: async () => {
      const { settings, currentFolderPath, opencodeServerPid } = get();
      if (opencodeServerPid !== null) return; // already running

      const workspace = currentFolderPath || ".";
      // Generate a per-session random password (never persisted to disk).
      const password = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Build BYOK credential env-var map with correct OpenCode variable names.
      // (spec §"Corrected: Secrets Handling" — note GOOGLE_GENERATIVE_AI_API_KEY,
      // NOT GEMINI_API_KEY, per OpenCode's own documented env var name for Gemini)
      const providerEnv: Record<string, string> = {};
      if (settings.aiApiKey?.trim()) {
        if (settings.aiProvider === "openai") {
          providerEnv["OPENAI_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "anthropic") {
          providerEnv["ANTHROPIC_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "gemini") {
          providerEnv["GOOGLE_GENERATIVE_AI_API_KEY"] = settings.aiApiKey.trim();
        } else if (settings.aiProvider === "openrouter") {
          providerEnv["OPENROUTER_API_KEY"] = settings.aiApiKey.trim();
        }
        // ollama_hermes / custom: no API key env var needed
      }

      try {
        const { config: mcpOverride, env: mcpEnv } = buildOpencodeMcpExport(
          get().settings.connectors ?? [],
        );
        const pid = await invoke<number>("spawn_opencode_server", {
          port: settings.opencodePort,
          workspacePath: workspace,
          serverPassword: password,
          providerEnv,
          mcpOverride,
          mcpEnv,
        });
        set({ opencodeServerPid: pid, opencodeServerPassword: password });
      } catch (err) {
        console.error("[OpenCode] Failed to start server:", err);
      }
    },

    stopOpencodeServer: async () => {
      const { opencodeServerPid } = get();
      if (opencodeServerPid === null) return;
      try {
        await invoke("kill_opencode_server", { pid: opencodeServerPid });
      } catch (err) {
        console.error("[OpenCode] Failed to stop server:", err);
      } finally {
        set({ opencodeServerPid: null, opencodeServerPassword: null });
      }
    },

    // Google Drive backup (BACKUP-0)
    refreshGoogleAccount: async () => {
      try {
        const acct = await invoke<GoogleAccount | null>("google_account");
        set({ googleAccount: acct });
      } catch (err) {
        console.warn("Failed to check Google Drive account:", err);
      }
    },

    connectGoogle: async () => {
      set({ backupSigningIn: true });
      try {
        const acct = await invoke<GoogleAccount>("google_sign_in");
        set({ googleAccount: acct, backupSigningIn: false });
      } catch (err) {
        set({ backupSigningIn: false });
        throw err;
      }
    },

    signOutGoogle: async () => {
      try {
        await invoke("google_sign_out");
      } catch (err) {
        console.warn("Google sign-out failed:", err);
      } finally {
        set({ googleAccount: null });
      }
    },

    // Session Actions
    createSession: (title) => {
      const id = "sess-" + Date.now();
      const newTitle = title || `New session - ${new Date().toISOString().slice(0, 16)}`;
      const sessions = get().sessions.map((s) => ({ ...s, active: false }));
      sessions.push({ id, title: newTitle, active: true, openTabs: [] });
      set({ sessions, activeSessionId: id });
      localStorage.setItem("lsn_sessions", JSON.stringify(sessions));
    },
    closeSession: (id) => {
      const current = get().sessions;
      if (current.length <= 1) return;
      const filtered = current.filter((s) => s.id !== id);
      let activeId = get().activeSessionId;
      if (activeId === id) {
        activeId = filtered[filtered.length - 1].id;
      }
      const updated = filtered.map((s) => ({ ...s, active: s.id === activeId }));
      set({ sessions: updated, activeSessionId: activeId });
      localStorage.setItem("lsn_sessions", JSON.stringify(updated));
    },
    selectSession: (id) => {
      const updated = get().sessions.map((s) => ({ ...s, active: s.id === id }));
      set({ sessions: updated, activeSessionId: id });
      localStorage.setItem("lsn_sessions", JSON.stringify(updated));
    },
    setShowSearchModal: (show) => set({ showSearchModal: show }),
    setTopbarViewMode: (mode) => set({ topbarViewMode: mode }),

    // Launcher & Panel Arrangement Actions (Iteration 3)
    setShowLauncherModal: (show) => set({ showLauncherModal: show }),
    setShowPanelLayoutModal: (show) => set({ showPanelLayoutModal: show }),

    // Onboarding
    completeOnboarding: () => {
      set({ onboardingComplete: true });
      localStorage.setItem("lsn_onboarding_complete", "true");
    },

    applyPanelPreset: (preset) => {
      set({ panelPreset: preset });
      if (preset === "default") {
        set({ showAssistantPanel: true, showSourcesPanel: true, showArtifactsPanel: false, showAgentPanel: false, assistantWidth: 360, sourcePanelWidth: 200, splitActive: false });
      } else if (preset === "focus") {
        set({ showAssistantPanel: false, showSourcesPanel: false, showArtifactsPanel: false, showAgentPanel: false, splitActive: false });
      } else if (preset === "assistant") {
        set({ showAssistantPanel: true, showSourcesPanel: false, showArtifactsPanel: false, showAgentPanel: false, assistantWidth: 420, splitActive: false });
      } else if (preset === "explorer") {
        set({ showAssistantPanel: false, showSourcesPanel: true, showArtifactsPanel: false, showAgentPanel: false, sourcePanelWidth: 240, splitActive: false });
      }
    },

    saveCustomLayout: (name) => {
      const layout: CustomLayout = {
        id: "layout-" + Date.now(),
        name,
        panelOrder: get().panelOrder,
        showAssistantPanel: get().showAssistantPanel,
        showSourcesPanel: get().showSourcesPanel,
        showArtifactsPanel: get().showArtifactsPanel,
        showAgentPanel: get().showAgentPanel,
        assistantWidth: get().assistantWidth,
        sourcePanelWidth: get().sourcePanelWidth,
        artifactsWidth: get().artifactsWidth,
        agentWidth: get().agentWidth,
        splitActive: get().splitActive,
      };
      const customLayouts = [...get().customLayouts, layout];
      set({ customLayouts, panelPreset: "custom" });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    applyCustomLayout: (id) => {
      const layout = get().customLayouts.find((l) => l.id === id);
      if (!layout) return;
      set({
        panelOrder: layout.panelOrder,
        showAssistantPanel: layout.showAssistantPanel,
        showSourcesPanel: layout.showSourcesPanel,
        showArtifactsPanel: layout.showArtifactsPanel,
        showAgentPanel: layout.showAgentPanel,
        assistantWidth: layout.assistantWidth,
        sourcePanelWidth: layout.sourcePanelWidth,
        artifactsWidth: layout.artifactsWidth,
        agentWidth: layout.agentWidth,
        splitActive: layout.splitActive,
        panelPreset: "custom",
      });
      localStorage.setItem("lsn_panel_order", JSON.stringify(layout.panelOrder));
    },

    deleteCustomLayout: (id) => {
      const customLayouts = get().customLayouts.filter((l) => l.id !== id);
      set({ customLayouts });
      localStorage.setItem("lsn_custom_layouts", JSON.stringify(customLayouts));
    },

    scaffoldWorkspaceTemplate: async (folderPath: string) => {
      try {
        // Create default template directories via Tauri commands
        await invoke("create_local_dir", { parentPath: folderPath, name: "Sources", vaultRoot: folderPath });
        await invoke("create_local_dir", { parentPath: folderPath, name: "Guides", vaultRoot: folderPath });
        await invoke("create_local_dir", { parentPath: folderPath, name: "_attachments", vaultRoot: folderPath });

        // Content for Welcome.md
        const welcomeContent = `# Welcome to Local Study Notebook 🚀

Welcome to your offline-first, local-first study workspace!

## 📁 Default Workspace Structure
- **Sources/**: Store raw study documents, research notes, and web captures.
- **Guides/**: Keep course outlines, exam prep summaries, and structured guides.
- **_attachments/**: Media files, figures, and diagrams.

## ⚡ Quick Guide
- **Smart Markdown Editor**: Raw markdown syntax renders automatically when hovering or editing lines!
- **Split-Screen Workspace**: Open notes side-by-side.
- **Local File Explorer**: Fast workspace tree view with right-click context menu.
- **AI Study Assistant**: Chat with your local study co-pilot.

---
*Start learning!*`;

        // Content for Study_Plan.md
        const planContent = `# 📚 Sample Study Plan

## Topic: Core Objectives
- [ ] Review Chapter 1: Foundations
- [ ] Create summary notes in \`Guides/\`
- [ ] Self-quiz on key concepts

## Notes & Hypotheses
Add your personal study observations here...`;

        // Write template files
        const welcomePath = await invoke<string>("create_local_file", { dirPath: folderPath, name: "Welcome.md", vaultRoot: folderPath });
        await invoke("write_local_file", { path: welcomePath, content: welcomeContent, vaultRoot: folderPath });

        const guidesDir = `${folderPath}/Guides`;
        const planPath = await invoke<string>("create_local_file", { dirPath: guidesDir, name: "Study_Plan.md", vaultRoot: folderPath });
        await invoke("write_local_file", { path: planPath, content: planContent, vaultRoot: folderPath });

        // Open newly created folder and open Welcome.md
        await get().openFolder(folderPath);
        await get().openFile(welcomePath);
      } catch (err) {
        console.error("Failed to scaffold workspace template:", err);
      }
    },
  };
});
```


## `src\services\aiProvider.ts`

```typescript
import { Settings } from "../stores/useStore";
import { buildEffectiveTools, executeWorkspaceTool } from "./workspaceTools";

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 15_000;
const MAX_429_RETRIES = 2;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  // The abort listener deliberately stays attached after cleanup() — cleanup only cancels
  // the connect-phase timer. Keeping the forward from `signal` to `controller` alive for the
  // life of the request lets a user-triggered abort (e.g. a Stop button) still cut off an
  // in-progress SSE stream, not just the initial connection.
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

function getRetryDelayMs(res: Response, attempt: number): number {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, 10_000);
  }
  return Math.min(1000 * 2 ** attempt, 8000);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Cancelled", "AbortError"));
      },
      { once: true }
    );
  });
}

// ---------------------------------------------------------------------------
// Dynamic Model Discovery
// ---------------------------------------------------------------------------

/**
 * Fetches the list of available model IDs from an OpenAI-compatible /models
 * endpoint. For Google Gemini, this populates a dynamic selector with every
 * current, non-deprecated chat completion model accessible by the user's key.
 * Returns an empty array on any failure so callers can fall back gracefully.
 */
export async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string
): Promise<string[]> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (apiKey?.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }
  const { signal, cleanup } = withTimeout(undefined, PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${cleanUrl}/models`, { method: "GET", headers, signal });
    if (!res.ok) return [];
    const data = await res.json();
    // Standard OpenAI-compat shape: { data: [ { id, object }, ... ] }
    const items: Array<{ id: string; object?: string }> = data?.data ?? [];
    return items
      .map((m) => m.id)
      .filter((id) => {
        // For Google endpoints, exclude embedding / AQA / vision-only models
        // so the selector only surfaces chat-capable models.
        if (cleanUrl.includes("generativelanguage.googleapis.com")) {
          return (
            id.startsWith("gemini") &&
            !id.includes("embedding") &&
            !id.includes("aqa") &&
            !id.includes("-vision")
          );
        }
        return true;
      })
      .sort();
  } catch {
    return [];
  } finally {
    cleanup();
  }
}

export interface ChatMessagePayload {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

// ---------------------------------------------------------------------------
// Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M2): Ollama embeddings for the front end.
// All embed HTTP stays here (consistent with the chat streaming path), while Rust
// owns vector storage (`store_chunk_embeddings`, `add_memory`) and retrieval math.
// ---------------------------------------------------------------------------

const EMBED_TIMEOUT_MS = 60_000;

/** Maps an OpenAI-compat Base URL (e.g. http://localhost:11434/v1) to the Ollama HTTP root. */
export function deriveEmbedBaseUrl(aiBaseUrl?: string): string {
  const clean = (aiBaseUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return "http://localhost:11434";
  return clean.replace(/\/v1$/i, "");
}

/**
 * Embeds `texts` in one batch against Ollama's /api/embeddings. Returns a parallel array
 * of vectors (empty inner array for any failed/failed-text slot), or [] on transport or
 * shape failure so callers can degrade to keyword-only retrieval without crashing.
 */
export async function embedTexts(texts: string[], settings: Settings): Promise<number[][]> {
  if (!texts.length) return [];
  const baseUrl = deriveEmbedBaseUrl(settings.aiBaseUrl || settings.embedBaseUrl);
  const model = settings.embedModel || "nomic-embed-text";
  try {
    const res = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts }),
      signal: AbortSignal.timeout(EMBED_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const embeddings = data?.embeddings;
    if (!Array.isArray(embeddings)) return [];
    return embeddings.map((vec) =>
      Array.isArray(vec) ? vec.map((v) => Number(v) || 0) : []
    );
  } catch {
    return [];
  }
}

export async function testAIConnection(
  baseUrl: string,
  apiKey: string,
  model?: string
): Promise<{ ok: boolean; message: string }> {
  const cleanUrl = baseUrl.replace(/\/+$/, "");
  const key = apiKey?.trim();

  const shapeIssue = describeEndpointShapeIssue(cleanUrl);
  if (shapeIssue) {
    return { ok: false, message: shapeIssue };
  }

  {
    const { signal, cleanup } = withTimeout(undefined, PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${cleanUrl}/models`, {
        method: "GET",
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: formatApiError(res.status, res.statusText, errText) };
      }
    } catch (err) {
      if (isTimeoutError(err)) {
        return {
          ok: false,
          message: `Timed out waiting for ${cleanUrl} after ${PROBE_TIMEOUT_MS / 1000}s. The server may be slow, unreachable, or rate-limiting silently.`,
        };
      }
      return { ok: false, message: `Could not reach ${cleanUrl}: ${String(err)}` };
    } finally {
      cleanup();
    }
  }

  // Many OpenAI-compatible providers (OpenRouter included) expose GET /models publicly —
  // it returns 200 even with a missing or invalid key. That alone doesn't prove the key
  // works, so run one minimal authenticated chat request to actually validate it here,
  // instead of the user finding out on their first real message.
  if (key && model) {
    const { signal, cleanup } = withTimeout(undefined, PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${cleanUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false }),
        signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, message: formatApiError(res.status, res.statusText, errText) };
      }
    } catch (err) {
      if (isTimeoutError(err)) {
        return {
          ok: false,
          message: `Timed out waiting for ${cleanUrl} after ${PROBE_TIMEOUT_MS / 1000}s. The server may be slow, unreachable, or rate-limiting silently.`,
        };
      }
      return { ok: false, message: `Could not reach ${cleanUrl}: ${String(err)}` };
    } finally {
      cleanup();
    }
  }

  return { ok: true, message: "Connection Successful!" };
}

function isLikelyToolIncompatibility(status: number, errText: string): boolean {
  // Only treat this as a tool-support problem when the error text actually says so.
  // A bare 404/400 can just as easily mean "wrong model ID" or "route not found" —
  // silently stripping `tools` and retrying on any 404 would mask those as if they were
  // tool-support issues, so require the message to name the actual cause.
  const text = errText.toLowerCase();
  const toolPhrases = [
    "no endpoints found that support tool use",
    "does not support tool",
    "does not support tools",
    "tool use",
    "tool calling",
    "tool_choice",
    "function calling is not supported",
    // Gemini: rejects function-call parts lacking its "thought_signature" metadata.
    "thought_signature",
    // Gemini strict JSON schema enforcement on tool parameters
    "schema validation failed",
    "invalid_function_call",
    "invalid function declaration",
    // Gemini experimental/preview model endpoints may not support tools yet
    "functioncalling is not enabled",
    "does not support functioncalling",
  ];
  return (status === 404 || status === 400) && toolPhrases.some((p) => text.includes(p));
}

function stripToolArtifactsFromHistory(messages: ChatMessagePayload[]): ChatMessagePayload[] {
  // When we fall back to a no-tools retry, the conversation history can still contain an
  // earlier assistant tool-call turn (and its paired "tool" role reply) from before the
  // fallback kicked in. A provider that rejects our tool-call shape outright (e.g. Gemini
  // without thought_signature) will reject that same shape sitting in history just as hard —
  // deleting payload.tools alone doesn't help if the poisoned turn is still in messages[].
  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => (m.tool_calls ? { ...m, tool_calls: undefined } : m));
}

function formatApiError(status: number, statusText: string, errText: string): string {
  let detail = errText;
  try {
    const parsed = JSON.parse(errText);
    detail = parsed?.error?.message || parsed?.message || errText;
  } catch {
    // errText wasn't JSON — use it as-is (already assigned above)
  }
  detail = detail || statusText || "Unknown error";

  switch (status) {
    case 401:
      return `Authentication failed (HTTP 401): ${detail}. Check that your API key in Settings -> AI & BYOK Model is correct and hasn't expired.`;
    case 402:
      return `Out of credits (HTTP 402): ${detail}. Add credits or switch to a free-tier model (e.g. "google/gemini-2.0-flash-exp:free") in Settings -> AI & BYOK Model.`;
    case 429:
      return `Rate limited (HTTP 429) after automatic retries: ${detail}. OpenRouter free-tier models are often rate-limited — wait longer, or switch models in Settings -> AI & BYOK Model.`;
    default:
      return `AI request failed (HTTP ${status}): ${detail}`;
  }
}

function describeModelMismatch(baseUrl: string, model: string): string | null {
  const isOpenRouter = baseUrl.includes("openrouter.ai");
  const isGeminiDirect = baseUrl.includes("generativelanguage.googleapis.com");
  const looksNamespaced = model.includes("/");

  if (isOpenRouter && !looksNamespaced) {
    return `Model ID "${model}" doesn't look like an OpenRouter model — OpenRouter expects a namespaced ID like "nousresearch/hermes-3-llama-3.1-405b" or "google/gemini-2.0-flash-exp:free". If you meant to use a local Ollama model, switch the Base URL back to "http://localhost:11434/v1".`;
  }
  if (!isOpenRouter && looksNamespaced && (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"))) {
    return `Model ID "${model}" looks like a cloud/OpenRouter model, but the Base URL points at a local endpoint (${baseUrl}). Local Ollama models use plain tags like "hermes3:8b".`;
  }
  // Warn if the user has entered an OpenRouter-namespaced ID against Google's direct endpoint
  if (isGeminiDirect && looksNamespaced) {
    return `Model ID "${model}" looks like an OpenRouter namespaced model, but the Base URL points at Google's direct Gemini endpoint. Use a plain Gemini model ID like "gemini-2.0-flash" or "gemini-1.5-pro" for the direct endpoint.`;
  }
  return null;
}

function describeEndpointShapeIssue(baseUrl: string): string | null {
  // Gemini's native REST API (generativelanguage.googleapis.com/v1beta) has no
  // /chat/completions route — that shape only exists under Google's separate
  // OpenAI-compatibility path, /v1beta/openai. A Base URL saved before that fix
  // (or typed by hand) will 404 in a confusing, Gemini-native-shaped error.
  if (baseUrl.includes("generativelanguage.googleapis.com") && !baseUrl.includes("/openai")) {
    return `Base URL "${baseUrl}" points at Gemini's native API, which doesn't have a /chat/completions route. ` +
      `Use Google's OpenAI-compatibility endpoint instead: "https://generativelanguage.googleapis.com/v1beta/openai". ` +
      `Update the Base URL in Settings → AI & BYOK Model.`;
  }
  return null;
}

/**
 * Maps a Gemini SSE finish_reason or promptFeedback blockReason to a
 * human-readable explanation surfaced in the chat UI.
 */
function describeGeminiBlock(finishReason?: string, blockReason?: string): string | null {
  const reason = (finishReason || blockReason || "").toUpperCase();
  if (!reason || reason === "STOP" || reason === "MAX_TOKENS") {
    // MAX_TOKENS is a normal completion stop — no block message needed
    return null;
  }
  switch (reason) {
    case "SAFETY":
      return "⚠️ **Gemini Safety Filter**: This response was blocked by Google's safety filters. Try rephrasing your message or disabling 'Workspace Tool Calling' in Settings if the tool output triggered the filter.";
    case "RECITATION":
      return "⚠️ **Gemini Recitation Filter**: The response was blocked because it may reproduce copyrighted content. Try asking in a different way.";
    case "OTHER":
      return "⚠️ **Gemini blocked this response** for an unspecified reason. Try rephrasing your message.";
    default:
      return `⚠️ **Gemini stopped early** (reason: ${reason}). The response may be incomplete.`;
  }
}

export async function streamAIResponse(options: {
  messages: ChatMessagePayload[];
  settings: Settings;
  onChunk: (text: string) => void;
  onToolCall?: (toolName: string, args: Record<string, any>) => void;
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { settings, onChunk, onToolCall, onStatusChange, signal: externalSignal } = options;
  const baseUrl = (settings.aiBaseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;
  const model = settings.aiModelName || "hermes3:8b";

  const shapeIssue = describeEndpointShapeIssue(baseUrl);
  if (shapeIssue) {
    throw new Error(shapeIssue);
  }

  const mismatch = describeModelMismatch(baseUrl, model);
  if (mismatch) {
    throw new Error(mismatch);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (settings.aiApiKey?.trim()) {
    headers["Authorization"] = `Bearer ${settings.aiApiKey.trim()}`;
  }

  const currentMessages = [...options.messages];
  let accumulatedText = "";
  let toolCallsBuffer: Array<{ id: string; name: string; arguments: string }> = [];

  const payload: Record<string, any> = {
    model,
    messages: currentMessages,
    stream: true,
    temperature: 0.7,
  };

  if (settings.aiEnableWorkspaceTools) {
    try {
      // Builtin workspace tools + enabled MCP connector tools (offline-aware).
      payload.tools = await buildEffectiveTools();
    } catch (err) {
      console.warn("[AI] Failed to load effective tools:", err);
    }
  }

  onStatusChange?.("Connecting...");

  async function postOnce(): Promise<Response> {
    const { signal, cleanup } = withTimeout(externalSignal, DEFAULT_CONNECT_TIMEOUT_MS);
    try {
      return await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });
    } finally {
      cleanup();
    }
  }

  let response: Response;
  try {
    response = await postOnce();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError" && externalSignal?.aborted) {
      throw err;
    }
    const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    if (isTimeoutError(err)) {
      throw new Error(
        `Timed out connecting to ${endpoint} after ${DEFAULT_CONNECT_TIMEOUT_MS / 1000}s. The server may be slow, unreachable, or rate-limiting silently.`
      );
    }
    if (isLocal) {
      throw new Error(
        `Could not reach ${endpoint}. Make sure your local model server (e.g. Ollama) is installed and running — try "ollama run ${model}" in a terminal, then send your message again.`
      );
    }
    throw new Error(
      `Could not reach ${endpoint}. Check your internet connection and that the Base URL is correct (${String(err)}).`
    );
  }

  let retryAttempt = 0;
  while (response.status === 429 && retryAttempt < MAX_429_RETRIES) {
    const delay = getRetryDelayMs(response, retryAttempt);
    onStatusChange?.(`Rate limited — retrying in ${Math.round(delay / 1000)}s...`);
    await sleep(delay, externalSignal);
    retryAttempt++;
    response = await postOnce();
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");

    if (payload.tools && isLikelyToolIncompatibility(response.status, errText)) {
      delete payload.tools;
      payload.messages = stripToolArtifactsFromHistory(currentMessages);
      response = await postOnce();
    }

    if (!response.ok) {
      const retryErrText = await response.text().catch(() => "");
      throw new Error(formatApiError(response.status, response.statusText, retryErrText || errText));
    }
  }

  if (!response.body) {
    throw new Error("No response body received from AI endpoint.");
  }

  onStatusChange?.("Streaming...");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6));
        const choice = json.choices?.[0];
        const delta = choice?.delta;

        // Capture Gemini finish_reason and promptFeedback for safety/recitation blocks
        const finishReason: string | undefined = choice?.finish_reason;
        const blockReason: string | undefined = json.promptFeedback?.blockReason;
        const geminiBlock = describeGeminiBlock(finishReason, blockReason);
        if (geminiBlock && !accumulatedText) {
          // Only override if we haven't accumulated real text yet (a mid-stream
          // safety block on a nearly-complete response shouldn't clobber the text).
          accumulatedText = geminiBlock;
          onChunk(accumulatedText);
          continue;
        }

        if (!delta) continue;

        if (delta.content) {
          accumulatedText += delta.content;
          onChunk(accumulatedText);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsBuffer[idx]) {
              toolCallsBuffer[idx] = {
                id: tc.id || `call_${Date.now()}`,
                name: tc.function?.name || "",
                arguments: tc.function?.arguments || "",
              };
            } else {
              if (tc.function?.name) toolCallsBuffer[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallsBuffer[idx].arguments += tc.function.arguments;
            }
          }
        }
      } catch {
        // Skip malformed SSE json lines
      }
    }
  }

  // Handle tool calls execution loop if model invoked tools
  if (toolCallsBuffer.length > 0) {
    onStatusChange?.("Executing workspace tools...");
    
    // Add assistant tool calls message to conversation history
    const assistantToolMsg: ChatMessagePayload = {
      role: "assistant",
      content: accumulatedText || "",
      tool_calls: toolCallsBuffer.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    currentMessages.push(assistantToolMsg);

    for (const tc of toolCallsBuffer) {
      let parsedArgs: Record<string, any> = {};
      try {
        parsedArgs = JSON.parse(tc.arguments || "{}");
      } catch {}

      onToolCall?.(tc.name, parsedArgs);
      onStatusChange?.(`Running tool: ${tc.name}...`);
      
      const result = await executeWorkspaceTool(tc.name, parsedArgs);

      currentMessages.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.name,
        content: result,
      });
    }

    // Follow-up request for model to synthesize tool execution results
    onStatusChange?.("Synthesizing results...");
    return streamAIResponse({
      messages: currentMessages,
      settings,
      onChunk,
      onToolCall,
      onStatusChange,
      signal: externalSignal,
    });
  }

  onStatusChange?.("");
  return accumulatedText;
}
```


## `src\services\providerPresets.ts`

```typescript
export interface ProviderPreset {
  id: string;
  name: string;
  icon: string;
  desc: string;
  defaultBaseUrl: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "ollama_hermes",
    name: "Nous Hermes 3 (Local)",
    icon: "🦙",
    desc: "Offline function tool calling agent",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "hermes3:8b",
  },
  {
    id: "openrouter",
    name: "Nous Hermes 3 (OpenRouter)",
    icon: "🌐",
    desc: "Online 405B reasoning & synthesis",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "nousresearch/hermes-3-llama-3.1-405b",
  },
  {
    id: "openai",
    name: "OpenAI GPT-4o Mini",
    icon: "⚡",
    desc: "Fast & lightweight cloud reasoning",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    name: "Claude Sonnet 5",
    icon: "✨",
    desc: "Deep study & synthesis model",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-5",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "💎",
    desc: "Multimodal study tutor — Hermes tools compatible",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
  },
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}
```


## `src\services\agentKnowledge.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../stores/useStore";
import { embedTexts, streamAIResponse, ChatMessagePayload } from "./aiProvider";

// ---------------------------------------------------------------------------
// Agent Knowledge Service (AGENT_MEMORY_RAG_PLAN.md, Phase 2).
// Single frontend wrapper over the Memory-RAG commands consumed by every surface
// (Study Assistant, Micro Agent panel, OpenCode bootstrap). Mirrors the tool-loop
// pattern in aiProvider.ts: all AI HTTP lives here/in aiProvider, Rust stores + ranks.
// ---------------------------------------------------------------------------

export interface RagHit {
  path: string;
  title: string;
  snippet: string;
  score: number;
  char_offset: number;
}

export interface MemoryItem {
  id: number;
  scope: string;
  kind: string;
  content: string;
  source: string;
  topic_title: string | null;
  created_at: string;
  score: number;
}

export interface ActiveNoteContext {
  path: string;
  title: string;
  excerpt: string;
}

export interface Backlink {
  id?: number;
  source_path: string;
  target_path: string;
  link_text: string;
  line_number: number;
}

export interface ContextBundle {
  scope: string;
  memory: MemoryItem[];
  rag: RagHit[];
  active_note: ActiveNoteContext | null;
  backlinks: Backlink[];
}

/** Embeds one query text; returns [] when the embed server is unreachable. */
async function embedQuery(text: string, settings: Settings): Promise<number[]> {
  try {
    const [vec] = await embedTexts([text], settings);
    return vec ?? [];
  } catch {
    return [];
  }
}

/**
 * Lazy, idempotent embedding rebuild: pulls chunks whose embedding is still NULL and
 * batches them to the Ollama server until none remain. Returns how many rows gained a
 * vector; stops early (returns accumulated count) if the server goes away mid-loop.
 */
export async function rebuildEmbeddings(vaultRoot: string, settings: Settings, batchSize = 16): Promise<number> {
  let total = 0;
  for (;;) {
    const chunks = await invoke<Array<{ rowid: number; path: string; chunk_index: number; text: string }>>(
      "get_unembedded_chunks",
      { vaultRoot, limit: batchSize }
    );
    if (!chunks.length) break;

    const embeddings = await embedTexts(chunks.map((c) => c.text), settings);
    const items: Array<{ rowid: number; embedding: number[] }> = [];
    chunks.forEach((c, i) => {
      const vec = embeddings[i];
      if (vec && vec.length) items.push({ rowid: c.rowid, embedding: vec });
    });
    if (!items.length) break; // embed server unavailable — keep what we have

    const updated = await invoke<number>("store_chunk_embeddings", {
      items,
      embedModel: settings.embedModel || "nomic-embed-text",
    });
    total += updated;
  }
  return total;
}

/**
 * Fetches the single ContextBundle a turn needs: recent related memory, RAG passages,
 * active-note excerpt, and backlinks. `queryText` defaults to the scope (topic title).
 */
export async function fetchContextBundle(opts: {
  vaultRoot: string;
  scope: string;
  queryText?: string;
  activeNotePath?: string | null;
  limit?: number;
}): Promise<ContextBundle | null> {
  const state = await import("../stores/useStore");
  const settings = state.useStore.getState().settings;
  if (!opts.vaultRoot || !opts.scope) return null;

  const queryText = opts.queryText || opts.scope;
  const queryEmbedding = await embedQuery(queryText, settings);

  return invoke<ContextBundle>("get_context_bundle", {
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText,
    queryEmbedding,
    activeNotePath: opts.activeNotePath ?? null,
    ragLimit: opts.limit ?? settings.ragTopK ?? 5,
  });
}

/** Persists a durable memory entry (kind: fact | context | message) with an embedding. */
export async function remember(opts: {
  scope: string;
  kind: "fact" | "context" | "message";
  content: string;
  source: string;
  topicTitle?: string;
}, settings?: Settings): Promise<number | null> {
  if (!opts.content.trim()) return null;
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.content, s);
  try {
    return await invoke<number>("add_memory", {
      scope: opts.scope,
      kind: opts.kind,
      content: opts.content,
      source: opts.source,
      topicTitle: opts.topicTitle ?? null,
      embedding,
    });
  } catch {
    return null;
  }
}

/** Semantic recall over durable memory; degrades to keyword (created_at desc) offline. */
export async function recall(opts: {
  query: string;
  scope?: string;
  limit?: number;
}): Promise<MemoryItem[]> {
  const s = (await import("../stores/useStore")).useStore.getState().settings;
  const embedding = await embedQuery(opts.query, s);
  try {
    return await invoke<MemoryItem[]>("recall_memory", {
      scope: opts.scope ?? "global",
      queryText: opts.query,
      queryEmbedding: embedding,
      limit: opts.limit ?? s.ragTopK ?? 5,
    });
  } catch {
    return [];
  }
}

/** Renders a ContextBundle into prompt-injectable markdown. */
export function formatContextBundle(bundle: ContextBundle): string {
  const parts: string[] = [];

  if (bundle.active_note) {
    parts.push(
      `### Active Note: ${bundle.active_note.title}\nPath: \`${bundle.active_note.path}\`\n\n${bundle.active_note.excerpt.slice(0, 2000)}`
    );
  }

  if (bundle.rag.length) {
    const passages = bundle.rag
      .map((r) => `- **[${r.title}]** (score ${r.score.toFixed(3)}): ${r.snippet}`)
      .join("\n");
    parts.push(`### Related notes (retrieved)\n${passages}`);
  }

  if (bundle.memory.length) {
    const mem = bundle.memory
      .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
      .join("\n");
    parts.push(`### Prior memory\n${mem}`);
  }

  if (bundle.backlinks.length) {
    const links = bundle.backlinks
      .map((b) => `- Linked from \`${b.source_path}\` (line ${b.line_number}): "${b.link_text}"`)
      .join("\n");
    parts.push(`### Backlinks\n${links}`);
  }

  return parts.join("\n\n");
}

/**
 * Composes the ChatMessagePayload[] the Study Assistant (and other surfaces) send to the
 * model: a system prompt fused with the Memory-RAG context bundle (memory digest, RAG
 * passages, backlinks), recent history, and an optional attachment block appended to the
 * latest user message. Replaces the ad-hoc `contextPrefix` + bare `slice(-10)` in
 * `sendAssistantMessage`. Degrades gracefully: offline/embed-server errors fall back to
 * the plain prompt + history.
 */
export async function buildPromptWithContext(opts: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  settings: Settings;
  scope: string;
  vaultRoot?: string;
  queryText?: string;
  attachment?: string;
  ragLimit?: number;
}): Promise<ChatMessagePayload[]> {
  const { settings, messages, scope, vaultRoot } = opts;
  const systemBase = settings.aiSystemPrompt || "You are an intelligent study assistant for Local Study Notebook.";

  let bundle: ContextBundle | null = null;
  if (vaultRoot) {
    try {
      bundle = await fetchContextBundle({
        vaultRoot,
        scope,
        queryText: opts.queryText || scope,
        limit: opts.ragLimit ?? settings.ragTopK ?? 5,
      });
    } catch {
      bundle = null;
    }
  }

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = contextBlock
    ? `${systemBase}\n\nUse this retrieved context. Do not claim facts beyond it:\n\n${contextBlock}`
    : systemBase;

  const history = messages.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const historyPayload: ChatMessagePayload[] = [
    { role: "system", content: system },
    ...history,
  ];

  // Attach context (active-note excerpt, etc.) to the newest user turn explicitly.
  if (opts.attachment && historyPayload.length > 1) {
    const last = historyPayload[historyPayload.length - 1];
    historyPayload[historyPayload.length - 1] = {
      ...last,
      content: `${opts.attachment}${last.content}`,
    };
  }

  return historyPayload;
}

/** Persists a Q&A turn to durable memory when `memoryAutoSave` is enabled. */
export async function persistConversationTurn(opts: {
  userText: string;
  assistantText: string;
  scope: string;
}, settings?: Settings): Promise<number | null> {
  const s = settings ?? (await import("../stores/useStore")).useStore.getState().settings;
  if (s.memoryAutoSave === false) return null;
  if (!opts.assistantText.trim()) return null;
  return remember(
    {
      scope: opts.scope,
      kind: "message",
      content: `Q: ${opts.userText}\nA: ${opts.assistantText.slice(0, 2000)}`,
      source: "study-assistant",
      topicTitle: opts.scope,
    },
    s
  );
}

/**
 * Micro-agent executor used by the Agent panel (summarize/improve/assess/custom) and
 * reuseable anywhere a one-shot task needs memory + RAG context. Streams the completion
 * through `onChunk` and returns the final text.
 */
export async function runAgentTask(opts: {
  task: string;
  context: string;
  scope: string;
  vaultRoot: string;
  onChunk?: (text: string) => void;
  onStatusChange?: (status: string) => void;
}): Promise<string> {
  const { useStore } = await import("../stores/useStore");
  const store = useStore.getState();
  const settings = store.settings;

  const bundle = await fetchContextBundle({
    vaultRoot: opts.vaultRoot,
    scope: opts.scope,
    queryText: opts.context || opts.scope,
    activeNotePath: store.activeLeftTabId || store.activeRightTabId,
  });

  const contextBlock = bundle ? formatContextBundle(bundle) : "";
  const system = [
    "You are the Local Study Notebook micro-agent. Perform the requested task using only the provided context and your own knowledge.",
    "Do not invent facts not supported by the context. Keep the answer concise and well-structured.",
  ].join(" ");

  const messages: ChatMessagePayload[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `[TASK]\n${opts.task}\n\n[CONTEXT]\n${contextBlock || opts.context}\n[TARGET TEXT]\n${opts.context}`,
    },
  ];

  let out = "";
  await streamAIResponse({
    messages,
    settings,
    onChunk: (t) => {
      out = t;
      opts.onChunk?.(t);
    },
    onStatusChange: opts.onStatusChange,
  });
  return out;
}
```


## `src\services\workspaceTools.ts`

```typescript
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../stores/useStore";
import type { McpConnector } from "../types";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

// Wire shapes returned by the Rust MCP host (src-tauri/src/mcp.rs).
interface McpTool {
  name: string;
  description: string;
  input_schema: ToolDefinition["function"]["parameters"];
}

interface McpContent {
  type: string;
  text?: string;
}

interface McpCallResult {
  content: McpContent[];
  is_error: boolean;
}

/** Maps a frontend connector to the Rust `ConnectorConfig` wire shape (snake_case keys). */
function connectorToConfig(c: McpConnector): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
    tools: c.tools,
  };
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : !!navigator.onLine;
}

function mcpResultToString(result: McpCallResult): string {
  const parts = result.content
    .map((c) => (c.type === "text" && c.text ? c.text : `[${c.type} content not renderable as text]`))
    .filter(Boolean);
  if (parts.length === 0) return "(connector returned no content)";
  return parts.join("\n\n");
}

/**
 * Builds the full tool list sent to the AI model: builtin workspace tools merged with
 * every enabled connector's tools. Connector names are namespaced as `<connector>/<tool>`
 * so builtin vs connector tools can never collide; the dispatch path strips the prefix.
 * Offline http connectors are excluded so the model never wastes a turn on an
 * unreachable cloud server.
 */
export async function buildEffectiveTools(): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [...WORKSPACE_TOOLS];
  const settings = useStore.getState().settings;
  // File-mutation tools are gated off entirely unless aiEnableFileWrite is on (Phase 2b).
  if (settings.aiEnableFileWrite) {
    tools.push(...FILE_WRITE_TOOLS);
  }
  const connectors = useStore.getState().settings.connectors.filter((c) => c.enabled);
  for (const connector of connectors) {
    if (connector.kind === "http" && !isOnline()) continue;
    try {
      const mcpTools = await invoke<McpTool[]>("list_connector_tools", {
        config: connectorToConfig(connector),
      });
      for (const t of mcpTools) {
        tools.push({
          type: "function",
          function: {
            name: `${connector.name}/${t.name}`,
            description: t.description,
            parameters: t.input_schema,
          },
        });
      }
    } catch (err) {
      console.warn(`[MCP] Skipping connector "${connector.name}":`, err);
    }
  }
  return tools;
}

export const WORKSPACE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_vault",
      description: "Search local markdown notes in the user's workspace for keywords or topics.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query or keyword to locate in workspace notes.",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_active_note",
      description: "Read the full contents of the currently active note open in the editor.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_backlinks",
      description: "Get incoming backlinks and outgoing connections for a specific note path.",
      parameters: {
        type: "object",
        properties: {
          note_path: {
            type: "string",
            description: "The path or filename of the note to retrieve backlinks for.",
          },
        },
        required: ["note_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rag_search",
      description:
        "Semantic + keyword search over the workspace notes (Memory-RAG) that returns the most relevant passages for a query, even when wording differs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The question or topic to retrieve context for.",
          },
          limit: {
            type: "number",
            description: "Maximum passages to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description:
        "Recall durable memory entries (facts, prior Q&A, user context) for a topic or query, semantically by default, keyword fallback offline.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What to recall (topic, question, or fact).",
          },
          scope: {
            type: "string",
            description: 'Optional memory scope filter, e.g. a topic title or "global".',
          },
          limit: {
            type: "number",
            description: "Maximum entries to return (default 5).",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Persist a durable fact or context about the user, a topic, or their workspace so future turns can recall it.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "string",
            description: 'Memory scope: a topic title or "global".',
          },
          content: {
            type: "string",
            description: "The fact or context to remember (1-3 sentences).",
          },
          topic_title: {
            type: "string",
            description: "Optional topic title for grouping.",
          },
        },
        required: ["scope", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_note_context",
      description:
        "Get the full context bundle for a single note: related passages (RAG), prior memory, backlinks, and the note's contents.",
      parameters: {
        type: "object",
        properties: {
          note_path: {
            type: "string",
            description: "Path of the note to build context for (defaults to the active note).",
          },
          query: {
            type: "string",
            description: "Optional question/topic to rank context against.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_notes",
      description: "List markdown notes available in the workspace (top-level folders included).",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum entries to list (default 20).",
          },
        },
        required: [],
      },
    },
  },
];

// File-mutation tools (Phase 2b) — only exposed to the model when
// `settings.aiEnableFileWrite` is enabled (default off). delete/rename/overwrite still
// pass through the user approval gate in `executeWorkspaceTool`.
export const FILE_WRITE_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_note",
      description:
        "Create a new markdown note at a vault-relative path (e.g. 'Guides/Chemistry.md'). Fails if a file already exists at that path. Use for creating new study notes and guides.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the new note, e.g. 'Guides/Organic Chemistry.md'.",
          },
          content: {
            type: "string",
            description: "Full markdown content (start with a `# Title` heading).",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_note",
      description:
        "Overwrite an existing note with new content, or create it when create_if_missing is true. Overwriting a non-empty file requires user approval.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note to edit.",
          },
          content: {
            type: "string",
            description: "Full replacement markdown content.",
          },
          create_if_missing: {
            type: "boolean",
            description: "Create the file when it doesn't exist yet (default false).",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description:
        "Permanently delete a note (or folder) from the vault. DANGEROUS — requires explicit user approval before it runs.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative path of the note or folder to delete.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_note",
      description:
        "Rename or move a note within the vault. Requires user approval before it runs.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative current path.",
          },
          new_name: {
            type: "string",
            description: "New vault-relative path.",
          },
        },
        required: ["path", "new_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "Create a new folder inside the vault (creates intermediate folders too).",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Vault-relative folder path, e.g. 'Guides/Physics'.",
          },
        },
        required: ["path"],
      },
    },
  },
];

/** Whether a possible file-mutation tool name is one of the gated write tools. */
export function isFileWriteTool(name: string): boolean {
  return FILE_WRITE_TOOLS.some((t) => t.function.name === name);
}

/**
 * Resolves a vault-relative path to an absolute one, refusing anything that escapes the
 * vault root (`..`, absolute paths, drive letters). Mirrors Rust `validate_vault_path`.
 */
function resolveVaultPath(vaultRoot: string, rel: string): string | null {
  if (!vaultRoot || typeof rel !== "string" || !rel.trim()) return null;
  if (rel.includes("\0")) return null;
  const normalized = rel.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return null;
  const joined = vaultRoot.replace(/[\\/]+$/, "") + "/" + normalized;
  const cleaned = joined
    .split("/")
    .reduce<string[]>((acc, seg) => {
      if (seg === "..") acc.pop();
      else if (seg !== "." && seg !== "") acc.push(seg);
      return acc;
    }, [])
    .join("/");
  const rootNorm = vaultRoot.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  const rootLower = rootNorm.toLowerCase();
  const check = cleaned.toLowerCase();
  if (check === rootLower) return null;
  if (!check.startsWith(rootLower + "/")) return null;
  return cleaned;
}

/** Polls the approval gate until the user resolves the request. */
function awaitApproval(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    const poll = setInterval(() => {
      const item = useStore.getState().pendingToolApprovals.find((p) => p.id === id);
      if (!item || item.status !== "pending") {
        clearInterval(poll);
        resolve(item?.status === "approved");
      }
    }, 150);
  });
}

/** Adds an approval request and waits for the user; auto-denies when the store entry is gone. */
async function requireApproval(opts: {
  tool: string;
  args: Record<string, any>;
  summary: string;
}): Promise<boolean> {
  const id = "tool-approval-" + Date.now() + "-" + Math.round(Math.random() * 1e6);
  useStore.getState().addPendingToolApproval({
    id,
    tool: opts.tool,
    args: opts.args,
    summary: opts.summary,
    status: "pending",
  });
  return awaitApproval(id);
}

let postWriteTimer: ReturnType<typeof setTimeout> | null = null;

/** Reindexes the vault after a write tool succeeds, then lazily re-embeds (Phase 2b). */
function triggerPostWriteReindex(vaultRoot: string): void {
  invoke("reindex_vault", { vaultRoot })
    .then(() => {
      if (postWriteTimer !== null) clearTimeout(postWriteTimer);
      postWriteTimer = setTimeout(() => {
        postWriteTimer = null;
        const settings = useStore.getState().settings;
        if (!settings.aiEnabled) return;
        import("./agentKnowledge").then(({ rebuildEmbeddings }) => {
          rebuildEmbeddings(vaultRoot, settings).catch(() => {});
        });
      }, 500);
    })
    .catch(() => {});
}

export async function executeWorkspaceTool(name: string, args: Record<string, any>): Promise<string> {
  const store = useStore.getState();
  const vaultRoot = store.currentFolderPath;

  try {
    if (name === "search_vault") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const results = await invoke<Array<{ path: string; title: string; snippet: string; line_number: number }>>("search_vault", {
        vaultRoot,
        query: args.query || "",
      });

      if (!results || results.length === 0) {
        return `No matching note snippets found for query "${args.query}".`;
      }

      return results
        .map((r) => `- [${r.title}] (Line ${r.line_number}): ${r.snippet}`)
        .join("\n");
    }

    if (name === "read_active_note") {
      const activePath = store.activeLeftTabId || store.activeRightTabId;
      if (!activePath) return "No active tab open in the editor.";

      const content = store.activePanel === "left" ? store.leftDraft : store.rightDraft;
      const title = activePath.split(/[\\/]/).pop();
      return `### Active Note: ${title}\nPath: ${activePath}\n\n${content}`;
    }

    if (name === "get_note_backlinks") {
      const notePath = args.note_path || store.activeLeftTabId || "";
      if (!notePath) return "No note path specified.";

      const backlinks = await invoke<Array<{ source_path: string; link_text: string; line_number: number }>>("get_backlinks", {
        targetPath: notePath,
      });

      if (!backlinks || backlinks.length === 0) {
        return `No incoming backlinks found for "${notePath}".`;
      }

      return backlinks
        .map((b) => `- Linked from [${b.source_path.split(/[\\/]/).pop()}] (Line ${b.line_number}): "${b.link_text}"`)
        .join("\n");
    }

    if (name === "rag_search") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const settings = useStore.getState().settings;
      const { embedTexts } = await import("./aiProvider");
      const embedding = (await embedTexts([String(args.query || "")], settings))[0] ?? [];
      const results = await invoke<Array<{ path: string; title: string; snippet: string; score: number }>>("search_rag", {
        vaultRoot,
        queryText: String(args.query || ""),
        queryEmbedding: embedding,
        limit: Math.max(1, Number(args.limit) || settings.ragTopK || 5),
      });
      if (!results || results.length === 0) {
        return `No relevant passages found for "${args.query}".`;
      }
      return results
        .map((r) => `- [${r.title}] (score ${r.score.toFixed(3)}): ${r.snippet}`)
        .join("\n");
    }

    if (name === "recall_memory") {
      const settings = useStore.getState().settings;
      const { embedTexts } = await import("./aiProvider");
      const query = String(args.query || "");
      const embedding = (await embedTexts([query], settings))[0] ?? [];
      const results = await invoke<Array<{ id: number; scope: string; kind: string; content: string; created_at: string; score: number }>>("recall_memory", {
        scope: String(args.scope || "global"),
        queryText: query,
        queryEmbedding: embedding,
        limit: Math.max(1, Number(args.limit) || settings.ragTopK || 5),
      });
      if (!results || results.length === 0) return `No recalled memory for "${query}".`;
      return results
        .map((m) => `- [${m.kind}/${m.scope}] ${m.content}`)
        .join("\n");
    }

    if (name === "save_memory") {
      const { remember } = await import("./agentKnowledge");
      const content = String(args.content || "").trim();
      if (!content) return "Error: save_memory requires a non-empty content.";
      const settings = useStore.getState().settings;
      await remember(
        {
          scope: String(args.scope || "global"),
          kind: "fact",
          content,
          source: "ai-assistant",
          topicTitle: args.topic_title ? String(args.topic_title) : undefined,
        },
        settings
      );
      return `Remembered: ${content.slice(0, 300)}`;
    }

    if (name === "get_note_context") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const { fetchContextBundle, formatContextBundle } = await import("./agentKnowledge");
      const notePath = args.note_path || store.activeLeftTabId || store.activeRightTabId || null;
      const bundle = await fetchContextBundle({
        vaultRoot,
        scope: notePath ? notePath.split(/[\\/]/).pop() || "note" : "global",
        queryText: args.query ? String(args.query) : undefined,
        activeNotePath: notePath,
      });
      if (!bundle) return "Could not build context for that note.";
      return formatContextBundle(bundle);
    }

    if (name === "list_recent_notes") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      const excludedList = store.settings.excludedFolders
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const entries = await invoke<Array<{ name: string; path: string; is_dir: boolean }>>("read_local_dir", {
        path: vaultRoot,
        excludedFolders: excludedList,
      });
      const limit = Math.max(1, Number(args.limit) || 20);
      const notes = entries
        .filter((e) => !e.is_dir && /\.(md|markdown|txt)$/i.test(e.name))
        .slice(0, limit);
      if (!notes.length) return "No markdown/plain-text notes found in the workspace root.";
      return notes.map((n) => `- ${n.name}`).join("\n");
    }

    // ---- Phase 2b: file-mutation tools (gated + approval-required) ----

    if (name === "create_note" || name === "create_folder") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "").trim();
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      if (name === "create_folder") {
        await invoke("create_local_dir", { parentPath: vaultRoot, name: rel, vaultRoot });
        triggerPostWriteReindex(vaultRoot);
        return `Created folder "${rel}".`;
      }
      const dirName = target.split("/").pop() || "note.md";
      const dirPath = target.slice(0, target.length - dirName.length).replace(/\/$/, "") || vaultRoot;
      await invoke("create_local_file", {
        dirPath,
        name: dirName,
        vaultRoot,
      });
      await invoke("write_local_file", {
        path: target,
        content: String(args.content || ""),
        vaultRoot,
      });
      triggerPostWriteReindex(vaultRoot);
      return `Created note "${rel}".`;
    }

    if (name === "edit_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "");
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;

      let existing = "";
      try {
        existing = await invoke<string>("read_local_file", { path: target });
      } catch {
        existing = "___NOT_FOUND___";
      }

      if (existing === "___NOT_FOUND___" && args.create_if_missing !== true) {
        return `Error: No file exists at "${rel}" (create_if_missing is false).`;
      }
      if (existing !== "___NOT_FOUND___" && existing.replace(/\s+/g, "").length > 0) {
        const approved = await requireApproval({
          tool: name,
          args,
          summary: `Overwrite note "${rel}" (${existing.length} chars) with new AI-provided content?`,
        });
        if (!approved) return "User declined the overwrite — no changes made.";
      }
      await invoke("write_local_file", { path: target, content: String(args.content || ""), vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Updated note "${rel}".`;
    }

    if (name === "delete_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const rel = String(args.path || "");
      const target = resolveVaultPath(vaultRoot, rel);
      if (!target) return `Error: Refusing path "${rel}" — must stay inside the vault root and be non-empty.`;
      const approved = await requireApproval({
        tool: name,
        args,
        summary: `Delete "${rel}"? This cannot be undone.`,
      });
      if (!approved) return "User declined the delete — nothing was removed.";
      await invoke("delete_local_entry", { path: target, vaultRoot });
      useStore.getState().closeTab("left", target);
      useStore.getState().closeTab("right", target);
      triggerPostWriteReindex(vaultRoot);
      return `Deleted "${rel}".`;
    }

    if (name === "rename_note") {
      if (!vaultRoot) return "Error: No active workspace folder opened.";
      if (!useStore.getState().settings.aiEnableFileWrite) {
        return "Error: File write tools are disabled. Enable 'Allow AI file writes' in Settings -> AI.";
      }
      const relOld = String(args.path || "");
      const relNew = String(args.new_name || "");
      const oldTarget = resolveVaultPath(vaultRoot, relOld);
      const newTarget = resolveVaultPath(vaultRoot, relNew);
      if (!oldTarget || !newTarget) return `Error: Refusing path — must stay inside the vault root.`;
      const approved = await requireApproval({
        tool: name,
        args,
        summary: `Rename/move "${relOld}" to "${relNew}"?`,
      });
      if (!approved) return "User declined the rename — nothing changed.";
      await invoke("rename_local_entry", { oldPath: oldTarget, newPath: newTarget, vaultRoot });
      triggerPostWriteReindex(vaultRoot);
      return `Renamed "${relOld}" to "${relNew}".`;
    }

    // Namespaced connector tools: "<connectorName>/<toolName>".
    const slashIndex = name.indexOf("/");
    if (slashIndex > 0 && slashIndex < name.length - 1) {
      const connectorName = name.slice(0, slashIndex);
      const toolName = name.slice(slashIndex + 1);
      const connector = store.settings.connectors.find(
        (c) => c.enabled && c.name === connectorName
      );
      if (connector) {
        if (connector.kind === "http" && !isOnline()) {
          return "⚠️ Not connected — this connector requires internet access.";
        }
        const result = await invoke<McpCallResult>("call_connector_tool", {
          config: connectorToConfig(connector),
          name: toolName,
          args,
        });
        return mcpResultToString(result);
      }
    }

    return `Error: Unknown tool "${name}".`;
  } catch (err) {
    return `Error executing tool "${name}": ${String(err)}`;
  }
}
```


## `src\components\Layout.tsx`

```typescript
import TopBar from "./TopBar";
import Navbar from "./Navbar";
import AssistantPanel from "./AssistantPanel";
import SourcesPanel from "./SourcesPanel";
import ArtifactsPanel from "./ArtifactsPanel";
import AgentPanel from "./AgentPanel";
import StudyBoard from "./StudyBoard";
import SettingsModal from "./SettingsModal";
import WorkspaceLauncherModal from "./WorkspaceLauncherModal";
import PanelLayoutModal from "./PanelLayoutModal";
import WelcomeOnboarding from "./WelcomeOnboarding";
import PanelDragHandle, { PANEL_DRAG_MIME } from "./PanelDragHandle";
import EdgeResizer from "./EdgeResizer";
import { useStore, SidePanelId } from "../stores/useStore";

export default function Layout() {
  const panelOrder = useStore((s) => s.panelOrder);
  const reorderPanels = useStore((s) => s.reorderPanels);

  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const assistantWidth = useStore((s) => s.assistantWidth);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);

  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const sourcePanelWidth = useStore((s) => s.sourcePanelWidth);
  const setSourcePanelWidth = useStore((s) => s.setSourcePanelWidth);

  const showArtifactsPanel = useStore((s) => s.showArtifactsPanel);
  const artifactsWidth = useStore((s) => s.artifactsWidth);
  const setArtifactsWidth = useStore((s) => s.setArtifactsWidth);

  const showAgentPanel = useStore((s) => s.showAgentPanel);
  const agentWidth = useStore((s) => s.agentWidth);
  const setAgentWidth = useStore((s) => s.setAgentWidth);

  const cornerRoundness = useStore((s) => s.settings.cornerRoundness);

  const handleAssistantResize = (delta: number) => {
    const next = Math.min(Math.max(assistantWidth + delta, 260), 650);
    setAssistantWidth(next);
  };

  const handleSourcesResize = (delta: number) => {
    const next = Math.min(Math.max(sourcePanelWidth + delta, 160), 500);
    setSourcePanelWidth(next);
  };

  const handleArtifactsResize = (delta: number) => {
    const next = Math.min(Math.max(artifactsWidth - delta, 260), 600);
    setArtifactsWidth(next);
  };

  const handleAgentResize = (delta: number) => {
    const next = Math.min(Math.max(agentWidth - delta, 260), 600);
    setAgentWidth(next);
  };

  const panelConfig: Record<
    SidePanelId,
    { visible: boolean; width: number; onResize: (delta: number) => void; Component: React.ComponentType }
  > = {
    assistant: { visible: showAssistantPanel, width: assistantWidth, onResize: handleAssistantResize, Component: AssistantPanel },
    sources: { visible: showSourcesPanel, width: sourcePanelWidth, onResize: handleSourcesResize, Component: SourcesPanel },
    artifacts: { visible: showArtifactsPanel, width: artifactsWidth, onResize: handleArtifactsResize, Component: ArtifactsPanel },
    agent: { visible: showAgentPanel, width: agentWidth, onResize: handleAgentResize, Component: AgentPanel },
  };

  const roundnessStyle =
    cornerRoundness === "none"
      ? "0px"
      : cornerRoundness === "sm"
      ? "4px"
      : cornerRoundness === "lg"
      ? "12px"
      : "6px";

  return (
    <div
      className="flex h-full w-full flex-col bg-bg text-text overflow-hidden"
      style={{ "--panel-roundness": roundnessStyle } as React.CSSProperties}
    >
      <TopBar />

      <div className="flex flex-1 overflow-hidden p-1 gap-1">
        <Navbar />

        {panelOrder.map((id) => {
          const { visible, width, onResize, Component } = panelConfig[id];
          if (!visible) return null;
          return (
            <div key={id} className="contents">
              <div
                style={{ width }}
                className="relative shrink-0 h-full"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData(PANEL_DRAG_MIME) as SidePanelId | "";
                  if (draggedId && draggedId !== id) reorderPanels(draggedId, id);
                }}
              >
                <PanelDragHandle panelId={id} />
                <Component />
              </div>
              <EdgeResizer onResize={onResize} />
            </div>
          );
        })}

        <div className="min-w-0 flex-1 h-full">
          <StudyBoard />
        </div>

        {showArtifactsPanel && !panelOrder.includes("artifacts") && (
          <div className="contents">
            <EdgeResizer onResize={handleArtifactsResize} />
            <div style={{ width: artifactsWidth }} className="relative shrink-0 h-full">
              <ArtifactsPanel />
            </div>
          </div>
        )}

        {showAgentPanel && !panelOrder.includes("agent") && (
          <div className="contents">
            <EdgeResizer onResize={handleAgentResize} />
            <div style={{ width: agentWidth }} className="relative shrink-0 h-full">
              <AgentPanel />
            </div>
          </div>
        )}
      </div>

      <SettingsModal />
      <WorkspaceLauncherModal />
      <PanelLayoutModal />
      <WelcomeOnboarding />
    </div>
  );
}
```


## `src\components\Navbar.tsx`

```typescript
import { useStore } from "../stores/useStore";

export default function Navbar() {
  const showSidebar = useStore((s) => s.showSourcesPanel);
  const toggleSidebar = useStore((s) => s.toggleSourcesPanel);
  const showAssistant = useStore((s) => s.showAssistantPanel);
  const toggleAssistant = useStore((s) => s.toggleAssistantPanel);
  const showAgent = useStore((s) => s.showAgentPanel);
  const toggleAgent = useStore((s) => s.toggleAgentPanel);
  const openNewNote = useStore((s) => s.openNewNote);
  const setShowSettings = useStore((s) => s.setShowSettings);

  return (
    <nav className="flex w-12 shrink-0 flex-col items-center justify-between panel-rounded border border-border bg-card py-3 select-none">
      {/* Top Icons */}
      <div className="flex flex-col items-center gap-2 w-full">
        {/* Assistant Panel Toggle (Sparkles / AI Chat Icon) */}
        <button
          onClick={toggleAssistant}
          title="Toggle Study Assistant"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
            showAssistant
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:bg-bg hover:text-white"
          }`}
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </button>

        {/* Explorer Toggle Button (Folder Icon) */}
        <button
          onClick={toggleSidebar}
          title="Toggle File Explorer"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
            showSidebar
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:bg-bg hover:text-white"
          }`}
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>

        {/* Agent Panel Toggle (Lightning / Focus Icon) */}
        <button
          onClick={toggleAgent}
          title="Toggle Agent Panel"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer ${
            showAgent
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:bg-bg hover:text-white"
          }`}
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </button>

        <div className="w-6 border-b border-border/60 my-1" />

        {/* New Note Button (Plus Document Icon) */}
        <button
          onClick={openNewNote}
          title="Create New Note (Ctrl+N)"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4.5 h-4.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
          </svg>
        </button>
      </div>

      {/* Bottom Settings Button (Gear Icon) */}
      <button
        onClick={() => setShowSettings(true)}
        title="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
      >
        <svg className="w-5 h-5 stroke-current animate-hover-spin" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </nav>
  );
}
```


## `src\components\SourcesPanel.tsx`

```typescript
import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore, FileEntry } from "../stores/useStore";
import MoveConfirmModal from "./MoveConfirmModal";

interface ContextMenu {
  x: number;
  y: number;
  path: string;
  isDir: boolean;
}

export const FILE_DRAG_MIME = "application/x-lsn-file-entry";

interface MoveItem {
  name: string;
  from: string;
  to: string;
  conflict: boolean;
}

export default function SourcesPanel() {
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const explorerEntries = useStore((s) => s.explorerEntries);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const openFolder = useStore((s) => s.openFolder);
  const closeFolder = useStore((s) => s.closeFolder);
  const refreshExplorer = useStore((s) => s.refreshExplorer);
  const createFile = useStore((s) => s.createFile);
  const createFolder = useStore((s) => s.createFolder);
  const renameEntry = useStore((s) => s.renameEntry);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const moveEntries = useStore((s) => s.moveEntries);

  const filterQuery = useStore((s) => s.filterQuery);
  const setFilterQuery = useStore((s) => s.setFilterQuery);
  const setShowLauncherModal = useStore((s) => s.setShowLauncherModal);

  const openFile = useStore((s) => s.openFile);
  const activeLeftTabId = useStore((s) => s.activeLeftTabId);
  const activeRightTabId = useStore((s) => s.activeRightTabId);
  const activeTabId = useStore((s) => (s.activePanel === "left" ? activeLeftTabId : activeRightTabId));

  // Local States
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editorVal, setEditorVal] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({
    "Documentation": true,
    "Guides": true,
    "Sources": true,
  });

  // Selection + Drag/Drop states
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [pendingMove, setPendingMove] = useState<MoveItem[] | null>(null);

  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lastClickTimeRef = useRef(0);

  // Initial refresh of explorer on mount/folder change
  useEffect(() => {
    if (currentFolderPath) {
      refreshExplorer();
    }
    setSelectedPaths([]);
    setLastClickedPath(null);
  }, [currentFolderPath, refreshExplorer]);

  // Handle outside click to close context menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Flatten the visible tree for shift-click range selection
  const flattenTree = (nodes: FileEntry[]): string[] => {
    const result: string[] = [];
    const walk = (list: FileEntry[]) => {
      for (const node of list) {
        result.push(node.path);
        if (node.is_dir && node.children) walk(node.children);
      }
    };
    walk(nodes);
    return result;
  };

  // Compute the ordered list of all paths once per explorerEntries change
  const orderedPaths = flattenTree(explorerEntries);

  useEffect(() => {
    setOrder(orderedPaths);
  }, [JSON.stringify(orderedPaths)]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        await openFolder(selected);
      }
    } catch (err) {
      alert("Failed to open folder: " + err);
    }
  };

  // Node Context Menu
  const handleNodeContextMenu = (e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path,
      isDir,
    });
  };

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    if (!currentFolderPath) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path: currentFolderPath,
      isDir: true,
    });
  };

  // Directory Tree Render Toggle
  const toggleDirExpanded = (path: string) => {
    setExpandedDirs((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  // Click handler for node selection (with multi-select)
  const handleNodeClick = (e: React.MouseEvent, node: FileEntry) => {
    const now = Date.now();
    lastClickTimeRef.current = now;

    if (e.ctrlKey || e.metaKey) {
      e.stopPropagation();
      setSelectedPaths((prev) =>
        prev.includes(node.path) ? prev.filter((p) => p !== node.path) : [...prev, node.path]
      );
      return;
    }

    if (e.shiftKey && lastClickedPath && order.length > 0) {
      e.stopPropagation();
      const startIdx = order.indexOf(lastClickedPath);
      const endIdx = order.indexOf(node.path);
      if (startIdx !== -1 && endIdx !== -1) {
        const [min, max] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        setSelectedPaths(order.slice(min, max + 1));
        setLastClickedPath(node.path);
        return;
      }
    }

    // Plain click: clear selection, open file / toggle folder
    setSelectedPaths([]);
    setLastClickedPath(node.path);
    if (node.is_dir) {
      toggleDirExpanded(node.path);
    } else {
      openFile(node.path);
    }
  };

  // Drag handlers
  const isFileDrag = (e: React.DragEvent): boolean => {
    return e.dataTransfer.types.includes(FILE_DRAG_MIME);
  };

  const handleDragStart = (e: React.DragEvent, path: string) => {
    if (!currentFolderPath) return;
    e.stopPropagation();
    setIsDragging(true);
    // Drag the selection if this node is part of it; otherwise drag just this node
    const paths = selectedPaths.includes(path) ? selectedPaths : [path];
    e.dataTransfer.setData(FILE_DRAG_MIME, JSON.stringify({ paths, vaultRoot: currentFolderPath }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setDragOverPath(null);
    setDragOverRoot(false);
  };

  const isDescendant = (nodePath: string, ancestorPath: string): boolean => {
    if (nodePath === ancestorPath) return true;
    const normNode = nodePath.replace(/\\/g, "/");
    const normAncestor = ancestorPath.replace(/\\/g, "/");
    return normNode.startsWith(normAncestor.endsWith("/") ? normAncestor : normAncestor + "/");
  };

  const handleDirectoryDrop = (e: React.DragEvent, destDir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setDragOverRoot(false);
    setIsDragging(false);

    if (!currentFolderPath) return;
    const raw = e.dataTransfer.getData(FILE_DRAG_MIME);
    if (!raw) return;
    const { paths } = JSON.parse(raw) as { paths: string[]; vaultRoot: string };

    // Filter out invalid moves
    const valid = paths.filter((p) => {
      if (p === currentFolderPath) return false;
      if (isDescendant(destDir, p)) return false; // can't drop a folder into itself/descendant
      const parent = p.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
      const normDest = destDir.replace(/\\/g, "/").replace(/\/+$/, "");
      return parent !== normDest; // moving into same dir is no-op
    });

    if (valid.length === 0) return;

    const items: MoveItem[] = valid.map((p) => {
      const name = p.split(/[\\/]/).pop() || "";
      const joined = `${destDir.replace(/\\/g, "/").replace(/\/+$/, "")}/${name}`;
      return { name, from: p, to: joined, conflict: pathExists(joined) };
    });

    setPendingMove(items);
  };

  // Context Menu Actions
  const handleActionNewFile = async () => {
    if (!contextMenu) return;
    const name = prompt("Enter new file name (e.g. note.md):");
    if (!name || !name.trim()) return;
    try {
      const path = await createFile(contextMenu.path, name.trim());
      setContextMenu(null);
      await openFile(path);
    } catch (err) {
      alert("Failed to create file: " + err);
    }
  };

  const handleActionNewFolder = async () => {
    if (!contextMenu) return;
    const name = prompt("Enter new folder name:");
    if (!name || !name.trim()) return;
    try {
      await createFolder(contextMenu.path, name.trim());
      setContextMenu(null);
    } catch (err) {
      alert("Failed to create folder: " + err);
    }
  };

  const handleActionRename = () => {
    if (!contextMenu) return;
    const filename = contextMenu.path.split(/[\\/]/).pop() ?? "";
    setEditingPath(contextMenu.path);
    setEditorVal(filename);
    setContextMenu(null);
  };

  const confirmBeforeDelete = useStore((s) => s.settings.confirmBeforeDelete);

  const handleActionDelete = async () => {
    if (!contextMenu) return;
    const filename = contextMenu.path.split(/[\\/]/).pop() ?? "";
    const shouldDelete = confirmBeforeDelete
      ? confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)
      : true;

    if (shouldDelete) {
      try {
        await deleteEntry(contextMenu.path);
        setSelectedPaths([]);
        setContextMenu(null);
      } catch (err) {
        alert("Failed to delete entry: " + err);
      }
    }
  };

  const handleRenameConfirm = async () => {
    if (editingPath && editorVal.trim()) {
      const parts = editingPath.split(/[\\/]/);
      parts.pop();
      const parent = parts.join("/");
      const newPath = `${parent}/${editorVal.trim()}`;
      try {
        await renameEntry(editingPath, newPath);
        setEditingPath(null);
        setSelectedPaths((prev) =>
          prev.map((p) => (p === editingPath ? newPath : p))
        );
      } catch (err) {
        alert("Rename failed: " + err);
      }
    }
  };

  // Filter matcher for search query
  const matchesFilter = (node: FileEntry): boolean => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    if (node.name.toLowerCase().includes(q)) return true;
    if (node.is_dir && node.children) {
      return node.children.some((child) => matchesFilter(child));
    }
    return false;
  };

  const isSelected = (path: string) => selectedPaths.includes(path);

  // Check if a target path exists in the tree (for conflict detection).
  // Normalize separators so forward/backslash comparisons match.
  const normPath = (p: string): string => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const pathExists = (path: string): boolean => order.some((o) => normPath(o) === normPath(path));

  const resolveConflict = (targetPath: string): string => {
    if (!pathExists(targetPath)) return targetPath;
    const base = targetPath;
    const dot = targetPath.lastIndexOf(".");
    const stem = dot > targetPath.lastIndexOf("/") ? targetPath.slice(0, dot) : targetPath;
    const ext = dot > targetPath.lastIndexOf("/") ? targetPath.slice(dot) : "";
    let i = 1;
    let candidate = `${stem} (${i})${ext}`;
    while (pathExists(candidate)) {
      i++;
      candidate = `${stem} (${i})${ext}`;
    }
    return candidate;
  };

  const handleMoveConfirm = async () => {
    if (!pendingMove) return;
    const resolved: { oldPath: string; newPath: string }[] = [];
    for (const item of pendingMove) {
      resolved.push({ oldPath: item.from, newPath: resolveConflict(item.to) });
    }
    try {
      await moveEntries(resolved);
      setPendingMove(null);
      setSelectedPaths([]);
    } catch (err) {
      alert("Move failed: " + err);
    }
  };

  // Recursive Directory Tree Node Component
  const renderNode = (node: FileEntry, depth = 0) => {
    if (!matchesFilter(node)) return null;

    const isDir = node.is_dir;
    const isExpanded = expandedDirs[node.path] ?? (filterQuery.trim().length > 0 || depth === 0);
    const isEditing = editingPath === node.path;
    const isTabActive = activeTabId === node.path;
    const isMd = node.name.endsWith(".md") || node.name.endsWith(".markdown");
    const selected = isSelected(node.path);
    const dragOver = dragOverPath === node.path && isDir;

    return (
      <div key={node.path} className="flex flex-col select-none">
        {/* Row element */}
        <div
          draggable={!isEditing && !!currentFolderPath}
          onDragStart={(e) => handleDragStart(e, node.path)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            if (isDir) setDragOverPath(node.path);
          }}
          onDragLeave={() => {
            if (dragOverPath === node.path) setDragOverPath(null);
          }}
          onDrop={(e) => {
            if (isDir) handleDirectoryDrop(e, node.path);
          }}
          onClick={(e) => handleNodeClick(e, node)}
          onContextMenu={(e) => handleNodeContextMenu(e, node.path, isDir)}
          style={{ paddingLeft: `${depth * 10 + 4}px` }}
          className={`group flex items-center gap-1 py-1 px-1.5 rounded-md cursor-pointer transition-colors ${
            dragOver
              ? "bg-accent/20 border border-accent/60"
              : selected
              ? "bg-accent/15 border border-accent/40"
              : "border border-transparent "
          } ${
            isTabActive && !selected
              ? "bg-[#252836] text-white font-medium"
              : selected
              ? "text-white"
              : "text-text/80 hover:bg-bg/60 hover:text-text"
          }`}
        >
          {isDir ? (
            <span className="w-4 text-center text-[11px] text-muted group-hover:text-text font-mono shrink-0">
              {isExpanded ? "v" : ">"}
            </span>
          ) : isMd ? (
            <span className="text-[11px] text-cyan-400 font-mono font-bold shrink-0 mr-0.5">
              M+
            </span>
          ) : (
            <span className="w-3 text-center text-[11px] text-muted shrink-0">·</span>
          )}

          {isEditing ? (
            <input
              autoFocus
              value={editorVal}
              onChange={(e) => setEditorVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
              onBlur={handleRenameConfirm}
              onClick={(e) => e.stopPropagation()}
              className="min-w-0 flex-1 rounded border border-border bg-card px-1 py-0.5 text-xs text-text outline-none"
            />
          ) : (
            <span className="truncate text-xs tracking-tight">{node.name}</span>
          )}

          {/* Pin marker */}
          {!isDir && pinnedPaths.includes(node.path) && (
            <span className="text-[10px] text-amber-500 ml-auto shrink-0" title="Pinned">
              📌
            </span>
          )}
        </div>

        {/* Drop target when a directory is expanded (blank space below children) */}
        {isDir && isExpanded && node.children && node.children.length > 0 && (
          <div
            onDragOver={(e) => {
              if (!isFileDrag(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDragOverPath(node.path);
            }}
            onDragLeave={() => {
              if (dragOverPath === node.path) setDragOverPath(null);
            }}
            onDrop={(e) => handleDirectoryDrop(e, node.path)}
            style={{ marginLeft: `${(depth + 1) * 10 + 4}px` }}
            className={`flex items-center justify-center rounded py-0.5 mx-1 text-[9px] text-muted transition-colors ${
              dragOverPath === node.path ? "bg-accent/15 text-accent" : "hover:bg-bg/40"
            }`}
          >
            <span className="opacity-60">— drop to move into this folder —</span>
          </div>
        )}

        {/* Children directories */}
        {isDir && isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const folderName = currentFolderPath ? currentFolderPath.split(/[\\/]/).pop() : "Local Study Notebook";

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-r border-border/40">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between px-2.5 py-2 bg-bg/20 border-b border-border/30">
        <h2 className="text-xs font-semibold text-text truncate select-none">
          {folderName}
        </h2>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowLauncherModal(true)}
            title="Open Launcher / Start Workspace"
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            onClick={refreshExplorer}
            title="Refresh files"
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter Files search */}
      <div className="shrink-0 p-1.5 border-b border-border/30 bg-bg/10">
        <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-bg/40 px-2 py-0.5 text-xs text-text focus-within:border-accent/80 transition-colors">
          <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Filter files"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            onFocus={() => setSelectedPaths([])}
            className="w-full bg-transparent text-xs text-text placeholder:text-muted/60 outline-none"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery("")}
              className="text-[10px] text-muted hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tree Content */}
      <div
        onContextMenu={handleEmptyContextMenu}
        onClick={() => {
          const t = Date.now();
          if (t - lastClickTimeRef.current > 100) {
            setSelectedPaths([]);
            setLastClickedPath(null);
          }
        }}
        onDragOver={(e) => {
          if (!isFileDrag(e)) return;
          e.preventDefault();
          if (currentFolderPath) setDragOverRoot(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverRoot(false);
        }}
        onDrop={(e) => {
          if (currentFolderPath) handleDirectoryDrop(e, currentFolderPath);
        }}
        className="flex-1 overflow-y-auto p-1 space-y-0.5 scrollbar-thin"
      >
        {!currentFolderPath ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-muted">
            <p className="text-xs font-semibold text-text mb-1">No vault open</p>
            <button
              onClick={() => setShowLauncherModal(true)}
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Launch Workspace
            </button>
          </div>
        ) : explorerEntries.length === 0 ? (
          <p className="p-3 text-center text-[10px] text-muted">Empty folder.</p>
        ) : (
          explorerEntries.map((node) => renderNode(node))
        )}
      </div>

      {/* Drop target bar when dragging (move to vault root) */}
      {isDragging && currentFolderPath && (
        <div
          onDragOver={(e) => {
            if (!isFileDrag(e)) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverRoot(true);
          }}
          onDragLeave={() => setDragOverRoot(false)}
          onDrop={(e) => handleDirectoryDrop(e, currentFolderPath)}
          className={`shrink-0 mx-2 my-1.5 flex items-center justify-center gap-1.5 rounded-md border border-dashed py-1.5 text-[10px] transition-colors ${
            dragOverRoot
              ? "border-accent bg-accent/15 text-accent"
              : "border-border/60 text-muted"
          }`}
        >
          <svg className="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Drop here to move to {folderName}
        </div>
      )}

      {/* Selection action bar */}
      {selectedPaths.length > 0 && !isDragging && (
        <div className="shrink-0 mx-2 my-1.5 flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5">
          <span className="text-[10px] font-semibold text-accent">
            {selectedPaths.length} selected
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted hidden sm:inline">Drag to move</span>
            <button
              onClick={() => setSelectedPaths([])}
              className="rounded px-1.5 py-0.5 text-[10px] text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Floating Right Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 flex w-36 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl"
        >
          {contextMenu.isDir && (
            <>
              <button
                onClick={handleActionNewFile}
                className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
              >
                New File
              </button>
              <button
                onClick={handleActionNewFolder}
                className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
              >
                New Folder
              </button>
              <div className="h-px bg-border/60 my-0.5" />
            </>
          )}
          {contextMenu.path !== currentFolderPath && (
            <>
              <button
                onClick={handleActionRename}
                className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
              >
                Rename
              </button>
              <button
                onClick={handleActionDelete}
                className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Move Confirmation Modal */}
      {pendingMove && (
        <MoveConfirmModal
          items={pendingMove}
          onConfirm={handleMoveConfirm}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </div>
  );
}
```


## `src\components\StudyBoard.tsx`

```typescript
import { useState, useEffect, useRef, useMemo } from "react";
import { useStore, Tab, ViewMode } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownEditor from "./MarkdownEditor";
import BacklinksPanel from "./BacklinksPanel";
import EditorContextMenu from "./EditorContextMenu";
import EdgeResizer from "./EdgeResizer";

export const TAB_DRAG_MIME = "application/x-lsn-tab";

const NEXT_VIEW_MODE: Record<ViewMode, ViewMode> = {
  live: "source",
  source: "preview",
  preview: "live",
};

export default function StudyBoard() {
  const splitActive = useStore((s) => s.splitActive);
  const activePanel = useStore((s) => s.activePanel);
  const setActivePanel = useStore((s) => s.setActivePanel);
  const moveTab = useStore((s) => s.moveTab);
  const splitLeftWidth = useStore((s) => s.splitLeftWidth);
  const setSplitLeftWidth = useStore((s) => s.setSplitLeftWidth);
  const [splitDropActive, setSplitDropActive] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const leftWidth = splitLeftWidth > 0 ? splitLeftWidth : (containerRef.current?.clientWidth ?? 800) / 2;

  const handleSplitResize = (delta: number) => {
    const containerWidth = containerRef.current?.clientWidth ?? 800;
    if (containerWidth <= 0) return;
    const next = Math.min(Math.max(leftWidth + delta, 200), containerWidth - 200);
    setSplitLeftWidth(next);
  };

  const leftStyle = splitActive ? { flex: `0 0 ${leftWidth}px` } : { flex: "1 1 0%" };
  const rightStyle = splitActive ? { flex: `1 1 0%` } : {};

  return (
    <div ref={containerRef} className="flex h-full w-full gap-1">
      <div
        onClick={() => setActivePanel("left")}
        style={leftStyle}
        className={`relative flex flex-col h-full overflow-hidden panel-rounded bg-card transition-colors ${
          activePanel === "left" && splitActive ? "border border-accent/60" : "border-r border-border/40"
        }`}
      >
        <EditorPanel panel="left" />
        {!splitActive && (
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(TAB_DRAG_MIME)) return;
              e.preventDefault();
              setSplitDropActive(true);
            }}
            onDragLeave={() => setSplitDropActive(false)}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(TAB_DRAG_MIME);
              setSplitDropActive(false);
              if (!raw) return;
              e.preventDefault();
              const { panel: fromPanel, path } = JSON.parse(raw) as { panel: "left" | "right"; path: string };
              if (fromPanel === "left") moveTab("left", "right", path);
            }}
            title="Drop here to open in a split pane"
            className={`absolute right-0 top-0 bottom-0 w-6 z-20 transition-colors ${
              splitDropActive ? "bg-accent/20 border-l-2 border-accent" : ""
            }`}
          />
        )}
      </div>

      {splitActive && (
        <>
          <EdgeResizer onResize={handleSplitResize} />
          <div
            onClick={() => setActivePanel("right")}
            style={rightStyle}
            className={`flex flex-col h-full overflow-hidden panel-rounded bg-card transition-colors ${
              activePanel === "right" ? "border border-accent/60" : "border-l border-border/40"
            }`}
          >
            <EditorPanel panel="right" />
          </div>
        </>
      )}
    </div>
  );
}

interface EditorPanelProps {
  panel: "left" | "right";
}

function EditorPanel({ panel }: EditorPanelProps) {
  const isLeft = panel === "left";
  const tabs = useStore((s) => (isLeft ? s.leftTabs : s.rightTabs));
  const activeTabId = useStore((s) => (isLeft ? s.activeLeftTabId : s.activeRightTabId));
  const draft = useStore((s) => (isLeft ? s.leftDraft : s.rightDraft));
  const viewMode = useStore((s) => (isLeft ? s.leftViewMode : s.rightViewMode));

  const selectTab = useStore((s) => s.selectTab);
  const closeTab = useStore((s) => s.closeTab);
  const moveTab = useStore((s) => s.moveTab);
  const setDraftContent = useStore((s) => s.setDraftContent);
  const setPanelViewMode = useStore((s) => s.setPanelViewMode);
  const splitScreen = useStore((s) => s.splitScreen);
  const closeSplit = useStore((s) => s.closeSplit);
  const splitActive = useStore((s) => s.splitActive);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const togglePinPath = useStore((s) => s.togglePinPath);
  const toggleSourcesPanel = useStore((s) => s.toggleSourcesPanel);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const openNewNote = useStore((s) => s.openNewNote);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const fontSize = settings.fontSize;
  const fontFamily = settings.fontFamily;
  const showWordCount = settings.showWordCount;
  const lineWrap = settings.lineWrap;

  const getFontFamilyStyle = (font: string) => {
    switch (font) {
      case "mono":
        return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      case "serif":
        return 'Georgia, Cambria, "Times New Roman", Times, serif';
      case "system":
      default:
        return font === "system" || !font ? "system-ui, -apple-system, sans-serif" : font;
    }
  };

  const [showOptions, setShowOptions] = useState(false);
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTOC, setShowTOC] = useState(false);
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [findCount, setFindCount] = useState(0);

  const optionsRef = useRef<HTMLDivElement | null>(null);
  const moreTabsRef = useRef<HTMLDivElement | null>(null);
  const tabContainerRef = useRef<HTMLDivElement | null>(null);
  const tocRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const editorContentRef = useRef<HTMLDivElement | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const MAX_VISIBLE_TABS = 3;
  const visibleTabs = tabs.slice(0, MAX_VISIBLE_TABS);
  const hiddenTabs = tabs.slice(MAX_VISIBLE_TABS);

  let displayTabs = visibleTabs;
  if (activeTabId && !visibleTabs.some((t) => t.id === activeTabId)) {
    const activeObj = tabs.find((t) => t.id === activeTabId);
    if (activeObj) {
      displayTabs = [visibleTabs[0], visibleTabs[1], activeObj];
    }
  }

  const handleTabWheelScroll = (e: React.WheelEvent) => {
    if (tabContainerRef.current) {
      tabContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
      if (moreTabsRef.current && !moreTabsRef.current.contains(e.target as Node)) {
        setShowMoreTabs(false);
      }
      if (tocRef.current && !tocRef.current.contains(e.target as Node)) {
        setShowTOC(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (showFindBar && findInputRef.current) {
      findInputRef.current.focus();
      findInputRef.current.select();
    }
  }, [showFindBar]);

  useEffect(() => {
    if (!findQuery || !draft) { setFindCount(0); setFindIndex(0); return; }
    const regex = new RegExp(findQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = draft.match(regex);
    setFindCount(matches ? matches.length : 0);
    setFindIndex(0);
  }, [findQuery, draft]);

  const tocHeadings = useMemo(() => {
    if (!draft) return [];
    const lines = draft.split(/\r?\n/);
    const headings: { level: number; text: string; line: number }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.+)/);
      if (m) {
        headings.push({ level: m[1].length, text: m[2].replace(/[*_`~\[\]]/g, ""), line: i });
      }
    }
    return headings;
  }, [draft]);

  const isPinned = activeTabId ? pinnedPaths.includes(activeTabId) : false;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopyAsFile = async () => {
    if (!activeTabId || !draft) { setShowOptions(false); return; }
    const blob = new Blob([draft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (activeTabId.split(/[\\/]/).pop()) || "note.md";
    a.click();
    URL.revokeObjectURL(url);
    setShowOptions(false);
  };

  const handlePrint = () => {
    window.print();
    setShowOptions(false);
  };

  const handleFontSize = (delta: number) => {
    const next = Math.min(Math.max(fontSize + delta, 10), 28);
    updateSettings({ fontSize: next });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Top Tab Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-2 select-none">
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
          <button
            onClick={() => toggleSourcesPanel()}
            title="Toggle Explorer Panel"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          <div
            ref={tabContainerRef}
            onWheel={handleTabWheelScroll}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(TAB_DRAG_MIME)) e.preventDefault();
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(TAB_DRAG_MIME);
              if (!raw) return;
              e.preventDefault();
              const { panel: fromPanel, path } = JSON.parse(raw) as { panel: "left" | "right"; path: string };
              if (fromPanel !== panel) moveTab(fromPanel, panel, path);
            }}
            className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1"
          >
            {displayTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              const isMd = tab.title.endsWith(".md") || tab.id.endsWith(".md");

              return (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify({ panel, path: tab.id }));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => selectTab(panel, tab.id)}
                  className={`group flex h-6.5 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors shrink-0 ${
                    isActive
                      ? "bg-[#252836] text-white font-medium shadow-xs"
                      : "text-muted hover:bg-card/60 hover:text-text"
                  }`}
                >
                  {isMd ? (
                    <span className="text-[9px] text-cyan-400 font-mono font-bold">M+</span>
                  ) : (
                    <svg className="w-3 h-3 stroke-current shrink-0 text-muted" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    </svg>
                  )}

                  <span className="truncate max-w-[130px] text-xs">{tab.title}</span>

                  {pinnedPaths.includes(tab.id) && <span className="text-[8px] text-amber-500">📌</span>}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(panel, tab.id);
                    }}
                    className="ml-0.5 rounded p-0.5 text-muted hover:bg-border/80 hover:text-white cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity text-[9px]"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {tabs.length > MAX_VISIBLE_TABS && (
              <div className="relative shrink-0" ref={moreTabsRef}>
                <button
                  onClick={() => setShowMoreTabs(!showMoreTabs)}
                  className="flex h-6 items-center gap-1 rounded bg-bg/80 border border-border/60 px-2 text-[11px] font-semibold text-accent hover:border-accent cursor-pointer transition-colors"
                >
                  <span>+{tabs.length - MAX_VISIBLE_TABS} more</span>
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showMoreTabs && (
                  <div className="absolute left-0 top-7 z-30 flex w-48 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">More Open Tabs</div>
                    {hiddenTabs.map((ht) => (
                      <button
                        key={ht.id}
                        onClick={() => {
                          selectTab(panel, ht.id);
                          setShowMoreTabs(false);
                        }}
                        className="flex items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                      >
                        <span className="truncate max-w-[130px]">{ht.title}</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            closeTab(panel, ht.id);
                          }}
                          className="text-muted hover:text-red-400 text-[10px]"
                        >
                          ✕
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {isLeft && (
            <button
              onClick={() => openNewNote()}
              title="New Note (Ctrl+N)"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={() => setPanelViewMode(panel, NEXT_VIEW_MODE[viewMode])}
            title={`Switch to ${NEXT_VIEW_MODE[viewMode]}`}
            className="rounded p-1 text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            {viewMode === "preview" ? (
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : viewMode === "source" ? (
              <span className="block w-3.5 text-center text-[10px] font-mono font-bold leading-none">{"</>"}</span>
            ) : (
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            )}
          </button>

          {/* Enhanced Options Menu */}
          <div className="relative" ref={optionsRef}>
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="rounded p-1 text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
              title="Pane options"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showOptions && (
              <div className="absolute right-0 top-7 z-30 flex w-52 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl max-h-[80vh] overflow-y-auto scrollbar-thin">
                {/* View Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">View</div>
                <div className="flex items-center justify-between rounded px-2.5 py-1.5 hover:bg-accent hover:text-white cursor-pointer transition-colors">
                  <span>Font Size</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleFontSize(-1)} className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-bg/60 hover:bg-accent cursor-pointer">A-</button>
                    <span className="text-[10px] font-mono w-5 text-center">{fontSize}</span>
                    <button onClick={() => handleFontSize(1)} className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-bg/60 hover:bg-accent cursor-pointer">A+</button>
                  </div>
                </div>
                <button
                  onClick={() => { updateSettings({ lineWrap: !lineWrap }); setShowOptions(false); }}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  <span>Line Wrap</span>
                  <span className={`text-[10px] font-mono ${lineWrap ? "text-accent" : "text-muted"}`}>{lineWrap ? "ON" : "OFF"}</span>
                </button>
                <button
                  onClick={() => { updateSettings({ showWordCount: !showWordCount }); setShowOptions(false); }}
                  className="flex items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  <span>Word Count</span>
                  <span className={`text-[10px] font-mono ${showWordCount ? "text-accent" : "text-muted"}`}>{showWordCount ? "ON" : "OFF"}</span>
                </button>

                <div className="h-px bg-border/60 my-0.5" />

                {/* Export Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Export</div>
                <button onClick={handleCopyAsFile} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
                  Export as File
                </button>
                <button onClick={handlePrint} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
                  Print Note
                </button>

                <div className="h-px bg-border/60 my-0.5" />

                {/* Navigate Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Navigate</div>
                <button
                  onClick={() => { setShowFindBar(true); setShowOptions(false); }}
                  className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Search in Note
                </button>
                <button
                  onClick={() => { setShowTOC(!showTOC); setShowOptions(false); }}
                  className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Table of Contents
                </button>

                <div className="h-px bg-border/60 my-0.5" />

                {/* Pane Section */}
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">Pane</div>
                {activeTabId && (
                  <button
                    onClick={() => { togglePinPath(activeTabId); setShowOptions(false); }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                  >
                    {isPinned ? "Unpin Note" : "Pin Note"}
                  </button>
                )}
                {isLeft ? (
                  <button
                    onClick={() => { splitScreen(); setShowOptions(false); }}
                    className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                  >
                    Split Screen Side-by-Side
                  </button>
                ) : (
                  <button
                    onClick={() => { closeSplit(); setShowOptions(false); }}
                    className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
                  >
                    Close Split Pane
                  </button>
                )}
                <button
                  onClick={() => { toggleAssistantPanel(); setShowOptions(false); }}
                  className="rounded px-2.5 py-1.5 text-left text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
                >
                  Toggle Assistant Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Find in Note Bar */}
      {showFindBar && (
        <div className="flex items-center gap-2 border-b border-border/30 bg-bg/40 px-3 py-1.5 shrink-0">
          <svg className="w-3.5 h-3.5 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={findInputRef}
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setShowFindBar(false); setFindQuery(""); }
            }}
            placeholder="Find in note..."
            className="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-muted"
          />
          {findQuery && (
            <span className="text-[10px] text-muted font-mono shrink-0">
              {findCount > 0 ? `${findIndex + 1}/${findCount}` : "No results"}
            </span>
          )}
          <button
            onClick={() => { setShowFindBar(false); setFindQuery(""); }}
            className="text-muted hover:text-white text-[10px] cursor-pointer"
          >
            ESC
          </button>
        </div>
      )}

      {/* Main Document Workspace */}
      <div
        ref={editorContentRef}
        onContextMenu={handleContextMenu}
        className="flex-1 overflow-y-auto w-full bg-card scrollbar-thin"
      >
        {tabs.length === 0 || !activeTabId || !activeTab ? (
          <div className="flex h-full flex-col items-center justify-center p-8 text-center select-none text-muted">
            <div className="h-10 w-10 rounded-full border border-border bg-bg/40 flex items-center justify-center mb-3">
              <span className="text-cyan-400 font-mono font-bold text-sm">M+</span>
            </div>
            <h3 className="text-xs font-semibold text-text mb-1">No document active</h3>
            <p className="text-[11px] text-muted mb-4 max-w-[240px]">
              Select a note from the file explorer or create a new study document to begin.
            </p>
            {isLeft && (
              <button
                onClick={() => openNewNote()}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors cursor-pointer"
              >
                Create New Note
              </button>
            )}
          </div>
        ) : (
          <div
            className="max-w-4xl mx-auto w-full min-h-full px-8 py-8 flex flex-col space-y-1"
            style={{ fontSize: `${fontSize}px`, fontFamily: getFontFamilyStyle(fontFamily) }}
          >
            {viewMode === "preview" ? (
              <div className="markdown-preview leading-relaxed tracking-normal">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft || "*Empty document...*"}</ReactMarkdown>
              </div>
            ) : (
              <MarkdownEditor
                key={activeTabId}
                value={draft}
                onChange={(content) => setDraftContent(panel, content)}
                livePreview={viewMode === "live"}
              />
            )}
          </div>
        )}
      </div>

      {/* Table of Contents Overlay */}
      {showTOC && tocHeadings.length > 0 && (
        <div
          ref={tocRef}
          className="absolute right-2 top-12 z-40 w-56 max-h-64 overflow-y-auto rounded-md border border-border bg-card p-2 shadow-xl scrollbar-thin"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase text-muted">Table of Contents</span>
            <button onClick={() => setShowTOC(false)} className="text-muted hover:text-white text-[10px] cursor-pointer">✕</button>
          </div>
          <div className="space-y-0.5">
            {tocHeadings.map((h, i) => (
              <div
                key={i}
                onClick={() => setShowTOC(false)}
                className="rounded px-2 py-1 text-[11px] hover:bg-accent hover:text-white cursor-pointer transition-colors truncate"
                style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
              >
                <span className="text-muted font-mono text-[9px] mr-1">H{h.level}</span>
                {h.text}
              </div>
            ))}
          </div>
        </div>
      )}

      <BacklinksPanel activeTabId={activeTabId} panel={panel} />

      {/* Editor Status Bar */}
      {activeTabId && (
        <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/20 bg-bg/20 px-3 text-[11px] text-muted select-none">
          <div className="flex items-center gap-3">
            {showWordCount && (
              <>
                <span>
                  {draft.trim() ? draft.trim().split(/\s+/).length : 0} words
                </span>
                <span>{draft.length} chars</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 font-mono">
            <span className="capitalize">{viewMode} mode</span>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <EditorContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          activeTabId={activeTabId}
          panel={panel}
          draft={draft}
        />
      )}
    </div>
  );
}
```


## `src\components\TopBar.tsx`

```typescript
import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";

export default function TopBar() {
  const sessions = useStore((s) => s.sessions);
  const activeSessionId = useStore((s) => s.activeSessionId);
  const selectSession = useStore((s) => s.selectSession);
  const createSession = useStore((s) => s.createSession);
  const closeSession = useStore((s) => s.closeSession);

  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const toggleSourcesPanel = useStore((s) => s.toggleSourcesPanel);
  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const toggleArtifactsPanel = useStore((s) => s.toggleArtifactsPanel);
  const showArtifactsPanel = useStore((s) => s.showArtifactsPanel);
  const splitActive = useStore((s) => s.splitActive);
  const splitScreen = useStore((s) => s.splitScreen);
  const closeSplit = useStore((s) => s.closeSplit);

  const setShowSettings = useStore((s) => s.setShowSettings);
  const setShowLauncherModal = useStore((s) => s.setShowLauncherModal);
  const setShowPanelLayoutModal = useStore((s) => s.setShowPanelLayoutModal);
  const userAccount = useStore((s) => s.userAccount);

  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const accountRef = useRef<HTMLDivElement | null>(null);

  // Close account menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <header className="flex h-10 w-full shrink-0 items-center justify-between border-b border-border/50 bg-[#121214] px-3 select-none text-text">
      {/* LEFT TOPBAR SETUP (Picture 1) */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-1 min-w-0 pr-2">
        {/* 1. Hamburger Menu Icon (≡) -> Opens Workspace Launcher */}
        <button
          onClick={() => setShowLauncherModal(true)}
          title="Open Start Launcher / Workspaces"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* 2. Grid with Plus Icon (㗊+) -> Opens Panel Layout Manager GUI */}
        <button
          onClick={() => setShowPanelLayoutModal(true)}
          title="Custom Panel Layout Manager GUI"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="1.8">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <line x1="17.5" y1="14" x2="17.5" y2="21" strokeWidth="2" />
            <line x1="14" y1="17.5" x2="21" y2="17.5" strokeWidth="2" />
          </svg>
        </button>

        {/* 3. Session Tabs List */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {sessions.map((sess) => {
            const isActive = sess.id === activeSessionId || sess.active;

            return (
              <div
                key={sess.id}
                onClick={() => selectSession(sess.id)}
                className={`group flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs transition-colors shrink-0 ${
                  isActive
                    ? "bg-[#33353d] text-white font-medium shadow-xs"
                    : "text-muted hover:bg-card/60 hover:text-text"
                }`}
              >
                {/* Grey square L badge icon */}
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-zinc-600/80 font-mono text-[9px] font-bold text-white">
                  L
                </div>

                <span className="truncate max-w-[150px] text-xs">{sess.title}</span>

                {/* Close ✕ button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeSession(sess.id);
                  }}
                  className="ml-0.5 rounded p-0.5 text-muted/70 hover:bg-zinc-600 hover:text-white cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity text-[9px]"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {/* Vertical Divider */}
          <div className="h-4 w-px bg-border/60 mx-1 shrink-0" />

          {/* "New session" Edit Pencil Button */}
          <button
            onClick={() => createSession()}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-xs font-medium text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span>New session</span>
          </button>

          {/* Plus Add Tab (+) Button */}
          <button
            onClick={() => createSession()}
            title="Create New Session"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* RIGHT TOPBAR SETUP (Picture 2) */}
      <div className="flex items-center gap-2.5 shrink-0 pl-2">
        {/* 1. Pane Toggle Icons Group */}
        <div className="flex items-center gap-1">
          {/* Icon 1: Grid Layout (Left + 2 Split Right) */}
          <button
            onClick={() => {
              if (!splitActive) splitScreen();
              if (!showSourcesPanel) toggleSourcesPanel();
            }}
            title="Grid Layout View"
            className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="13" y="3" width="8" height="8" rx="1" />
              <rect x="13" y="13" width="8" height="8" rx="1" />
            </svg>
          </button>

          {/* Icon 2: Left Panel Toggle */}
          <button
            onClick={toggleAssistantPanel}
            title="Toggle Left Assistant Pane"
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors cursor-pointer ${
              showAssistantPanel ? "bg-[#33353d] text-white" : "text-muted hover:bg-card hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {/* Icon 3: Artifacts Panel Toggle */}
          <button
            onClick={toggleArtifactsPanel}
            title="Toggle Artifacts Panel"
            className={`flex h-7 w-7 items-center justify-center rounded transition-colors cursor-pointer ${
              showArtifactsPanel ? "bg-[#33353d] text-white" : "text-muted hover:bg-card hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
          </button>

          {/* Icon 4: Right Panel Toggle (Highlighted Rounded Gray Box matching picture 2) */}
          <button
            onClick={() => {
              if (splitActive) closeSplit(); else splitScreen();
            }}
            title="Toggle Right Study Board Pane"
            className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors cursor-pointer ${
              splitActive
                ? "border-zinc-500 bg-[#33353d] text-white shadow-xs"
                : "border-transparent text-muted hover:bg-card hover:text-white"
            }`}
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        {/* 2. Search Icon (🔍) */}
        <button
          onClick={() => setShowSearchModal(true)}
          title="Search Workspace (Ctrl+K)"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {/* Vertical Divider */}
        <div className="h-4 w-px bg-border/60" />

        {/* 3. Browser View Icon (🌐 / Chrome Icon) */}
        <button
          onClick={() => alert("Local Study Notebook Browser Integration Active")}
          title="Open Web View"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>

        {/* 4. Settings Gear Icon (⚙️) */}
        <button
          onClick={() => setShowSettings(true)}
          title="Open Settings (800x600)"
          className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4 stroke-current animate-hover-spin" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* 5. User Account Avatar (Purple 'D' + Chevron Down ˅) */}
        <div className="relative" ref={accountRef}>
          <button
            onClick={() => setShowAccountDropdown(!showAccountDropdown)}
            className="flex items-center gap-1 rounded-full hover:opacity-90 cursor-pointer transition-opacity"
            title="User Account Options"
          >
            {/* Purple circle avatar matching picture 2 */}
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 font-bold text-xs text-white shadow-xs">
              {userAccount?.avatarLetter || "D"}
            </div>
            {/* Chevron down arrow */}
            <svg className="w-3.5 h-3.5 text-muted hover:text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {/* User Account Dropdown Menu */}
          {showAccountDropdown && (
            <div className="absolute right-0 top-8 z-50 flex w-56 flex-col rounded-md border border-border bg-card p-1.5 text-xs text-text shadow-2xl">
              <div className="flex items-center gap-2.5 border-b border-border/60 p-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 font-bold text-sm text-white">
                  {userAccount?.avatarLetter || "D"}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-white truncate">{userAccount?.name || "Developer Workspace"}</span>
                  <span className="text-[10px] text-muted truncate">{userAccount?.email || "developer@localnotebook.app"}</span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowAccountDropdown(false);
                  }}
                  className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Account Preferences
                </button>
                <button
                  onClick={() => {
                    alert("Local study workspace active.");
                    setShowAccountDropdown(false);
                  }}
                  className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Switch Workspace
                </button>
              </div>

              <div className="h-px bg-border/60 my-0.5" />

              <button
                onClick={() => {
                  alert("Local session active.");
                  setShowAccountDropdown(false);
                }}
                className="w-full rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Quick Search Modal */}
      {showSearchModal && (
        <div
          onClick={() => setShowSearchModal(false)}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-lg flex-col rounded-lg border border-border bg-card p-3 shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <svg className="w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                autoFocus
                type="text"
                placeholder="Search notes, sessions, or commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-text outline-none"
              />
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-xs text-muted hover:text-white"
              >
                ESC
              </button>
            </div>
            <div className="p-4 text-center text-xs text-muted">
              {searchQuery ? `Searching for "${searchQuery}"...` : "Type a query to search local notebook notes..."}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
```


## `src\components\WorkspaceLauncherModal.tsx`

```typescript
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../stores/useStore";

export default function WorkspaceLauncherModal() {
  const showLauncherModal = useStore((s) => s.showLauncherModal);
  const setShowLauncherModal = useStore((s) => s.setShowLauncherModal);
  const openFolder = useStore((s) => s.openFolder);
  const scaffoldWorkspaceTemplate = useStore((s) => s.scaffoldWorkspaceTemplate);
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);
  const currentFolderPath = useStore((s) => s.currentFolderPath);

  if (!showLauncherModal && currentFolderPath) return null;

  const handleOpenExistingFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        await openFolder(selected);
        setShowLauncherModal(false);
      }
    } catch (err) {
      alert("Failed to open folder: " + err);
    }
  };

  const handleCreateTemplatedWorkspace = async () => {
    try {
      const parent = await open({
        directory: true,
        multiple: false,
      });
      if (!parent || typeof parent !== "string") return;

      const folderName = prompt("Enter a name for the new study workspace folder:", "My Study Notebook");
      if (!folderName || !folderName.trim()) return;

      const targetPath = `${parent.replace(/\\/g, "/")}/${folderName.trim()}`;
      
      // Create folder via Tauri command
      await useStore.getState().createFolder(parent, folderName.trim());
      
      // Scaffold default template structure (Sources, Guides, _attachments, Welcome.md, Study_Plan.md)
      await scaffoldWorkspaceTemplate(targetPath);
      setShowLauncherModal(false);
    } catch (err) {
      alert("Failed to create templated workspace: " + err);
    }
  };

  const sortedProjects = [...projects].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-300">
      
      {/* Container matching 800x600 layout in screenshot */}
      <div className="relative flex w-[820px] h-[620px] rounded-[26px] border border-[#232323] bg-[#1C1C1C] text-text shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Optional Close button in top-right when a folder is already open */}
        {currentFolderPath && (
          <button
            onClick={() => setShowLauncherModal(false)}
            className="absolute top-5 right-5 z-10 rounded-full p-1.5 text-muted hover:bg-bg hover:text-white cursor-pointer transition-all duration-200"
            title="Close Launcher"
          >
            <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* LEFT PANEL: Existing Projects */}
        <div className="flex flex-col w-1/2 h-full p-10 border-r border-[#232323]">
          <div className="shrink-0 mb-6">
            <span className="text-[10px] uppercase font-bold tracking-widest text-muted/80 block mb-1">
              Existing
            </span>
            <h2 className="text-3xl font-semibold text-white tracking-tight">
              Projects
            </h2>
          </div>

          {/* Project List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 scrollbar-thin">
            {sortedProjects.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted">
                <svg className="w-8 h-8 text-muted/30 mb-2 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-xs font-medium text-muted/60">No recent projects</p>
                <p className="text-[10px] text-muted/40 mt-1">Use the right panel to create or open a project.</p>
              </div>
            ) : (
              sortedProjects.map((p) => (
                <div
                  key={p.id}
                  onClick={async () => {
                    await openProject(p.id);
                    setShowLauncherModal(false);
                  }}
                  className="group flex items-center gap-3.5 rounded-2xl border border-border/10 bg-card/10 p-4 cursor-pointer hover:border-accent/40 hover:bg-card/30 transition-all duration-200"
                >
                  <svg className="w-5 h-5 text-accent/60 group-hover:text-accent shrink-0 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate group-hover:text-accent transition-colors">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted truncate mt-0.5 font-mono">
                      {p.path}
                    </p>
                  </div>
                  {p.pinned && (
                    <span className="text-xs text-amber-500 shrink-0">📌</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Flux Brand & Core Action buttons */}
        <div className="flex flex-col w-1/2 h-full items-center justify-center p-12 bg-bg/10">
          
          {/* Stylized custom Flux vector logo matching mockup */}
          <div className="flex flex-col items-center mb-8">
            <svg className="w-24 h-24 text-blue-400 mb-4" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 24h12a8 8 0 0 1 8 8v0a8 8 0 0 0 8 8h12" />
              <polyline points="44 32 52 40 44 48" />
              <path d="M52 40H40a8 8 0 0 1-8-8v0a8 8 0 0 0-8-8H12" />
              <polyline points="20 32 12 24 20 16" />
              <circle cx="12" cy="40" r="2.5" fill="currentColor" stroke="none" />
            </svg>
            
            <h1 className="text-4xl font-semibold text-white tracking-tight">
              Flux
            </h1>
          </div>

          {/* Action buttons matching card pills */}
          <div className="w-full max-w-[280px] space-y-3.5">
            <button
              onClick={handleCreateTemplatedWorkspace}
              className="w-full flex items-center justify-center py-4 px-6 rounded-2xl bg-[#232323] hover:bg-[#2E2E2E] active:scale-[0.98] text-sm font-medium text-white transition-all cursor-pointer"
            >
              Create new project
            </button>
            <button
              onClick={handleOpenExistingFolder}
              className="w-full flex items-center justify-center py-4 px-6 rounded-2xl bg-[#232323] hover:bg-[#2E2E2E] active:scale-[0.98] text-sm font-medium text-white transition-all cursor-pointer"
            >
              Open existing project
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
```


## `src\components\WelcomeOnboarding.tsx`

```typescript
import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../stores/useStore";

const STEPS = ["welcome", "workspace", "ai-intro"] as const;
type Step = (typeof STEPS)[number];

export default function WelcomeOnboarding() {
  const onboardingComplete = useStore((s) => s.onboardingComplete);
  const completeOnboarding = useStore((s) => s.completeOnboarding);
  const openFolder = useStore((s) => s.openFolder);
  const scaffoldWorkspaceTemplate = useStore((s) => s.scaffoldWorkspaceTemplate);
  const projects = useStore((s) => s.projects);
  const openProject = useStore((s) => s.openProject);

  const [step, setStep] = useState<Step>("welcome");
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const finish = () => {
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      completeOnboarding();
    }, 220);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (onboardingComplete) return null;

  const handleOpenExisting = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        await openFolder(selected);
        finish();
      }
    } catch (err) {
      alert("Failed to open folder: " + err);
    }
  };

  const handleCreateTemplated = async () => {
    try {
      const parent = await open({ directory: true, multiple: false });
      if (!parent || typeof parent !== "string") return;

      const folderName = prompt("Enter a name for the new study workspace:", "My Study Notebook");
      if (!folderName || !folderName.trim()) return;

      const targetPath = `${parent.replace(/\\/g, "/")}/${folderName.trim()}`;
      await useStore.getState().createFolder(parent, folderName.trim());
      await scaffoldWorkspaceTemplate(targetPath);
      finish();
    } catch (err) {
      alert("Failed to create workspace: " + err);
    }
  };

  const handleOpenRecent = async (id: string) => {
    await openProject(id);
    finish();
  };

  const handleSkip = () => {
    finish();
  };

  const overlayClass = [
    "fixed inset-0 z-[100] flex items-center justify-center select-none transition-all duration-200 ease-out",
    mounted && !closing ? "opacity-100" : "opacity-0",
    mounted && !closing ? "backdrop-blur-sm" : "backdrop-blur-0",
  ].join(" ");

  const panelClass = [
    "flex w-full max-w-lg flex-col rounded-md border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden transition-all duration-200 ease-out",
    mounted && !closing ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2",
  ].join(" ");

  return (
    <div className={overlayClass} style={{ backgroundColor: mounted && !closing ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0)" }}>
      <div className={panelClass}>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 pt-5 pb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full transition-colors ${
                  s === step ? "bg-accent" : i < STEPS.indexOf(step) ? "bg-accent/50" : "bg-border"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === "welcome" && (
          <div className="flex flex-col items-center px-8 pt-4 pb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent/20 mb-5">
              <span className="text-3xl font-bold font-mono text-accent">L</span>
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Welcome to Local Study Notebook</h1>
            <p className="text-sm text-muted text-center leading-relaxed mb-6 max-w-sm">
              Your offline-first, local-first study workspace. Take notes, manage sources, and chat with an AI assistant — all on your machine.
            </p>

            {projects.length > 0 && (
              <div className="w-full mb-6">
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 text-center">Your Projects</h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {[...projects]
                    .sort((a, b) => {
                      if (a.pinned && !b.pinned) return -1;
                      if (!a.pinned && b.pinned) return 1;
                      return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
                    })
                    .map((proj) => (
                      <div
                        key={proj.id}
                        onClick={() => handleOpenRecent(proj.id)}
                        className="group flex items-center justify-between p-2.5 rounded border border-border/40 bg-bg/30 hover:bg-card hover:border-accent/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent/15 text-accent">
                            <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-xs font-medium text-text">{proj.name}</span>
                            <span className="block truncate text-[10px] text-muted">{proj.path.split(/[\\/]/).pop()}</span>
                          </div>
                        </div>
                        {proj.pinned && (
                          <svg className="w-3 h-3 text-accent shrink-0" viewBox="0 0 24 24" fill="currentColor" strokeWidth="0">
                            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                          </svg>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setStep("workspace")}
              className="rounded bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              {projects.length > 0 ? "Open or Create Workspace" : "Get Started"}
            </button>
            <button
              onClick={handleSkip}
              className="mt-3 text-xs text-muted hover:text-text transition-colors cursor-pointer"
            >
              {projects.length > 0 ? "Skip for now" : "Skip setup"}
            </button>
          </div>
        )}

        {/* Step 2: Workspace */}
        {step === "workspace" && (
          <div className="flex flex-col px-8 pt-4 pb-8">
            <h2 className="text-lg font-bold text-white text-center mb-1">Set up your workspace</h2>
            <p className="text-xs text-muted text-center mb-6">Choose a folder to use as your study vault.</p>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                onClick={handleCreateTemplated}
                className="group flex flex-col items-start p-4 rounded border border-accent/40 bg-accent/10 hover:bg-accent/20 hover:border-accent transition-all text-left cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <h3 className="text-xs font-bold text-white mb-1">Create Templated Project</h3>
                <p className="text-[10px] text-muted leading-relaxed">
                  Scaffolds <code className="text-cyan-400">Sources/</code>, <code className="text-cyan-400">Guides/</code>, and starter files.
                </p>
              </button>

              <button
                onClick={handleOpenExisting}
                className="group flex flex-col items-start p-4 rounded border border-border/80 bg-bg/40 hover:bg-card hover:border-text/40 transition-all text-left cursor-pointer"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded border border-border/80 bg-bg text-muted group-hover:text-white mb-2 shadow-xs group-hover:scale-105 transition-transform">
                  <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-xs font-bold text-white mb-1">Open Existing Workspace</h3>
                <p className="text-[10px] text-muted leading-relaxed">
                  Browse your local drive for an existing study folder.
                </p>
              </button>
            </div>

            {projects.length > 0 && (
              <div className="pt-3 border-t border-border/40">
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Recent Workspaces</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto scrollbar-thin pr-1">
                  {[...projects]
                    .sort((a, b) => {
                      if (a.pinned && !b.pinned) return -1;
                      if (!a.pinned && b.pinned) return 1;
                      return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
                    })
                    .map((proj) => (
                      <div
                        key={proj.id}
                        onClick={() => handleOpenRecent(proj.id)}
                        className="flex items-center justify-between p-2 rounded border border-border/40 bg-bg/20 hover:bg-card hover:border-accent/40 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className="w-3.5 h-3.5 text-accent shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          <span className="truncate text-xs font-medium text-text">{proj.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {proj.pinned && (
                            <svg className="w-3 h-3 text-accent" viewBox="0 0 24 24" fill="currentColor" strokeWidth="0">
                              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                            </svg>
                          )}
                          <span className="text-[9px] text-muted font-mono">
                            {proj.path.split(/[\\/]/).pop()}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="flex justify-between mt-5">
              <button
                onClick={() => setStep("welcome")}
                className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={() => setStep("ai-intro")}
                className="text-xs text-muted hover:text-text transition-colors cursor-pointer"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* Step 3: AI Intro */}
        {step === "ai-intro" && (
          <div className="flex flex-col items-center px-8 pt-4 pb-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent/20 mb-5">
              <svg className="w-7 h-7 stroke-accent" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Meet Your AI Assistant</h2>
            <p className="text-sm text-muted text-center leading-relaxed mb-5 max-w-sm">
              Your local study co-pilot. Ask for study tips, note summaries, or markdown help — powered by your own AI provider.
            </p>

            <div className="w-full rounded border border-border/60 bg-bg/40 p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent text-white">
                  <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-white mb-1">Where to find it</p>
                  <p className="text-[11px] text-muted leading-relaxed">
                    The AI Assistant lives in the <span className="text-accent font-medium">sparkle icon</span> on the left sidebar. Toggle it anytime to chat.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={finish}
              className="rounded bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Start Exploring
            </button>
            <button
              onClick={finish}
              className="mt-3 text-xs text-muted hover:text-text transition-colors cursor-pointer"
            >
              Set up AI later in Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```


## `src\components\SettingsModal.tsx`

```typescript
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, CONNECTOR_PRESETS } from "../stores/useStore";
import type { McpConnector, ConnectorKind } from "../types";
import { THEMES } from "../themes";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { testAIConnection } from "../services/aiProvider";
import { getProviderPreset } from "../services/providerPresets";

type SettingSection = "general" | "appearance" | "editor" | "files" | "project" | "backup" | "ai_byok" | "connectors" | "about";
type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "error";

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings);
  const setShowSettings = useStore((s) => s.setShowSettings);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const availableModels = useStore((s) => s.availableModels);
  const fetchAndSetAvailableModels = useStore((s) => s.fetchAndSetAvailableModels);

  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testConnectionStatus, setTestConnectionStatus] = useState<string | null>(null);
  const [fetchModelsStatus, setFetchModelsStatus] = useState<"idle" | "fetching" | "done" | "empty">("idle");
  const [reindexStatus, setReindexStatus] = useState<string | null>(null);
  const currentFolderPath = useStore((s) => s.currentFolderPath);


  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const googleAccount = useStore((s) => s.googleAccount);
  const backupSigningIn = useStore((s) => s.backupSigningIn);
  const connectGoogle = useStore((s) => s.connectGoogle);
  const signOutGoogle = useStore((s) => s.signOutGoogle);
  const [backupError, setBackupError] = useState<string | null>(null);

  // ── MCP Connectors ────────────────────────────────────────────
  const connectors = useStore((s) => s.settings.connectors);
  const addConnector = useStore((s) => s.addConnector);
  const updateConnector = useStore((s) => s.updateConnector);
  const removeConnector = useStore((s) => s.removeConnector);

  const [online, setOnline] = useState(() => typeof navigator !== "undefined" && navigator.onLine);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<McpConnector | null>(null);
  const [testStatus, setTestStatus] = useState<Record<string, string>>({});
  const [addMode, setAddMode] = useState<"closed" | "menu" | "custom">("closed");
  const [headersText, setHeadersText] = useState("");

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const connectorConfig = (c: McpConnector) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    command: c.command,
    args: c.args,
    cwd: c.cwd,
    url: c.url,
    headers: c.headers,
    env: c.env,
    tools: c.tools,
  });

  const handleTestConnector = async (c: McpConnector) => {
    setTestStatus((s) => ({ ...s, [c.id]: "Testing…" }));
    try {
      const health = await invoke<{ ok: boolean; tool_count: number; error: string | null }>(
        "test_connector",
        { config: connectorConfig(c) }
      );
      setTestStatus((s) => ({
        ...s,
        [c.id]: health.ok ? `✓ ${health.tool_count} tools available` : `✗ ${health.error ?? "failed"}`,
      }));
    } catch (err) {
      setTestStatus((s) => ({ ...s, [c.id]: `✗ ${String(err)}` }));
    }
  };

  const startEditor = (c: McpConnector) => {
    setDraft({ ...c });
    setHeadersText(Object.entries(c.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"));
    setExpandedId(c.id);
  };

  const startCustomAdd = () => {
    setDraft({
      id: "",
      name: "",
      kind: "stdio",
      command: "",
      args: [],
      cwd: "",
      url: "",
      headers: {},
      env: {},
      enabled: false,
      tools: [],
    });
    setHeadersText("");
    setExpandedId("__new__");
    setAddMode("closed");
  };

  const closeEditor = () => {
    setExpandedId(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return;
    if (draft.kind === "stdio" && !draft.command?.trim()) return;
    if (draft.kind === "http" && !draft.url?.trim()) return;

    let parsedHeaders: Record<string, string> = {};
    for (const line of headersText.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) parsedHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }

    const cleanedFields = {
      name,
      kind: draft.kind,
      command: draft.kind === "stdio" ? draft.command?.trim() : undefined,
      args: draft.kind === "stdio" ? draft.args?.filter((a) => a.trim()) ?? [] : undefined,
      cwd: draft.kind === "stdio" ? draft.cwd?.trim() || undefined : undefined,
      url: draft.kind === "http" ? draft.url?.trim() : undefined,
      headers: parsedHeaders,
      env: draft.env ?? {},
    };

    if (expandedId === "__new__") {
      addConnector(cleanedFields);
    } else if (expandedId) {
      updateConnector(expandedId, cleanedFields);
    }
    closeEditor();
  };

  const availablePresets = CONNECTOR_PRESETS.filter(
    (p) => !connectors.some((c) => c.name === p.name)
  );

  const handleCheckForUpdates = async () => {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await checkForUpdate();
      if (update?.available) {
        setPendingUpdate(update);
        setUpdateStatus("available");
      } else {
        setPendingUpdate(null);
        setUpdateStatus("up-to-date");
      }
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus("error");
    }
  };

  const handleTestConnection = async () => {
    setTestConnectionStatus("testing");
    const result = await testAIConnection(
      settings.aiBaseUrl || "http://localhost:11434/v1",
      settings.aiApiKey,
      settings.aiModelName
    );
    if (result.ok) {
      setTestConnectionStatus("success");
      // Auto-fetch models on a successful connection for Gemini / OpenRouter
      if (settings.aiProvider === "gemini" || settings.aiProvider === "openrouter") {
        await fetchAndSetAvailableModels();
      }
    } else {
      setTestConnectionStatus(result.message);
    }
  };

  const handleFetchModels = async () => {
    setFetchModelsStatus("fetching");
    await fetchAndSetAvailableModels();
    const models = useStore.getState().availableModels;
    setFetchModelsStatus(models.length > 0 ? "done" : "empty");
  };


  const handleInstallUpdate = async () => {
    if (!pendingUpdate) return;
    setUpdateStatus("downloading");
    setUpdateError(null);
    try {
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateError(String(err));
      setUpdateStatus("error");
    }
  };

  const handleConnectGoogle = async () => {
    setBackupError(null);
    try {
      await connectGoogle();
    } catch (err) {
      setBackupError(String(err));
    }
  };

  if (!showSettings) return null;

  const sections: { id: SettingSection; label: string }[] = [
    { id: "general", label: "General" },
    { id: "appearance", label: "Appearance" },
    { id: "editor", label: "Editor" },
    { id: "files", label: "Files & Links" },
    { id: "project", label: "Project" },
    { id: "backup", label: "Backup & Drive" },
    { id: "ai_byok", label: "AI & BYOK Model" },
    { id: "connectors", label: "Connectors & Research" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {/* Modal Container: exactly 800x600 */}
      <div className="relative flex w-[820px] h-[620px] overflow-hidden rounded-md border border-border bg-card text-text shadow-2xl animate-in fade-in zoom-in duration-200">

        {/* Close Button */}
        <button
          onClick={() => setShowSettings(false)}
          className="absolute top-4 right-4 z-10 rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer transition-colors"
          title="Close Settings"
        >
          <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Sidebar Nav */}
        <div className="w-48 shrink-0 border-r border-border bg-bg/50 p-4 pt-12 flex flex-col gap-1">
          <h2 className="px-3 mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Settings</h2>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 rounded px-3 py-2 text-left text-xs font-medium cursor-pointer transition-colors ${
                activeSection === s.id ? "bg-accent text-white" : "text-muted hover:bg-card hover:text-text"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Contents Area */}
        <div className="flex-1 overflow-y-auto p-8 pt-12">
          {activeSection === "general" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">General Settings</h3>
                <p className="text-xs text-muted">Core workspace behavior preferences.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Default Startup Folder Path</label>
                <input
                  type="text"
                  value={settings.startupFolder}
                  onChange={(e) => updateSettings({ startupFolder: e.target.value })}
                  placeholder="e.g. C:/Users/Documents/Vault"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Folder path to automatically load upon application initialization.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Confirm before deleting files</label>
                <div className="flex items-center justify-between py-1">
                  <span className="text-[10px] text-muted">Ask for confirmation before permanently deleting an entry.</span>
                  <input
                    type="checkbox"
                    checked={settings.confirmBeforeDelete}
                    onChange={(e) => updateSettings({ confirmBeforeDelete: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Appearance Settings</h3>
                <p className="text-xs text-muted">Configure themes and visual preferences. Applied live.</p>
              </div>

              {/* Dark theme preset grid */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Color Theme (Presets)</label>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((t) => {
                    const active = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => updateSettings({ theme: t.id })}
                        className={`flex items-center gap-2 rounded border p-2 text-left transition-colors cursor-pointer ${
                          active ? "border-accent bg-accent/10" : "border-border hover:border-accent/50"
                        }`}
                      >
                        {/* Mini swatch */}
                        <span className="flex h-8 w-8 shrink-0 flex-col overflow-hidden rounded border border-border"
                          style={{ background: t.colors.bg }}>
                          <span className="h-2" style={{ background: t.colors.accent }} />
                          <span className="flex-1" style={{ background: t.colors.card }} />
                          <span className="h-1.5" style={{ background: t.colors.text }} />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-xs font-medium ${active ? "text-accent" : "text-text"}`}>{t.name}</span>
                          <span className="block truncate text-[10px] text-muted">{t.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent color */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Accent Color (Optional Override)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.accentColor || "#3b82f6"}
                    onChange={(e) => updateSettings({ accentColor: e.target.value })}
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <button
                    onClick={() => updateSettings({ accentColor: "" })}
                    className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:bg-bg hover:text-white cursor-pointer"
                  >
                    Reset to theme
                  </button>
                </div>
              </div>

              {/* Font Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Editor Font Size: {settings.fontSize}px</label>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={settings.fontSize}
                  onChange={(e) => updateSettings({ fontSize: parseInt(e.target.value) })}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
              </div>

              {/* Corner Roundness */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Panel Corner Roundness</label>
                <select
                  value={settings.cornerRoundness}
                  onChange={(e) => updateSettings({ cornerRoundness: e.target.value as any })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="none">Sharp Corners (Obsidian-Style)</option>
                  <option value="sm">Small (2px)</option>
                  <option value="md">Medium (6px)</option>
                  <option value="lg">Large (12px)</option>
                </select>
              </div>

              {/* Reduce motion */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Reduce Motion</label>
                  <span className="text-[10px] text-muted">Minimize animations throughout the interface.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.reduceMotion}
                  onChange={(e) => updateSettings({ reduceMotion: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeSection === "editor" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Editor Settings</h3>
                <p className="text-xs text-muted">Customize the markdown editing environment.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Font Family</label>
                <select
                  value={settings.fontFamily}
                  onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="system">System UI</option>
                  <option value="mono">Monospace</option>
                  <option value="serif">Serif</option>
                </select>
              </div>

              {/* Line Wrap */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Editor Line Wrapping</label>
                  <span className="text-[10px] text-muted">Wrap long lines to fit page bounds.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.lineWrap}
                  onChange={(e) => updateSettings({ lineWrap: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Tab Size */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Indent Tab Size</label>
                <select
                  value={settings.tabSize}
                  onChange={(e) => updateSettings({ tabSize: parseInt(e.target.value) })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="2">2 Spaces</option>
                  <option value="4">4 Spaces</option>
                  <option value="8">8 Spaces</option>
                </select>
              </div>

              {/* Show line numbers */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Show Line Numbers</label>
                  <span className="text-[10px] text-muted">Display gutter line numbers in the editor.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showLineNumbers}
                  onChange={(e) => updateSettings({ showLineNumbers: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Auto-pair brackets */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Auto-pair Brackets</label>
                  <span className="text-[10px] text-muted">Automatically close (), [], and {} while typing.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoPairBrackets}
                  onChange={(e) => updateSettings({ autoPairBrackets: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Word count */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Show Word Count</label>
                  <span className="text-[10px] text-muted">Display character/word count in the status bar.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showWordCount}
                  onChange={(e) => updateSettings({ showWordCount: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Live Preview Timeout */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Live Preview Idle Delay: {settings.livePreviewTimeout}ms</label>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={settings.livePreviewTimeout}
                  onChange={(e) => updateSettings({ livePreviewTimeout: parseInt(e.target.value) })}
                  className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-[10px] text-muted">Time idle in edit mode before automatically formatting preview content.</span>
              </div>
            </div>
          )}

          {activeSection === "files" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Files & Links Settings</h3>
                <p className="text-xs text-muted">Control default file configurations and filter views.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Default Location for New Notes</label>
                <input
                  type="text"
                  value={settings.newNoteLocation}
                  onChange={(e) => updateSettings({ newNoteLocation: e.target.value })}
                  placeholder="e.g. /notes"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Sub-folder inside opened workspace where new notes are created.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Attachments Folder</label>
                <input
                  type="text"
                  value={settings.attachmentsFolder}
                  onChange={(e) => updateSettings({ attachmentsFolder: e.target.value })}
                  placeholder="e.g. _attachments"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Default folder for pasted/dropped attachments.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium">Exclude Folders (comma-separated)</label>
                <input
                  type="text"
                  value={settings.excludedFolders}
                  onChange={(e) => updateSettings({ excludedFolders: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent"
                />
                <span className="text-[10px] text-muted">Directories that should be hidden from explorer lists (e.g. node_modules).</span>
              </div>
            </div>
          )}

          {activeSection === "project" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Project Management</h3>
                <p className="text-xs text-muted">Control how projects and vaults behave.</p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4">
                <h4 className="text-xs font-semibold text-text mb-2">Quick Actions</h4>
                <p className="text-[10px] text-muted mb-3">
                  Use the folders icon in the left navigation bar to open the Projects dialog. There you can add a
                  folder as a project, rename, pin, or delete projects. Switching projects opens the vault instantly.
                </p>
                <p className="text-[10px] text-muted">
                  Project data (name, path, last opened) is stored locally on this device.
                </p>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium">Reopen last project on launch</label>
                  <span className="text-[10px] text-muted">Remember and reopen the most recent vault automatically.</span>
                </div>
                <input
                  type="checkbox"
                  checked={!!settings.startupFolder}
                  onChange={(e) => updateSettings({})}
                  disabled
                  className="w-4 h-4 rounded border-border bg-bg/50 cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {activeSection === "backup" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">Google Drive Backup</h3>
                <p className="text-xs text-muted">
                  Connect a Google account to back up your vault notes to your own Google Drive.
                </p>
              </div>

              {!googleAccount ? (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    disabled={backupSigningIn}
                    className="flex items-center gap-2.5 rounded border border-border bg-bg/60 px-3 py-2.5 text-xs font-medium text-white hover:bg-card cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 35.5 44 38 44 24c0-1.3-.1-2.6-.4-3.9z"/>
                    </svg>
                    {backupSigningIn ? "Waiting for Google sign-in in your browser…" : "Connect Google Drive"}
                  </button>
                  <span className="text-[10px] text-muted">
                    {backupSigningIn
                      ? "A browser window has opened. Complete the consent screen there and return here."
                      : "Sign in with Google to choose which folders to back up to your Drive."}
                  </span>
                  {backupError && <span className="text-[11px] text-red-400">Sign-in failed: {backupError}</span>}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="rounded-md border border-border bg-bg/40 p-3 flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent text-sm font-semibold text-white uppercase"
                    >
                      {googleAccount.email.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-white">{googleAccount.name}</p>
                      <p className="truncate text-[11px] text-muted">{googleAccount.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => signOutGoogle()}
                      className="ml-auto shrink-0 rounded border border-border bg-bg/60 px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-card hover:text-white cursor-pointer transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                  <span className="text-[10px] text-muted">
                    Connected. Vault selection and the "Backup now" button arrive in the next milestone.
                  </span>
                </div>
              )}
            </div>
          )}

          {activeSection === "ai_byok" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">AI & BYOK Model Server</h3>
                <p className="text-xs text-muted">
                  Bring Your Own Key (BYOK) or connect a local Hermes / Ollama server endpoint.
                </p>
              </div>

              {/* Architecture Plan Banner */}
              <div className="rounded-md border border-accent/40 bg-accent/10 p-3.5 flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-accent">BYOK & Hermes Architecture Plan</span>
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold text-accent uppercase">Architected</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Local plan document saved to <code className="text-text font-mono bg-bg/60 px-1 py-0.5 rounded">BYOK_HERMES_PLAN.md</code>. Integrates Hermes 3 function calling, local SQLite knowledge graph RAG, and multi-provider keys.
                  </p>
                </div>
              </div>

              {/* Enable AI Assistant Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-white">Enable AI Study Assistant</label>
                  <span className="text-[10px] text-muted">Toggle AI chat, note context attachments, and workspace reasoning.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnabled}
                  onChange={(e) => updateSettings({ aiEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* Provider Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">AI Model Provider</label>
                <select
                  value={settings.aiProvider}
                  onChange={(e) => {
                    const provider = e.target.value;
                    const preset = getProviderPreset(provider);
                    const defaultUrl = preset?.defaultBaseUrl ?? settings.aiBaseUrl;
                    const defaultModel = preset?.defaultModel ?? settings.aiModelName;

                    updateSettings({
                      aiProvider: provider,
                      aiBaseUrl: defaultUrl,
                      aiModelName: defaultModel,
                    });
                  }}
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent cursor-pointer"
                >
                  <option value="ollama_hermes">Local Nous Hermes / Ollama (Offline / Local Proxy)</option>
                  <option value="openrouter">OpenRouter (Online Hermes 3 / Llama 3.3 / Free Models)</option>
                  <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet / Haiku)</option>
                  <option value="gemini">Google Gemini (2.0 Flash / 1.5 Pro / Latest)</option>
                  <option value="custom">Custom OpenAI-Compatible Server (vLLM / LM Studio)</option>
                </select>
              </div>

              {/* Base URL */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Server Base URL</label>
                <input
                  type="text"
                  value={settings.aiBaseUrl}
                  onChange={(e) => updateSettings({ aiBaseUrl: e.target.value })}
                  placeholder="e.g. http://localhost:11434/v1 or https://openrouter.ai/api/v1"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent font-mono"
                />
                <span className="text-[10px] text-muted">API endpoint base URL.</span>
              </div>

              {/* Model Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">Model Identifier</label>
                <input
                  type="text"
                  value={settings.aiModelName}
                  onChange={(e) => updateSettings({ aiModelName: e.target.value })}
                  placeholder="e.g. nousresearch/hermes-3-llama-3.1-405b or hermes3:8b"
                  className="w-full rounded border border-border bg-bg/50 px-3 py-2 text-xs text-text outline-none focus:border-accent font-mono"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-muted">Presets:</span>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "nousresearch/hermes-3-llama-3.1-405b" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-accent hover:border-accent font-mono cursor-pointer"
                  >
                    hermes-3-405b (OpenRouter)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "google/gemini-2.0-flash-exp:free" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-emerald-400 hover:border-emerald-400 font-mono cursor-pointer"
                  >
                    gemini-2.0-flash:free
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "gemini-2.0-flash" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-sky-400 hover:border-sky-400 font-mono cursor-pointer"
                  >
                    gemini-2.0-flash (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "gemini-1.5-pro" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-sky-400 hover:border-sky-400 font-mono cursor-pointer"
                  >
                    gemini-1.5-pro (Direct)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSettings({ aiModelName: "hermes3:8b" })}
                    className="rounded border border-border/60 bg-bg/40 px-1.5 py-0.5 text-[10px] text-muted hover:text-white font-mono cursor-pointer"
                  >
                    hermes3:8b (Local Ollama)
                  </button>
                </div>
                {/* Dynamic model pills — populated after "Fetch Models" or Test Connection */}
                {availableModels.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1">
                    <span className="text-[10px] text-muted">Live models from your API key:</span>
                    <div className="flex flex-wrap gap-1">
                      {availableModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateSettings({ aiModelName: m })}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono cursor-pointer transition-colors ${
                            settings.aiModelName === m
                              ? "border-accent bg-accent/20 text-white"
                              : "border-border/60 bg-bg/40 text-muted hover:border-accent hover:text-white"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {availableModels.length > 0 &&
                  !!settings.aiModelName &&
                  !availableModels.includes(settings.aiModelName) && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                      ⚠️ "{settings.aiModelName}" was not found in the live model list for this API key. It may have
                      been deprecated or renamed. Pick one from the list above, or click "Fetch Available Models"
                      again.
                    </div>
                  )}

              </div>

              {/* API Key */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">API Key (BYOK)</label>
                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={settings.aiApiKey}
                    onChange={(e) => updateSettings({ aiApiKey: e.target.value })}
                    placeholder={settings.aiProvider === "ollama_hermes" ? "Not required for local Ollama" : "sk-..."}
                    className="w-full rounded border border-border bg-bg/50 px-3 py-2 pr-16 text-xs text-text outline-none focus:border-accent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 text-[10px] text-muted hover:text-white px-1.5 py-0.5 rounded bg-bg/80 cursor-pointer"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {/* Test Connection + Fetch Models Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                >
                  Test Connection
                </button>
                {(settings.aiProvider === "gemini" || settings.aiProvider === "openrouter") && (
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={fetchModelsStatus === "fetching"}
                    className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-card hover:text-sky-300 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {fetchModelsStatus === "fetching" ? "Fetching..." : "↻ Fetch Available Models"}
                  </button>
                )}
                {fetchModelsStatus === "done" && (
                  <span className="text-xs text-sky-400">{availableModels.length} models loaded ✓</span>
                )}
                {fetchModelsStatus === "empty" && (
                  <span className="text-xs text-amber-400">No models returned. Check your API key and Base URL.</span>
                )}
                {testConnectionStatus && (
                  <span className={`text-xs ${testConnectionStatus === "success" ? "text-emerald-400" : "text-accent"}`}>
                    {testConnectionStatus === "testing" ? "Testing connection..." : testConnectionStatus === "success" ? "Connection Successful!" : testConnectionStatus}
                  </span>
                )}
              </div>

              {/* Enable Hermes Tool Calling & RAG Toggle */}
              <div className="flex items-center justify-between py-2 border-b border-border/40">
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-white">Workspace Tool Calling & RAG</label>
                  <span className="text-[10px] text-muted">Allow Hermes to query vault index (FTS5 search, backlinks graph) via function tools.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.aiEnableWorkspaceTools}
                  onChange={(e) => updateSettings({ aiEnableWorkspaceTools: e.target.checked })}
                  className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                />
              </div>

              {/* System Prompt Override */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text">System Instructions</label>
                <textarea
                  rows={3}
                  value={settings.aiSystemPrompt}
                  onChange={(e) => updateSettings({ aiSystemPrompt: e.target.value })}
                  className="w-full rounded border border-border bg-bg/50 p-2.5 text-xs text-text outline-none focus:border-accent resize-none leading-relaxed"
                />
              </div>

              {/* ─── Memory-RAG (Agent Knowledge) ─────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🧠 Memory-RAG (Agent Knowledge)</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Semantic memory + retrieval over your vault. Embeddings run against a local Ollama server; when it is offline, tools fall back to keyword search.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Embedding Base URL</label>
                    <input
                      type="text"
                      value={settings.embedBaseUrl}
                      onChange={(e) => updateSettings({ embedBaseUrl: e.target.value })}
                      placeholder="http://localhost:11434"
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">Embedding Model</label>
                    <input
                      type="text"
                      value={settings.embedModel}
                      onChange={(e) => updateSettings({ embedModel: e.target.value })}
                      placeholder="nomic-embed-text"
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-text">RAG Top-K</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={settings.ragTopK}
                      onChange={(e) => updateSettings({ ragTopK: parseInt(e.target.value) || 5 })}
                      className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!currentFolderPath) {
                          setReindexStatus("Open a vault first.");
                          return;
                        }
                        setReindexStatus("Embedding chunks...");
                        try {
                          const { rebuildEmbeddings } = await import("../services/agentKnowledge");
                          const n = await rebuildEmbeddings(currentFolderPath, settings);
                          setReindexStatus(n === 0 ? "Embeddings up to date" : `Embedded ${n} chunks`);
                        } catch (err) {
                          setReindexStatus(`Failed: ${String(err)}`);
                        }
                      }}
                      className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-card hover:text-sky-300 cursor-pointer transition-colors"
                    >
                      ↻ Re-index Embeddings
                    </button>
                    {reindexStatus && (
                      <span className="text-[10px] text-muted">{reindexStatus}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-save conversation memory</label>
                    <span className="text-[10px] text-muted">Persist Q&A turns so future sessions recall them.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.memoryAutoSave !== false}
                    onChange={(e) => updateSettings({ memoryAutoSave: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>

                {/* File-write tools gate */}
                <div className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Allow AI file writes</label>
                    <span className="text-[10px] text-muted">
                      Lets the AI create, edit, rename and delete notes (destructive actions still need your approval). Off by default.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.aiEnableFileWrite === true}
                    onChange={(e) => updateSettings({ aiEnableFileWrite: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>

              {/* ─── OpenCode Agent ──────────────────────────────── */}
              <div className="pt-4 border-t border-border/40 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">🤖 OpenCode Agent</h4>
                  <p className="text-[10px] text-muted mt-0.5">
                    Settings for the OpenCode Agent tab. BYOK keys are injected from above at launch — no separate key configuration needed.
                  </p>
                </div>

                {/* Install status */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-text">OpenCode Status</label>
                    <span className="text-[10px] text-muted">
                      {(() => {
                        // Detect platform for the correct install command
                        const isWin = navigator.userAgent.toLowerCase().includes("windows");
                        return isWin ? "Install: winget install SST.opencode" : "Install: curl -fsSL https://opencode.ai/install | bash";
                      })()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-medium ${settings.opencodePort > 0 ? "text-muted" : "text-red-400"}`}>
                      port {settings.opencodePort}
                    </span>
                  </div>
                </div>

                {/* Server port */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-text">Server Port</label>
                  <input
                    type="number"
                    min={1024}
                    max={65535}
                    value={settings.opencodePort}
                    onChange={(e) => updateSettings({ opencodePort: parseInt(e.target.value) || 4096 })}
                    className="w-full rounded border border-border bg-bg/50 p-2 text-xs text-text outline-none focus:border-accent"
                  />
                  <span className="text-[10px] text-muted">
                    OpenCode's default is 4096. Change only if that port conflicts with another service.
                  </span>
                </div>

                {/* Auto-start toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="flex flex-col">
                    <label className="text-xs font-medium text-white">Auto-start on Agent Tab Switch</label>
                    <span className="text-[10px] text-muted">Automatically start opencode serve when you switch to the Agent tab.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.opencodeAutoStart}
                    onChange={(e) => updateSettings({ opencodeAutoStart: e.target.checked })}
                    className="w-4 h-4 rounded border-border bg-bg/50 text-accent focus:ring-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "connectors" && (
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-semibold text-white">Connectors & Research</h3>
                <p className="text-xs text-muted">
                  MCP servers expose tools to the AI assistant. Offline-first: every connector is opt-in and stays off until you enable it.
                </p>
              </div>

              {/* Online state */}
              <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${online ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-400" : "bg-amber-400"}`} />
                {online ? "Online — web connectors (🔌) are available." : "Offline — web connectors will be skipped until you reconnect."}
              </div>

              {/* Add Connector */}
              <div className="relative">
                <button
                  onClick={() => setAddMode(addMode === "menu" ? "closed" : "menu")}
                  className="rounded border border-border bg-bg/60 px-3 py-1.5 text-xs font-medium text-text hover:bg-card hover:text-white cursor-pointer transition-colors"
                >
                  {addMode === "menu" ? "Close" : "+ Add Connector"}
                </button>

                {addMode === "menu" && (
                  <div className="absolute left-0 top-9 z-30 w-64 rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    {availablePresets.length > 0 && (
                      <>
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">From preset</div>
                        {availablePresets.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              addConnector({
                                name: p.name,
                                kind: p.kind,
                                command: p.command,
                                args: p.args,
                                cwd: p.cwd,
                                url: p.url,
                                headers: p.headers,
                                env: p.env,
                              });
                              setAddMode("closed");
                            }}
                            className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                          >
                            <span>{p.name}</span>
                            <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${p.kind === "http" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>
                              {p.kind}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                    <div className="h-px bg-border/60 my-0.5" />
                    <button
                      onClick={startCustomAdd}
                      className="w-full rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                    >
                      Custom connector…
                    </button>
                  </div>
                )}
              </div>

              {/* Registry list */}
              <div className="space-y-2">
                {connectors.length === 0 && (
                  <div className="rounded-md border border-dashed border-border bg-bg/30 px-4 py-6 text-center text-[11px] text-muted">
                    No connectors registered. Add one above, or rerun to restore the built-in presets.
                  </div>
                )}

                {connectors.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const status = testStatus[c.id];
                  return (
                    <div key={c.id} className="rounded-md border border-border bg-bg/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.enabled ? "bg-emerald-400" : "bg-border"}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-medium text-text">{c.name}</span>
                              <span className={`rounded px-1.5 py-px text-[9px] font-semibold uppercase ${c.kind === "http" ? "bg-sky-500/15 text-sky-400" : "bg-violet-500/15 text-violet-400"}`}>{c.kind}</span>
                              {c.kind === "http" && <span className="rounded px-1.5 py-px text-[9px] uppercase text-muted bg-border/40">🔌 web</span>}
                            </div>
                            <div className="truncate text-[10px] text-muted">
                              {c.kind === "stdio" ? `${c.command ?? ""} ${(c.args ?? []).join(" ")}`.trim() : c.url}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={c.enabled}
                            onChange={(e) => updateConnector(c.id, { enabled: e.target.checked })}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-border bg-bg/50 text-accent focus:ring-accent"
                            title={c.enabled ? "Disable connector" : "Enable connector"}
                          />
                          <button
                            onClick={() => handleTestConnector(c)}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
                          >
                            Test
                          </button>
                          <button
                            onClick={() => (isExpanded ? closeEditor() : startEditor(c))}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-muted hover:text-white transition-colors"
                          >
                            {isExpanded ? "Close" : "Configure"}
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm(`Remove connector "${c.name}"?`)) removeConnector(c.id);
                            }}
                            className="cursor-pointer rounded border border-border/60 px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            title="Remove connector"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {status && (
                        <p className={`mt-1.5 text-[10px] ${status.startsWith("✓") ? "text-emerald-400" : status.startsWith("✗") ? "text-red-400" : "text-muted"}`}>
                          {status}
                        </p>
                      )}

                      {isExpanded && draft && (
                        <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Connector name"
                            className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                          />
                          <select
                            value={draft.kind}
                            onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConnectorKind })}
                            className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                          >
                            <option value="stdio">stdio (local binary)</option>
                            <option value="http">http (remote streamable-http)</option>
                          </select>

                          {draft.kind === "stdio" ? (
                            <>
                              <input
                                type="text"
                                value={draft.command ?? ""}
                                onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                                placeholder="e.g. npx, python -m, or a binary path"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <input
                                type="text"
                                value={draft.args?.join(", ") ?? ""}
                                onChange={(e) =>
                                  setDraft({
                                    ...draft,
                                    args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                  })
                                }
                                placeholder="Arguments, comma-separated — e.g. -y, @modelcontextprotocol/server-filesystem, /vault"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <input
                                type="text"
                                value={draft.cwd ?? ""}
                                onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                                placeholder="Working directory (optional)"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                value={draft.url ?? ""}
                                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                                placeholder="https://mcp.example.com/sse"
                                className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                              />
                              <textarea
                                rows={3}
                                value={headersText}
                                onChange={(e) => setHeadersText(e.target.value)}
                                placeholder={'Headers (one per line), e.g.\nauthorization: Bearer sk-...'}
                                className="w-full resize-none rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono leading-relaxed"
                              />
                            </>
                          )}

                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={closeEditor}
                              className="cursor-pointer rounded border border-border/60 px-2.5 py-1 text-[10px] text-muted hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={saveDraft}
                              className="cursor-pointer rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Editor for a brand-new custom connector (no row yet) */}
              {expandedId === "__new__" && draft && (
                <div className="space-y-2 border-t border-border/40 pt-3">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="Connector name"
                    className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                  />
                  <select
                    value={draft.kind}
                    onChange={(e) => setDraft({ ...draft, kind: e.target.value as ConnectorKind })}
                    className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="stdio">stdio (local binary)</option>
                    <option value="http">http (remote streamable-http)</option>
                  </select>

                  {draft.kind === "stdio" ? (
                    <>
                      <input
                        type="text"
                        value={draft.command ?? ""}
                        onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                        placeholder="e.g. npx, python -m, or a binary path"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={draft.args?.join(", ") ?? ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            args: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                          })
                        }
                        placeholder="Arguments, comma-separated — e.g. -y, @modelcontextprotocol/server-filesystem"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <input
                        type="text"
                        value={draft.cwd ?? ""}
                        onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                        placeholder="Working directory (optional)"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={draft.url ?? ""}
                        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                        placeholder="https://mcp.example.com/sse"
                        className="w-full rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono"
                      />
                      <textarea
                        rows={3}
                        value={headersText}
                        onChange={(e) => setHeadersText(e.target.value)}
                        placeholder={"Headers (one per line), e.g.\nauthorization: Bearer sk-..."}
                        className="w-full resize-none rounded border border-border bg-bg/50 px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent font-mono leading-relaxed"
                      />
                    </>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={closeEditor}
                      className="cursor-pointer rounded border border-border/60 px-2.5 py-1 text-[10px] text-muted hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDraft}
                      className="cursor-pointer rounded bg-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-accent-hover transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white">About</h3>
                <p className="text-xs text-muted">Local Study Notebook.</p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4 space-y-1.5 text-xs">
                <p><span className="text-muted">Name:</span> <span className="text-text">Local Study Notebook</span></p>
                <p><span className="text-muted">Version:</span> <span className="text-text">1.4.0</span></p>
                <p><span className="text-muted">Framework:</span> <span className="text-text">Tauri v2 · React · TypeScript</span></p>
                <p><span className="text-muted">Data:</span> <span className="text-text">Stored locally in the app data directory.</span></p>
              </div>

              <div className="rounded-md border border-border bg-bg/40 p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">Software Updates</span>
                  {updateStatus !== "available" && (
                    <button
                      onClick={handleCheckForUpdates}
                      disabled={updateStatus === "checking"}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
                    >
                      {updateStatus === "checking" ? "Checking…" : "Check for Updates"}
                    </button>
                  )}
                </div>

                {updateStatus === "up-to-date" && (
                  <p className="text-muted">You're on the latest version.</p>
                )}

                {updateStatus === "available" && pendingUpdate && (
                  <div className="space-y-2">
                    <p className="text-text">
                      Version <span className="font-semibold text-accent">{pendingUpdate.version}</span> is available.
                    </p>
                    {pendingUpdate.body && (
                      <p className="text-muted whitespace-pre-line max-h-20 overflow-y-auto">{pendingUpdate.body}</p>
                    )}
                    <button
                      onClick={handleInstallUpdate}
                      disabled={updateStatus !== "available"}
                      className="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:bg-accent-hover cursor-pointer transition-colors"
                    >
                      Download &amp; Restart to Install
                    </button>
                  </div>
                )}

                {updateStatus === "downloading" && (
                  <p className="text-muted">Downloading update, the app will restart automatically…</p>
                )}

                {updateStatus === "error" && (
                  <p className="text-red-400">Update check failed: {updateError}</p>
                )}
              </div>

              <p className="text-[10px] text-muted">
                An Obsidian-style local-first study notebook with sources, notes, and project vaults.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```


## `src\components\ProjectsModal.tsx`

```typescript
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useStore } from "../stores/useStore";

export default function ProjectsModal() {
  const showProjectsPanel = useStore((s) => s.showProjectsPanel);
  const setShowProjectsPanel = useStore((s) => s.setShowProjectsPanel);
  const projects = useStore((s) => s.projects);
  const addProject = useStore((s) => s.addProject);
  const renameProject = useStore((s) => s.renameProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const toggleProjectPinned = useStore((s) => s.toggleProjectPinned);
  const openProject = useStore((s) => s.openProject);
  const currentFolderPath = useStore((s) => s.currentFolderPath);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  if (!showProjectsPanel) return null;

  const createProjectFromFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        const name =
          prompt("Project name:")?.trim() ||
          selected.split(/[\\/]/).pop() ||
          "Project";
        const id = `proj-${Date.now()}`;
        addProject(id, name, selected);
      }
    } catch (err) {
      alert("Failed to add project: " + err);
    }
  };

  const addCurrentFolderAsProject = async () => {
    if (!currentFolderPath) return;
    const existing = projects.find((p) => p.path === currentFolderPath);
    if (existing) {
      openProject(existing.id);
      return;
    }
    const name = currentFolderPath.split(/[\\/]/).pop() || "Project";
    const id = `proj-${Date.now()}`;
    addProject(id, name, currentFolderPath);
  };

  const handleRename = (id: string) => {
    const p = projects.find((x) => x.id === id);
    setRenamingId(id);
    setRenameVal(p?.name ?? "");
  };

  const confirmRename = () => {
    if (renamingId && renameVal.trim()) {
      renameProject(renamingId, renameVal.trim());
    }
    setRenamingId(null);
  };

  const sorted = [...projects].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.lastOpened).getTime() - new Date(a.lastOpened).getTime();
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex w-[640px] h-[520px] overflow-hidden rounded-md border border-border bg-card text-text shadow-2xl animate-in fade-in zoom-in duration-200">
        <button
          onClick={() => setShowProjectsPanel(false)}
          className="absolute top-4 right-4 z-10 rounded p-1 text-muted hover:bg-bg hover:text-text cursor-pointer transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex w-full flex-col">
          <div className="shrink-0 border-b border-border p-5">
            <h2 className="text-base font-semibold text-white">Projects</h2>
            <p className="text-xs text-muted">Manage multiple study vaults as named projects.</p>
          </div>

          <div className="flex shrink-0 gap-2 p-4 border-b border-border/40">
            <button
              onClick={createProjectFromFolder}
              className="flex-1 rounded bg-accent py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
            >
              + New Project (Folder)
            </button>
            <button
              onClick={addCurrentFolderAsProject}
              disabled={!currentFolderPath}
              className="flex-1 rounded border border-border py-2 text-xs font-medium text-muted hover:bg-bg hover:text-white transition-colors cursor-pointer disabled:opacity-40"
            >
              Use Current Folder
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {sorted.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted">
                No projects yet. Add a project to switch between vaults quickly.
              </p>
            ) : (
              sorted.map((p) => (
                <div
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className="group flex items-center gap-3 rounded-md border border-border bg-bg/50 p-3 cursor-pointer hover:border-accent/50 transition-colors"
                >
                  <svg className="w-5 h-5 stroke-current shrink-0 text-muted" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>

                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                      onBlur={confirmRename}
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1 text-sm text-text outline-none"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{p.name}</p>
                      <p className="truncate text-[10px] text-muted">{p.path}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      title={p.pinned ? "Unpin" : "Pin"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProjectPinned(p.id);
                      }}
                      className={`rounded p-1 hover:bg-border cursor-pointer ${p.pinned ? "text-amber-500 opacity-100" : "text-muted hover:text-white"}`}
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5M5 12h14M19 12l-4-4V3H9v5L5 12z" />
                      </svg>
                    </button>
                    <button
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRename(p.id);
                      }}
                      className="rounded p-1 text-muted hover:bg-border hover:text-white cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        const name = p.name;
                        if (confirm(`Delete project "${name}"? This removes it from the list (files on disk are kept).`)) {
                          deleteProject(p.id);
                        }
                      }}
                      className="rounded p-1 text-muted hover:bg-border hover:text-red-400 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```


## `src\components\PanelLayoutModal.tsx`

```typescript
import { useStore } from "../stores/useStore";

export default function PanelLayoutModal() {
  const showPanelLayoutModal = useStore((s) => s.showPanelLayoutModal);
  const setShowPanelLayoutModal = useStore((s) => s.setShowPanelLayoutModal);

  const panelPreset = useStore((s) => s.panelPreset);
  const applyPanelPreset = useStore((s) => s.applyPanelPreset);

  const showAssistantPanel = useStore((s) => s.showAssistantPanel);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const assistantWidth = useStore((s) => s.assistantWidth);
  const setAssistantWidth = useStore((s) => s.setAssistantWidth);

  const showSourcesPanel = useStore((s) => s.showSourcesPanel);
  const toggleSourcesPanel = useStore((s) => s.toggleSourcesPanel);
  const sourcePanelWidth = useStore((s) => s.sourcePanelWidth);
  const setSourcePanelWidth = useStore((s) => s.setSourcePanelWidth);

  const showArtifactsPanel = useStore((s) => s.showArtifactsPanel);
  const toggleArtifactsPanel = useStore((s) => s.toggleArtifactsPanel);
  const artifactsWidth = useStore((s) => s.artifactsWidth);
  const setArtifactsWidth = useStore((s) => s.setArtifactsWidth);

  const showAgentPanel = useStore((s) => s.showAgentPanel);
  const toggleAgentPanel = useStore((s) => s.toggleAgentPanel);
  const agentWidth = useStore((s) => s.agentWidth);
  const setAgentWidth = useStore((s) => s.setAgentWidth);

  const splitActive = useStore((s) => s.splitActive);
  const splitScreen = useStore((s) => s.splitScreen);
  const closeSplit = useStore((s) => s.closeSplit);

  const customLayouts = useStore((s) => s.customLayouts);
  const saveCustomLayout = useStore((s) => s.saveCustomLayout);
  const applyCustomLayout = useStore((s) => s.applyCustomLayout);
  const deleteCustomLayout = useStore((s) => s.deleteCustomLayout);

  if (!showPanelLayoutModal) return null;

  const presets = [
    {
      id: "default",
      title: "Default 3-Pane",
      desc: "Assistant + Explorer + Study Board",
      icon: "📐",
    },
    {
      id: "focus",
      title: "Focus Document",
      desc: "Full-width distraction-free notebook",
      icon: "📖",
    },
    {
      id: "assistant",
      title: "Assistant & Notes",
      desc: "AI Co-pilot + Study Board side-by-side",
      icon: "✨",
    },
    {
      id: "explorer",
      title: "Explorer & Notes",
      desc: "Local File Explorer + Study Board",
      icon: "📁",
    },
  ] as const;

  const handleSaveCustomLayout = () => {
    const name = prompt("Name this layout:");
    if (!name || !name.trim()) return;
    saveCustomLayout(name.trim());
    setShowPanelLayoutModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="flex w-full max-w-lg flex-col rounded-xl border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4 bg-bg/40">
          <div>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Panel Layout Manager</h2>
            <p className="text-[11px] text-muted">Arrange custom workspace panels or apply presets</p>
          </div>

          <button
            onClick={() => setShowPanelLayoutModal(false)}
            className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Preset Selection */}
          <div>
            <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-2">
              Layout Presets
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {presets.map((p) => {
                const isActive = panelPreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => applyPanelPreset(p.id)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      isActive
                        ? "border-accent bg-accent/15 text-white shadow-xs"
                        : "border-border/70 bg-bg/40 text-muted hover:border-text/40 hover:text-white"
                    }`}
                  >
                    <span className="text-base">{p.icon}</span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-white">{p.title}</span>
                      <span className="text-[10px] text-muted truncate">{p.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Saved Custom Layouts */}
          {customLayouts.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block mb-2">
                Custom Layouts
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {customLayouts.map((layout) => {
                  const isActive = panelPreset === "custom";
                  return (
                    <div
                      key={layout.id}
                      onClick={() => applyCustomLayout(layout.id)}
                      className={`group flex items-start justify-between gap-2 p-3 rounded-lg border text-left cursor-pointer transition-all ${
                        isActive
                          ? "border-accent bg-accent/15 text-white shadow-xs"
                          : "border-border/70 bg-bg/40 text-muted hover:border-text/40 hover:text-white"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-base">💾</span>
                        <span className="text-xs font-bold text-white truncate">{layout.name}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete layout "${layout.name}"?`)) deleteCustomLayout(layout.id);
                        }}
                        className="shrink-0 rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 cursor-pointer transition-all"
                        title="Delete layout"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Custom Fine-Tuning */}
          <div className="space-y-3 border-t border-border/40 pt-4">
            <label className="text-[11px] font-semibold text-muted uppercase tracking-wider block">
              Custom Panel Customizer
            </label>

            {/* Assistant Panel Toggle & Width */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showAssistantPanel}
                  onChange={toggleAssistantPanel}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">AI Assistant Panel</span>
              </div>
              {showAssistantPanel && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted font-mono">{assistantWidth}px</span>
                  <input
                    type="range"
                    min={260}
                    max={550}
                    step={10}
                    value={assistantWidth}
                    onChange={(e) => setAssistantWidth(Number(e.target.value))}
                    className="w-24 accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* File Explorer Toggle & Width */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showSourcesPanel}
                  onChange={toggleSourcesPanel}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">Explorer Panel</span>
              </div>
              {showSourcesPanel && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted font-mono">{sourcePanelWidth}px</span>
                  <input
                    type="range"
                    min={180}
                    max={400}
                    step={10}
                    value={sourcePanelWidth}
                    onChange={(e) => setSourcePanelWidth(Number(e.target.value))}
                    className="w-24 accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Split Screen Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={splitActive}
                  onChange={() => {
                    if (splitActive) closeSplit(); else splitScreen();
                  }}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">Split-Screen Note Editor</span>
              </div>
              <span className="text-[10px] text-muted font-mono">
                {splitActive ? "Side-by-side" : "Single pane"}
              </span>
            </div>

            {/* Artifacts Panel Toggle & Width */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showArtifactsPanel}
                  onChange={toggleArtifactsPanel}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">Artifacts Panel</span>
              </div>
              {showArtifactsPanel && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted font-mono">{artifactsWidth}px</span>
                  <input
                    type="range"
                    min={260}
                    max={600}
                    step={10}
                    value={artifactsWidth}
                    onChange={(e) => setArtifactsWidth(Number(e.target.value))}
                    className="w-24 accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Agent Panel Toggle & Width */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-bg/20">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showAgentPanel}
                  onChange={toggleAgentPanel}
                  className="rounded accent-accent cursor-pointer"
                />
                <span className="text-xs font-medium text-text">Agent Panel</span>
              </div>
              {showAgentPanel && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted font-mono">{agentWidth}px</span>
                  <input
                    type="range"
                    min={260}
                    max={600}
                    step={10}
                    value={agentWidth}
                    onChange={(e) => setAgentWidth(Number(e.target.value))}
                    className="w-24 accent-accent cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/60 px-5 py-3 bg-bg/40 gap-2">
          <button
            onClick={() => setShowPanelLayoutModal(false)}
            className="rounded px-3 py-1.5 text-xs text-muted hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveCustomLayout}
            className="rounded bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer shadow-xs"
          >
            Save Layout Use Case
          </button>
        </div>
      </div>
    </div>
  );
}
```


## `src\components\AssistantPanel.tsx`

```typescript
import { useState, useRef, useEffect } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import OpenCodeView from "./OpenCodeView";
import { PROVIDER_PRESETS, getProviderPreset } from "../services/providerPresets";

export default function AssistantPanel() {
  const assistantMessages = useStore((s) => s.assistantMessages);
  const sendAssistantMessage = useStore((s) => s.sendAssistantMessage);
  const cancelAssistantMessage = useStore((s) => s.cancelAssistantMessage);
  const clearAssistantMessages = useStore((s) => s.clearAssistantMessages);
  const isAssistantStreaming = useStore((s) => s.isAssistantStreaming);
  const assistantStatusText = useStore((s) => s.assistantStatusText);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const assistantTopicTitle = useStore((s) => s.assistantTopicTitle);
  const setAssistantTopicTitle = useStore((s) => s.setAssistantTopicTitle);
  const toggleAssistantPanel = useStore((s) => s.toggleAssistantPanel);
  const assistantMode = useStore((s) => s.assistantMode);
  const setAssistantMode = useStore((s) => s.setAssistantMode);
  const checkOpencodeInstalled = useStore((s) => s.checkOpencodeInstalled);
  const startOpencodeServer = useStore((s) => s.startOpencodeServer);
  const stopOpencodeServer = useStore((s) => s.stopOpencodeServer);
  const opencodeServerPid = useStore((s) => s.opencodeServerPid);
  const pendingToolApprovals = useStore((s) => s.pendingToolApprovals);
  const resolveToolApproval = useStore((s) => s.resolveToolApproval);
  const clearToolApproval = useStore((s) => s.clearToolApproval);

  const [inputVal, setInputVal] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(assistantTopicTitle);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);

  const modelsList = [
    ...PROVIDER_PRESETS.map((p) => ({ id: p.id, model: p.defaultModel, name: p.name, icon: p.icon, desc: p.desc })),
    { id: "custom", model: settings.aiModelName || "custom-model", name: "Custom Endpoint", icon: "⚙️", desc: "vLLM / LM Studio / Local Proxy" },
  ];

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantMessages]);

  // Outside click handlers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target as Node)) {
        setShowOptionsMenu(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleSend = () => {
    if (!inputVal.trim()) return;
    sendAssistantMessage(inputVal);
    setInputVal("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTitleSubmit = () => {
    if (titleDraft.trim()) {
      setAssistantTopicTitle(titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  const handleAttachContext = (contextType: string) => {
    if (contextType === "active_file") {
      const activeFile = useStore.getState().activeLeftTabId || useStore.getState().activeRightTabId;
      if (activeFile) {
        const name = activeFile.split(/[\\/]/).pop();
        setInputVal((prev) => prev + ` @[${name}] `);
      }
    } else if (contextType === "folder") {
      const folder = useStore.getState().currentFolderPath;
      if (folder) {
        const name = folder.split(/[\\/]/).pop();
        setInputVal((prev) => prev + ` @folder/${name} `);
      }
    }
    setShowAttachMenu(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded border border-border bg-card">
      {/* Top Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-3.5 py-2.5 bg-bg/20">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Mode Toggle Tabs */}
          <div className="flex items-center rounded-md border border-border/60 bg-bg/40 p-0.5 shrink-0">
            <button
              onClick={() => {
                setAssistantMode("study");
                if (opencodeServerPid !== null) stopOpencodeServer();
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                assistantMode === "study"
                  ? "bg-accent text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              💬 Study
            </button>
            <button
              onClick={() => {
                setAssistantMode("opencode");
                checkOpencodeInstalled();
                if (opencodeServerPid === null) startOpencodeServer();
              }}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                assistantMode === "opencode"
                  ? "bg-accent text-white"
                  : "text-muted hover:text-white"
              }`}
            >
              🤖 Agent
            </button>
          </div>

          {assistantMode === "study" && (
            <>
              {isEditingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTitleSubmit()}
                  onBlur={handleTitleSubmit}
                  className="min-w-0 flex-1 rounded border border-border bg-bg/80 px-2 py-0.5 text-xs text-white outline-none"
                />
              ) : (
                <h2
                  onDoubleClick={() => {
                    setTitleDraft(assistantTopicTitle);
                    setIsEditingTitle(true);
                  }}
                  title="Double click to rename topic"
                  className="truncate text-xs font-semibold text-text select-none cursor-pointer hover:text-white"
                >
                  {assistantTopicTitle}
                </h2>
              )}
            </>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Online indicator circle */}
          <div className="h-2 w-2 rounded-full border border-emerald-400/30 bg-emerald-500/80 shadow-xs" title="Assistant Active" />

          {/* Memory-RAG status dot (M6 UX) */}
          <div
            className={`h-2 w-2 rounded-full border shadow-xs ${
              settings.aiEnabled
                ? "border-sky-400/30 bg-sky-500/80"
                : "border-border bg-border/40"
            }`}
            title={
              settings.aiEnabled
                ? `Memory-RAG on · ${settings.embedModel || "nomic-embed-text"} @ ${settings.embedBaseUrl || "localhost:11434"}`
                : "AI disabled — Memory-RAG off"
            }
          />

          {/* Options Menu (Three Dots) */}
          <div className="relative" ref={optionsMenuRef}>
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
              title="Assistant Options"
            >
              <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </button>

            {showOptionsMenu && (
              <div className="absolute right-0 top-7 z-30 flex w-40 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                <button
                  onClick={() => {
                    setTitleDraft(assistantTopicTitle);
                    setIsEditingTitle(true);
                    setShowOptionsMenu(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                >
                  Rename Topic
                </button>
                <button
                  onClick={() => {
                    clearAssistantMessages();
                    setShowOptionsMenu(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
                >
                  Clear Chat
                </button>
                <div className="h-px bg-border/60 my-0.5" />
                <button
                  onClick={() => {
                    toggleAssistantPanel();
                    setShowOptionsMenu(false);
                  }}
                  className="rounded px-2.5 py-1.5 text-left text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
                >
                  Hide Panel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content: Study Assistant or OpenCode Agent */}
      {assistantMode === "opencode" ? (
        <div className="flex-1 overflow-hidden">
          <OpenCodeView />
        </div>
      ) : (
        <>
          {/* Messages Stream */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {assistantMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted select-none">
            <div className="h-10 w-10 rounded-full border border-border bg-bg/50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 stroke-current text-accent" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-text">Study Assistant Ready</p>
            <p className="text-[11px] text-muted mt-1 max-w-[220px]">
              Ask questions about your study notes, summarize documents, or generate learning plans.
            </p>
          </div>
        ) : (
          assistantMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-xs text-white shadow-sm leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full text-xs text-text/90 leading-relaxed markdown-preview">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          ))
        )}
        {assistantStatusText && (
          <div className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] text-accent font-medium animate-pulse w-fit">
            <span className="text-[10px]">✨</span>
            <span>{assistantStatusText}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending file-tool approval gate (Phase 2b) */}
      {pendingToolApprovals.length > 0 && (
        <div className="space-y-2 px-3 py-2 border-t border-border/40 bg-bg/40">
          {pendingToolApprovals
            .filter((p) => p.status === "pending")
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-amber-300">
                    <span>⚠️</span>
                    <span className="uppercase tracking-wide text-[10px]">AI wants to change your files</span>
                  </div>
                  <p className="mt-0.5 text-text/90 leading-relaxed break-words">{p.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => {
                      resolveToolApproval(p.id, "approved");
                      setTimeout(() => clearToolApproval(p.id), 1200);
                    }}
                    className="rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-400 cursor-pointer transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      resolveToolApproval(p.id, "rejected");
                      clearToolApproval(p.id);
                    }}
                    className="rounded-md border border-border bg-bg/60 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20 cursor-pointer transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Bottom Input Area */}
      <div className="p-3 pt-0">
        <div className="flex flex-col rounded-xl border border-border/80 bg-bg/60 p-2.5 shadow-inner focus-within:border-accent/80 transition-colors">
          {/* Text Area */}
          <textarea
            ref={textareaRef}
            rows={2}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add \ or ask assistant..."
            className="w-full resize-none bg-transparent text-xs text-text placeholder:text-muted/60 outline-none leading-relaxed"
          />

          {/* Bottom Toolbar */}
          <div className="mt-2 flex items-center justify-between pt-1 border-t border-border/30">
            {/* Left toolbar items */}
            <div className="flex items-center gap-1.5">
              {/* Attach Context Button (+) */}
              <div className="relative" ref={attachMenuRef}>
                <button
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  title="Add context attachment"
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-border/60 text-muted hover:border-text hover:text-white cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                {showAttachMenu && (
                  <div className="absolute bottom-8 left-0 z-30 flex w-44 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    <button
                      onClick={() => handleAttachContext("active_file")}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      </svg>
                      Active Note Context
                    </button>
                    <button
                      onClick={() => handleAttachContext("folder")}
                      className="flex items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      Vault Workspace
                    </button>
                  </div>
                )}
              </div>

              {/* Model Dropdown Pill Badge */}
              <div className="relative" ref={modelDropdownRef}>
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="flex items-center gap-1 rounded-md border border-border/70 bg-card/80 px-2 py-1 text-[11px] font-medium text-text/90 hover:border-accent/60 hover:text-white cursor-pointer transition-colors"
                >
                  <span className="text-[10px] text-accent font-bold">
                    {modelsList.find((m) => m.id === settings.aiProvider)?.icon || "🦙"}
                  </span>
                  <span className="truncate max-w-[100px]">{settings.aiModelName || "hermes3:8b"}</span>
                  <svg className="w-3 h-3 text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {showModelDropdown && (
                  <div className="absolute bottom-8 left-0 z-30 flex w-56 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted">AI Engine & Model</div>
                    {modelsList.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          const defaultUrl = getProviderPreset(m.id)?.defaultBaseUrl ?? settings.aiBaseUrl;

                          updateSettings({
                            aiProvider: m.id,
                            aiModelName: m.model,
                            aiBaseUrl: defaultUrl,
                          });
                          setShowModelDropdown(false);
                        }}
                        className={`flex items-center justify-between rounded px-2.5 py-1.5 text-left cursor-pointer transition-colors ${
                          settings.aiProvider === m.id ? "bg-accent text-white font-medium" : "hover:bg-bg/80 text-text/90"
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 font-medium truncate">
                            <span>{m.icon}</span>
                            <span className="truncate">{m.name}</span>
                          </div>
                          <span className="text-[10px] text-muted leading-tight truncate">{m.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Send / Stop Button */}
            {isAssistantStreaming ? (
              <button
                onClick={cancelAssistantMessage}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/90 text-white shadow-sm hover:bg-red-500 cursor-pointer transition-all"
                title="Stop generating"
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputVal.trim()}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${
                  inputVal.trim()
                    ? "bg-accent text-white shadow-sm hover:bg-accent-hover cursor-pointer scale-100"
                    : "bg-border/40 text-muted cursor-not-allowed opacity-50"
                }`}
                title="Send message"
              >
                <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
```


## `src\components\AgentPanel.tsx`

```typescript
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore, AgentTask } from "../stores/useStore";

const TASKS: { id: AgentTask; label: string }[] = [
  { id: "summarize", label: "Summarize" },
  { id: "improve", label: "Improve" },
  { id: "assess", label: "Assess" },
  { id: "custom", label: "Custom" },
];

export default function AgentPanel() {
  const agentMessages = useStore((s) => s.agentMessages);
  const agentContext = useStore((s) => s.agentContext);
  const agentTask = useStore((s) => s.agentTask);
  const setAgentTask = useStore((s) => s.setAgentTask);
  const setAgentContext = useStore((s) => s.setAgentContext);
  const addAgentMessage = useStore((s) => s.addAgentMessage);
  const toggleAgentPanel = useStore((s) => s.toggleAgentPanel);

  const [inputVal, setInputVal] = useState("");

  const handleSend = () => {
    const text = inputVal.trim();
    if (!text) return;
    setInputVal("");

    const store = useStore.getState();
    const task: AgentTask = agentTask;
    const vaultRoot = store.currentFolderPath || "";

    addAgentMessage({ id: "user-" + Date.now(), role: "user", text, timestamp: Date.now() });
    const agentId = "agent-" + Date.now();
    addAgentMessage({ id: agentId, role: "agent", text: "…", timestamp: Date.now() });

    const activePath = store.activeLeftTabId || store.activeRightTabId;
    const scope = activePath ? activePath.split(/[\\/]/).pop()?.replace(/\.md$/i, "") || "global" : "global";

    const instruction =
      task === "custom"
        ? text
        : task === "summarize"
        ? "Summarize the target text below concisely, highlighting the key points, relationships, and any terms worth remembering. Use the retrieved context only as support."
        : task === "improve"
        ? "Improve the target text below: tighten wording, fix clarity and structure, and keep its meaning and voice. Output the revised text with a short list of the changes you made."
        : "Assess the target text below for the user as a study aid: note strengths, gaps, unclear sections, and 1-3 concrete suggestions for improvement.";

    const target = agentContext ?? `(No highlighted context)\nUser message: ${text}`;

    (async () => {
      const { runAgentTask, remember } = await import("../services/agentKnowledge");
      let finalText = "";
      try {
        finalText = await runAgentTask({
          task: instruction,
          context: target,
          scope,
          vaultRoot,
          onChunk: (t) => {
            const s = useStore.getState();
            s.setAgentMessages(s.agentMessages.map((m) => (m.id === agentId ? { ...m, text: t } : m)));
          },
        });
      } catch (err) {
        finalText = `⚠️ Agent run failed: ${String(err)}`;
      } finally {
        const s = useStore.getState();
        s.setAgentMessages(
          s.agentMessages.map((m) =>
            m.id === agentId ? { ...m, text: finalText || "_No output produced._" } : m
          )
        );
        // Persist the turn to durable memory (fire-and-forget).
        if (finalText && s.settings.memoryAutoSave !== false) {
          remember(
            {
              scope,
              kind: "message",
              content: `Task: ${instruction}\nResult: ${finalText.slice(0, 2000)}`,
              source: "micro-agent",
              topicTitle: scope,
            },
            s.settings
          ).catch(() => {});
        }
      }
    })();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-l border-border/40">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-accent stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <h2 className="text-xs font-semibold text-text">Agent</h2>
          <span className="text-[9px] font-mono uppercase text-muted bg-bg/50 rounded px-1 py-0.5">micro</span>
        </div>
        <button
          onClick={toggleAgentPanel}
          title="Close panel"
          className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Task Selector */}
      <div className="shrink-0 flex items-center gap-1 border-b border-border/30 bg-bg/10 px-2 py-1.5">
        <span className="text-[9px] font-semibold uppercase text-muted mr-1">Task</span>
        {TASKS.map((t) => (
          <button
            key={t.id}
            onClick={() => setAgentTask(t.id)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
              agentTask === t.id ? "bg-accent text-white" : "text-muted hover:bg-bg hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Context */}
      {agentContext && (
        <div className="shrink-0 px-3 py-2 border-b border-border/30 bg-bg/20">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9px] font-semibold uppercase text-muted">Context</p>
            <button
              onClick={() => setAgentContext(null)}
              className="text-[10px] text-muted hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-text/80 leading-relaxed line-clamp-4">{agentContext}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {agentMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted">
            <p className="text-[11px] mb-1">Highlight text in your note to</p>
            <p className="text-[11px]">summarize, improve, or assess it.</p>
          </div>
        ) : (
          agentMessages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-accent/15 text-white"
                  : "bg-bg/40 text-text/90 markdown-preview"
              }`}
            >
              {m.role === "agent" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
              ) : (
                <span className="whitespace-pre-wrap">{m.text}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-border/30 p-2">
        <textarea
          rows={2}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={agentContext ? `Run ${agentTask} on highlighted text...` : "Ask Agent to help..."}
          className="w-full resize-none rounded border border-border/60 bg-bg/40 px-2 py-1.5 text-xs text-text placeholder:text-muted/60 outline-none focus:border-accent/70"
        />
        <button
          onClick={handleSend}
          className="mt-1.5 w-full rounded bg-accent py-1.5 text-xs font-semibold text-white hover:bg-accent-hover cursor-pointer transition-colors"
        >
          Run Agent
        </button>
      </div>
    </div>
  );
}
```


## `src\components\ArtifactsPanel.tsx`

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useStore, Artifact } from "../stores/useStore";

export default function ArtifactsPanel() {
  const artifacts = useStore((s) => s.artifacts);
  const activeArtifact = useStore((s) => s.activeArtifact);
  const setActiveArtifact = useStore((s) => s.setActiveArtifact);
  const toggleArtifactsPanel = useStore((s) => s.toggleArtifactsPanel);

  return (
    <div className="flex h-full flex-col overflow-hidden panel-rounded bg-card border-l border-border/40">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/30 bg-bg/30 px-3">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-cyan-400 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 8h6M9 12h6M9 16h4" />
          </svg>
          <h2 className="text-xs font-semibold text-text">Artifacts</h2>
        </div>
        <button
          onClick={toggleArtifactsPanel}
          title="Close panel"
          className="rounded p-1 text-muted hover:bg-bg hover:text-white cursor-pointer transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {activeArtifact ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-border/30 bg-bg/20 px-3 py-2">
              <button
                onClick={() => setActiveArtifact(null)}
                className="text-[10px] font-semibold uppercase text-muted hover:text-white cursor-pointer"
              >
                ← Back to list
              </button>
              <span className="text-[10px] font-mono text-muted uppercase">{activeArtifact.type}</span>
            </div>
            <h3 className="px-3 pt-3 text-sm font-semibold text-text">{activeArtifact.title}</h3>
            <div className="px-3 py-3 text-xs text-text/90 leading-relaxed markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeArtifact.content}</ReactMarkdown>
            </div>
          </div>
        ) : artifacts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="h-12 w-12 rounded-xl border border-border bg-bg/40 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-cyan-400/60 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M4 4h16v6H4zM4 14h16v6H4z" />
              </svg>
            </div>
            <h3 className="text-xs font-semibold text-text mb-1">No artifacts yet</h3>
            <p className="text-[11px] text-muted max-w-[220px]">
              AI-generated artifacts (code, diagrams, summaries) will appear here as you generate them.
            </p>
          </div>
        ) : (
          <ArtifactList artifacts={artifacts} onSelect={setActiveArtifact} />
        )}
      </div>
    </div>
  );
}

function ArtifactList({ artifacts, onSelect }: { artifacts: Artifact[]; onSelect: (a: Artifact) => void }) {
  return (
    <div className="flex flex-col gap-1 p-2">
      {artifacts.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a)}
          className="rounded-md border border-border/60 bg-bg/30 p-2 text-left hover:border-accent/70 hover:bg-bg/60 cursor-pointer transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-text">{a.title}</span>
            <span className="shrink-0 text-[9px] font-mono uppercase text-muted">{a.type}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[10px] text-muted">{a.content.replace(/[#*`>]/g, "").trim()}</p>
        </button>
      ))}
    </div>
  );
}
```


## `src\components\BacklinksPanel.tsx`

```typescript
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../stores/useStore";

interface LinkItem {
  id: number | null;
  source_path: string;
  target_path: string;
  link_text: string;
  line_number: number;
}

interface BacklinksPanelProps {
  activeTabId: string | null;
  panel: "left" | "right";
}

export default function BacklinksPanel({ activeTabId, panel }: BacklinksPanelProps) {
  const openFile = useStore((s) => s.openFile);
  const [backlinks, setBacklinks] = useState<LinkItem[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!activeTabId) {
      setBacklinks([]);
      return;
    }
    let cancelled = false;
    invoke<LinkItem[]>("get_backlinks", { targetPath: activeTabId })
      .then((links) => {
        if (!cancelled) setBacklinks(links);
      })
      .catch((err) => {
        console.error("Failed to load backlinks", err);
        if (!cancelled) setBacklinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTabId]);

  if (!activeTabId || backlinks.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/20 bg-bg/10 text-[11px]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-muted hover:text-text cursor-pointer transition-colors"
      >
        <span className={`text-[9px] transition-transform ${expanded ? "rotate-90" : ""}`}>▶</span>
        <span className="font-medium">Linked Mentions</span>
        <span className="text-muted/70">({backlinks.length})</span>
      </button>
      {expanded && (
        <div className="max-h-32 overflow-y-auto px-3 pb-2 space-y-1 scrollbar-thin">
          {backlinks.map((link) => {
            const name = link.source_path.split(/[\\/]/).pop() ?? link.source_path;
            return (
              <button
                key={`${link.source_path}-${link.line_number}-${link.id ?? 0}`}
                onClick={() => openFile(link.source_path, panel)}
                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-text/80 hover:bg-card hover:text-white cursor-pointer transition-colors"
                title={link.source_path}
              >
                <span className="truncate">{name.replace(/\.md$/, "")}</span>
                <span className="shrink-0 text-muted/60 ml-2">line {link.line_number}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```


## `src\components\EditorContextMenu.tsx`

```typescript
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/useStore";

interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  activeTabId: string | null;
  panel: "left" | "right";
  draft: string;
}

export default function EditorContextMenu({ x, y, onClose, activeTabId, panel, draft }: EditorContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const togglePinPath = useStore((s) => s.togglePinPath);
  const pinnedPaths = useStore((s) => s.pinnedPaths);
  const openFile = useStore((s) => s.openFile);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const renameEntry = useStore((s) => s.renameEntry);
  const createFile = useStore((s) => s.createFile);
  const flushPendingSave = useStore((s) => s.flushPendingSave);
  const currentFolderPath = useStore((s) => s.currentFolderPath);

  const [showRenameInput, setShowRenameInput] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", handle);
    return () => window.removeEventListener("mousedown", handle);
  }, [onClose]);

  useEffect(() => {
    if (showRenameInput && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [showRenameInput]);

  if (!activeTabId) return null;

  const isPinned = pinnedPaths.includes(activeTabId);
  const fileName = activeTabId.split(/[\\/]/).pop() || "Note";

  const handleCopy = async (format: "markdown" | "text" | "html") => {
    let content = draft;
    if (format === "html") {
      const el = document.createElement("div");
      el.innerHTML = draft;
      content = el.textContent || el.innerText || draft;
    }
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      document.execCommand("copy");
    }
    onClose();
  };

  const handleCut = () => {
    document.execCommand("cut");
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.execCommand("insertText", false, text);
    } catch {
      document.execCommand("paste");
    }
    onClose();
  };

  const handleSelectAll = () => {
    document.execCommand("selectAll");
    onClose();
  };

  const handleDuplicate = async () => {
    if (!currentFolderPath || !activeTabId) { onClose(); return; }
    await flushPendingSave(panel);
    const dir = activeTabId.replace(/[\\/][^\\/]+$/, "");
    const baseName = fileName.replace(/\.md$/, "");
    const copyName = `${baseName} Copy`;
    try {
      const newPath = await createFile(dir, copyName);
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("write_local_file", { path: newPath, content: draft, vaultRoot: currentFolderPath });
      await openFile(newPath);
    } catch (err) {
      console.error("Duplicate failed", err);
    }
    onClose();
  };

  const handleRenameStart = () => {
    setRenameValue(fileName.replace(/\.md$/, ""));
    setShowRenameInput(true);
  };

  const handleRenameConfirm = async () => {
    if (!renameValue.trim() || !activeTabId) { setShowRenameInput(false); onClose(); return; }
    const dir = activeTabId.replace(/[\\/][^\\/]+$/, "");
    const ext = activeTabId.endsWith(".md") ? ".md" : "";
    const newPath = `${dir}/${renameValue.trim()}${ext}`.replace(/[\\/]+/g, "/");
    try {
      await renameEntry(activeTabId, newPath);
    } catch (err) {
      console.error("Rename failed", err);
    }
    setShowRenameInput(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!activeTabId) { onClose(); return; }
    try {
      await deleteEntry(activeTabId);
    } catch (err) {
      console.error("Delete failed", err);
    }
    onClose();
  };

  return (
    <div
      ref={ref}
      style={{ top: `${y}px`, left: `${x}px` }}
      className="fixed z-50 flex w-52 flex-col rounded-md border border-border bg-card p-1 text-xs text-text shadow-xl"
    >
      {/* Clipboard */}
      <button onClick={handleCopy.bind(null, "text")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy
      </button>
      <button onClick={handleCut} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Cut
      </button>
      <button onClick={handlePaste} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Paste
      </button>
      <button onClick={handleSelectAll} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Select All
      </button>

      <div className="h-px bg-border/60 my-0.5" />

      {/* Note Management */}
      <button onClick={handleDuplicate} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Duplicate Note
      </button>

      {showRenameInput ? (
        <div className="px-2 py-1">
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameConfirm();
              if (e.key === "Escape") { setShowRenameInput(false); onClose(); }
            }}
            className="w-full rounded border border-accent bg-bg px-2 py-1 text-xs text-text outline-none"
          />
        </div>
      ) : (
        <button onClick={handleRenameStart} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
          Rename Note
        </button>
      )}

      <button onClick={handleDelete} className="rounded px-2.5 py-1.5 text-left text-red-400 hover:bg-red-500 hover:text-white cursor-pointer transition-colors">
        Delete Note
      </button>

      <div className="h-px bg-border/60 my-0.5" />

      {/* Copy As */}
      <button onClick={() => handleCopy("markdown")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy as Markdown
      </button>
      <button onClick={() => handleCopy("text")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy as Plain Text
      </button>
      <button onClick={() => handleCopy("html")} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Copy as HTML
      </button>

      <div className="h-px bg-border/60 my-0.5" />

      {/* Navigation & Pinning */}
      <button
        onClick={() => { togglePinPath(activeTabId); onClose(); }}
        className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors"
      >
        {isPinned ? "Unpin Note" : "Pin Note"}
      </button>
      <button onClick={() => { openFile(activeTabId, panel === "left" ? "right" : "left"); onClose(); }} className="rounded px-2.5 py-1.5 text-left hover:bg-accent hover:text-white cursor-pointer transition-colors">
        Open in Other Pane
      </button>
    </div>
  );
}
```


## `src\components\MoveConfirmModal.tsx`

```typescript
interface MoveItem {
  name: string;
  from: string;
  to: string;
  conflict: boolean;
}

interface MoveConfirmModalProps {
  items: MoveItem[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function MoveConfirmModal({ items, onConfirm, onCancel }: MoveConfirmModalProps) {
  const conflicts = items.filter((i) => i.conflict).length;
  const destName = items[0]?.to.split(/[\\/]/).slice(0, -1).pop() || "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm select-none">
      <div className="flex w-full max-w-md flex-col rounded-lg border border-border bg-[#18181b] text-text shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-bg/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-accent/20 text-accent">
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Move {items.length} item{items.length !== 1 ? "s" : ""}</h2>
              <p className="text-[11px] text-muted">
                {conflicts > 0 && (
                  <span className="text-amber-400">{conflicts} name conflict{conflicts !== 1 ? "s" : ""} — will rename automatically. </span>
                )}
                Destination: <span className="text-accent font-mono">{destName}</span>
              </p>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="p-3 space-y-1 max-h-64 overflow-y-auto scrollbar-thin flex-1">
          {items.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 p-2 rounded border border-border/40 bg-bg/20 ${
                item.conflict ? "border-amber-500/50" : ""
              }`}
            >
              {item.from.endsWith(".md") || item.from.endsWith(".markdown") ? (
                <span className="text-[11px] text-cyan-400 font-mono font-bold shrink-0">M+</span>
              ) : (
                <svg className="w-3.5 h-3.5 stroke-current text-muted shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              )}
              <span className="truncate text-xs font-medium text-text">{item.name}</span>
              <svg className="w-3 h-3 text-accent shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span className="truncate text-[10px] text-muted font-mono">
                {item.to.split(/[\\/]/).slice(0, -1).pop()}
              </span>
              {item.conflict && (
                <span className="text-[9px] text-amber-400 shrink-0">(1)</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3 bg-bg/40">
          <button
            onClick={onCancel}
            className="rounded px-3.5 py-1.5 text-xs text-muted hover:bg-bg hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer"
          >
            Move {items.length} Item{items.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
```


## `src\components\MarkdownEditor.tsx`

```typescript
import { useEffect, useRef } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages as codeLanguages } from "@codemirror/language-data";
import { GFM } from "@lezer/markdown";
import { tags } from "@lezer/highlight";
import { livePreviewExtension } from "./markdownLivePreview";
import { continueListOnEnter } from "./markdownListContinuation";
import { useStore } from "../stores/useStore";

const editorTheme = EditorView.theme({
  "&": {
    color: "var(--color-text)",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    caretColor: "var(--color-text)",
    fontFamily: "inherit",
    fontSize: "inherit",
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.75",
    overflow: "visible",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 35%, transparent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--color-text)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--color-muted)",
    border: "none",
  },
  ".cm-md-heading": {
    fontWeight: "700",
    color: "#ffffff",
  },
  ".cm-md-h1": { fontSize: "1.75em" },
  ".cm-md-h2": { fontSize: "1.35em" },
  ".cm-md-h3": { fontSize: "1.15em" },
  ".cm-md-h4": { fontSize: "1.05em" },
  ".cm-md-h5": { fontSize: "1em" },
  ".cm-md-h6": { fontSize: "0.95em", color: "var(--color-muted)" },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strike": { textDecoration: "line-through", opacity: "0.7" },
  ".cm-md-inline-code": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "3px",
    padding: "0 4px",
    fontSize: "0.9em",
  },
  ".cm-md-task-checkbox": {
    verticalAlign: "middle",
    marginRight: "4px",
    cursor: "pointer",
  },
  ".cm-md-bullet": {
    display: "inline-block",
    width: "1em",
    color: "var(--color-accent)",
    fontWeight: "700",
  },
  ".cm-md-hr": {
    border: "none",
    borderTop: "1px solid var(--color-border)",
    margin: "0.5em 0",
  },
  ".cm-md-codeblock-line": {
    backgroundColor: "var(--color-bg)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  ".cm-md-table-row": {
    display: "table-row",
  },
  ".cm-md-table-delim-row": {
    borderTop: "1px solid var(--color-border)",
  },
  ".cm-md-table-cell": {
    display: "table-cell",
    padding: "2px 12px",
    borderBottom: "1px solid var(--color-border)",
  },
  ".cm-md-table-header-cell": {
    display: "table-cell",
    padding: "2px 12px",
    fontWeight: "700",
    borderBottom: "1px solid var(--color-border)",
  },
});

// Fixed syntax-highlighting palette for fenced code blocks — deliberately not themed per
// dark-preset (Obsidian/Nord/Dracula/etc.), same approach as the hardcoded heading color
// above, since token colors need to stay distinguishable across all five presets.
const codeHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "#c792ea" },
  { tag: [tags.name, tags.deleted, tags.character, tags.propertyName, tags.macroName], color: "#f07178" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#82aaff" },
  { tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)], color: "#f78c6c" },
  { tag: [tags.definition(tags.name), tags.separator], color: "#eeffff" },
  { tag: [tags.typeName, tags.className, tags.number, tags.changed, tags.annotation, tags.modifier, tags.self, tags.namespace], color: "#ffcb6b" },
  { tag: [tags.operator, tags.operatorKeyword], color: "#89ddff" },
  { tag: [tags.url, tags.escape, tags.regexp, tags.link], color: "#89ddff" },
  { tag: tags.meta, color: "#ffcb6b" },
  { tag: tags.comment, color: "#697098", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.string, color: "#c3e88d" },
  { tag: tags.bool, color: "#f78c6c" },
  { tag: tags.invalid, color: "#ff5370" },
]);

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  livePreview?: boolean;
}

export default function MarkdownEditor({ value, onChange, livePreview = false }: MarkdownEditorProps) {
  const tabSize = useStore((s) => s.settings.tabSize);
  const showLineNumbers = useStore((s) => s.settings.showLineNumbers);
  const autoPairBrackets = useStore((s) => s.settings.autoPairBrackets);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastEmittedRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const livePreviewCompartmentRef = useRef(new Compartment());
  const tabSizeCompartmentRef = useRef(new Compartment());
  const lineNumbersCompartmentRef = useRef(new Compartment());
  const bracketsCompartmentRef = useRef(new Compartment());

  // Create the EditorView once; external doc replacement is handled by the effect below
  // so switching tabs doesn't tear down and rebuild the whole editor/cursor state.
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: lastEmittedRef.current,
      extensions: [
        history(),
        Prec.highest(keymap.of([{ key: "Enter", run: continueListOnEnter }])),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        markdown({ base: markdownLanguage, codeLanguages, extensions: [GFM] }),
        syntaxHighlighting(codeHighlightStyle),
        livePreviewCompartmentRef.current.of(livePreview ? livePreviewExtension : []),
        tabSizeCompartmentRef.current.of(indentUnit.of(" ".repeat(tabSize))),
        lineNumbersCompartmentRef.current.of(showLineNumbers ? [lineNumbers()] : []),
        bracketsCompartmentRef.current.of(
          autoPairBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : []
        ),
        EditorView.lineWrapping,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            lastEmittedRef.current = text;
            onChangeRef.current(text);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. switching tabs) without fighting local typing —
  // only replace the doc when the incoming value didn't originate from our own onChange.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastEmittedRef.current) return;

    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
    lastEmittedRef.current = value;
  }, [value]);

  // Toggle the live-preview decorations via the compartment so switching modes
  // reconfigures the existing view instead of tearing it down (keeps cursor/undo history).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: livePreviewCompartmentRef.current.reconfigure(livePreview ? livePreviewExtension : []),
    });
  }, [livePreview]);

  // Reconfigure editor-affecting settings live, without recreating the view (preserves
  // cursor position, selection, and undo history across a settings change).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: tabSizeCompartmentRef.current.reconfigure(indentUnit.of(" ".repeat(tabSize))),
    });
  }, [tabSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumbersCompartmentRef.current.reconfigure(showLineNumbers ? [lineNumbers()] : []),
    });
  }, [showLineNumbers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: bracketsCompartmentRef.current.reconfigure(
        autoPairBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : []
      ),
    });
  }, [autoPairBrackets]);

  return <div ref={containerRef} className="w-full" />;
}
```


## `src\components\markdownLivePreview.ts`

```typescript
import { syntaxTree } from "@codemirror/language";
import { EditorState, Range, RangeSet } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

// Obsidian-style "Live Preview": markdown formatting is rendered inline (headings sized up,
// bold/italic styled, marks hidden) everywhere EXCEPT the line the cursor is currently on,
// which stays raw and fully editable.

const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
};

class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly markFrom: number,
    private readonly markTo: number
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return other.checked === this.checked && other.markFrom === this.markFrom && other.markTo === this.markTo;
  }

  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-md-task-checkbox";
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({ changes: { from: this.markFrom, to: this.markTo, insert: replacement } });
    });
    return input;
  }

  ignoreEvent() {
    return true;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }
}

class HorizontalRuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement("hr");
    hr.className = "cm-md-hr";
    return hr;
  }
}

function buildDecorations(state: EditorState, visibleRanges: readonly { from: number; to: number }[]): DecorationSet {
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const ranges: Range<Decoration>[] = [];
  // Line-level decorations (e.g. table-row/codeblock backgrounds) must be added in document
  // order and separately from the mark/replace ranges above, per CodeMirror's RangeSet rules.
  const lineRanges: Range<Decoration>[] = [];

  const hide = (from: number, to: number) => {
    if (to > from) ranges.push(Decoration.replace({}).range(from, to));
  };
  const style = (from: number, to: number, cls: string) => {
    if (to > from) ranges.push(Decoration.mark({ class: cls }).range(from, to));
  };
  const lineClasses = new Map<number, Set<string>>();
  const styleLine = (pos: number, cls: string) => {
    const line = state.doc.lineAt(pos);
    let classes = lineClasses.get(line.from);
    if (!classes) {
      classes = new Set();
      lineClasses.set(line.from, classes);
    }
    classes.add(cls);
  };

  for (const { from, to } of visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from).number;
        const isActiveLine = line === cursorLine;

        const headingLevel = HEADING_LEVEL[node.name];
        if (headingLevel) {
          if (!isActiveLine) style(node.from, node.to, `cm-md-heading cm-md-h${headingLevel}`);
          return;
        }

        if (node.name === "HeaderMark" && !isActiveLine) {
          let end = node.to;
          if (state.doc.sliceString(end, end + 1) === " ") end += 1;
          hide(node.from, end);
          return;
        }

        if (node.name === "StrongEmphasis" && !isActiveLine) {
          style(node.from, node.to, "cm-md-strong");
          return;
        }

        if (node.name === "Emphasis" && !isActiveLine) {
          style(node.from, node.to, "cm-md-em");
          return;
        }

        if (node.name === "EmphasisMark" && !isActiveLine) {
          hide(node.from, node.to);
          return;
        }

        if (node.name === "InlineCode" && !isActiveLine) {
          style(node.from, node.to, "cm-md-inline-code");
          return;
        }

        if (node.name === "CodeMark" && !isActiveLine) {
          hide(node.from, node.to);
          return;
        }

        if (node.name === "Strikethrough" && !isActiveLine) {
          style(node.from, node.to, "cm-md-strike");
          return;
        }

        if (node.name === "StrikethroughMark" && !isActiveLine) {
          hide(node.from, node.to);
          return;
        }

        if (node.name === "TaskMarker" && !isActiveLine) {
          const text = state.doc.sliceString(node.from, node.to);
          const checked = /x/i.test(text);
          ranges.push(
            Decoration.replace({ widget: new TaskCheckboxWidget(checked, node.from, node.to) }).range(
              node.from,
              node.to
            )
          );
          return;
        }

        if (node.name === "ListMark" && !isActiveLine) {
          // ListMark is shared between bullet and ordered lists — only render a bullet
          // dot for the plain bullet markers (-, *, +); leave ordered-list numbers ("1.") raw.
          const text = state.doc.sliceString(node.from, node.to);
          if (text === "-" || text === "*" || text === "+") {
            let end = node.to;
            if (state.doc.sliceString(end, end + 1) === " ") end += 1;
            ranges.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, end));
          }
          return;
        }

        if (node.name === "HorizontalRule" && !isActiveLine) {
          ranges.push(Decoration.replace({ widget: new HorizontalRuleWidget() }).range(node.from, node.to));
          return;
        }

        // Fenced code blocks: keep the body monospaced/backgrounded at all times (like
        // Obsidian), but only hide the ``` fence markers and language label off the active line.
        if (node.name === "CodeText") {
          for (let l = state.doc.lineAt(node.from).number; l <= state.doc.lineAt(node.to).number; l++) {
            styleLine(state.doc.line(l).from, "cm-md-codeblock-line");
          }
          return;
        }
        if ((node.name === "CodeMark" || node.name === "CodeInfo") && !isActiveLine) {
          const parentName = node.node.parent?.name;
          if (parentName === "FencedCode") hide(node.from, node.to);
          return;
        }

        // GFM tables: give header/body rows a CSS `table-row` so cells line up in columns;
        // hide the raw `|` separators and the `---|---` alignment row off the active line.
        // The active line is deliberately left out of the `table-row` grouping (not just
        // left with its marks visible) — otherwise its one giant raw-text cell forces the
        // shared column widths to stretch around it, skewing every other row while typing.
        if ((node.name === "TableHeader" || node.name === "TableRow") && !isActiveLine) {
          styleLine(node.from, "cm-md-table-row");
          return;
        }
        if (node.name === "TableCell" && !isActiveLine) {
          const inHeader = node.node.parent?.name === "TableHeader";
          style(node.from, node.to, inHeader ? "cm-md-table-header-cell" : "cm-md-table-cell");
          return;
        }
        if (node.name === "TableDelimiter") {
          const isAlignmentRow = node.to - node.from > 1;
          if (isAlignmentRow) {
            if (!isActiveLine) {
              styleLine(node.from, "cm-md-table-row cm-md-table-delim-row");
              hide(node.from, node.to);
            }
          } else if (!isActiveLine) {
            hide(node.from, node.to);
          }
          return;
        }
      },
    });
  }

  for (const [linePos, classes] of lineClasses) {
    lineRanges.push(Decoration.line({ class: Array.from(classes).join(" ") }).range(linePos));
  }

  // RangeSet.of sorts (and validates nesting order) for us — safer than manually driving
  // RangeSetBuilder, which requires the caller to get from/startSide ordering exactly right.
  return RangeSet.of([...ranges, ...lineRanges], true);
}

export const livePreviewExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state, view.visibleRanges);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state, update.view.visibleRanges);
      }
    }
  },
  { decorations: (v) => v.decorations }
);
```


## `src\components\markdownListContinuation.ts`

```typescript
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Matches a bullet list item prefix: indent, marker (-, *, +), whitespace, and an optional
// GFM task checkbox ("[ ] " / "[x] "). Deliberately scoped to bullet markers only, not
// ordered lists (1.) — not asked for, and mixing the two adds ambiguity for little value.
const BULLET_ITEM_RE = /^(\s*)([-*+])(\s+)(\[[ xX]\]\s+)?/;

// Enter on a list item continues the list with the same marker (fresh unchecked box for
// task items, matching common editor conventions); Enter on an *empty* item exits the list
// by stripping the marker instead of duplicating an empty bullet indefinitely.
export function continueListOnEnter(view: EditorView): boolean {
  const { state } = view;
  let handled = false;

  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const match = BULLET_ITEM_RE.exec(line.text);

    if (!match) {
      return { range, changes: [] };
    }

    const rest = line.text.slice(match[0].length);
    if (rest.trim() === "") {
      handled = true;
      return {
        changes: { from: line.from, to: line.to, insert: "" },
        range: EditorSelection.cursor(line.from),
      };
    }

    handled = true;
    const [, indent, marker, , taskPart] = match;
    const insert = "\n" + indent + marker + " " + (taskPart ? "[ ] " : "");
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });

  if (!handled) return false;

  view.dispatch(tr, { scrollIntoView: true, userEvent: "input" });
  return true;
}
```


## `src\components\EdgeResizer.tsx`

```typescript
import { useRef } from "react";

interface EdgeResizerProps {
  onResize: (delta: number) => void;
}

export default function EdgeResizer({ onResize }: EdgeResizerProps) {
  const isDragging = useRef(false);
  const lastX = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
    onResize(delta);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="group relative flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-accent/80 active:bg-accent z-10"
      title="Drag panel border to resize"
    >
      <div className="h-8 w-0.5 rounded-full bg-border/40 group-hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
```


## `src\components\PanelDragHandle.tsx`

```typescript
import { SidePanelId } from "../stores/useStore";

export const PANEL_DRAG_MIME = "application/x-lsn-panel-id";

interface PanelDragHandleProps {
  panelId: SidePanelId;
}

export default function PanelDragHandle({ panelId }: PanelDragHandleProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PANEL_DRAG_MIME, panelId);
        e.dataTransfer.effectAllowed = "move";
      }}
      title="Drag to reorder panel"
      className="group absolute inset-x-0 top-0 z-20 flex h-2.5 cursor-grab items-center justify-center active:cursor-grabbing"
    >
      <div className="h-0.5 w-6 rounded-full bg-border/60 transition-colors group-hover:bg-accent/70" />
    </div>
  );
}
```


## `src\components\OpenCodeView.tsx`

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../stores/useStore";
import ReactMarkdown from "react-markdown";
import { invoke } from "@tauri-apps/api/core";

// ---------------------------------------------------------------------------
// Types matching OpenCode's HTTP API response shapes.
//
// Verified against a live `opencode serve` instance (v1.18.16) rather than
// assumed from docs — the actual wire shapes differ from the OpenAPI-adjacent
// names one might guess:
//   - the event type is "message.part.updated", not "part.updated"
//   - a message's metadata arrives as `properties.info`, not `properties.message`
//   - tool calls are `{ type: "tool", tool: <name>, callID, state: {...} }`,
//     not a `toolInvocation` field
//   - a message never carries its own `parts` array; parts stream in
//     separately, correlated back to a message via `part.messageID`
// ---------------------------------------------------------------------------

interface OpenCodeToolState {
  status: "pending" | "running" | "completed" | "error";
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  error?: string;
}

interface OpenCodePart {
  id?: string;
  messageID?: string;
  type: string; // "text" | "tool" | "reasoning" | "step-start" | "step-finish" | "file" | ...
  text?: string;
  tool?: string;
  callID?: string;
  state?: OpenCodeToolState;
}

interface OpenCodeMessageInfo {
  id: string;
  role: "user" | "assistant";
}

interface OpenCodeMessage {
  id: string;
  role: "user" | "assistant";
  parts: OpenCodePart[];
}

interface OpenCodeSSEEvent {
  type: string;
  properties?: {
    sessionID?: string;
    info?: OpenCodeMessageInfo;
    part?: OpenCodePart;
    status?: { type: string };
  };
}

// Platform-specific install commands (spec: no npm install -g, use winget/curl)
const INSTALL_INSTRUCTIONS = {
  windows: "winget install SST.opencode",
  other: "curl -fsSL https://opencode.ai/install | bash",
};

function getPlatformInstallCmd(): string {
  if (navigator.userAgent.toLowerCase().includes("windows")) {
    return INSTALL_INSTRUCTIONS.windows;
  }
  return INSTALL_INSTRUCTIONS.other;
}

export default function OpenCodeView() {
  const settings = useStore((s) => s.settings);
  const opencodeInstalled = useStore((s) => s.opencodeInstalled);
  const opencodeServerPid = useStore((s) => s.opencodeServerPid);
  const opencodeServerPassword = useStore((s) => s.opencodeServerPassword);
  const currentFolderPath = useStore((s) => s.currentFolderPath);
  const checkOpencodeInstalled = useStore((s) => s.checkOpencodeInstalled);
  const startOpencodeServer = useStore((s) => s.startOpencodeServer);
  const stopOpencodeServer = useStore((s) => s.stopOpencodeServer);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<OpenCodeMessage[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [serverStatus, setServerStatus] = useState<"starting" | "ready" | "error">("starting");
  const [toolActivity, setToolActivity] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  // messageID -> role, populated from every message.updated event (including the
  // user's own echoed message) so message.part.updated events know whose part it
  // is. We already show the user's own message optimistically in handleSend, so
  // parts belonging to a "user" role message are tracked here but never rendered.
  const messageRolesRef = useRef<Map<string, "user" | "assistant">>(new Map());

  const baseUrl = `http://localhost:${settings.opencodePort}`;

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opencodeServerPassword) {
      headers["Authorization"] = `Basic ${btoa(`opencode:${opencodeServerPassword}`)}`;
    }
    return headers;
  }, [opencodeServerPassword]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolActivity]);

  useEffect(() => {
    checkOpencodeInstalled();
  }, [checkOpencodeInstalled]);

  useEffect(() => {
    if (opencodeInstalled && settings.opencodeAutoStart && opencodeServerPid === null) {
      startOpencodeServer();
    }
    return () => {
      if (opencodeServerPid !== null) {
        stopOpencodeServer();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opencodeInstalled]);

  useEffect(() => {
    if (opencodeServerPid === null) {
      setServerStatus("starting");
      return;
    }
    let retries = 0;
    const maxRetries = 20;
    const tryConnect = async () => {
      try {
        const res = await fetch(`${baseUrl}/session`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ workspaceDir: currentFolderPath || "." }),
        });
        if (res.ok) {
          const data = await res.json();
          setSessionId(data.id ?? data.sessionID ?? null);
          setServerStatus("ready");
          return true;
        }
      } catch { /* server not ready yet */ }
      return false;
    };
    const poll = setInterval(async () => {
      const connected = await tryConnect();
      if (connected) {
        clearInterval(poll);
      } else {
        retries++;
        if (retries >= maxRetries) { clearInterval(poll); setServerStatus("error"); }
      }
    }, 500);
    return () => clearInterval(poll);
  }, [opencodeServerPid, authHeaders, baseUrl, currentFolderPath]);

  // OpenCode's /event stream requires HTTP Basic Auth (confirmed against a live
  // `opencode serve` instance: a `?password=` query param gets a 401). The native
  // browser EventSource API cannot send an Authorization header, so we read the
  // SSE stream manually via fetch + a ReadableStream reader instead.
  useEffect(() => {
    if (!sessionId || serverStatus !== "ready") return;
    let cancelled = false;

    const handleEvent = (raw: string) => {
      try {
        const event: OpenCodeSSEEvent = JSON.parse(raw);

        if (event.type === "message.updated" && event.properties?.info) {
          const info = event.properties.info;
          messageRolesRef.current.set(info.id, info.role);
          if (info.role === "assistant") {
            setMessages((prev) =>
              prev.some((m) => m.id === info.id) ? prev : [...prev, { id: info.id, role: "assistant", parts: [] }]
            );
          }
          return;
        }

        if (event.type === "message.part.updated" && event.properties?.part?.messageID) {
          const part = event.properties.part;
          const messageID = part.messageID as string;
          const role = messageRolesRef.current.get(messageID);
          if (role === "user") return; // already shown optimistically in handleSend

          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageID);
            if (idx < 0) {
              return [...prev, { id: messageID, role: "assistant", parts: [part] }];
            }
            const msg = prev[idx];
            const partIdx = msg.parts.findIndex((p) => p.id === part.id);
            const parts = partIdx >= 0
              ? msg.parts.map((p, i) => (i === partIdx ? part : p))
              : [...msg.parts, part];
            const next = [...prev];
            next[idx] = { ...msg, parts };
            return next;
          });

          if (part.type === "tool" && part.tool) {
            const status = part.state?.status ?? "pending";
            const summary = `🔧 ${part.tool} · ${status}`;
            setToolActivity((prev) => [...prev.slice(-19), summary]);
            const fileEditTools = ["write", "edit", "patch", "delete"];
            if (
              currentFolderPath &&
              status === "completed" &&
              fileEditTools.some((t) => part.tool!.toLowerCase().includes(t))
            ) {
              invoke("reindex_vault", { vaultRoot: currentFolderPath }).catch(() => {});
            }
          }
        }
      } catch { /* ignore malformed SSE frames */ }
    };

    const connect = async () => {
      const controller = new AbortController();
      sseAbortRef.current = controller;
      try {
        const res = await fetch(`${baseUrl}/event`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`SSE connect failed: ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data:")) handleEvent(line.slice(5).trim());
          }
        }
      } catch (err) {
        if (!cancelled) console.warn("[OpenCode SSE] Connection lost:", err);
      }
      if (!cancelled) setTimeout(connect, 2000);
    };
    connect();

    return () => {
      cancelled = true;
      sseAbortRef.current?.abort();
      sseAbortRef.current = null;
    };
  }, [sessionId, serverStatus, baseUrl, authHeaders, currentFolderPath]);

  const handleSend = async () => {
    if (!inputVal.trim() || !sessionId || isSending) return;
    const text = inputVal.trim();
    setInputVal("");
    setIsSending(true);
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", parts: [{ type: "text", text }] }]);
    try {
      // First message of a session gets a Memory-RAG bootstrap: memory digest + RAG
      // passages for the workspace fused in as a leading text part (plan Phase 3.3).
      let payloadText = text;
      if (messages.length === 0 && currentFolderPath) {
        try {
          const { fetchContextBundle, formatContextBundle } = await import("../services/agentKnowledge");
          const settings = useStore.getState().settings;
          const scope = currentFolderPath.split(/[\\/]/).pop() || "vault";
          const bundle = await fetchContextBundle({
            vaultRoot: currentFolderPath,
            scope,
            queryText: text,
            limit: settings.ragTopK ?? 5,
          });
          if (bundle) {
            const contextBlock = [
              "## Workspace context (Memory-RAG bootstrap)",
              formatContextBundle(bundle),
              "Use this context to ground your work in the user's existing notes.",
            ].join("\n\n");
            payloadText = `${contextBlock}\n\n---\n\n${text}`;
          }
        } catch {
          /* offline/embed-server down — send the plain message */
        }
      }
      await fetch(`${baseUrl}/session/${sessionId}/message`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ parts: [{ type: "text", text: payloadText }] }),
      });
    } catch (err) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", parts: [{ type: "text", text: `⚠️ Failed to send message: ${String(err)}` }] }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const renderParts = (parts: OpenCodePart[]) =>
    parts.map((p, i) => {
      if (p.type === "text" && p.text) {
        return (
          <div key={i} className="w-full text-xs text-text/90 leading-relaxed markdown-preview">
            <ReactMarkdown>{p.text}</ReactMarkdown>
          </div>
        );
      }
      if (p.type === "tool" && p.tool) {
        const status = p.state?.status ?? "pending";
        const arrow = status === "completed" ? "←" : status === "error" ? "⚠" : "→";
        return (
          <div key={i} className="my-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-mono text-amber-300">
            <span className="text-amber-400 font-semibold">{arrow} {p.tool}</span>
            <span className="ml-1.5 text-amber-200/70">
              {status === "error" ? p.state?.error : status === "completed" ? p.state?.output?.slice(0, 120) : JSON.stringify(p.state?.input ?? {}).slice(0, 120)}
            </span>
          </div>
        );
      }
      return null;
    });

  if (!opencodeInstalled) {
    const installCmd = getPlatformInstallCmd();
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
        <div className="h-12 w-12 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center">
          <span className="text-2xl">🤖</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-text">OpenCode Not Found</p>
          <p className="text-[11px] text-muted mt-1 max-w-[260px]">
            Install OpenCode to enable the agentic coding mode. It supports all your existing BYOK API keys.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <div className="rounded border border-border bg-bg/60 px-3 py-2 font-mono text-[11px] text-accent text-left select-all">{installCmd}</div>
          <button onClick={() => navigator.clipboard.writeText(installCmd)} className="mt-1.5 w-full rounded border border-border/60 bg-bg/40 px-2 py-1 text-[10px] text-muted hover:text-white cursor-pointer transition-colors">Copy install command</button>
        </div>
        <button onClick={() => checkOpencodeInstalled()} className="rounded border border-border bg-card px-3 py-1.5 text-xs text-text hover:text-white cursor-pointer transition-colors">↻ Recheck Installation</button>
        <p className="text-[10px] text-muted">After installing, click "Recheck" or reopen the OpenCode Agent tab.</p>
      </div>
    );
  }

  if (opencodeServerPid === null || serverStatus === "starting") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <div className="h-10 w-10 rounded-full border border-accent/40 bg-accent/10 flex items-center justify-center">
          <span className="text-lg animate-spin">⚙️</span>
        </div>
        <p className="text-xs font-semibold text-text">Starting OpenCode Server...</p>
        <p className="text-[11px] text-muted">Launching opencode serve on port {settings.opencodePort}</p>
        {opencodeServerPid === null && (
          <button onClick={() => startOpencodeServer()} className="mt-2 rounded border border-border bg-card px-3 py-1.5 text-xs text-text hover:text-white cursor-pointer transition-colors">▶ Start Server Manually</button>
        )}
      </div>
    );
  }

  if (serverStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
        <p className="text-xs font-semibold text-red-400">⚠️ Could not connect to OpenCode server</p>
        <p className="text-[11px] text-muted max-w-[240px]">The server started (PID: {opencodeServerPid}) but did not respond on port {settings.opencodePort}. Check that no other process is using that port.</p>
        <button onClick={async () => { await stopOpencodeServer(); await startOpencodeServer(); }} className="rounded border border-border bg-card px-3 py-1.5 text-xs text-text hover:text-white cursor-pointer transition-colors">↻ Restart Server</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/30 px-3.5 py-1.5 text-[10px] text-muted bg-bg/30">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm" />
        <span>OpenCode Agent</span>
        <span className="text-border">·</span>
        <span>port {settings.opencodePort}</span>
        <span className="text-border">·</span>
        <span className="font-mono truncate max-w-[140px]">{currentFolderPath?.split(/[/\\]/).pop() ?? "no workspace"}</span>
        <button onClick={() => stopOpencodeServer()} className="ml-auto text-muted hover:text-red-400 cursor-pointer transition-colors" title="Stop OpenCode server">■ Stop</button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 && toolActivity.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted select-none">
            <span className="text-3xl mb-3">🤖</span>
            <p className="text-xs font-semibold text-text">OpenCode Agent Ready</p>
            <p className="text-[11px] text-muted mt-1 max-w-[220px]">Ask the agent to write, edit, or refactor code. It can read and modify files in your workspace directly.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-lg bg-accent px-3 py-2 text-xs text-white shadow-sm leading-relaxed">{msg.parts.find((p) => p.type === "text")?.text ?? ""}</div>
            ) : (
              <div className="w-full">{renderParts(msg.parts)}</div>
            )}
          </div>
        ))}
        {toolActivity.length > 0 && (
          <div className="rounded border border-border/40 bg-bg/30 px-2 py-1.5 text-[10px] text-muted font-mono space-y-0.5">
            <div className="text-[9px] text-muted/60 uppercase tracking-wide mb-1">Agent Activity</div>
            {toolActivity.map((line, i) => (<div key={i} className="truncate">{line}</div>))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 pt-0">
        <div className="flex flex-col rounded-xl border border-border/80 bg-bg/60 p-2.5 shadow-inner focus-within:border-accent/80 transition-colors">
          <textarea ref={textareaRef} rows={2} value={inputVal} onChange={(e) => setInputVal(e.target.value)} onKeyDown={handleKeyDown} disabled={isSending} placeholder={isSending ? "Agent working..." : "Ask OpenCode to write, edit, or explain code..."} className="w-full resize-none bg-transparent text-xs text-text placeholder:text-muted/60 outline-none leading-relaxed" />
          <div className="mt-2 flex items-center justify-between pt-1 border-t border-border/30">
            <div className="text-[10px] text-muted/60">Workspace tools: file edit · git · shell · LSP</div>
            <button onClick={handleSend} disabled={!inputVal.trim() || isSending} className={`flex h-7 w-7 items-center justify-center rounded-md transition-all ${inputVal.trim() && !isSending ? "bg-accent text-white shadow-sm hover:bg-accent-hover cursor-pointer scale-100" : "bg-border/40 text-muted cursor-not-allowed opacity-50"}`} title="Send to OpenCode agent">
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

