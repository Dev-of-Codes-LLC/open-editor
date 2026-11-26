// Between the engine's JSON and a chapter document.
//
// The two have the same shape, on purpose (decision 0007). The engine's JSON
// is looser: it writes attributes it does not use as null, gives a link mark
// more attributes than an address, and will copy a block's id onto the new
// paragraph when a paragraph is split. `toChapter` turns what the engine
// holds into a chapter document that passes the validator, whatever the
// author did. It needs no browser.

import { CHAPTER_FORMAT, FORMAT_VERSION, ID_PATTERN, SIMPLE_MARKS } from "../book/types";
import type { Block, Chapter, Footnote, Inline, Mark, Paragraph } from "../book/types";
import { isRelativePath } from "../book/validate";

type Loose = { type?: string; attrs?: Record<string, unknown>; content?: Loose[]; marks?: Loose[]; text?: string };

const isHttp = (href: unknown): href is string => typeof href === "string" && /^https?:\/\/\S+$/.test(href);

export function toChapter(id: string, doc: Loose, footnotes: Record<string, Footnote> = {}): Chapter {
  const blockIds = new Set<string>();
  const called = new Set<string>();

  // A block keeps its id the first time the id is seen. A copy made by a split or a paste loses it.
  const idOf = (attrs: Record<string, unknown> | undefined): { id?: string } => {
    const id = attrs?.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id) || blockIds.has(id)) return {};
    blockIds.add(id);
    return { id };
  };
  const withAttrs = <T extends object>(attrs: T): { attrs: T } | Record<string, never> =>
    Object.keys(attrs).length > 0 ? { attrs } : {};

  const marks = (list: Loose[] | undefined): Mark[] => {
    const out: Mark[] = [];
    for (const mark of list ?? []) {
      const simple = SIMPLE_MARKS.find((name) => name === mark.type);
      if (simple) {
        // One of each, and never superscript and subscript together: the first one stays.
        const clash = simple === "superscript" ? "subscript" : simple === "subscript" ? "superscript" : null;
        if (!out.some((m) => m.type === simple || m.type === clash)) out.push({ type: simple });
      } else if (mark.type === "link" && isHttp(mark.attrs?.href) && !out.some((m) => m.type === "link")) {
        out.push({ type: "link", attrs: { href: mark.attrs.href } });
      }
    }
    return out;
  };

  const inline = (nodes: Loose[] | undefined, notes: boolean): Inline[] => {
    const out: Inline[] = [];
    for (const node of nodes ?? []) {
      if (node.type === "text" && typeof node.text === "string" && node.text !== "") {
        const m = marks(node.marks);
        out.push(m.length > 0 ? { type: "text", text: node.text, marks: m } : { type: "text", text: node.text });
      } else if (node.type === "hardBreak") {
        out.push({ type: "hardBreak" });
      } else if (node.type === "footnoteRef" && notes) {
        // A call is kept once, and only while its note exists. A pasted copy of a call is dropped.
        const ref = node.attrs?.id;
        if (typeof ref === "string" && footnotes[ref] && !called.has(ref)) {
          called.add(ref);
          out.push({ type: "footnoteRef", attrs: { id: ref } });
        }
      }
    }
    return out;
  };

  const paragraph = (node: Loose, withId: boolean): Paragraph => {
    const content = inline(node.content, true);
    return {
      type: "paragraph",
      ...(withId ? withAttrs(idOf(node.attrs)) : {}),
      ...(content.length > 0 ? { content } : {}),
    };
  };

  const blocks: Block[] = [];
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "paragraph":
        blocks.push(paragraph(node, true));
        break;
      case "heading": {
        const level = node.attrs?.level;
        const content = inline(node.content, true);
        blocks.push({
          type: "heading",
          attrs: { ...idOf(node.attrs), level: level === 2 || level === 3 ? level : 1 },
          ...(content.length > 0 ? { content } : {}),
        });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = (node.content ?? [])
          .filter((item) => item.type === "listItem")
          .map((item) => {
            const paragraphs = (item.content ?? []).filter((child) => child.type === "paragraph").map((child) => paragraph(child, false));
            return { type: "listItem" as const, content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" as const }] };
          });
        if (items.length > 0) blocks.push({ type: node.type, ...withAttrs(idOf(node.attrs)), content: items });
        break;
      }
      case "blockquote": {
        const paragraphs = (node.content ?? []).filter((child) => child.type === "paragraph").map((child) => paragraph(child, false));
        if (paragraphs.length > 0) blocks.push({ type: "blockquote", ...withAttrs(idOf(node.attrs)), content: paragraphs });
        break;
      }
      case "image": {
        const { src, alt, caption } = node.attrs ?? {};
        // An image must be a file of the book. One from the web, typed into a source view, is left out.
        if (!isRelativePath(src)) break;
        blocks.push({
          type: "image",
          attrs: {
            ...idOf(node.attrs),
            src,
            alt: typeof alt === "string" ? alt : "",
            ...(typeof caption === "string" && caption.trim() !== "" ? { caption } : {}),
          },
        });
        break;
      }
    }
  }

  // A note whose call was deleted goes with it. Undo brings the call back, and the note with it.
  const kept: Record<string, Footnote> = {};
  for (const ref of called) kept[ref] = footnotes[ref];
  return {
    format: CHAPTER_FORMAT,
    version: FORMAT_VERSION,
    id,
    content: blocks,
    ...(called.size > 0 ? { footnotes: kept } : {}),
  };
}

/** A chapter as the engine reads it. The shapes are the same, so this is the chapter's own content. */
export function fromChapter(chapter: Chapter): { type: "doc"; content: Block[] } {
  return { type: "doc", content: chapter.content.length > 0 ? chapter.content : [{ type: "paragraph" }] };
}
