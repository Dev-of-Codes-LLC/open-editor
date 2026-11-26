# Manuscript schema, version 0

A book is a manifest and one document for each chapter, in a format that tools can check.

| | |
|---|---|
| Status | Merged 2026-11-25 |
| Area | The author audience: the format the author script will edit |
| Delivered in | [Pull request 13](https://github.com/Dev-of-Codes-LLC/open-editor/pull/13) |
| Decisions | [0007 manuscript schema](../decisions/0007-manuscript-schema.md) |
| Related | [Two profiles behind one createEditor](two-profiles.md), [the plan](https://devofcodes.com/open-editor.html) |

## At a glance

- A book is `book.json` plus one JSON file for each chapter.
- A chapter holds paragraphs, headings, lists, block quotes, images, links, footnotes and eight text styles.
- Every chapter has an id that never changes. Moving a chapter changes one list in the manifest.
- A deleted chapter leaves its id and title behind, so nothing that pointed at it is left dangling.
- `validateBook` and `validateChapter` say what is wrong with a file, in plain words.
- It is a draft. The [author workspace](author-workspace.md) edits it.

## Why it exists

The manuscript editor stores one string in a small Markdown subset. That cannot hold a heading, a footnote, an image or a second chapter. The author script needs all four. This is the format it will edit.

## How it works

Read a file, check it, and act on the list of problems.

```js
import { validateBook, validateChapter } from "@devofcodes/editor/book";

const problems = validateChapter(JSON.parse(text));
if (problems.length > 0) console.error(problems.join("\n"));
```

A full example book is in `examples/book/`: three chapters, one image, and one removed chapter.

The manifest:

```json
{
  "format": "open-editor.book",
  "version": 0,
  "id": "bakery-at-six",
  "title": "The Bakery at Six",
  "authors": ["An Example Author"],
  "language": "en",
  "chapters": [
    { "id": "ch-before-light", "title": "Before Light", "file": "chapters/ch-before-light.json" },
    { "id": "ch-first-loaf", "title": "The First Loaf", "file": "chapters/ch-first-loaf.json" }
  ],
  "removed": [{ "id": "ch-a-note-on-flour", "title": "A Note on Flour" }]
}
```

One paragraph of a chapter, with bold text and a footnote:

```json
{
  "type": "paragraph",
  "attrs": { "id": "p-kitchen-quiet" },
  "content": [
    { "type": "text", "text": "The kitchen was " },
    { "type": "text", "text": "quiet", "marks": [{ "type": "bold" }] },
    { "type": "text", "text": " before six" },
    { "type": "footnoteRef", "attrs": { "id": "fn-ovens" } },
    { "type": "text", "text": "." }
  ]
}
```

*Illustrative example, not real data.*

### What a chapter can hold

| Kind | Types |
| --- | --- |
| Blocks | `paragraph`, `heading` (levels 1 to 3), `bulletList`, `orderedList`, `blockquote`, `image` |
| Inline | `text`, `hardBreak`, `footnoteRef` |
| Marks | `bold`, `italic`, `underline`, `strike`, `highlight`, `code`, `superscript`, `subscript`, `link` (http and https only) |

### Moving and removing a chapter

| Call | Does |
| --- | --- |
| `moveChapter(book, id, to)` | Returns a manifest with the chapter at a new place. Nothing else changes |
| `removeChapter(book, id)` | Returns a manifest without the chapter, with its id and title in `removed` |
| `resolveChapter(book, id)` | Says where an id points now: present with its place, removed with its old title, or unknown |

### Markdown in and out

| Call | Does |
| --- | --- |
| `chapterFromMarkdown(id, markdown)` | Reads the Markdown subset as a chapter. Nothing is lost |
| `chapterToMarkdown(chapter)` | Returns `{ markdown, lost }`. `lost` lists what the subset could not hold |

For the first example chapter, `lost` is `["1 footnote was left out", "1 heading was written as a plain paragraph"]`.

## What it guarantees

Each promise has a unit test that runs on every change.

- **The example book is valid** under the validator and under the JSON Schema files.
- **The two checkers agree.** 43 bad examples are refused by the validator with a message that names the fault. The JSON Schema files refuse 34 of them; the other 9 break rules a JSON Schema cannot say, and the tests name those.
- **A move changes the order and nothing else.** An id points at the same chapter before and after.
- **A removed chapter's id is never used again.** A manifest that reuses it is refused.
- **A book cannot point outside itself.** A file path with `..`, a leading `/` or a web address is refused.
- **A reader refuses what it does not know:** another version, an unknown field, an unknown block type.
- **The Markdown subset round-trips exactly**, and export never drops something without listing it.
- **The format needs no browser and no editing engine.** The built file imports neither.

## What it does not do

- **No tables, comments, named versions or cross-chapter references.**
- **No list inside a list**, and a footnote cannot be called twice.
- **No export to HTML, DOCX or EPUB.**
- **No migration.** Version 0 may change, and a reader refuses any other version.

> **Limitation:** The validator checks one file at a time. `validateChapterOf` checks that a chapter belongs to a manifest, and nothing yet checks a whole folder: that every chapter file exists and that every image is there.

## Verification

| Check | Outcome |
|---|---|
| Example book against both checkers | pass |
| 43 bad examples against both checkers | pass |
| Move, remove and resolve | pass |
| Markdown in and out | pass |
| A real manuscript, or a second person's reading of the format | not checked |

No video: a file format has nothing to watch.

## Technical appendix

| What | Where |
| --- | --- |
| Types | `packages/editor/src/book/types.ts` |
| Validator | `packages/editor/src/book/validate.ts` |
| Move, remove, resolve | `packages/editor/src/book/chapters.ts` |
| Markdown in and out | `packages/editor/src/book/markdown.ts` |
| JSON Schema files | `schema/book.schema.json`, `schema/chapter.schema.json` |
| Example book | `examples/book/` |
| Tests | `packages/editor/test/book.test.ts` |
| Import | `@devofcodes/editor/book` |
