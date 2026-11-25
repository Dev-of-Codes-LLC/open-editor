// The part of the API that every profile shares.
//
//   const editor = createEditor({ mount: element, profile: "code", document: "let a = 1;" });
//   const stop = editor.on("change", (document) => save(document));
//   editor.execute("undo");
//   editor.destroy();
//
// A document is always a string: source text for "code", a small Markdown
// subset for "manuscript". Each profile names its own commands.

export type Profile = "code" | "manuscript";

export interface BaseOptions {
  /** The element the editor is built inside. */
  mount: HTMLElement;
  /** The starting document. */
  document?: string;
  /** The accessible name of the editor, for a screen reader. */
  label?: string;
  /** Reserved. No profile takes extensions yet; passing any is an error. */
  extensions?: unknown[];
  /** Reserved. No profile has a storage adapter yet; passing one is an error. */
  storage?: unknown;
}

export interface EditorHandle<Command extends string, Args> {
  /** Call `handler` with the new document after each edit. Returns a function that stops it. */
  on(event: "change", handler: (document: string) => void): () => void;
  /** Run a command. Returns false when it could not apply. An unknown command is an error. */
  execute(command: Command, args?: Args): boolean;
  /** The document now. */
  getDocument(): string;
  /** Replace the document. Does not fire "change". */
  setDocument(document: string): void;
  /** Remove the editor and everything it added to the page. Safe to call twice. */
  destroy(): void;
}

/** The checks every profile makes before it touches the page. */
export function checkOptions(options: BaseOptions & { profile?: string }, profile: Profile): void {
  if (!options || !options.mount) {
    throw new Error("createEditor needs a mount: the element to build the editor in.");
  }
  if (options.profile !== undefined && options.profile !== profile) {
    throw new Error(`This entry point has the "${profile}" profile only, not "${options.profile}".`);
  }
  if (options.extensions && options.extensions.length > 0) {
    throw new Error("No profile takes extensions yet.");
  }
  if (options.storage !== undefined) {
    throw new Error('There is no storage adapter yet. Save the document that "change" hands you.');
  }
}

/** The set of "change" handlers behind `on`. */
export function changeHandlers() {
  const handlers = new Set<(document: string) => void>();
  return {
    on(event: "change", handler: (document: string) => void): () => void {
      if (event !== "change") throw new Error(`Unknown event: ${String(event)}`);
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    emit(document: string): void {
      for (const handler of [...handlers]) handler(document);
    },
    clear(): void {
      handlers.clear();
    },
  };
}
