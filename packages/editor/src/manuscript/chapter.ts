// An editor for one chapter document (the manuscript format, version 0), on
// Tiptap's open-source packages and ProseMirror.
//
//   const editor = createChapterEditor({ mount: element, chapter });
//   editor.on("change", (chapter) => keep(chapter));
//   editor.getChapter();          // always passes validateChapter
//   editor.destroy();
//
// It edits paragraphs, headings, bold, italic, links, bullet lists and
// numbered lists. It shows images and footnotes and carries them through
// untouched: an author cannot add or rewrite a footnote or an image here yet.
// Importing this file needs no browser; createChapterEditor does.

import { Editor, Extension, Node } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import type { Chapter, Footnote } from "../book/types";
import { fromChapter, toChapter } from "./editor-json";

export { fromChapter, toChapter } from "./editor-json";

export type ChapterCommand = "bold" | "italic" | "heading" | "bulletList" | "orderedList" | "undo" | "redo" | "focus";
export interface ChapterCommandArgs {
  /** For "heading": 1, 2 or 3. Default: 1. The same level again turns the heading back into a paragraph. */
  level?: 1 | 2 | 3;
}

export interface ChapterEditorOptions {
  /** The element the editor is built inside. */
  mount: HTMLElement;
  /** The chapter to edit. */
  chapter: Chapter;
  /** The accessible name of the editor, for a screen reader. Default: "Chapter". */
  label?: string;
  /** Show the row of formatting buttons. Default: true. */
  toolbar?: boolean;
  /** Turn an image's path in the book into an address the page can load. Default: the path as it is. */
  imageUrl?: (path: string) => string;
}

export interface ChapterEditor {
  /** Call `handler` with the chapter after each edit. Returns a function that stops it. */
  on(event: "change", handler: (chapter: Chapter) => void): () => void;
  /** Run a command. Returns false when it could not apply. An unknown command is an error. */
  execute(command: ChapterCommand, args?: ChapterCommandArgs): boolean;
  /** The chapter now, as a valid chapter document. */
  getChapter(): Chapter;
  /** Replace the chapter. Does not fire "change". */
  setChapter(chapter: Chapter): void;
  /** Remove the editor and everything it added to the page. Safe to call twice. */
  destroy(): void;
}

const isHttp = (href: string) => /^https?:\/\/\S+$/.test(href);

// A block's stable id rides along as an attribute, so comments can hold on to it later.
const BlockId = Extension.create({
  name: "blockId",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "bulletList", "orderedList"],
        attributes: {
          id: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
            renderHTML: (attributes: { id?: string | null }) => (attributes.id ? { "data-block-id": attributes.id } : {}),
          },
        },
      },
    ];
  },
});

// The place a footnote is called. One unit: the caret steps over it, and
// Backspace removes it whole. Its number comes from a CSS counter.
const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-footnote"),
        renderHTML: (attributes: { id?: string | null }) => ({ "data-footnote": attributes.id ?? "" }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["sup", { ...HTMLAttributes, class: "oe-footnote-ref" }];
  },
});

function imageNode(imageUrl: (path: string) => string) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    addAttributes() {
      return {
        id: { default: null, rendered: false },
        src: { default: "", rendered: false },
        alt: { default: "", rendered: false },
        caption: { default: null, rendered: false },
      };
    },
    parseHTML() {
      return [{ tag: "figure.oe-image" }];
    },
    renderHTML({ node }) {
      const image = ["img", { src: imageUrl(String(node.attrs.src)), alt: String(node.attrs.alt ?? "") }];
      return node.attrs.caption
        ? ["figure", { class: "oe-image" }, image, ["figcaption", {}, String(node.attrs.caption)]]
        : ["figure", { class: "oe-image" }, image];
    },
  });
}

