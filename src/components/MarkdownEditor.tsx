import { useEffect, useRef } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { livePreviewExtension } from "./markdownLivePreview";
import { continueListOnEnter } from "./markdownListContinuation";
import { useStore } from "../stores/useStore";

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
  ".cm-md-heading": {
    fontWeight: "700",
    color: "#ffffff",
  },
  ".cm-md-h1": { fontSize: "1.75em" },
  ".cm-md-h2": { fontSize: "1.35em" },
  ".cm-md-h3": { fontSize: "1.15em" },
  ".cm-md-h4": { fontSize: "1.05em" },
  ".cm-md-h5": { fontSize: "1em" },
  ".cm-md-h6": { fontSize: "0.95em", color: "var(--color-muted)" },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strike": { textDecoration: "line-through", opacity: "0.7" },
  ".cm-md-inline-code": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    backgroundColor: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "3px",
    padding: "0 4px",
    fontSize: "0.9em",
  },
  ".cm-md-task-checkbox": {
    verticalAlign: "middle",
    marginRight: "4px",
    cursor: "pointer",
  },
  ".cm-md-bullet": {
    display: "inline-block",
    width: "1em",
    color: "var(--color-accent)",
    fontWeight: "700",
  },
  ".cm-md-hr": {
    border: "none",
    borderTop: "1px solid var(--color-border)",
    margin: "0.5em 0",
  },
});

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  livePreview?: boolean;
}

export default function MarkdownEditor({ value, onChange, livePreview = false }: MarkdownEditorProps) {
  const tabSize = useStore((s) => s.settings.tabSize);
  const showLineNumbers = useStore((s) => s.settings.showLineNumbers);
  const autoPairBrackets = useStore((s) => s.settings.autoPairBrackets);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastEmittedRef = useRef<string>(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const livePreviewCompartmentRef = useRef(new Compartment());
  const tabSizeCompartmentRef = useRef(new Compartment());
  const lineNumbersCompartmentRef = useRef(new Compartment());
  const bracketsCompartmentRef = useRef(new Compartment());

  // Create the EditorView once; external doc replacement is handled by the effect below
  // so switching tabs doesn't tear down and rebuild the whole editor/cursor state.
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: lastEmittedRef.current,
      extensions: [
        history(),
        Prec.highest(keymap.of([{ key: "Enter", run: continueListOnEnter }])),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        markdown({ extensions: [GFM] }),
        livePreviewCompartmentRef.current.of(livePreview ? livePreviewExtension : []),
        tabSizeCompartmentRef.current.of(indentUnit.of(" ".repeat(tabSize))),
        lineNumbersCompartmentRef.current.of(showLineNumbers ? [lineNumbers()] : []),
        bracketsCompartmentRef.current.of(
          autoPairBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : []
        ),
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

  // Toggle the live-preview decorations via the compartment so switching modes
  // reconfigures the existing view instead of tearing it down (keeps cursor/undo history).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: livePreviewCompartmentRef.current.reconfigure(livePreview ? livePreviewExtension : []),
    });
  }, [livePreview]);

  // Reconfigure editor-affecting settings live, without recreating the view (preserves
  // cursor position, selection, and undo history across a settings change).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: tabSizeCompartmentRef.current.reconfigure(indentUnit.of(" ".repeat(tabSize))),
    });
  }, [tabSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: lineNumbersCompartmentRef.current.reconfigure(showLineNumbers ? [lineNumbers()] : []),
    });
  }, [showLineNumbers]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: bracketsCompartmentRef.current.reconfigure(
        autoPairBrackets ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : []
      ),
    });
  }, [autoPairBrackets]);

  return <div ref={containerRef} className="w-full" />;
}
