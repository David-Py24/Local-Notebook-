# Changelog

All notable changes to the Local Study Notebook are documented in this file.

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
