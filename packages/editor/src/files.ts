// How a workspace reaches files. The host owns the files; the editor only
// asks for them through these three calls.
//
//   const files = memoryFiles({ "scale.js": "let a = 1;\n" });
//   await files.list();                    // ["scale.js"]
//   await files.read("scale.js");          // "let a = 1;\n"
//   await files.write("scale.js", "let a = 2;\n");
//
// A host writes its own store for a server, a folder the user picked, or
// browser storage. Each call returns a promise. A call that fails rejects
// with an Error whose message a person can read.

export interface FileStore {
  /** The paths of the files, in the order to show them. A path uses "/" between its parts. */
  list(): Promise<string[]>;
  /** The whole text of one file. The editor does not change it on the way in. */
  read(path: string): Promise<string>;
  /** Replace the whole text of one file. Resolves when the text is safely written. */
  write(path: string, text: string): Promise<void>;
}

/** A store that keeps its files in memory, for examples and tests. Nothing outlives the page. */
export function memoryFiles(initial: Record<string, string> = {}): FileStore {
  const files = new Map(Object.entries(initial));
  return {
    async list() {
      return [...files.keys()];
    },
    async read(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`No such file: ${path}`);
      return text;
    },
    async write(path, text) {
      files.set(path, text);
    },
  };
}
