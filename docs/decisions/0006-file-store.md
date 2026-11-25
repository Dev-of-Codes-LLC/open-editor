# 0006: The host owns the files, behind three calls

Date: 2026-11-25. Status: accepted for the developer script.

## Decision

A workspace reaches files through a `FileStore` that the host hands in:

```ts
interface FileStore {
  list(): Promise<string[]>;
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
}
```

- Every call returns a promise. A failure is a rejection with a message a person can read.
- A path is a string with `/` between its parts. The store decides what a path means.
- A file is its whole text. `write` replaces the whole file and resolves when the text is safely written.
- The workspace never writes on its own. Only `save()` and the save key write.
- The package ships one store, `memoryFiles`, for examples and tests. A host writes its own for a server, a folder or browser storage.

`createCodeWorkspace({ mount, files })` builds a file list and one code editor for each open file. It lives in its own entry point, `@devofcodes/editor/code-workspace`.

## Why

The plan says hosts control file access and that editing needs no account and no backend. Three calls are the least a workspace needs to open, edit and save. The browser test's page writes its own store on session storage in about fifteen lines. That is the evidence that a host can.

One editor for each open file keeps that file's unsaved text and undo history while the developer looks at another file. The other choice, one editor whose text is swapped, loses the undo history on every switch.

The workspace is a third entry point, not part of the code profile. A host that embeds one code field does not load a file list.

## What "saved" means

A file is saved when its text equals what the store last gave or took. The text that was written is what counts: keys typed while a write is in flight leave the file unsaved. A refused write changes nothing and shows the store's message.

## Measured

On 2026-11-25, minified: `code-workspace.js` is 549.0 kB raw and 163.1 kB gzip. `code.js` is 544.5 kB and 161.7 kB. So the workspace costs about 1.4 kB gzip on top of the code profile, plus 0.5 kB of CSS.

## Cost, and what would change this

- **No create, rename, delete or watch.** The developer script does not need them. A real project does.
- **Whole files only.** A 10 MB file is read and written in one piece. The plan's large-file work will need ranges or streams.
- **Text only, as the store decodes it.** The store owns the encoding. The plan asks for encoding metadata; there is none yet.
- **No "changed on disk" check.** Two tabs can overwrite each other. A version or a hash on `read` and `write` would catch that.
- **One editor for each open file costs memory.** Nothing closes a file yet.
- **The manuscript side has no store.** The author script may need more than three calls, such as a manifest. This contract may grow then.
