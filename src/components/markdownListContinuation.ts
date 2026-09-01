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
