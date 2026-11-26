// The "code" profile: source text on CodeMirror 6.
//
//   const editor = createEditor({ mount: element, profile: "code", document: "let a = 1;" });
//   editor.on("change", (document) => save(document));
//   editor.execute("find", { query: "a" });
//   editor.destroy();
//
// The document is the source text. Importing this file needs no browser;
// createEditor does.

import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import {
  SearchQuery,
  findNext,
  highlightSelectionMatches,
  replaceAll,
  search,
  searchKeymap,
  setSearchQuery,
} from "@codemirror/search";
import { Annotation, EditorState } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { changeHandlers, checkOptions } from "../contract";
import type { BaseOptions, EditorHandle } from "../contract";
import { detectLineEnding } from "./line-endings";

export { detectLineEnding } from "./line-endings";
export type { LineEnding } from "./line-endings";

export type CodeLanguage = "plain" | "javascript" | "typescript";
export type CodeCommand = "undo" | "redo" | "focus" | "find" | "replaceAll";
export interface CodeCommandArgs {
  /** For "find" and "replaceAll": the text to look for, taken as written. */
  query?: string;
  /** For "replaceAll": the text to put in its place. Default: nothing. */
  replacement?: string;
}

export interface CodeOptions extends BaseOptions {
  profile?: "code";
  /** Syntax colours and indentation. Default: "plain". */
  language?: CodeLanguage;
  /** Show line numbers. Default: true. */
  lineNumbers?: boolean;
  /** Wrap long lines to the width of the editor, as prose wants. Default: false, and long lines scroll sideways. */
  wrapLines?: boolean;
}

export type CodeEditor = EditorHandle<CodeCommand, CodeCommandArgs>;

// Marks a change the host made through setDocument, so "change" stays quiet.
const fromHost = Annotation.define<boolean>();

// The look. A host sets these variables on .oe, or on any element around it:
//   --oe-ink, --oe-muted, --oe-line, --oe-surface, --oe-accent, --oe-code-font
const look = EditorView.theme({
  "&": {
    color: "var(--oe-ink, #1f1b16)",
    backgroundColor: "var(--oe-surface, #fff)",
    border: "1px solid var(--oe-line, #c9c2b4)",
    borderRadius: "6px",
    fontSize: "14px",
  },
  "&.cm-focused": {
    outline: "2px solid var(--oe-accent, #a3401e)",
    outlineOffset: "2px",
  },
  ".cm-scroller": {
    fontFamily: "var(--oe-code-font, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
    lineHeight: "1.5",
    minHeight: "84px",
    maxHeight: "60vh",
  },
  ".cm-gutters": {
    color: "var(--oe-muted, #6b6257)",
    backgroundColor: "transparent",
    borderRight: "1px solid var(--oe-line, #c9c2b4)",
  },
});

function languageOf(language: CodeLanguage | undefined): Extension {
  switch (language ?? "plain") {
    case "plain":
      return [];
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    default:
      throw new Error(`Unknown language: ${String(language)}. Use "plain", "javascript" or "typescript".`);
  }
}

export function createEditor(options: CodeOptions): CodeEditor {
  checkOptions(options, "code");
  const language = languageOf(options.language);

  const doc = options.mount.ownerDocument;
  const root = doc.createElement("div");
  root.className = "oe oe-code";
  const handlers = changeHandlers();
  let lineEnding = detectLineEnding(options.document ?? "");
  let destroyed = false;

  const read = (): string => view.state.doc.sliceString(0, undefined, lineEnding);

  const view: EditorView = new EditorView({
    parent: root,
    state: EditorState.create({
      doc: options.document ?? "",
      extensions: [
        options.lineNumbers === false ? [] : lineNumbers(),
        options.wrapLines ? EditorView.lineWrapping : [],
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        search(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        language,
        look,
        EditorView.contentAttributes.of({ "aria-label": options.label ?? "Code" }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.every((tr) => tr.annotation(fromHost))) return;
          handlers.emit(read());
        }),
      ],
    }),
  });

  function execute(command: CodeCommand, args: CodeCommandArgs = {}): boolean {
    if (destroyed) return false;
    switch (command) {
      case "undo":
        return undo(view);
      case "redo":
        return redo(view);
      case "focus":
        view.focus();
        return true;
      case "find": {
        const query = args.query ?? "";
        if (query === "") return false;
        view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query, literal: true })) });
        return findNext(view);
      }
      case "replaceAll": {
        const query = args.query ?? "";
        if (query === "") return false;
        view.dispatch({
          effects: setSearchQuery.of(
            new SearchQuery({ search: query, replace: args.replacement ?? "", literal: true }),
          ),
        });
        // False when nothing matched. One undo takes every replacement back.
        return replaceAll(view);
      }
      default:
        throw new Error(`Unknown command: ${String(command)}`);
    }
  }

  options.mount.append(root);

  return {
    on: handlers.on,
    execute,
    getDocument: read,
    setDocument(document) {
      if (destroyed) return;
      lineEnding = detectLineEnding(document);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: document },
        annotations: fromHost.of(true),
      });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handlers.clear();
      view.destroy();
      root.remove();
    },
  };
}
