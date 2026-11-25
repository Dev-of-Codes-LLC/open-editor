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
// The Markdown is CommonMark plus the footnote syntax ([^id]) that most
// Markdown tools know. It is wider than the small subset the editor imports.

import type { Block, Book, BulletList, Chapter, Inline, Mark, OrderedList, Paragraph } from "./types";

export interface BookExport {
  text: string;
  /** What could not be written, one line each. Empty when nothing was left out. */
  lost: string[];
}

type Chapters = Record<string, Chapter> | Map<string, Chapter>;
const chapterOf = (chapters: Chapters, id: string) => (chapters instanceof Map ? chapters.get(id) : chapters[id]);

const isHttp = (href: string) => /^https?:\/\/\S+$/.test(href);
const ORDER: Mark["type"][] = ["link", "bold", "italic"];
const hrefOf = (mark: Mark) => (mark.type === "link" ? mark.attrs.href : "");

/** The marks of a text node in one fixed order, link outside bold outside italic, without unsafe links. */
function marksOf(node: Inline): Mark[] {
  if (node.type !== "text") return [];
  return ORDER.flatMap((type) => {
    const mark = (node.marks ?? []).find((m) => m.type === type);
    if (!mark || (mark.type === "link" && !isHttp(mark.attrs.href))) return [];
    return [mark];
  });
}

/** Walk inline nodes, opening and closing marks so that they nest properly. */
function inlineWith(
  nodes: Inline[] | undefined,
  write: {
    text: (text: string) => string;
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
    out += write.text(node.text);
  }
  closeFrom(0);
  return out;
}

/** The footnote ids of a chapter in the order the text calls them. */
function callsOf(chapter: Chapter): string[] {
  const ids: string[] = [];
  const scan = (nodes: Inline[] | undefined) => {
    for (const node of nodes ?? []) if (node.type === "footnoteRef" && !ids.includes(node.attrs.id)) ids.push(node.attrs.id);
  };
  for (const block of chapter.content) {
    if (block.type === "paragraph" || block.type === "heading") scan(block.content);
    else if (block.type !== "image") for (const item of block.content) for (const p of item.content) scan(p.content);
  }
  return ids;
}

function missing(book: Book, chapters: Chapters): string[] {
  return book.chapters
    .filter((entry) => !chapterOf(chapters, entry.id))
    .map((entry) => `The chapter "${entry.title}" was left out: its document was not given.`);
}

// --- Markdown --------------------------------------------------------------------

const mdText = (text: string) => text.replace(/[\\`*_[\]<]/g, "\\$&");
// A line that would start a heading, a quote, a list or a rule gets a backslash first.
const mdLineStart = (line: string) => line.replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s|$)|\d+(?=[.)](\s|$))|={3,}\s*$|-{3,}\s*$)/, "$1\\$2");

function mdInline(nodes: Inline[] | undefined): string {
  return inlineWith(nodes, {
    text: mdText,
    open: (mark) => (mark.type === "link" ? "[" : mark.type === "bold" ? "**" : "_"),
    close: (mark) =>
      mark.type === "link"
        ? `](${mark.attrs.href.replace(/\)/g, "%29").replace(/\s/g, "%20")})`
        : mark.type === "bold"
          ? "**"
          : "_",
    hardBreak: "\\\n",
    footnote: (id) => `[^${id}]`,
  })
    .split("\n")
    .map(mdLineStart)
    .join("\n");
}

const mdParagraphs = (paragraphs: Paragraph[], indent: string) =>
  paragraphs.map((p) => mdInline(p.content).replace(/\n/g, `\n${indent}`)).join(`\n\n${indent}`);

function mdBlock(block: Block): string {
  switch (block.type) {
    case "paragraph":
      return mdInline(block.content);
    case "heading":
      // The book's title is "#" and a chapter's is "##", so a level 1 heading is "###".
      return `${"#".repeat(block.attrs.level + 2)} ${mdInline(block.content).replace(/\n/g, " ")}`;
    case "bulletList":
      return block.content.map((item) => `- ${mdParagraphs(item.content, "  ")}`).join("\n");
    case "orderedList":
      return block.content.map((item, n) => `${n + 1}. ${mdParagraphs(item.content, "   ")}`).join("\n");
    case "image": {
      const image = `![${mdText(block.attrs.alt)}](${encodeURI(block.attrs.src)})`;
      return block.attrs.caption ? `${image}\n\n_${mdText(block.attrs.caption)}_` : image;
    }
  }
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
        open: (mark) =>
          mark.type === "link" ? `<a href="${htmlAttr(mark.attrs.href)}">` : mark.type === "bold" ? "<strong>" : "<em>",
        close: (mark) => (mark.type === "link" ? "</a>" : mark.type === "bold" ? "</strong>" : "</em>"),
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
