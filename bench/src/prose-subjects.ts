// The three manuscript subjects. Each gets the same 20,000-word chapter and
// the same features: paragraphs, headings, bold, italic, lists and undo history.
//
//   tiptap       Tiptap's open-source packages alone, with the extensions our chapter editor uses
//   open-editor  our chapter editor: createChapterEditor, with its toolbar and its valid-chapter step
//   lexical      Lexical with its rich-text, list and history packages

import { MARKER, chapterOf } from "./fixtures";
import type { FixtureName } from "./fixtures";
import type { Subject } from "./probe";

// Put the caret at the end of the marker paragraph through the page's own
// selection, the same way for every engine: each one reads the selection back.
function caretAtMarker(root: HTMLElement): void {
  const paragraph = [...root.querySelectorAll("p")].find((p) => p.textContent === MARKER);
  if (!paragraph) throw new Error("The marker paragraph is not on the page.");
  paragraph.scrollIntoView({ block: "center" });
  root.focus();
  let node: Node = paragraph;
  while (node.firstChild) node = node.firstChild;
  const selection = getSelection()!;
  selection.collapse(node, node.textContent!.length);
}

export async function tiptap(): Promise<Subject> {
  const { Editor } = await import("@tiptap/core");
  const { Bold } = await import("@tiptap/extension-bold");
  const { Document } = await import("@tiptap/extension-document");
  const { HardBreak } = await import("@tiptap/extension-hard-break");
  const { Heading } = await import("@tiptap/extension-heading");
  const { Italic } = await import("@tiptap/extension-italic");
  const { BulletList, ListItem, OrderedList } = await import("@tiptap/extension-list");
  const { Paragraph } = await import("@tiptap/extension-paragraph");
  const { Text } = await import("@tiptap/extension-text");
  const { UndoRedo } = await import("@tiptap/extensions");
  let editor: InstanceType<typeof Editor>;
  return {
    mount(host, fixture: FixtureName) {
      editor = new Editor({
        element: host,
        extensions: [Document, Paragraph, Text, HardBreak, Heading.configure({ levels: [1, 2, 3] }), Bold, Italic, BulletList, OrderedList, ListItem, UndoRedo],
        content: { type: "doc", content: chapterOf(fixture).blocks },
      });
    },
    placeCaret: () => caretAtMarker(editor.view.dom as HTMLElement),
    length: () => editor.state.doc.textContent.length,
  };
}

export async function openEditorChapter(): Promise<Subject> {
  const { createChapterEditor } = await import("@devofcodes/editor/chapter");
  let host: HTMLElement;
  let length = 0;
  const lengthOf = (chapter: { content: any[] }) =>
    chapter.content.reduce((sum, block) => sum + (block.content ?? []).reduce((n: number, node: any) => n + (node.text?.length ?? 0), 0), 0);
  return {
    mount(mount, fixture: FixtureName) {
      host = mount;
      const chapter = { format: "open-editor.chapter" as const, version: 0 as const, id: "ch-bench", content: chapterOf(fixture).blocks };
      const editor = createChapterEditor({ mount, chapter });
      // A real host listens for change. The length is all this one keeps.
      editor.on("change", (now) => (length = lengthOf(now)));
      length = lengthOf(editor.getChapter());
    },
    placeCaret: () => caretAtMarker(host.querySelector(".oe-content") as HTMLElement),
    length: () => length,
  };
}

export async function lexical(): Promise<Subject> {
  const { $createParagraphNode, $createTextNode, $getRoot, createEditor } = await import("lexical");
  const { HeadingNode, QuoteNode, $createHeadingNode, registerRichText } = await import("@lexical/rich-text");
  const { createEmptyHistoryState, registerHistory } = await import("@lexical/history");
  const { ListItemNode, ListNode } = await import("@lexical/list");
  let root: HTMLElement;
  let editor: ReturnType<typeof createEditor>;
  return {
    mount(host, fixture: FixtureName) {
      root = document.createElement("div");
      root.contentEditable = "true";
      root.setAttribute("role", "textbox");
      host.append(root);
      editor = createEditor({ namespace: "bench", nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode], onError: (error) => { throw error; } });
      registerRichText(editor);
      registerHistory(editor, createEmptyHistoryState(), 300);
      editor.setRootElement(root);
      const { blocks } = chapterOf(fixture);
      editor.update(
        () => {
          const top = $getRoot();
          top.clear();
          for (const block of blocks) {
            const node = block.type === "heading" ? $createHeadingNode("h1") : $createParagraphNode();
            for (const part of block.content) {
              const text = $createTextNode(part.text);
              for (const mark of part.marks ?? []) text.toggleFormat(mark.type);
              node.append(text);
            }
            top.append(node);
          }
        },
        { discrete: true },
      );
    },
    placeCaret: () => caretAtMarker(root),
    length: () => editor.getEditorState().read(() => $getRoot().getTextContentSize()),
  };
}
