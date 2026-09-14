import type { Plugin } from "unified";
import type { Root, Text } from "mdast";
import { visit } from "unist-util-visit";

const HIGHLIGHT_RE = /==([^=]+)==/g;

const remarkHighlight: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node: Text, index, parent) => {
    if (index === undefined || !parent) return;
    const value = node.value;
    HIGHLIGHT_RE.lastIndex = 0;
    if (!HIGHLIGHT_RE.test(value)) return;
    HIGHLIGHT_RE.lastIndex = 0;

    const newNodes: unknown[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HIGHLIGHT_RE.exec(value))) {
      if (match.index > lastIndex) {
        newNodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
      }
      newNodes.push({ type: "highlight", children: [{ type: "text", value: match[1] }] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      newNodes.push({ type: "text", value: value.slice(lastIndex) });
    }

    (parent.children as unknown[]).splice(index, 1, ...newNodes);
    return index + newNodes.length;
  });
};

export const remarkHighlightRehypeHandlers = {
  highlight(state: any, node: any) {
    return {
      type: "element",
      tagName: "mark",
      properties: {},
      children: state.all(node),
    };
  },
};

export default remarkHighlight;
