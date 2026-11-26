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
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { Code } from "@tiptap/extension-code";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { Highlight } from "@tiptap/extension-highlight";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { UndoRedo } from "@tiptap/extensions";
import { DOMParser as PMParser } from "@tiptap/pm/model";
import { chapterToHtmlSource, chapterToMarkdownSource, keepBlockIds } from "../book/export";
import { createEditor as createCodeEditor } from "../code/index";
import type { CodeEditor } from "../code/index";
import { isRelativePath } from "../book/validate";
import { markdownToHtml, prepareHtml } from "./source";
import { SIMPLE_MARKS } from "../book/types";
import type { Chapter, Footnote, SimpleMark } from "../book/types";
import { fromChapter, toChapter } from "./editor-json";
import { createStyleMenu } from "./style-menu";
import type { StyleGroup, StyleItem } from "./style-menu";

export { fromChapter, toChapter } from "./editor-json";
export { shortcutText } from "./style-menu";

export type ChapterCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "highlight"
  | "code"
  | "superscript"
  | "subscript"
  | "paragraph"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "copyFormatting"
  | "pasteFormatting"
  | "clearFormatting"
  | "undo"
  | "redo"
  | "focus";
/** The three ways to see and edit a chapter. */
export type ChapterView = "formatted" | "markdown" | "html";

export interface ChapterCommandArgs {
  /** For "heading": 1, 2 or 3. Default: 1. The same level again turns the heading back into a paragraph. */
  level?: 1 | 2 | 3;
}

/**
 * Every style the chapter editor offers, with its shortcut. "Mod" is Ctrl on
 * Windows and Linux and Command on a Mac. These are the engine's own default
 * keys, so they are the ones other editors on the same engine use.
 */
export const STYLES: StyleGroup[] = [
  {
    label: "Text",
    items: [
      { id: "bold", label: "Bold", kind: "check", keys: "Mod-b", look: "oe-look-bold" },
      { id: "italic", label: "Italic", kind: "check", keys: "Mod-i", look: "oe-look-italic" },
      { id: "underline", label: "Underline", kind: "check", keys: "Mod-u", look: "oe-look-underline" },
      { id: "strike", label: "Strikethrough", kind: "check", keys: "Mod-Shift-s", look: "oe-look-strike" },
      { id: "highlight", label: "Highlight", kind: "check", keys: "Mod-Shift-h", look: "oe-look-highlight" },
      { id: "code", label: "Code", kind: "check", keys: "Mod-e", look: "oe-look-code" },
      { id: "superscript", label: "Superscript", kind: "check", keys: "Mod-.", look: "oe-look-superscript" },
      { id: "subscript", label: "Subscript", kind: "check", keys: "Mod-,", look: "oe-look-subscript" },
    ],
  },
  {
    label: "Paragraph",
    items: [
      { id: "paragraph", label: "Normal text", kind: "radio", keys: "Mod-Alt-0" },
      { id: "heading1", label: "Heading 1", kind: "radio", keys: "Mod-Alt-1", look: "oe-look-h1" },
      { id: "heading2", label: "Heading 2", kind: "radio", keys: "Mod-Alt-2", look: "oe-look-h2" },
      { id: "heading3", label: "Heading 3", kind: "radio", keys: "Mod-Alt-3", look: "oe-look-h3" },
      { id: "bulletList", label: "Bullet list", kind: "radio", keys: "Mod-Shift-8" },
      { id: "orderedList", label: "Numbered list", kind: "radio", keys: "Mod-Shift-7" },
      { id: "blockquote", label: "Block quote", kind: "radio", keys: "Mod-Shift-b" },
    ],
  },
  {
    label: "Formatting",
    items: [
      // The keys other editors use for this are taken by the browser (its developer tools), so these add Alt.
      { id: "copyFormatting", label: "Copy formatting", kind: "action", keys: "Mod-Alt-c" },
      { id: "pasteFormatting", label: "Paste formatting", kind: "action", keys: "Mod-Alt-v" },
      { id: "clearFormatting", label: "Clear formatting", kind: "action", keys: "Mod-\\" },
    ],
  },
];

