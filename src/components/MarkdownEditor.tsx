import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

const editorTheme = EditorView.theme({
  "&": {
    color: "var(--color-text)",
    backgroundColor: "transparent",
  },
  ".cm-content": {
    caretColor: "var(--color-text)",
    fontFamily: "inherit",
    fontSize: "inherit",
    padding: "0",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.75",
    overflow: "visible",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--color-accent) 35%, transparent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--color-text)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--color-muted)",
    border: "none",
  },
});

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastEmittedRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Create the EditorView once; external doc replacement is handled by the effect below
  // so switching tabs doesn't tear down and rebuild the whole editor/cursor state.
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: lastEmittedRef.current,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        editorTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const text = update.state.doc.toString();
            lastEmittedRef.current = text;
            onChangeRef.current(text);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. switching tabs) without fighting local typing —
  // only replace the doc when the incoming value didn't originate from our own onChange.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (value === lastEmittedRef.current) return;

    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
    lastEmittedRef.current = value;
  }, [value]);

  return <div ref={containerRef} className="w-full" />;
}
