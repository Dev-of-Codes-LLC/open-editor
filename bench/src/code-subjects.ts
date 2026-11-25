// The three code subjects. Each gets the same text and the same features:
// line numbers, JavaScript colours, undo history, bracket matching and search.
//
//   codemirror   CodeMirror 6 alone, with the extensions our code profile uses
//   open-editor  our code profile: createEditor({ profile: "code" })
//   monaco       Monaco's core editor with its JavaScript colours, find and bracket matching.
//                No TypeScript language service: CodeMirror has none here either.

import { MARKER, codeOf } from "./fixtures";
import type { FixtureName } from "./fixtures";
import type { Subject } from "./probe";

const textOf = codeOf;

export async function codemirror(): Promise<Subject> {
  const { defaultKeymap, history, historyKeymap } = await import("@codemirror/commands");
  const { javascript } = await import("@codemirror/lang-javascript");
  const { bracketMatching, defaultHighlightStyle, indentOnInput, syntaxHighlighting } = await import("@codemirror/language");
  const { highlightSelectionMatches, search, searchKeymap } = await import("@codemirror/search");
  const { EditorState } = await import("@codemirror/state");
  const { EditorView, drawSelection, highlightActiveLine, highlightSpecialChars, keymap, lineNumbers, rectangularSelection } = await import("@codemirror/view");
  let view: InstanceType<typeof EditorView>;
  return {
    mount(host, fixture) {
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: textOf(fixture),
          extensions: [
            lineNumbers(),
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
            javascript(),
            EditorView.theme({ ".cm-scroller": { maxHeight: "560px" } }),
          ],
        }),
      });
    },
    placeCaret() {
      const at = view.state.doc.toString().indexOf(MARKER) + MARKER.length;
      view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
      view.focus();
    },
    length: () => view.state.doc.length,
    text: () => view.state.doc.toString(),
  };
}

export async function openEditorCode(): Promise<Subject> {
  const { createEditor } = await import("@devofcodes/editor/code");
  let editor: ReturnType<typeof createEditor>;
  let length = 0;
  return {
    mount(host, fixture) {
      editor = createEditor({ mount: host, document: textOf(fixture), language: "javascript" });
      // A real host listens for change. The length is all this one keeps.
      editor.on("change", (document) => (length = document.length));
      length = editor.getDocument().length;
    },
    placeCaret() {
      // The profile has no caret call. "find" selects the marker; the runner then presses End.
      editor.execute("find", { query: MARKER });
      editor.execute("focus");
    },
    length: () => length,
    text: () => editor.getDocument(),
  };
}

export async function monaco(): Promise<Subject> {
  const api = await import("monaco-editor/editor");
  await import("monaco-editor/languages/definitions/javascript/register");
  await import("monaco-editor/features/find/register");
  await import("monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching");
  const { default: EditorWorker } = await import("monaco-editor/editor/editor.worker?worker");
  (self as any).MonacoEnvironment = { getWorker: () => new EditorWorker() };
  let editor: ReturnType<typeof api.editor.create>;
  return {
    mount(host, fixture) {
      host.style.height = "560px";
      editor = api.editor.create(host, {
        value: textOf(fixture),
        language: "javascript",
        minimap: { enabled: false },
        automaticLayout: false,
        // No suggestions while typing: the CodeMirror subjects have no completion either.
        quickSuggestions: false,
        wordBasedSuggestions: "off",
        suggestOnTriggerCharacters: false,
        // By default Monaco stops drawing a line after 10,000 characters and stops colouring it
        // after 20,000. The default is what a user gets, so it is the main measurement.
        // ?variant=nolimit turns both limits off, so Monaco draws what CodeMirror draws.
        ...(new URLSearchParams(location.search).get("variant") === "nolimit" ? { stopRenderingLineAfter: -1, maxTokenizationLineLength: 1_000_000 } : {}),
      });
    },
    placeCaret() {
      const model = editor.getModel()!;
      const match = model.findMatches(MARKER, false, false, true, null, false)[0];
      const position = { lineNumber: match.range.endLineNumber, column: match.range.endColumn };
      editor.setPosition(position);
      editor.revealPositionInCenter(position);
      editor.focus();
    },
    length: () => editor.getModel()!.getValueLength(),
    text: () => editor.getModel()!.getValue(),
  };
}
