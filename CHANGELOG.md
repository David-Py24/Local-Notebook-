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