// The text styles last copied with "Copy formatting". One for the page, not one for each editor,
// so a style copied in one chapter can be pasted in another. It never leaves the page: this is
// not the system clipboard, and copying text with Ctrl+C does not touch it.
let copiedFormatting: SimpleMark[] | null = null;

/** The text styles "Paste formatting" would apply now, or null when nothing has been copied. */
export function copiedTextStyles(): SimpleMark[] | null {
  return copiedFormatting === null ? null : [...copiedFormatting];
}

/** Forget what "Copy formatting" copied. */
export function forgetCopiedFormatting(): void {
  copiedFormatting = null;
}

export interface ChapterEditorOptions {
  /** The element the editor is built inside. */
  mount: HTMLElement;
  /** The chapter to edit. */
  chapter: Chapter;
  /** The accessible name of the editor, for a screen reader. Default: "Chapter". */
  label?: string;
  /** Show the Style menu above the text. Default: true. The shortcuts work either way. */
  toolbar?: boolean;
  /** Which keys the Style menu shows: "mac" or "windows". Default: what the browser says it runs on. */
  shortcuts?: "mac" | "windows";
  /** The view to start in. Default: "formatted". */
  view?: ChapterView;
  /** Turn an image's path in the book into an address the page can load. Default: the path as it is. */
  imageUrl?: (path: string) => string;
}