export function createChapterEditor(options: ChapterEditorOptions): ChapterEditor {
  if (!options || !options.mount) {
    throw new Error("createChapterEditor needs a mount: the element to build the editor in.");
  }
  if (!options.chapter || !Array.isArray(options.chapter.content)) {
    throw new Error("createChapterEditor needs a chapter: a chapter document with content.");
  }

  const doc = options.mount.ownerDocument;
  const root = doc.createElement("div");
  root.className = "oe oe-manuscript oe-chapter";
  const surface = doc.createElement("div");
  surface.className = "oe-surface";
  const notesList = doc.createElement("ol");
  notesList.className = "oe-footnotes";
  notesList.setAttribute("aria-label", "Footnotes");

  const handlers = new Set<(chapter: Chapter) => void>();
  let id = options.chapter.id;
  // Every note the chapter came with. A note stays here while its call is deleted, so undo can bring both back.
  let footnotes: Record<string, Footnote> = { ...(options.chapter.footnotes ?? {}) };
  let destroyed = false;

  const read = (): Chapter => toChapter(id, editor.getJSON(), footnotes);

  const editor: Editor = new Editor({
    element: surface,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Heading.configure({ levels: [1, 2, 3] }),
      Bold,
      Italic,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https"],
        isAllowedUri: (url) => isHttp(url),
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      BulletList,
      OrderedList,
      // Paragraphs only inside an item: the format has no list inside a list.
      ListItem.extend({ content: "paragraph+" }),
      BlockId,
      FootnoteRef,
      imageNode(options.imageUrl ?? ((path) => path)),
      UndoRedo,
    ],
    content: fromChapter(options.chapter),
    editorProps: {
      attributes: {
        class: "oe-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": options.label ?? "Chapter",
      },
    },
    onUpdate: () => {
      const chapter = read();
      showNotes(chapter);
      for (const handler of [...handlers]) handler(chapter);
    },
  });

  // The notes under the text, in the order the text calls them. Read-only for now.
  function showNotes(chapter: Chapter): void {
    const items: HTMLElement[] = [];
    for (const [, note] of Object.entries(chapter.footnotes ?? {})) {
      const item = doc.createElement("li");
      item.textContent = note.content
        .map((p) => (p.content ?? []).map((n) => (n.type === "text" ? n.text : n.type === "hardBreak" ? " " : "")).join(""))
        .join(" ");
      items.push(item);
    }
    notesList.replaceChildren(...items);
    notesList.hidden = items.length === 0;
  }

  function execute(command: ChapterCommand, args: ChapterCommandArgs = {}): boolean {
    if (destroyed) return false;
    const chain = editor.chain().focus();
    switch (command) {
      case "bold":
        return chain.toggleBold().run();
      case "italic":
        return chain.toggleItalic().run();
      case "heading":
        return chain.toggleHeading({ level: args.level ?? 1 }).run();
      case "bulletList":
        return chain.toggleBulletList().run();
      case "orderedList":
        return chain.toggleOrderedList().run();
      case "undo":
        return chain.undo().run();
      case "redo":
        return chain.redo().run();
      case "focus":
        return chain.run();
      default:
        throw new Error(`Unknown command: ${String(command)}`);
    }
  }

  let refresh = () => {};
  if (options.toolbar !== false) {
    const bar = doc.createElement("div");
    bar.className = "oe-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Formatting");
    const button = (text: string, name: string, title: string, run: () => void, active: () => boolean) => {
      const el = doc.createElement("button");
      el.type = "button";
      el.className = `oe-button oe-${name}`;
      el.textContent = text;
      el.title = title;
      el.setAttribute("aria-label", title);
      el.setAttribute("aria-pressed", "false");
      // Keep the selection in the text when a button is pressed.
      el.addEventListener("mousedown", (event) => event.preventDefault());
      el.addEventListener("click", run);
      return { el, active };
    };
    const buttons = [
      button("B", "bold", "Bold", () => execute("bold"), () => editor.isActive("bold")),
      button("I", "italic", "Italic", () => execute("italic"), () => editor.isActive("italic")),
      button("Heading", "heading", "Heading", () => execute("heading"), () => editor.isActive("heading", { level: 1 })),
      button("List", "list", "Bullet list", () => execute("bulletList"), () => editor.isActive("bulletList")),
      button("1. List", "numbered", "Numbered list", () => execute("orderedList"), () => editor.isActive("orderedList")),
    ];
    bar.append(...buttons.map((b) => b.el));
    root.append(bar);
    refresh = () => {
      for (const b of buttons) b.el.setAttribute("aria-pressed", String(b.active()));
    };
    editor.on("transaction", refresh);
    refresh();
  }

  root.append(surface, notesList);
  showNotes(read());
  options.mount.append(root);

  return {
    on(event, handler) {
      if (event !== "change") throw new Error(`Unknown event: ${String(event)}`);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    execute,
    getChapter: read,
    setChapter(chapter) {
      if (destroyed) return;
      id = chapter.id;
      footnotes = { ...(chapter.footnotes ?? {}) };
      editor.commands.setContent(fromChapter(chapter), { emitUpdate: false });
      showNotes(read());
      refresh();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handlers.clear();
      editor.destroy();
      root.remove();
    },
  };
}
