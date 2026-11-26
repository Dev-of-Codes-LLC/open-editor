// Count the words of a chapter or a book.
//
// What counts: the body text, which is paragraphs, headings and list items.
// What does not: footnotes, image captions, alt text, and the chapter titles
// in the manifest.
//
// A word is a run of characters between spaces that holds a letter or a
// digit. So "don't" and "over-proved" are one word each, as an author
// expects from a word processor, and a dash on its own is none. Text in a
// script that is written without spaces (Chinese, Japanese, Thai and a few
// more) is divided by the language's own rules, with Intl.Segmenter; where
// that is missing, such a run counts as one word.

import type { Block, Chapter, Inline } from "./types";

function textOf(nodes: Inline[] | undefined): string {
  return (nodes ?? []).map((node) => (node.type === "text" ? node.text : node.type === "hardBreak" ? "\n" : "")).join("");
}

/** The body text of a chapter, one block to a line. */
export function chapterText(chapter: Chapter): string {
  const lines: string[] = [];
  const visit = (block: Block) => {
    switch (block.type) {
      case "paragraph":
      case "heading":
        lines.push(textOf(block.content));
        break;
      case "bulletList":
      case "orderedList":
        for (const item of block.content) for (const paragraph of item.content) lines.push(textOf(paragraph.content));
        break;
      case "blockquote":
        for (const paragraph of block.content) lines.push(textOf(paragraph.content));
        break;
      case "image":
        break;
    }
  };
  chapter.content.forEach(visit);
  return lines.join("\n");
}

const WORDLIKE = /[\p{L}\p{N}]/u;
const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

export function countWordsIn(text: string, language?: string): number {
  let count = 0;
  for (const run of text.split(/\s+/)) {
    if (!WORDLIKE.test(run)) continue;
    if (NO_SPACES.test(run) && typeof Intl !== "undefined" && "Segmenter" in Intl) {
      for (const part of new Intl.Segmenter(language, { granularity: "word" }).segment(run)) {
        if (part.isWordLike) count++;
      }
    } else {
      count++;
    }
  }
  return count;
}

/** The number of words in the body text of one chapter. */
export function countWords(chapter: Chapter, language?: string): number {
  return countWordsIn(chapterText(chapter), language);
}
