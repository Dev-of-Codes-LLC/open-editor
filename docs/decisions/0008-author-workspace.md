# 0008: The author workspace, and a chapter editor beside the small prose field

Date: 2026-11-25. Status: accepted for the author script.

## Decision

1. **A new editor for chapters, not a change to the prose field.** `createChapterEditor` edits one chapter document of the manuscript format. The `"manuscript"` profile of `createEditor` stays as it is: a small prose field whose document is a Markdown string. Decisions 0003 and 0007 said the profile's document would change and break. It does not. Both run on the same engine.
2. **What the chapter editor edits, and what it only carries.** It edits paragraphs, headings, bullet lists, numbered lists and, since [decision 0009](0009-style-menu.md), block quotes and eight text styles. It shows images and footnotes and writes them back untouched. An author cannot add or rewrite a footnote or an image yet.
3. **What the editor writes is always valid.** One step, `toChapter`, turns what the engine holds into a chapter document. It drops what the engine adds, and it repairs what an author can cause: a split paragraph does not keep a second copy of a block id, a pasted footnote call is kept once, and a note goes when its call is deleted. Undo brings the call back, and the note with it.
4. **Opening a chapter never marks it unsaved.** A chapter is unsaved when the editor gives back something other than what it gave back before the first edit.
5. **Save writes everything that changed: chapters first, the manifest last.** Nothing is written before a save. A chapter that was not edited is never written, so its file stays byte for byte the same.
6. **A move is not written until save.** It changes the manifest's order and nothing else (decision 0007).
7. **Words are counted the way a word processor counts them.** A word is a run between spaces that holds a letter or a digit. Text in a script written without spaces is divided by the language's rules. The body counts; footnotes, captions and titles do not.
8. **Export is the whole book, in the current order, with unsaved text included.** Markdown export is CommonMark plus footnote syntax, wider than the small subset the editor imports. HTML export is one page with no script. Neither is read back.
9. **The workspace reads every chapter when it opens**, so the word count and export cover the whole book at once.

## Why

**Why not change the prose field.** A host that wants one notes field should not get headings, chapters and footnotes. Tastebuds is that host. Two editors on one engine is less than one editor with two documents.

**Why the repair step.** The engine's JSON and the format have the same shape, and still differ in small ways that matter. The first run of a test that split a paragraph would have written two blocks with one id, which the validator refuses. The format's rules are checked where the document leaves the editor, so no host has to.

**Why chapters first on save.** If a write fails part way, the old manifest still names files that exist. The plan asks for recoverable operations across chapter documents. This order is the least that gives that for a move plus an edit.

**Why count like a word processor.** The first version used the language's own word rules for everything. It counted "over-proved" as two words. An author compares the count with their word processor, so the rule follows that.

## What the author script found

- **The caret was not in the chapter at once after a click on its name.** The engine took the focus a frame later, and keys pressed in that frame landed at the start of the chapter. Fixed with [decision 0009](0009-style-menu.md): the editor takes the keyboard at once.
- **The schema needed no change.** Version 0 held everything the script did.

## Cost, and what would change this

- **Footnotes and images cannot be added or edited.** That is the largest gap for a real author.
- **Every chapter is read at start.** A 30-chapter book would read 30 files before it shows a list. The plan asks to load the active chapter and its neighbours.
- **A save of two chapters and the manifest is three writes, not one.** A failure between them leaves a mix of old and new that is still a valid book. It is not a snapshot.
- **No new chapter, rename or remove in the workspace.** `removeChapter` exists in the format's code and has no button.
- **The arrows move a chapter one place.** There is no drag, and no "move to".
- **The on-screen footnote list shows plain text.** Bold and italic inside a note are kept in the file and in exports.
- **Retention is not measured for either workspace.**
