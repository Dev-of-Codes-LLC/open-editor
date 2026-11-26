// Write a whole book as one Markdown file or one HTML file.
//
//   const { text } = bookToMarkdown(book, chapters);
//   const { text } = bookToHtml(book, chapters);
//
// `chapters` holds a chapter document for each id in the manifest. The
// chapters come out in the manifest's order. Both calls return the text and a
// list of what could not be written, in plain words; the list is empty when
// nothing was left out.
//
// These are exports, for reading and for other tools. They are not a second
// home for the manuscript: nothing here reads them back.
//
// The Markdown is CommonMark plus two things most Markdown tools know: the
// footnote syntax ([^id]) and ~~strikethrough~~. Markdown has no way to say
// underline, highlight, superscript or subscript, so those four are written
// as the HTML tags <u>, <mark>, <sup> and <sub>, which Markdown allows inline.
// It is wider than the small subset the editor imports.

import type { Block, Book, BulletList, Chapter, Inline, Mark, OrderedList, Paragraph } from "./types";

export interface BookExport {
  text: string;
  /** What could not be written, one line each. Empty when nothing was left out. */
  lost: string[];
}

type Chapters = Record<string, Chapter> | Map<string, Chapter>;
const chapterOf = (chapters: Chapters, id: string) => (chapters instanceof Map ? chapters.get(id) : chapters[id]);

const isHttp = (href: string) => /^https?:\/\/\S+$/.test(href);
// Marks open and close in this fixed order, the link outermost, so they always nest properly.
// "code" is not in the list: it is written around each piece of text, innermost.
const ORDER: Mark["type"][] = ["link", "bold", "italic", "underline", "strike", "highlight", "superscript", "subscript"];
const hrefOf = (mark: Mark) => (mark.type === "link" ? mark.attrs.href : "");

/** The marks of a text node in the fixed order, without unsafe links and without "code". */
function marksOf(node: Inline): Mark[] {
  if (node.type !== "text") return [];
  return ORDER.flatMap((type) => {
    const mark = (node.marks ?? []).find((m) => m.type === type);
    if (!mark || (mark.type === "link" && !isHttp(mark.attrs.href))) return [];
    return [mark];
  });
}
const isCode = (node: Inline) => node.type === "text" && (node.marks ?? []).some((mark) => mark.type === "code");

/** Walk inline nodes, opening and closing marks so that they nest properly. */
function inlineWith(
  nodes: Inline[] | undefined,
  write: {
    text: (text: string) => string;
    code: (text: string) => string;
    open: (mark: Mark) => string;
    close: (mark: Mark) => string;
    hardBreak: string;
    footnote: (id: string) => string;
  },
): string {
  let out = "";
  let open: Mark[] = [];
  const closeFrom = (depth: number) => {
    for (let k = open.length - 1; k >= depth; k--) out += write.close(open[k]);
    open = open.slice(0, depth);
  };
  for (const node of nodes ?? []) {
    if (node.type !== "text") {
      closeFrom(0);
      out += node.type === "hardBreak" ? write.hardBreak : write.footnote(node.attrs.id);
      continue;
    }
    const wanted = marksOf(node);
    let same = 0;
    while (
      same < open.length &&
      same < wanted.length &&
      open[same].type === wanted[same].type &&
      hrefOf(open[same]) === hrefOf(wanted[same])
    ) {
      same++;
    }
    closeFrom(same);
    for (const mark of wanted.slice(same)) {
      out += write.open(mark);
      open.push(mark);
    }
    out += isCode(node) ? write.code(node.text) : write.text(node.text);
  }
  closeFrom(0);
  return out;
}

/** The paragraphs of a block that holds paragraphs under it, however deep. */
function paragraphsOf(block: Block): { content?: Inline[] }[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return [block];
    case "blockquote":
      return block.content;
    case "bulletList":
    case "orderedList":
      return block.content.flatMap((item) => item.content);
    case "image":
      return [];
  }
}

/** The footnote ids of a chapter in the order the text calls them. */
function callsOf(chapter: Chapter): string[] {
  const ids: string[] = [];
  for (const block of chapter.content) {
    for (const paragraph of paragraphsOf(block)) {
      for (const node of paragraph.content ?? []) {
        if (node.type === "footnoteRef" && !ids.includes(node.attrs.id)) ids.push(node.attrs.id);
      }
    }
  }
  return ids;
}

function missing(book: Book, chapters: Chapters): string[] {
  return book.chapters
    .filter((entry) => !chapterOf(chapters, entry.id))
    .map((entry) => `The chapter "${entry.title}" was left out: its document was not given.`);
}

