// The manuscript format, version 0: a book is a manifest and one document
// for each chapter.
//
//   book.json                    the manifest: title, authors, chapter order
//   chapters/<chapter id>.json   one chapter document each
//
// The JSON Schema files in /schema say the same thing for other tools. The
// validator in validate.ts checks it with no dependencies.
//
// Ids. A chapter id, a block id and a footnote id never change and are never
// used again. Nothing in the format points at a position: order lives in one
// place, the manifest's `chapters` list.

export const BOOK_FORMAT = "open-editor.book";
export const CHAPTER_FORMAT = "open-editor.chapter";
export const FORMAT_VERSION = 0;

/** Lower-case letters, digits, "-" and "_"; 3 to 64 characters; starts with a letter or digit. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,63}$/;

// --- The manifest ----------------------------------------------------------------

export interface ChapterEntry {
  /** Stable. The chapter document carries the same id. */
  id: string;
  /** The chapter's title, shown in the outline. */
  title: string;
  /** The chapter document, as a path next to the manifest, with "/" between its parts. */
  file: string;
}

export interface RemovedChapter {
  /** The id the chapter had. It is never given to another chapter. */
  id: string;
  /** The title it had, so a reference to it can still be named. */
  title: string;
}

export interface Book {
  format: typeof BOOK_FORMAT;
  version: typeof FORMAT_VERSION;
  /** Stable id of the book. */
  id: string;
  title: string;
  /** In the order to print them. May be empty. */
  authors: string[];
  /** A BCP 47 language tag, such as "en" or "pt-BR". */
  language?: string;
  /** The chapters, in reading order. Moving a chapter changes this list and nothing else. */
  chapters: ChapterEntry[];
  /** Chapters that were deleted. A comment or reference to one of these ids resolves to "removed". */
  removed?: RemovedChapter[];
}

// --- A chapter document ----------------------------------------------------------
// The shape follows ProseMirror's JSON (type, attrs, content, marks), so an
// editor built on it maps one to one. It is still our format: the list of
// node and mark types is closed, and a document with any other type is not valid.

export type Mark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export interface TextNode {
  type: "text";
  text: string;
  marks?: Mark[];
}
export interface HardBreak {
  type: "hardBreak";
}
/** The place in the text where a footnote is called. `attrs.id` is a key of the chapter's `footnotes`. */
export interface FootnoteRef {
  type: "footnoteRef";
  attrs: { id: string };
}
export type Inline = TextNode | HardBreak | FootnoteRef;

/** An optional stable id on a block, for comments and references to hold on to. */
export interface BlockAttrs {
  id?: string;
}

export interface Paragraph {
  type: "paragraph";
  attrs?: BlockAttrs;
  content?: Inline[];
}
export interface Heading {
  type: "heading";
  /** Level 1 is a section of the chapter. The chapter's own title is in the manifest. */
  attrs: BlockAttrs & { level: 1 | 2 | 3 };
  content?: Inline[];
}
export interface ListItem {
  type: "listItem";
  content: Paragraph[];
}
export interface BulletList {
  type: "bulletList";
  attrs?: BlockAttrs;
  content: ListItem[];
}
export interface OrderedList {
  type: "orderedList";
  attrs?: BlockAttrs;
  content: ListItem[];
}
export interface Image {
  type: "image";
  /** `src` is a path next to the manifest. `alt` says what the image shows; "" marks decoration. */
  attrs: BlockAttrs & { src: string; alt: string; caption?: string };
}
export type Block = Paragraph | Heading | BulletList | OrderedList | Image;

export interface Footnote {
  /** The text of the note. Paragraphs only, and no footnote inside a footnote. */
  content: Paragraph[];
}

export interface Chapter {
  format: typeof CHAPTER_FORMAT;
  version: typeof FORMAT_VERSION;
  /** The same id as the chapter's entry in the manifest. */
  id: string;
  content: Block[];
  /** The chapter's footnotes, by id. They live in the chapter, so they move with it. */
  footnotes?: Record<string, Footnote>;
}
