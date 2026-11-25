// The manuscript format, version 0: types, a validator, the two changes that
// span chapters, and Markdown in and out. Nothing here needs a browser or an
// editing engine.
//
//   import { validateBook, validateChapter } from "@devofcodes/editor/book";

export { BOOK_FORMAT, CHAPTER_FORMAT, FORMAT_VERSION, ID_PATTERN } from "./types";
export type {
  Block,
  BlockAttrs,
  Book,
  BulletList,
  Chapter,
  ChapterEntry,
  Footnote,
  FootnoteRef,
  HardBreak,
  Heading,
  Image,
  Inline,
  ListItem,
  Mark,
  OrderedList,
  Paragraph,
  RemovedChapter,
  TextNode,
} from "./types";
export { isRelativePath, validateBook, validateChapter, validateChapterOf } from "./validate";
export { moveChapter, removeChapter, resolveChapter } from "./chapters";
export { chapterFromMarkdown, chapterToMarkdown } from "./markdown";
export type { MarkdownExport } from "./markdown";
export { chapterText, countWords, countWordsIn } from "./words";
export { bookToHtml, bookToMarkdown } from "./export";
export type { BookExport } from "./export";