// --- Markdown --------------------------------------------------------------------

const mdText = (text: string) => text.replace(/[\\`*_[\]<~]/g, "\\$&");
// Code is written as it is, inside a run of backticks one longer than any in the text.
function mdCode(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}
// A line that would start a heading, a quote, a list or a rule gets a backslash first.
const mdLineStart = (line: string) => line.replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s|$)|\d+(?=[.)](\s|$))|={3,}\s*$|-{3,}\s*$)/, "$1\\$2");

const MD_OPEN: Record<Mark["type"], string> = { link: "[", bold: "**", italic: "_", underline: "<u>", strike: "~~", highlight: "<mark>", superscript: "<sup>", subscript: "<sub>", code: "" };
const MD_CLOSE: Record<Mark["type"], string> = { link: "", bold: "**", italic: "_", underline: "</u>", strike: "~~", highlight: "</mark>", superscript: "</sup>", subscript: "</sub>", code: "" };

function mdInline(nodes: Inline[] | undefined): string {
  return inlineWith(nodes, {
    text: mdText,
    code: mdCode,
    open: (mark) => MD_OPEN[mark.type],
    close: (mark) => (mark.type === "link" ? `](${mark.attrs.href.replace(/\)/g, "%29").replace(/\s/g, "%20")})` : MD_CLOSE[mark.type]),
    hardBreak: "\\\n",
    footnote: (id) => `[^${id}]`,
  })
    .split("\n")
    .map(mdLineStart)
    .join("\n");
}

const mdParagraphs = (paragraphs: Paragraph[], indent: string) =>
  paragraphs.map((p) => mdInline(p.content).replace(/\n/g, `\n${indent}`)).join(`\n\n${indent}`);

interface MarkdownStyle {
  /** How many "#" to add to a heading's own level. */
  headingOffset: number;
  /** Where an image's caption goes: in the image's title, or on a line of its own in italics. */
  caption: "title" | "line";
}
// In a whole book the title is "#" and a chapter's is "##", so a level 1 heading is "###".
const IN_A_BOOK: MarkdownStyle = { headingOffset: 2, caption: "line" };
// A chapter on its own starts at "#", and keeps the caption with its image so it reads back.
const ON_ITS_OWN: MarkdownStyle = { headingOffset: 0, caption: "title" };

function mdBlock(block: Block, style: MarkdownStyle = IN_A_BOOK): string {
  switch (block.type) {
    case "paragraph":
      return mdInline(block.content);
    case "heading":
      return `${"#".repeat(block.attrs.level + style.headingOffset)} ${mdInline(block.content).replace(/\n/g, " ")}`;
    case "bulletList":
      return block.content.map((item) => `- ${mdParagraphs(item.content, "  ")}`).join("\n");
    case "orderedList":
      return block.content.map((item, n) => `${n + 1}. ${mdParagraphs(item.content, "   ")}`).join("\n");
    case "blockquote":
      return block.content.map((p) => mdInline(p.content).split("\n").map((line) => `> ${line}`).join("\n")).join("\n>\n");
    case "image": {
      const { alt, src, caption } = block.attrs;
      if (style.caption === "title") {
        return caption ? `![${mdText(alt)}](${encodeURI(src)} "${caption.replace(/["\\]/g, "\\$&")}")` : `![${mdText(alt)}](${encodeURI(src)})`;
      }
      const image = `![${mdText(alt)}](${encodeURI(src)})`;
      return caption ? `${image}\n\n_${mdText(caption)}_` : image;
    }
  }
}

// --- One chapter as source text, to edit and read back ----------------------------
// These two are what the editor's Markdown view and HTML view show. Unlike the
// exports above they are read back, so they carry what a round trip needs:
// footnotes by their ids, an image's caption with its image and, in the HTML,
// each block's id.

/** A chapter as Markdown: "#" for a level 1 heading, footnotes as [^id] with their notes at the end. */
export function chapterToMarkdownSource(chapter: Chapter): string {
  const parts: string[] = [];
  for (const block of chapter.content) {
    const text = mdBlock(block, ON_ITS_OWN);
    if (text !== "") parts.push(text);
  }
  for (const id of callsOf(chapter)) {
    const note = chapter.footnotes?.[id];
    if (note) parts.push(`[^${id}]: ${mdParagraphs(note.content, "    ")}`);
  }
  return parts.length > 0 ? parts.join("\n\n") + "\n" : "";
}

