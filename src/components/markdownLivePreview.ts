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

  const hide = (from: number, to: number) => {
    if (to > from) ranges.push(Decoration.replace({}).range(from, to));
  };
  const style = (from: number, to: number, cls: string) => {
    if (to > from) ranges.push(Decoration.mark({ class: cls }).range(from, to));
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
      },
    });
  }

  // RangeSet.of sorts (and validates nesting order) for us — safer than manually driving
  // RangeSetBuilder, which requires the caller to get from/startSide ordering exactly right.
  return RangeSet.of(ranges, true);
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
