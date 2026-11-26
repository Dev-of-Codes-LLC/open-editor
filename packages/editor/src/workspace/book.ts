// A small author workspace: the chapters of a book in reading order, an
// editor for the chapter on screen, a word count, and export.
//
//   const workspace = createBookWorkspace({ mount: element, files });
//   await workspace.ready;
//   await workspace.open("ch-before-light");
//   workspace.moveChapter("ch-open-door", 0);
//   await workspace.save();                       // or Ctrl+S / Cmd+S, or the Save button
//   const { text } = await workspace.exportBook("html");
//   workspace.destroy();
//
// The host owns the files and hands in a FileStore (see ../files.ts). The
// book is a manifest and one document for each chapter (decision 0007).
// Nothing is written until the author saves.

import { bookToHtml, bookToMarkdown } from "../book/export";
import type { BookExport } from "../book/export";
import { moveChapter as moved } from "../book/chapters";
import type { Book, Chapter } from "../book/types";
import { validateBook, validateChapter } from "../book/validate";
import { countWords } from "../book/words";
import type { FileStore } from "../files";
import { createChapterEditor } from "../manuscript/chapter";
import type { ChapterEditor } from "../manuscript/chapter";

export { memoryFiles } from "../files";
export type { FileStore } from "../files";
export type { BookExport } from "../book/export";

export type BookWorkspaceEvent = "open" | "change" | "save" | "move";
export type ExportFormat = "markdown" | "html";

export interface BookWorkspaceOptions {
  /** The element the workspace is built inside. */
  mount: HTMLElement;
  /** Where the book's files come from and go to. */
  files: FileStore;
  /** The path of the manifest in the store. Default: "book.json". */
  manifest?: string;
  /** Turn an image's path in the book into an address the page can load. Default: the path as it is. */
  imageUrl?: (path: string) => string;
  /** Receives an export when the author presses an export button. Default: the browser saves it as a file. */
  onExport?: (format: ExportFormat, result: BookExport) => void;
  /** A chapter to show as soon as the book is read: its id, or "first". Default: none, and the author chooses. */
  open?: string;
}

export interface BookWorkspace {
  /** Resolves when the book is read and its chapters are listed. Rejects when the book cannot be read or is not valid. */
  ready: Promise<void>;
  /** Show a chapter, by its id. Its unsaved text and undo history are kept while the workspace lives. */
  open(id: string): Promise<void>;
  /** Write every changed chapter, then the manifest when the order changed. Rejects when a write fails. */
  save(): Promise<void>;
  /** The manifest now, with any unsaved change of order. */
  book(): Book;
  /** The id of the chapter on screen, or null. */
  current(): string | null;
  /** True when a chapter, or the order of the chapters, differs from what was last read or saved. */
  isDirty(): boolean;
  /** Words in the body text: of the whole book, and of the chapter on screen. Unsaved text counts. */
  wordCount(): { book: number; chapter: number | null };
  /** Move a chapter to a new place in the reading order. `to` counts from 0. Not written until save. */
  moveChapter(id: string, to: number): void;
  /** The whole book as one file, in the current order, with unsaved text included. */
  exportBook(format: ExportFormat): Promise<BookExport>;
  /** Call `handler` with a chapter's id when it is opened, edited, saved or moved. Returns a function that stops it. */
  on(event: BookWorkspaceEvent, handler: (id: string) => void): () => void;
  /** Remove the workspace, every editor in it, and everything it added to the page. Safe to call twice. */
  destroy(): void;
}

