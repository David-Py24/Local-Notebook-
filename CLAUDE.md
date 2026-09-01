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
  - Write: `write_local_file`, `create_local_file`, `create_local_dir`, `rename_local_entry`, `delete_local_entry`
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
