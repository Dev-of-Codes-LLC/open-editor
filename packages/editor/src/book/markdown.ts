// The Markdown subset as an import and export format for a chapter.
//
// The subset holds paragraphs, line breaks, bold, italic, links and bullet
// lists (see ../manuscript/markdown.ts). A chapter can hold more. Import is
// exact. Export writes what the subset can hold and reports the rest, so
// nothing is lost without a word.

import { fromMarkdown, toMarkdown } from "../manuscript/markdown";
import type { Doc } from "../manuscript/markdown";
import { CHAPTER_FORMAT, FORMAT_VERSION } from "./types";
import type { Block, Chapter, Inline, Paragraph } from "./types";

/** Read text in the Markdown subset as a chapter. Every part of the subset is kept. */
export function chapterFromMarkdown(id: string, markdown: string): Chapter {
  return {
    format: CHAPTER_FORMAT,
    version: FORMAT_VERSION,
    id,
    content: fromMarkdown(markdown).content as Block[],
  };
}

export interface MarkdownExport {
  /** The chapter in the Markdown subset. */
  markdown: string;
  /** What the subset could not hold, one line for each kind, in plain words. Empty when nothing was lost. */
  lost: string[];
}

/** Write a chapter in the Markdown subset, and say what did not fit. */
export function chapterToMarkdown(chapter: Chapter): MarkdownExport {
  const counts = new Map<string, number>();
  const count = (kind: string) => counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const inline = (nodes: Inline[] | undefined): Inline[] =>
    (nodes ?? []).filter((node) => {
      if (node.type !== "footnoteRef") return true;
      count("footnote");
      return false;
    });
  const paragraph = (node: { content?: Inline[] }): Paragraph => {
    const content = inline(node.content);
    return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
  };

  const blocks: Block[] = [];
  for (const block of chapter.content) {
    switch (block.type) {
      case "paragraph":
        blocks.push(paragraph(block));
        break;
      case "heading":
        count("heading");
        blocks.push(paragraph(block));
        break;
      case "orderedList":
      case "bulletList":
        // A numbered list is written as a bullet list.
        if (block.type === "orderedList") count("numbered list");
        blocks.push({
          type: "bulletList",
          content: block.content.map((item) => {
            if (item.content.length > 1) count("list item with more than one paragraph");
            return { type: "listItem", content: item.content.map(paragraph) };
          }),
        });
        break;
      case "image":
        count("image");
        break;
    }
  }

  const said: Record<string, (n: number) => string> = {
    heading: (n) => `${n} heading${n === 1 ? " was" : "s were"} written as ${n === 1 ? "a plain paragraph" : "plain paragraphs"}`,
    "numbered list": (n) => `${n} numbered list${n === 1 ? " was" : "s were"} written as ${n === 1 ? "a bullet list" : "bullet lists"}`,
    "list item with more than one paragraph": (n) =>
      `${n} list item${n === 1 ? "" : "s"} with more than one paragraph ${n === 1 ? "was" : "were"} joined into one line`,
    image: (n) => `${n} image${n === 1 ? " was" : "s were"} left out`,
    footnote: (n) => `${n} footnote${n === 1 ? " was" : "s were"} left out`,
  };
  return {
    markdown: toMarkdown({ type: "doc", content: blocks } as Doc),
    lost: [...counts].map(([kind, n]) => said[kind](n)),
  };
}
