# Editor Formatting Context Menu — Implementation Plan

**Status: implemented (§7 steps 1–4).** `MarkdownEditor` now exposes `wrapSelection` / `setBlockPrefix` / `insertBlock` / `insertFootnote` via `forwardRef`, and `EditorContextMenu` renders the Format/Paragraph/Insert flyouts (gated to non-preview view modes) wired to those commands, including Highlight's `remark`/CSS support. Math and "New base" were skipped per §3/§7. `unist-util-visit` was added as a direct dependency for the highlight plugin; `package-lock.json` still needs a real `npm install` pass once network access is available (this environment's install was network-restricted, but the package is already present in `node_modules` transitively so build/type-check both pass).

Goal: add Obsidian-style **Format / Paragraph / Insert** flyout submenus to our right-click editor menu, so selecting text and right-clicking gives Bold/Italic/Strikethrough/Code, heading/list/quote block transforms, and block inserts (table, callout, hr, code block, footnote) — matching the reference screenshots.

## 1. Current state

- [EditorContextMenu.tsx](../src/components/EditorContextMenu.tsx) is a **flat** button list — Copy/Cut/Paste, Duplicate/Rename/Delete note, Copy As, Pin, Open in Other Pane. No text-formatting commands, no nested/flyout submenus at all.
- [MarkdownEditor.tsx](../src/components/MarkdownEditor.tsx) wraps CodeMirror 6. It holds `viewRef` ([MarkdownEditor.tsx:144](../src/components/MarkdownEditor.tsx:144)) **internally only** — nothing outside the component can dispatch changes or read the current selection.
- The menu is opened from `StudyBoard.tsx`'s `handleContextMenu` ([StudyBoard.tsx:217](../src/components/StudyBoard.tsx:217)) and rendered at [StudyBoard.tsx:630](../src/components/StudyBoard.tsx:630), which already has `draft`, `activeTabId`, `panel`, and `viewMode` in scope.
- Formatting only makes sense in `source`/`live` view (there's a real text cursor); in `preview` mode there's no CodeMirror selection to act on.

This is the one real architectural gap: **there is currently no way for anything outside `MarkdownEditor` to manipulate the CodeMirror selection.** Everything else is additive UI.

## 2. Architecture change: expose an imperative editor handle

Convert `MarkdownEditor` to `forwardRef` and expose a small command surface via `useImperativeHandle`, instead of leaking the raw `EditorView`:

```ts
export interface MarkdownEditorHandle {
  wrapSelection: (before: string, after?: string) => void;   // bold/italic/strike/code/highlight
  toggleLinePrefix: (prefix: string, opts?: { ordered?: boolean }) => void; // headings/quote/bullet/task
  insertBlock: (template: string, cursorOffset?: number) => void; // table/hr/code block/callout/footnote
  focus: () => void;
}
```

Implementation uses `viewRef.current.state` / `dispatch` with `changeByRange` over `state.selection.ranges` so it works with multiple cursors and empty selections (e.g. toggling a heading with no selection just affects the current line). This is standard CodeMirror 6 usage — no new dependency.

`StudyBoard.tsx`'s `EditorPanel` creates `const editorRef = useRef<MarkdownEditorHandle>(null)`, passes `ref={editorRef}` to `<MarkdownEditor>`, and passes `editorRef` down to `<EditorContextMenu>` as a new prop. The menu only needs `editorRef` — it doesn't need `draft` for formatting since commands act directly on the live document via CodeMirror.

Gate visibility: `EditorContextMenu` receives `viewMode` and only renders the Format/Paragraph/Insert groups when `viewMode !== "preview"`.

## 3. Menu structure & command mapping

### Format (wraps selection, or inserts empty markers at cursor if no selection)
| Item | Markers |
|---|---|
| Bold | `**` / `**` |
| Italic | `*` / `*` |
| Strikethrough | `~~` / `~~` (already parsed — `remark-gfm` supports it) |
| Highlight | `==` / `==` — **not** standard GFM; needs a small remark plugin + `.markdown-preview mark` CSS to render in Preview (see §5) |
| Code | `` ` `` / `` ` `` |
| ~~Math~~ | Skip for v1 — needs `remark-math` + `rehype-katex` + KaTeX CSS, a real new dependency. Call out as a separate future plan if wanted. |
| ~~Comment~~ | Skip for v1 — Obsidian's `%%...%%` hidden-comment syntax needs a remark transform that drops the span entirely in Preview; low value without a broader "comments" feature. |

### Paragraph (line-prefix toggle on the current line, or every selected line)
| Item | Behavior |
|---|---|
| Bullet list | prefix each line with `- ` (toggle off if already present) |
| Numbered list | prefix with `1. `, `2. `, ... renumbered sequentially |
| Task list | prefix with `- [ ] ` |
| Heading 1–6 | replace any existing leading `#{1,6} ` with `#`×n + space |
| Body | strip any leading `#`, `>`, `- `, `1. `, `- [ ] ` — plain paragraph |
| Quote | prefix each line with `> ` |

### Insert (template inserted at cursor, cursor placed at first fill-in point)
| Item | Template |
|---|---|
| Horizontal rule | `\n\n---\n\n` |
| Code block | ` ```\n\n``` ` with cursor on the blank line |
| Table | 2×3 markdown table skeleton (`\| Header \| Header \|` + separator + one blank row) |
| Callout | `> [!note]\n> ` — plain quote syntax already renders fine with Phase-1 callout CSS from [MARKDOWN_TYPOGRAPHY_PLAN.md](MARKDOWN_TYPOGRAPHY_PLAN.md); typed callouts (`[!warning]`, `[!tip]` with distinct colors) are the stretch goal noted there |
| Footnote | inserts `[^n]` at cursor (next unused number) + appends `\n[^n]: ` at end of document, cursor moved to the new definition line |
| ~~Math block~~ | Skip for v1, same reasoning as inline Math above |
| ~~New base~~ | Obsidian "Bases" is a proprietary database/view feature with no equivalent in our app (no per-note structured-data model) — drop this item entirely, don't try to reinterpret it |

## 4. UI: nested flyout submenu

`EditorContextMenu` currently has zero nesting. Add a small reusable pattern:
- A `MenuGroup` row (`Format ▸`) that shows a second `<div>` panel positioned to its right on hover/focus, matching the reference screenshots' flyout behavior.
- Keep it self-contained inside `EditorContextMenu.tsx` (a ~30-line internal component) rather than a new shared file — this is the only place in the app that currently needs flyouts.
- Close the whole menu (both levels) on outside click, same as today's `mousedown` listener.

## 5. Preview rendering support (only for Highlight)
`==highlighted text==` isn't part of CommonMark or GFM, so `react-markdown` + `remark-gfm` won't render it without help. Two options:
- **Cheap:** a ~15-line custom `remark` plugin (visitor over `text` nodes, regex `==(.+?)==` → wraps a `mark` mdast node) — no new dependency, `remark`/`unist` types already come in via `react-markdown`'s deps.
- Add `.markdown-preview mark { background: rgba(250, 204, 21, 0.25); color: inherit; border-radius: 2px; padding: 0 2px; }` to `src/index.css`.

Quote/heading/list/hr/table/code-block inserts need **no** new preview support — they're already styled from the typography pass.

## 6. Files touched
- `src/components/MarkdownEditor.tsx` — `forwardRef` + `useImperativeHandle` with the command surface (§2).
- `src/components/StudyBoard.tsx` — create/hold `editorRef`, pass to `MarkdownEditor` and `EditorContextMenu`, pass `viewMode` to the menu.
- `src/components/EditorContextMenu.tsx` — add the three submenu groups + flyout UI + command dispatch calls.
- `src/index.css` — one new rule for `mark` (highlight) if that item ships.
- New tiny remark plugin (co-located in `StudyBoard.tsx` or a new `src/utils/remarkHighlight.ts`) — only if Highlight ships.

## 7. Suggested order of work
1. Ship the `forwardRef`/imperative-handle plumbing with just **Bold/Italic/Code** wired — proves the CodeMirror dispatch pattern end-to-end with the lowest-risk items.
2. Add the rest of **Format** (Strikethrough, Highlight + its remark plugin/CSS).
3. Add **Paragraph** (heading/list/quote/body line-prefix toggles) — these touch multi-line selections, more edge cases (mixed-state selections, renumbering ordered lists).
4. Add **Insert** (hr, code block, table, callout, footnote).
5. Skip Math and "New base" outright per §3 unless explicitly requested later.

## 8. Verification
- `npx tsc --noEmit` after the `forwardRef` change (typed handle surface).
- Manual smoke test per item: select text → right-click → apply each Format/Paragraph/Insert action → confirm the CodeMirror doc updates correctly and Preview mode renders it as expected → confirm undo (Ctrl+Z) cleanly reverts a single formatting action (each command should be one dispatch = one undo step).
- Test with **no selection** (cursor only) for every command — must not throw, should behave like Obsidian (wrap inserts empty markers with cursor between them; line-prefix acts on current line only).
