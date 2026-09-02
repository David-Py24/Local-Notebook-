# Changelog

All notable changes to the Local Study Notebook are documented in this file.

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
