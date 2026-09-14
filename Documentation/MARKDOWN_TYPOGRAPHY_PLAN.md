# Markdown Typography & Structure — Implementation Plan

Goal: bring the Study Board's preview rendering (`.markdown-preview` in [src/index.css](../src/index.css), rendered via `ReactMarkdown` in [StudyBoard.tsx:568](../src/components/StudyBoard.tsx:568)) up to the polish level of the reference screenshot — clear heading hierarchy, callout-style blockquotes, disciplined bullet rhythm, and pill-style inline code.

## 1. What the reference has that we don't

| Element | Reference screenshot | Our current preview |
|---|---|---|
| Blockquote | Full-width card, colored left bar, **not italic**, holds a bold inline label (`Purpose:`) | Thin left bar, italic, very faint tint (`rgba(59,130,246,0.05)`) |
| H1 | Bold, large, tight to a divider rule below the intro block | Bold + `border-bottom`, fine as-is |
| H2 ("2. Current State Assessment") | Numbered, bold, generous top margin, reads as a section break | We already support this generically — just needs breathing room |
| Bullets | Bold lead-in term + colon + description, consistent hanging indent, sub-bullets clearly nested | Plain `disc`/`circle`, no lead-in styling, indent is fine but no visual distinction for bold-label bullets |
| Inline code | Pill-shaped, muted gray chip for file paths/identifiers (`supabaseService.ts`) | Already chip-like (`#24252a` bg, blue text) — close, just recolor to neutral gray to match "reference" data rather than "syntax" |
| Footer | Sticky bottom-right meta bar: backlinks · word count · char count | Not present at all |

Everything except the footer is a **CSS-only** change to `.markdown-preview` rules (lines 58–198 of `src/index.css`). No new dependencies needed for the typography work.

## 2. Phased plan

### Phase 1 — Blockquote → Callout card
Replace the italic/faint blockquote with a non-italic card:
```css
.markdown-preview blockquote {
  font-style: normal;
  border-left: 4px solid var(--color-accent);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 0.75rem 1.1rem;
  margin: 1.1rem 0;
  color: var(--color-text);
}
.markdown-preview blockquote p { margin: 0.3rem 0; }
.markdown-preview blockquote strong { color: #ffffff; }
```
No component change needed — `> **Purpose**: text...` already parses to `<blockquote><p><strong>` via `remark-gfm`.

**Stretch (optional, separate PR):** Obsidian-style typed callouts (`> [!note]`, `> [!warning]`) via a small `remark` plugin that maps the `[!type]` marker to a `data-callout` attribute, then color/icon per type in CSS. Only do this if the user wants typed callouts, not just the plain-quote look in the screenshot.

### Phase 2 — Heading rhythm
Reference reads as generous vertical whitespace before each numbered section. Tune:
```css
.markdown-preview h1 { margin: 0 0 1rem; }
.markdown-preview h2 { margin: 2rem 0 0.75rem; }
.markdown-preview h3 { margin: 1.4rem 0 0.5rem; }
.markdown-preview hr { border: none; border-top: 1px solid var(--color-border); margin: 1.5rem 0; }
```
`hr` isn't currently styled at all — add it since the reference uses a divider under the intro/purpose block.

### Phase 3 — Bullet lead-in pattern
The "flawless" bullets are just `- **Term**: description`, which already renders correctly structurally. What's missing is spacing polish:
```css
.markdown-preview li { margin: 0.45rem 0; line-height: 1.75; }
.markdown-preview li > strong:first-child { color: #ffffff; }
.markdown-preview ul li::marker { color: var(--color-muted); }
```
No markdown syntax change required — this is purely about matching how *our* users already write bulleted definitions.

### Phase 4 — Inline code as neutral chips
Reference uses code spans for file paths/identifiers, styled as a muted gray pill rather than "syntax-highlighted blue":
```css
.markdown-preview code {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
```
(Keep `pre code` block styling as-is — that's for actual code blocks, not reference chips.)

### Phase 5 — Footer meta bar
**Status: already implemented, no work needed.** The editor status bar at [StudyBoard.tsx:610-627](../src/components/StudyBoard.tsx:610) already renders word count + char count, and [BacklinksPanel.tsx](../src/components/BacklinksPanel.tsx) already renders a collapsible "Linked Mentions (`n`)" bar backed by a real `get_backlinks` Tauri command — this project has grown past the CLAUDE.md snapshot this plan was originally scoped against. The only cosmetic gap vs. the reference is that our backlinks/word-count live in two stacked bars instead of one combined row; not worth merging unless requested purely for pixel parity.

## 3. Files touched
- `src/index.css` — all of Phases 1–4 (pure CSS, no risk to other consumers since `.markdown-preview` is scoped to the preview pane). **Done.**
- `src/components/StudyBoard.tsx` / `src/components/BacklinksPanel.tsx` — Phase 5 already existed before this plan; no change made.

## 4. Verification
- `npx tsc --noEmit` (footer change only, CSS needs no type-check).
- Manual smoke test: open a note with headings, a blockquote, nested bullets, inline code, and an `---` rule in Preview mode; compare visually against the reference screenshot for spacing/contrast.
- Check both light-adjacent and default dark themes if `--color-accent`/`--color-border` vary per theme in [src/themes.ts](../src/themes.ts) — callout border/background should stay legible across all five presets.

## 5. Suggested order of work
1. Phase 1 (callout blockquote) — highest visual impact, matches the screenshot's most distinctive element.
2. Phase 2 + 4 (heading rhythm + code chips) — quick, low-risk CSS tuning.
3. Phase 3 (bullet rhythm) — quick.
4. Phase 5 (word/char footer) — small standalone feature, do after typography lands so it doesn't get lost in an unrelated diff.
5. Typed callouts (`[!note]`) — only if requested, own PR with a remark plugin.
