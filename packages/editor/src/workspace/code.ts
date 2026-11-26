// A small developer workspace: a list of files and a code editor for each
// file that is open.
//
//   const workspace = createCodeWorkspace({ mount: element, files: memoryFiles({ ... }) });
//   await workspace.ready;
//   await workspace.open("scale.js");
//   await workspace.save();               // or Ctrl+S / Cmd+S in the editor
//   workspace.destroy();
//
// The host owns the files and hands in a FileStore (see ../files.ts). The
// workspace never writes a file on its own: only save() and the save key do.

import { createEditor } from "../code/index";
import type { CodeEditor, CodeLanguage } from "../code/index";
import type { FileStore } from "../files";

export { memoryFiles } from "../files";
export type { FileStore } from "../files";

export type WorkspaceEvent = "open" | "change" | "save";

export interface CodeWorkspaceOptions {
  /** The element the workspace is built inside. */
  mount: HTMLElement;
  /** Where the files come from and go to. */
  files: FileStore;
  /** The accessible name of the workspace. Default: "Workspace". */
  label?: string;
  /** A file to show as soon as the files are listed: its path, or "first". Default: none, and the developer chooses. */
  open?: string;
}

export interface CodeWorkspace {
  /** Resolves when the list of files is on the page. Rejects when the store cannot list them. */
  ready: Promise<void>;
  /** Show a file, reading it the first time. Its unsaved text and undo history are kept while it is open. */
  open(path: string): Promise<void>;
  /** Write a file back through the store: the one on screen, or the one named. Rejects when the write fails. */
  save(path?: string): Promise<void>;
  /** The paths the store listed. */
  files(): string[];
  /** The path of the file on screen, or null. */
  current(): string | null;
  /** True when the file's text differs from what was last read or saved. */
  isDirty(path?: string): boolean;
  /** Call `handler` with a file's path when it is opened, edited or saved. Returns a function that stops it. */
  on(event: WorkspaceEvent, handler: (path: string) => void): () => void;
  /** Remove the workspace, every editor in it, and everything it added to the page. Safe to call twice. */
  destroy(): void;
}

interface OpenFile {
  editor: CodeEditor;
  host: HTMLElement;
  /** The text as last read from, or written to, the store. */
  saved: string;
}