/** A chapter as HTML: one element for each block, with its id, and the footnotes in a section at the end. */
export function chapterToHtmlSource(chapter: Chapter): string {
  const calls = callsOf(chapter).filter((id) => chapter.footnotes?.[id]);
  const inline = (nodes: Inline[] | undefined, withNotes = true) =>
    inlineWith(nodes, {
      text: htmlText,
      code: (text) => `<code>${htmlText(text)}</code>`,
      open: (mark) => (mark.type === "link" ? `<a href="${htmlAttr(mark.attrs.href)}">` : `<${HTML_TAG[mark.type]}>`),
      close: (mark) => (mark.type === "link" ? "</a>" : `</${HTML_TAG[mark.type]}>`),
      hardBreak: "<br>",
      footnote: (id) => (withNotes && calls.includes(id) ? `<sup><a href="#${htmlAttr(id)}">${calls.indexOf(id) + 1}</a></sup>` : ""),
    });
  const id = (attrs: { id?: string } | undefined) => (attrs?.id ? ` id="${htmlAttr(attrs.id)}"` : "");
  const item = (paragraphs: Paragraph[]) =>
    paragraphs.length === 1 ? inline(paragraphs[0].content) : paragraphs.map((p) => `<p>${inline(p.content)}</p>`).join("");

  const out: string[] = [];
  for (const block of chapter.content) {
    switch (block.type) {
      case "paragraph":
        out.push(`<p${id(block.attrs)}>${inline(block.content)}</p>`);
        break;
      case "heading":
        out.push(`<h${block.attrs.level}${id(block.attrs)}>${inline(block.content)}</h${block.attrs.level}>`);
        break;
      case "bulletList":
      case "orderedList": {
        const tag = block.type === "bulletList" ? "ul" : "ol";
        out.push(`<${tag}${id(block.attrs)}>`, ...block.content.map((li) => `  <li>${item(li.content)}</li>`), `</${tag}>`);
        break;
      }
      case "blockquote":
        out.push(`<blockquote${id(block.attrs)}>`, ...block.content.map((p) => `  <p>${inline(p.content)}</p>`), "</blockquote>");
        break;
      case "image":
        out.push(
          `<figure${id(block.attrs)}>`,
          `  <img src="${htmlAttr(block.attrs.src)}" alt="${htmlAttr(block.attrs.alt)}">`,
          ...(block.attrs.caption ? [`  <figcaption>${htmlText(block.attrs.caption)}</figcaption>`] : []),
          "</figure>",
        );
        break;
    }
  }
  if (calls.length > 0) {
    out.push("", '<section class="footnotes">', "  <ol>");
    for (const note of calls) out.push(`    <li id="${htmlAttr(note)}">${item(chapter.footnotes![note].content.map((p) => ({ ...p, content: p.content?.filter((n) => n.type !== "footnoteRef") })))}</li>`);
    out.push("  </ol>", "</section>");
  }
  return out.length > 0 ? out.join("\n") + "\n" : "";
}

/**
 * Give the blocks of a chapter that was read back from Markdown the ids they had before.
 * Markdown has no place for a block's id, so a block gets its old id back when its kind and
 * its text are unchanged. A block that was edited comes back without one.
 */
export function keepBlockIds(before: Chapter, after: Chapter): Chapter {
  const text = (block: Block): string =>
    block.type === "image"
      ? block.attrs.src
      : paragraphsOf(block)
          .map((p) => (p.content ?? []).map((node) => (node.type === "text" ? node.text : node.type === "hardBreak" ? "\n" : "")).join(""))
          .join("\n");
  const signature = (block: Block) => `${block.type}${block.type === "heading" ? block.attrs.level : ""}|${text(block)}`;
  const known = new Map<string, string[]>();
  for (const block of before.content) {
    if (!block.attrs?.id) continue;
    const list = known.get(signature(block)) ?? [];
    list.push(block.attrs.id);
    known.set(signature(block), list);
  }
  const content = after.content.map((block): Block => {
    if (block.attrs?.id) return block;
    const id = known.get(signature(block))?.shift();
    return id ? ({ ...block, attrs: { ...block.attrs, id } } as Block) : block;
  });
  return { ...after, content };
}

export function bookToMarkdown(book: Book, chapters: Chapters): BookExport {
  const parts: string[] = [`# ${mdText(book.title)}`];
  if (book.authors.length > 0) parts.push(mdText(book.authors.join(", ")));
  for (const entry of book.chapters) {
    const chapter = chapterOf(chapters, entry.id);
    if (!chapter) continue;
    parts.push(`## ${mdText(entry.title)}`);
    for (const block of chapter.content) {
      const text = mdBlock(block);
      if (text !== "") parts.push(text);
    }
    for (const id of callsOf(chapter)) {
      const note = chapter.footnotes?.[id];
      if (note) parts.push(`[^${id}]: ${mdParagraphs(note.content, "    ")}`);
    }
  }
  return { text: parts.join("\n\n") + "\n", lost: missing(book, chapters) };
}

