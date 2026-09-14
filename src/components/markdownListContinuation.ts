import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// Matches bullet list items (-, *, +) or ordered list items (1., 2., etc.) with optional GFM checkbox
const LIST_ITEM_RE = /^(\s*)([-*+]|(\d+)\.)(\s+)(\[[ xX]\]\s+)?/;

// Detects a short "lead-in" phrase (e.g. "Help, don't sell.") followed by explanatory
// text, so a completed list item can be auto-organized the way outline-style bullets are
// ("**Lead-in.** Rest of the paragraph...") instead of one flat run of text.
const LEAD_IN_RE = /^([^*_\s][^*\n]{1,80}?[.:])(\s+)(\S[\s\S]*)$/;

function autoFormatLeadIn(text: string): string {
  if (text.startsWith("**") || text.startsWith("_") || text.startsWith("*")) return text;
  const match = LEAD_IN_RE.exec(text);
  if (!match) return text;
  const [, lead, space, remainder] = match;
  return `**${lead}**${space}${remainder}`;
}

export function continueListOnEnter(view: EditorView): boolean {
  const { state } = view;
  let handled = false;

  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const match = LIST_ITEM_RE.exec(line.text);

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
    const [, indent, marker, numStr, , taskPart] = match;
    let nextMarker = marker;
    if (numStr) {
      const nextNum = parseInt(numStr, 10) + 1;
      nextMarker = `${nextNum}.`;
    }

    const insert = "\n" + indent + nextMarker + " " + (taskPart ? "[ ] " : "");

    // Only reformat the completed item when the cursor sits at its end — Enter pressed
    // mid-line is a line split, not a "paragraph added" event, so leave it untouched.
    const atLineEnd = range.from === line.to && range.to === line.to;
    const formattedRest = atLineEnd ? autoFormatLeadIn(rest) : rest;

    if (formattedRest !== rest) {
      const restStart = line.from + match[0].length;
      return {
        changes: [
          { from: restStart, to: line.to, insert: formattedRest },
          { from: line.to, to: line.to, insert },
        ],
        range: EditorSelection.cursor(restStart + formattedRest.length + insert.length),
      };
    }

    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });

  if (!handled) return false;

  view.dispatch(tr, { scrollIntoView: true, userEvent: "input" });
  return true;
}
