# 0007: A book is a manifest and one document for each chapter

Date: 2026-11-25. Status: a draft. Version 0 may change without a migration.

## Decision

A manuscript is a set of files:

```
book.json                    the manifest: title, authors, chapters in reading order
chapters/<chapter id>.json   one chapter document each
images/...                   whatever the chapters point at
```

The format is written down three ways that must agree: TypeScript types (`packages/editor/src/book/types.ts`), a validator with no dependencies (`validate.ts`), and two JSON Schema files (`schema/`). The tests run the same good and bad examples through the validator and the JSON Schema files.

The choices:

1. **Order lives in one place.** The manifest's `chapters` list is the reading order. No chapter carries a number.
2. **Ids are stable and never used again.** A chapter id, a block id and a footnote id are 3 to 64 characters of `a-z`, `0-9`, `-` and `_`. They do not come from a title or a position.
3. **A move changes the manifest's list and nothing else.** Whatever points at a chapter holds its id, so it still points at it.
4. **A removal leaves a tombstone.** The chapter's id and title go to the manifest's `removed` list. Whatever still points at the id resolves to "removed" and can name the chapter. This is how the format answers the plan's rule that a deletion must "preserve or explicitly orphan references and comments".
5. **Footnotes live in their chapter**, by id, so they move with it. Each call in the text has one note, and each note one call.
6. **A chapter document has the shape of ProseMirror's JSON** (`type`, `attrs`, `content`, `marks`), with a closed list of types. An editor built on ProseMirror maps one to one. A document with any other type is not valid.
7. **Unknown fields are refused**, in the manifest and in a chapter. A reader that does not know a field cannot silently drop it.
8. **Files are paths next to the manifest.** No `..`, no leading `/`, no web address. A book cannot point outside itself.
9. **A block may carry an id**, for comments and references to hold on to later. It is optional in version 0.
10. **The Markdown subset is an import and export format**, no longer the document. Import is exact. Export writes what the subset can hold and returns a list of what it could not.

## What is in version 0

| Kind | Types |
| --- | --- |
| Blocks | `paragraph`, `heading` (levels 1 to 3), `bulletList`, `orderedList`, `image` |
| Inline | `text`, `hardBreak`, `footnoteRef` |
| Marks | `bold`, `italic`, `link` (http and https only) |

The chapter's own title is in the manifest, so heading level 1 is a section inside the chapter.

## Why

The plan asks for a manifest with stable chapter ids, ordering, metadata and chapter documents, so that an editor can load one chapter while search, counts and export still cover the book. One file for each chapter gives that. It also gives small diffs and small writes: an edit to chapter two writes chapter two.

The ProseMirror shape was chosen over a shape of our own because the manuscript engine already reads and writes it. A second shape would need a converter that can only add bugs. The cost is that the format looks like one engine's. The closed list of types and the version number are what keep it ours.

The validator checks five rules a JSON Schema cannot say: an id used twice, a file used twice, a removed id used again, footnote calls and notes that do not match, and a mark given twice. The tests name these, and check that the JSON Schema does not catch them, so the list stays honest.

## What this breaks

Update, with decision 0008: nothing broke. The chapter format got its own editor, and the manuscript profile kept its Markdown string. The paragraph below is what was expected when this record was written.

The manuscript profile's document is still the Markdown subset in one string (decision 0003). When the profile moves to this format, in the author script, `getDocument()` and `"change"` will carry a chapter document. That is a breaking change, and it is expected. Nothing in this piece changes the editor.

## Cost, and what would change this

- **No simple tables.** The plan lists them for the first release. They are not in version 0.
- **No comments, no named versions, no cross-chapter references.** Block ids are the hook for them. Their own records come later.
- **A snapshot of the whole book is not defined.** The plan asks for a consistent set of chapter revisions for each snapshot or export.
- **Footnote order is the order of the calls.** A note that is called twice is refused; some books do want that.
- **Lists hold paragraphs only.** No list inside a list.
- **Images are files by path.** There is no size, and no rule for where a host keeps them.
- **The tombstone keeps a title, not the text.** Whether the removed chapter's file is kept is the host's choice.
- **Version 0 has no migration.** The first version that has users will need one, and readers already refuse a version they do not know.