// --- HTML ------------------------------------------------------------------------

const htmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const htmlAttr = (text: string) => htmlText(text).replace(/"/g, "&quot;");
const HTML_TAG: Record<Exclude<Mark["type"], "link">, string> = { bold: "strong", italic: "em", underline: "u", strike: "s", highlight: "mark", superscript: "sup", subscript: "sub", code: "code" };

export function bookToHtml(book: Book, chapters: Chapters): BookExport {
  const out: string[] = [];
  for (const entry of book.chapters) {
    const chapter = chapterOf(chapters, entry.id);
    if (!chapter) continue;
    const calls = callsOf(chapter);
    // Footnote anchors carry the chapter's id, so two chapters can both have a note called "fn-one".
    const noteId = (id: string) => `${entry.id}-${id}`;
    const inline = (nodes: Inline[] | undefined, withNotes = true) =>
      inlineWith(nodes, {
        text: htmlText,
        code: (text) => `<code>${htmlText(text)}</code>`,
        open: (mark) => (mark.type === "link" ? `<a href="${htmlAttr(mark.attrs.href)}">` : `<${HTML_TAG[mark.type]}>`),
        close: (mark) => (mark.type === "link" ? "</a>" : `</${HTML_TAG[mark.type]}>`),
        hardBreak: "<br>",
        footnote: (id) =>
          withNotes && chapter.footnotes?.[id]
            ? `<sup><a id="ref-${htmlAttr(noteId(id))}" href="#${htmlAttr(noteId(id))}">${calls.indexOf(id) + 1}</a></sup>`
            : "",
      });
    const items = (block: BulletList | OrderedList) =>
      block.content
        .map((item) =>
          item.content.length === 1
            ? `    <li>${inline(item.content[0].content)}</li>`
            : `    <li>${item.content.map((p) => `<p>${inline(p.content)}</p>`).join("")}</li>`,
        )
        .join("\n");

    out.push(`  <section id="${htmlAttr(entry.id)}">`, `    <h2>${htmlText(entry.title)}</h2>`);
    for (const block of chapter.content) {
      switch (block.type) {
        case "paragraph":
          out.push(`    <p>${inline(block.content)}</p>`);
          break;
        case "heading": {
          // The book's title is h1 and a chapter's is h2, so a level 1 heading is h3.
          const tag = `h${block.attrs.level + 2}`;
          out.push(`    <${tag}>${inline(block.content)}</${tag}>`);
          break;
        }
        case "bulletList":
          out.push("    <ul>", items(block), "    </ul>");
          break;
        case "orderedList":
          out.push("    <ol>", items(block), "    </ol>");
          break;
        case "blockquote":
          out.push("    <blockquote>", ...block.content.map((p) => `      <p>${inline(p.content)}</p>`), "    </blockquote>");
          break;
        case "image":
          out.push(
            "    <figure>",
            `      <img src="${htmlAttr(encodeURI(block.attrs.src))}" alt="${htmlAttr(block.attrs.alt)}">`,
            ...(block.attrs.caption ? [`      <figcaption>${htmlText(block.attrs.caption)}</figcaption>`] : []),
            "    </figure>",
          );
          break;
      }
    }
    const notes = calls.filter((id) => chapter.footnotes?.[id]);
    if (notes.length > 0) {
      out.push('    <ol class="footnotes">');
      for (const id of notes) {
        const body = chapter.footnotes![id].content.map((p) => inline(p.content, false)).join("<br>");
        out.push(
          `      <li id="${htmlAttr(noteId(id))}">${body} <a href="#ref-${htmlAttr(noteId(id))}" aria-label="Back to the text">↩</a></li>`,
        );
      }
      out.push("    </ol>");
    }
    out.push("  </section>");
  }

  const head = [
    "<!doctype html>",
    `<html lang="${htmlAttr(book.language ?? "en")}">`,
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${htmlText(book.title)}</title>`,
    "</head>",
    "<body>",
    `  <h1>${htmlText(book.title)}</h1>`,
    ...(book.authors.length > 0 ? [`  <p class="authors">${htmlText(book.authors.join(", "))}</p>`] : []),
  ];
  return { text: [...head, ...out, "</body>", "</html>", ""].join("\n"), lost: missing(book, chapters) };
}