function languageOf(path: string): CodeLanguage {
  if (/\.(js|mjs|cjs|jsx)$/i.test(path)) return "javascript";
  if (/\.(ts|mts|cts|tsx)$/i.test(path)) return "typescript";
  return "plain";
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createCodeWorkspace(options: CodeWorkspaceOptions): CodeWorkspace {
  if (!options || !options.mount) {
    throw new Error("createCodeWorkspace needs a mount: the element to build the workspace in.");
  }
  if (!options.files) {
    throw new Error("createCodeWorkspace needs files: a FileStore with list, read and write.");
  }
  const store = options.files;
  const doc = options.mount.ownerDocument;

  const root = doc.createElement("div");
  root.className = "oe oe-workspace";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", options.label ?? "Workspace");

  const nav = doc.createElement("nav");
  nav.className = "oe-files";
  nav.setAttribute("aria-label", "Files");
  const list = doc.createElement("ul");
  nav.append(list);

  const main = doc.createElement("div");
  main.className = "oe-workspace-main";
  const pane = doc.createElement("div");
  pane.className = "oe-workspace-pane";
  const status = doc.createElement("p");
  status.className = "oe-status";
  status.setAttribute("role", "status");
  main.append(pane, status);
  root.append(nav, main);

  const handlers: Record<WorkspaceEvent, Set<(path: string) => void>> = {
    open: new Set(),
    change: new Set(),
    save: new Set(),
  };
  const emit = (event: WorkspaceEvent, path: string) => {
    for (const handler of [...handlers[event]]) handler(path);
  };

  const buttons = new Map<string, HTMLButtonElement>();
  const opened = new Map<string, OpenFile>();
  let paths: string[] = [];
  let shown: string | null = null;
  let asked = 0; // counts open() calls, so a slow read cannot take the screen from a later one
  let destroyed = false;
  // What the status line says beyond saved or unsaved: a save in flight, or the last failure.
  const notes = new Map<string, string>();

  const dirty = (path: string) => {
    const file = opened.get(path);
    return file !== undefined && file.editor.getDocument() !== file.saved;
  };

  function refresh(): void {
    for (const [path, button] of buttons) {
      const unsaved = dirty(path);
      button.classList.toggle("oe-unsaved", unsaved);
      button.setAttribute("aria-label", unsaved ? `${path}, unsaved changes` : path);
      if (path === shown) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    if (shown === null) status.textContent = notes.get("") ?? "No file open";
    else status.textContent = `${shown}: ${notes.get(shown) ?? (dirty(shown) ? "unsaved changes" : "saved")}`;
  }

  function show(path: string): void {
    for (const [other, file] of opened) file.host.hidden = other !== path;
    shown = path;
    refresh();
  }

  async function open(path: string, takeFocus = true): Promise<void> {
    if (destroyed) return;
    const turn = ++asked;
    if (!opened.has(path)) {
      let text: string;
      try {
        text = await store.read(path);
      } catch (error) {
        if (!destroyed && turn === asked) {
          notes.set(shown ?? "", `could not open ${path}. ${reason(error)}`);
          refresh();
        }
        throw error;
      }
      if (destroyed) return;
      // Two open() calls for the same file can both get here; the first one wins.
      if (!opened.has(path)) {
        const host = doc.createElement("div");
        host.className = "oe-workspace-file";
        host.hidden = true;
        pane.append(host);
        const editor = createEditor({ mount: host, document: text, language: languageOf(path), label: path });
        editor.on("change", () => {
          notes.delete(path);
          refresh();
          emit("change", path);
        });
        opened.set(path, { editor, host, saved: text });
      }
    }
    if (turn !== asked) return;
    notes.delete("");
    show(path);
    if (takeFocus) opened.get(path)?.editor.execute("focus");
    emit("open", path);
  }

  async function save(path: string | null = shown): Promise<void> {
    if (destroyed) return;
    const file = path === null ? undefined : opened.get(path);
    if (path === null || file === undefined) throw new Error("There is no open file to save.");
    const text = file.editor.getDocument();
    notes.set(path, "saving");
    refresh();
    try {
      await store.write(path, text);
    } catch (error) {
      if (!destroyed) {
        notes.set(path, `not saved. ${reason(error)}`);
        refresh();
      }
      throw error;
    }
    if (destroyed) return;
    // What was written is what counts as saved. Keys typed during the write leave the file unsaved.
    file.saved = text;
    notes.delete(path);
    refresh();
    emit("save", path);
  }

  // Ctrl+S, or Cmd+S on a Mac, saves the file on screen and keeps the browser's own save dialog away.
  root.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    if (shown !== null) save().catch(() => {}); // the status line already says why
  });

  options.mount.append(root);
  refresh();

  const ready = store.list().then(
    (found) => {
      if (destroyed) return;
      paths = [...found];
      for (const path of paths) {
        const item = doc.createElement("li");
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "oe-file";
        button.textContent = path;
        button.addEventListener("click", () => {
          open(path).catch(() => {}); // the status line already says why
        });
        buttons.set(path, button);
        item.append(button);
        list.append(item);
      }
      refresh();
      // Show a file at once when the host asked for one. The page keeps the keyboard where it was.
      const first = options.open === "first" ? paths[0] : options.open;
      if (first !== undefined) return open(first, false);
    },
    (error) => {
      if (!destroyed) {
        notes.set("", `Could not list the files. ${reason(error)}`);
        refresh();
      }
      throw error;
    },
  );
  // A host that does not await `ready` still sees the failure in the status line.
  ready.catch(() => {});

  return {
    ready,
    open: (path) => open(path),
    save: (path) => save(path ?? shown),
    files: () => [...paths],
    current: () => shown,
    isDirty: (path) => {
      const target = path ?? shown;
      return target !== null && dirty(target);
    },
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
      for (const file of opened.values()) file.editor.destroy();
      opened.clear();
      buttons.clear();
      root.remove();
    },
  };
}