interface Loaded {
  /** The chapter now. For an open chapter, what its editor holds. */
  chapter: Chapter;
  /** Set once the chapter has been opened. */
  editor?: ChapterEditor;
  host?: HTMLElement;
  /** What the editor gave back before any edit, as text. A chapter is unsaved when it gives back something else. */
  baseline?: string;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
const asFile = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const plural = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "word" : "words"}`;

export function createBookWorkspace(options: BookWorkspaceOptions): BookWorkspace {
  if (!options || !options.mount) {
    throw new Error("createBookWorkspace needs a mount: the element to build the workspace in.");
  }
  if (!options.files) {
    throw new Error("createBookWorkspace needs files: a FileStore with list, read and write.");
  }
  const store = options.files;
  const manifestPath = options.manifest ?? "book.json";
  const doc = options.mount.ownerDocument;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
    const node = doc.createElement(tag);
    node.className = className;
    return node;
  };
  const root = el("div", "oe oe-workspace oe-book");
  root.setAttribute("role", "group");
  const nav = el("nav", "oe-chapters");
  nav.setAttribute("aria-label", "Chapters");
  const list = doc.createElement("ol");
  nav.append(list);
  const main = el("div", "oe-workspace-main");
  const actions = el("div", "oe-actions");
  const pane = el("div", "oe-workspace-pane");
  const status = el("p", "oe-status");
  status.setAttribute("role", "status");
  const counts = el("p", "oe-counts");
  main.append(actions, pane, status, counts);
  root.append(nav, main);

  const action = (text: string, run: () => void) => {
    const button = el("button", "oe-action");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", run);
    actions.append(button);
    return button;
  };

  const handlers: Record<BookWorkspaceEvent, Set<(id: string) => void>> = {
    open: new Set(),
    change: new Set(),
    save: new Set(),
    move: new Set(),
  };
  const emit = (event: BookWorkspaceEvent, id: string) => {
    for (const handler of [...handlers[event]]) handler(id);
  };

  let manifest: Book | null = null;
  let savedOrder = "";
  const loaded = new Map<string, Loaded>();
  let shown: string | null = null;
  let note: string | null = null; // a save in flight, or the last failure
  let listed = ""; // what the chapter list last showed
  let destroyed = false;

  const orderOf = (book: Book) => book.chapters.map((entry) => entry.id).join(" ");
  const orderChanged = () => manifest !== null && orderOf(manifest) !== savedOrder;
  const chapterChanged = (id: string) => {
    const item = loaded.get(id);
    return item?.baseline !== undefined && JSON.stringify(item.chapter) !== item.baseline;
  };
  const dirty = () => orderChanged() || [...loaded.keys()].some(chapterChanged);
  const titleOf = (id: string) => manifest?.chapters.find((entry) => entry.id === id)?.title ?? id;

  function wordCount(): { book: number; chapter: number | null } {
    if (!manifest) return { book: 0, chapter: null };
    const language = manifest.language;
    let book = 0;
    for (const entry of manifest.chapters) {
      const item = loaded.get(entry.id);
      if (item) book += countWords(item.chapter, language);
    }
    const here = shown === null ? undefined : loaded.get(shown);
    return { book, chapter: here ? countWords(here.chapter, language) : null };
  }

  function refresh(): void {
    if (!manifest) {
      status.textContent = note ?? "Reading the book";
      counts.textContent = "";
      return;
    }
    // The list is rebuilt in the manifest's order, so a move shows at once.
    const items: HTMLElement[] = [];
    manifest.chapters.forEach((entry, n) => {
      const item = doc.createElement("li");
      const open = el("button", "oe-file");
      open.type = "button";
      open.textContent = entry.title;
      const unsaved = chapterChanged(entry.id);
      open.classList.toggle("oe-unsaved", unsaved);
      open.setAttribute("aria-label", unsaved ? `${entry.title}, unsaved changes` : entry.title);
      if (entry.id === shown) open.setAttribute("aria-current", "true");
      open.dataset.chapter = entry.id;
      open.addEventListener("click", () => {
        void show(entry.id);
      });
      const up = el("button", "oe-move");
      up.type = "button";
      up.textContent = "↑";
      up.setAttribute("aria-label", `Move "${entry.title}" up`);
      up.disabled = n === 0;
      up.addEventListener("click", () => move(entry.id, n - 1, "up"));
      const down = el("button", "oe-move");
      down.type = "button";
      down.textContent = "↓";
      down.setAttribute("aria-label", `Move "${entry.title}" down`);
      down.disabled = n === manifest!.chapters.length - 1;
      down.addEventListener("click", () => move(entry.id, n + 1, "down"));
      item.append(open, up, down);
      items.push(item);
    });
    // Rebuild the list only when what it shows has changed, not on every key.
    const signature = manifest.chapters.map((entry) => `${entry.id}:${chapterChanged(entry.id)}`).join(" ") + ` @${shown}`;
    if (signature !== listed) {
      listed = signature;
      list.replaceChildren(...items);
    }

    const state = note ?? (dirty() ? "unsaved changes" : "saved");
    status.textContent = shown === null ? `${manifest.title}: ${state}` : `${titleOf(shown)}: ${state}`;
    const words = wordCount();
    counts.textContent =
      words.chapter === null
        ? `${plural(words.book)} in the book`
        : `${plural(words.chapter)} in this chapter, ${plural(words.book)} in the book`;
    save.disabled = !dirty();
  }

  async function show(id: string, takeFocus = true): Promise<void> {
    if (destroyed || !manifest) return;
    const item = loaded.get(id);
    if (!item) throw new Error(`No chapter with the id "${id}".`);
    if (!item.editor) {
      const host = el("div", "oe-workspace-file");
      pane.append(host);
      const editor = createChapterEditor({ mount: host, chapter: item.chapter, label: titleOf(id), imageUrl: options.imageUrl });
      item.editor = editor;
      item.host = host;
      // What the editor gives back for the untouched file is the baseline, so opening a chapter never marks it unsaved.
      item.chapter = editor.getChapter();
      item.baseline = JSON.stringify(item.chapter);
      editor.on("change", (chapter) => {
        item.chapter = chapter;
        note = null;
        refresh();
        emit("change", id);
      });
    }
    for (const [other, entry] of loaded) if (entry.host) entry.host.hidden = other !== id;
    shown = id;
    refresh();
    if (takeFocus) item.editor.execute("focus");
    emit("open", id);
  }

  function move(id: string, to: number, direction?: "up" | "down"): void {
    if (destroyed || !manifest) return;
    manifest = moved(manifest, id, to);
    note = null;
    refresh();
    if (direction) {
      // After a click on an arrow, stay on that chapter's row so the author can press again.
      const row = list.querySelector<HTMLElement>(`[data-chapter="${id}"]`)?.closest("li");
      const arrows = [...(row?.querySelectorAll<HTMLButtonElement>(".oe-move") ?? [])];
      const same = direction === "up" ? arrows[0] : arrows[1];
      (same && !same.disabled ? same : arrows.find((b) => !b.disabled))?.focus();
    }
    emit("move", id);
  }

  // Text typed in a Markdown or HTML view is read back a moment after the typing stops.
  // Before a save or an export, read it back now, so nothing typed is left out.
  function sync(): void {
    for (const item of loaded.values()) if (item.editor) item.chapter = item.editor.getChapter();
  }

  async function saveAll(): Promise<void> {
    if (destroyed || !manifest) return;
    sync();
    note = "saving";
    refresh();
    const written: string[] = [];
    try {
      // Chapters first, the manifest last: if a write fails part way, the old order still names files that exist.
      for (const entry of manifest.chapters) {
        const item = loaded.get(entry.id);
        if (!item || !chapterChanged(entry.id)) continue;
        const chapter = item.chapter;
        await store.write(entry.file, asFile(chapter));
        if (destroyed) return;
        item.baseline = JSON.stringify(chapter);
        written.push(entry.id);
      }
      if (orderChanged()) {
        const book = manifest;
        await store.write(manifestPath, asFile(book));
        if (destroyed) return;
        savedOrder = orderOf(book);
      }
    } catch (error) {
      if (!destroyed) {
        note = `not saved. ${reason(error)}`;
        refresh();
      }
      throw error;
    }
    note = null;
    refresh();
    for (const id of written) emit("save", id);
  }

  async function exportBook(format: ExportFormat): Promise<BookExport> {
    if (!manifest) throw new Error("The book is not read yet. Wait for ready.");
    sync();
    const chapters = new Map<string, Chapter>();
    for (const [id, item] of loaded) chapters.set(id, item.chapter);
    if (format === "markdown") return bookToMarkdown(manifest, chapters);
    if (format === "html") return bookToHtml(manifest, chapters);
    throw new Error(`Unknown export format: ${String(format)}. Use "markdown" or "html".`);
  }

  function download(format: ExportFormat, result: BookExport): void {
    const name = `${manifest?.id ?? "book"}.${format === "html" ? "html" : "md"}`;
    const type = format === "html" ? "text/html" : "text/markdown";
    const url = URL.createObjectURL(new Blob([result.text], { type: `${type};charset=utf-8` }));
    const link = doc.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
  const exportFrom = (format: ExportFormat) => () => {
    exportBook(format).then(
      (result) => (options.onExport ?? download)(format, result),
      (error) => {
        note = `not exported. ${reason(error)}`;
        refresh();
      },
    );
  };

  const save = action("Save", () => {
    saveAll().catch(() => {}); // the status line already says why
  });
  action("Export Markdown", exportFrom("markdown"));
  action("Export HTML", exportFrom("html"));

  // Ctrl+S, or Cmd+S on a Mac, saves and keeps the browser's own save dialog away.
  root.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    saveAll().catch(() => {});
  });

  options.mount.append(root);
  refresh();

  const ready = (async () => {
    const book = JSON.parse(await store.read(manifestPath)) as Book;
    const problems = validateBook(book);
    if (problems.length > 0) throw new Error(`${manifestPath} is not a valid book. ${problems[0]}`);
    for (const entry of book.chapters) {
      const chapter = JSON.parse(await store.read(entry.file)) as Chapter;
      const faults = validateChapter(chapter);
      if (faults.length > 0) throw new Error(`${entry.file} is not a valid chapter. ${faults[0]}`);
      if (chapter.id !== entry.id) {
        throw new Error(`${entry.file} holds the chapter "${chapter.id}", and the book lists it as "${entry.id}".`);
      }
      loaded.set(entry.id, { chapter });
    }
    if (destroyed) return;
    manifest = book;
    savedOrder = orderOf(book);
    root.setAttribute("aria-label", book.title);
    refresh();
    // Show a chapter at once when the host asked for one. The page keeps the keyboard where it was.
    const first = options.open === "first" ? book.chapters[0]?.id : options.open;
    if (first !== undefined) await show(first, false);
  })().catch((error) => {
    if (!destroyed) {
      note = `Could not open the book. ${reason(error)}`;
      refresh();
    }
    throw error;
  });
  // A host that does not await `ready` still sees the failure in the status line.
  ready.catch(() => {});

  return {
    ready,
    open: (id) => show(id),
    save: saveAll,
    book: () => {
      if (!manifest) throw new Error("The book is not read yet. Wait for ready.");
      return manifest;
    },
    current: () => shown,
    isDirty: dirty,
    wordCount,
    moveChapter: (id, to) => move(id, to),
    exportBook,
    on(event, handler) {
      const set = handlers[event];
      if (!set) throw new Error(`Unknown event: ${String(event)}`);
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const set of Object.values(handlers)) set.clear();
      for (const item of loaded.values()) item.editor?.destroy();
      loaded.clear();
      root.remove();
    },
  };
}