export interface ChapterEditor {
  /** Call `handler` with the chapter after each edit. Returns a function that stops it. */
  on(event: "change", handler: (chapter: Chapter) => void): () => void;
  /** Run a command. Returns false when it could not apply. An unknown command is an error. */
  execute(command: ChapterCommand, args?: ChapterCommandArgs): boolean;
  /** The chapter now, as a valid chapter document. Anything typed in a source view is read back first. */
  getChapter(): Chapter;
  /** The view on screen. */
  view(): ChapterView;
  /** Show the chapter formatted, as Markdown source or as HTML source. All three edit the same chapter. */
  setView(view: ChapterView): void;
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
        types: ["paragraph", "heading", "bulletList", "orderedList", "blockquote"],
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

// Take every text style off the selection and turn its blocks back into plain paragraphs.
const ClearFormatting = Extension.create({
  name: "clearFormatting",
  addKeyboardShortcuts() {
    return { "Mod-\\": () => this.editor.chain().unsetAllMarks().clearNodes().run() };
  },
});

/** Copy the text styles at the selection: of its first character, or of the caret when nothing is selected. */
function copyFormatting(editor: Editor): boolean {
  const { selection, storedMarks, doc } = editor.state;
  let marks = storedMarks ?? selection.$from.marks();
  if (!selection.empty) {
    // The styles of the first piece of text in the selection, as a person reads it.
    let found = false;
    doc.nodesBetween(selection.from, selection.to, (node) => {
      if (found || !node.isText) return !found;
      marks = node.marks;
      found = true;
      return false;
    });
  }
  copiedFormatting = SIMPLE_MARKS.filter((name) => marks.some((mark) => mark.type.name === name));
  return true;
}

/** Give the selection exactly the copied text styles. With nothing selected, the next typing gets them. */
function pasteFormatting(editor: Editor): boolean {
  const copied = copiedFormatting;
  if (copied === null) return false;
  return editor
    .chain()
    .command(({ tr, state }) => {
      const types = SIMPLE_MARKS.map((name) => state.schema.marks[name]).filter(Boolean);
      const wanted = copied.map((name) => state.schema.marks[name]).filter(Boolean);
      const { from, to, empty, $from } = state.selection;
      if (empty) {
        // Keep a link the caret sits in; replace every text style.
        const kept = (state.storedMarks ?? $from.marks()).filter((mark) => !types.includes(mark.type));
        tr.setStoredMarks([...kept, ...wanted.map((type) => type.create())]);
        return true;
      }
      for (const type of types) tr.removeMark(from, to, type);
      for (const type of wanted) tr.addMark(from, to, type.create());
      return true;
    })
    .run();
}

const FormatPainter = Extension.create({
  name: "formatPainter",
  addKeyboardShortcuts() {
    return {
      "Mod-Alt-c": () => copyFormatting(this.editor),
      "Mod-Alt-v": () => pasteFormatting(this.editor),
    };
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
  // Ahead of the superscript style, which would otherwise take every <sup>.
  priority: 1000,
  parseHTML() {
    return [{ tag: "sup[data-footnote]", priority: 100 }];
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
      const text = (value: string | null | undefined) => (value && value.trim() !== "" ? value : null);
      return [
        {
          // A figure with an image in it. data-src is the path in the book; the img's own src may be an address made for the page.
          tag: "figure",
          getAttrs: (element: HTMLElement) => {
            const image = element.querySelector("img");
            const src = element.getAttribute("data-src") ?? image?.getAttribute("src");
            // An image must be a file of the book. One from the web is not taken in, so it is never asked for.
            if (!image || !isRelativePath(src)) return false;
            return { src, alt: image.getAttribute("alt") ?? "", caption: text(element.querySelector("figcaption")?.textContent), id: element.getAttribute("data-block-id") };
          },
        },
        {
          // A bare image, as Markdown writes it. Its title is the caption.
          tag: "img[src]",
          getAttrs: (element: HTMLElement) =>
            isRelativePath(element.getAttribute("src"))
              ? { src: element.getAttribute("src"), alt: element.getAttribute("alt") ?? "", caption: text(element.getAttribute("title")), id: element.getAttribute("data-block-id") }
              : false,
        },
      ];
    },
    renderHTML({ node }) {
      const image = ["img", { src: imageUrl(String(node.attrs.src)), alt: String(node.attrs.alt ?? "") }];
      const figure = { class: "oe-image", "data-src": String(node.attrs.src) };
      return node.attrs.caption ? ["figure", figure, image, ["figcaption", {}, String(node.attrs.caption)]] : ["figure", figure, image];
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
      Underline,
      Strike,
      Highlight,
      Code,
      // One or the other: setting one takes the other off.
      Superscript.extend({ excludes: "subscript" }),
      Subscript.extend({ excludes: "superscript" }),
      // Paragraphs only inside a quote, as in the format.
      Blockquote.extend({ content: "paragraph+" }),
      ClearFormatting,
      FormatPainter,
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
    onUpdate: () => emit(),
  });

  // Tell the page, and the host, that the chapter changed.
  function emit(): void {
    const chapter = read();
    showNotes(chapter);
    for (const handler of [...handlers]) handler(chapter);
  }

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
    // In a source view the notes are in the source, so the list under the text would say them twice.
    notesList.hidden = items.length === 0 || view !== "formatted";
  }

  // Give the text the keyboard at once. The engine's own focus command waits a frame, and in that
  // frame a key lands in the wrong place, or the late focus takes the keyboard back from where
  // the person has gone next.
  const focusNow = () => {
    if (!editor.view.hasFocus()) editor.view.focus();
  };

  function execute(command: ChapterCommand, args: ChapterCommandArgs = {}): boolean {
    if (destroyed) return false;
    focusNow();
    const chain = editor.chain();
    switch (command) {
      case "bold":
        return chain.toggleBold().run();
      case "italic":
        return chain.toggleItalic().run();
      case "underline":
        return chain.toggleUnderline().run();
      case "strike":
        return chain.toggleStrike().run();
      case "highlight":
        return chain.toggleHighlight().run();
      case "code":
        return chain.toggleCode().run();
      case "superscript":
        return chain.toggleSuperscript().run();
      case "subscript":
        return chain.toggleSubscript().run();
      case "paragraph":
        return chain.clearNodes().run();
      case "heading":
        return chain.toggleHeading({ level: args.level ?? 1 }).run();
      case "bulletList":
        return chain.toggleBulletList().run();
      case "orderedList":
        return chain.toggleOrderedList().run();
      case "blockquote":
        return chain.toggleBlockquote().run();
      case "copyFormatting":
        chain.run();
        return copyFormatting(editor);
      case "pasteFormatting":
        chain.run();
        return pasteFormatting(editor);
      case "clearFormatting":
        return chain.unsetAllMarks().clearNodes().run();
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
    const heading = (item: StyleItem) => (/^heading[123]$/.test(item.id) ? (Number(item.id.slice(-1)) as 1 | 2 | 3) : null);
    const isActive = (item: StyleItem): boolean => {
      const level = heading(item);
      if (level) return editor.isActive("heading", { level });
      if (item.id === "paragraph") return !["heading", "bulletList", "orderedList", "blockquote"].some((name) => editor.isActive(name));
      return editor.isActive(item.id);
    };
    const run = (item: StyleItem): void => {
      if (item.kind !== "radio") return void execute(item.id as ChapterCommand);
      // A paragraph style is one of several. Choosing the one that is already set changes nothing.
      if (isActive(item)) return void execute("focus");
      // Text styles switched on at an empty caret, and not typed with yet, must outlive the change.
      const pending = editor.state.storedMarks;
      focusNow();
      let chain = editor.chain().clearNodes();
      const level = heading(item);
      if (level) chain = chain.setHeading({ level });
      else if (item.id === "bulletList") chain = chain.toggleBulletList();
      else if (item.id === "orderedList") chain = chain.toggleOrderedList();
      else if (item.id === "blockquote") chain = chain.toggleBlockquote();
      chain
        .command(({ tr }) => {
          if (pending) tr.setStoredMarks(pending);
          return true;
        })
        .run();
    };
    const menu = createStyleMenu(doc, {
      groups: STYLES,
      apple: options.shortcuts === undefined ? undefined : options.shortcuts === "mac",
      run,
      isActive,
      // Nothing to paste until something has been copied.
      isEnabled: (item) => item.id !== "pasteFormatting" || copiedFormatting !== null,
      focusText: () => void execute("focus"),
    });
    bar.append(menu.element);
    root.append(bar);
    refresh = menu.refresh;
    editor.on("transaction", refresh);
    refresh();
  }

  // --- The three views: formatted, Markdown and HTML ------------------------------
  // All three edit the one chapter. The formatted view is the engine. The other two show the
  // chapter as source text in a code editor; what is typed there is read back into the chapter
  // a moment after the typing stops, and at once when the view changes or the host asks.
  const sourceHost = doc.createElement("div");
  sourceHost.className = "oe-source";
  sourceHost.hidden = true;
  let view: ChapterView = "formatted";
  let source: CodeEditor | null = null;
  let waiting: ReturnType<typeof setTimeout> | null = null;
  const name = options.label ?? "Chapter";

  /** Read source text back into the chapter. */
  function readSource(text: string, kind: "markdown" | "html"): void {
    const before = read();
    const prepared = prepareHtml(kind === "markdown" ? markdownToHtml(text) : text, doc);
    const parser = PMParser.fromSchema(editor.schema);
    const notes: Record<string, Footnote> = {};
    for (const [noteId, element] of prepared.notes) {
      // A note is paragraphs only, with no ids and no calls of its own: toChapter with no notes gives exactly that.
      const paragraphs = toChapter("note", parser.parse(element).toJSON(), {})
        .content.filter((block) => block.type === "paragraph")
        .map((block) => (block.content ? { type: "paragraph" as const, content: block.content } : { type: "paragraph" as const }));
      if (paragraphs.length > 0) notes[noteId] = { content: paragraphs };
    }
    footnotes = notes;
    editor.commands.setContent(prepared.body.innerHTML, { emitUpdate: false });
    if (kind === "markdown") {
      // Markdown has no place for a block's id. Unchanged blocks get theirs back.
      const kept = keepBlockIds(before, read());
      if (JSON.stringify(kept) !== JSON.stringify(read())) editor.commands.setContent(fromChapter(kept), { emitUpdate: false });
    }
    refresh();
    emit();
  }

  /** Read back anything typed in a source view that has not been read yet. */
  function flush(): void {
    if (waiting === null) return;
    clearTimeout(waiting);
    waiting = null;
    if (source && view !== "formatted") readSource(source.getDocument(), view);
  }

  const sourceOf = (kind: "markdown" | "html") => (kind === "markdown" ? chapterToMarkdownSource(read()) : chapterToHtmlSource(read()));

  let showView = () => {};
  function setView(next: ChapterView, takeFocus = true): void {
    if (destroyed || next === view) return;
    flush();
    view = next;
    if (next !== "formatted") {
      const text = sourceOf(next);
      if (source) source.setDocument(text);
      else {
        source = createCodeEditor({ mount: sourceHost, document: text, label: `${name}, source`, wrapLines: true });
        source.on("change", () => {
          if (waiting !== null) clearTimeout(waiting);
          waiting = setTimeout(flush, 250);
        });
      }
    }
    surface.hidden = next !== "formatted";
    sourceHost.hidden = next === "formatted";
    showNotes(read());
    showView();
    if (!takeFocus) return;
    if (next === "formatted") focusNow();
    else source?.execute("focus");
  }

  const bar = root.querySelector<HTMLElement>(".oe-toolbar");
  if (bar) {
    const switcher = doc.createElement("div");
    switcher.className = "oe-views";
    switcher.setAttribute("role", "radiogroup");
    switcher.setAttribute("aria-label", "View");
    const views: [ChapterView, string][] = [["formatted", "Formatted"], ["markdown", "Markdown"], ["html", "HTML"]];
    const buttons = views.map(([kind, label]) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "oe-button oe-view";
      button.setAttribute("role", "radio");
      button.textContent = label;
      button.addEventListener("click", () => setView(kind));
      return button;
    });
    // One stop for the Tab key; the arrow keys move between the three and switch at once.
    switcher.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const at = (views.findIndex(([kind]) => kind === view) + step + views.length) % views.length;
      setView(views[at][0], false);
      buttons[at].focus();
    });
    switcher.append(...buttons);
    bar.append(switcher);
    const styleButton = bar.querySelector<HTMLButtonElement>(".oe-style-button");
    showView = () => {
      views.forEach(([kind], n) => {
        buttons[n].setAttribute("aria-checked", String(kind === view));
        buttons[n].tabIndex = kind === view ? 0 : -1;
      });
      // Styles belong to the formatted view. In a source view the style is typed.
      if (styleButton) styleButton.disabled = view !== "formatted";
      root.dataset.view = view;
    };
    showView();
  }

  root.append(surface, sourceHost, notesList);
  showNotes(read());
  options.mount.append(root);
  if (options.view && options.view !== "formatted") setView(options.view, false);

  return {
    on(event, handler) {
      if (event !== "change") throw new Error(`Unknown event: ${String(event)}`);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    execute,
    getChapter() {
      flush();
      return read();
    },
    view: () => view,
    setView: (next) => setView(next),
    setChapter(chapter) {
      if (destroyed) return;
      if (waiting !== null) clearTimeout(waiting);
      waiting = null;
      id = chapter.id;
      footnotes = { ...(chapter.footnotes ?? {}) };
      editor.commands.setContent(fromChapter(chapter), { emitUpdate: false });
      showNotes(read());
      refresh();
      if (source && view !== "formatted") source.setDocument(sourceOf(view));
    },
    destroy() {
      if (destroyed) return;
      if (waiting !== null) clearTimeout(waiting);
      waiting = null;
      source?.destroy();
      source = null;
      destroyed = true;
      handlers.clear();
      editor.destroy();
      root.remove();
    },
  };
}
