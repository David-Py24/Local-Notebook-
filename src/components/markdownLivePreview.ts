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
