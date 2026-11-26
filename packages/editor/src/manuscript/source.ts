// Reading a chapter back from source text: Markdown or HTML.
//
// Both go one way in. Markdown is turned into HTML by markdown-it, a
// CommonMark parser. HTML is then tidied into the shapes the editing engine
// reads (see prepareHtml), and the engine's own parser builds the chapter.
// That parser keeps only what the book format has: a <script>, a style
// attribute or an unknown tag does not survive it, and nothing in the text is
// ever run.
//
// markdownToHtml needs no browser. prepareHtml needs a Document.

import MarkdownIt from "markdown-it";
import footnotes from "markdown-it-footnote";
import { ID_PATTERN } from "../book/types";

const attr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

type Parser = InstanceType<typeof MarkdownIt>;
let parser: Parser | null = null;
function markdown(): Parser {
  if (parser) return parser;
  // html: true lets <u>, <mark>, <sup> and <sub> through, which is how the Markdown view writes
  // the four styles Markdown has no sign for. Anything else in angle brackets comes through too,
  // and the engine's parser then drops what the format does not have.
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false }).use(footnotes);
  const label = (tokens: { meta: { label?: string; id: number } }[], index: number) => tokens[index].meta.label ?? String(tokens[index].meta.id + 1);
  // Footnotes come out in the same shape the HTML view uses: a call is <sup><a href="#id">, and
  // the notes are list items with that id in a section at the end.
  md.renderer.rules.footnote_ref = (tokens, index) => `<sup><a href="#${attr(label(tokens as never, index))}">${(tokens[index].meta as { id: number }).id + 1}</a></sup>`;
  md.renderer.rules.footnote_block_open = () => '<section class="footnotes"><ol>\n';
  md.renderer.rules.footnote_block_close = () => "</ol></section>\n";
  md.renderer.rules.footnote_open = (tokens, index) => `<li id="${attr(label(tokens as never, index))}">`;
  md.renderer.rules.footnote_close = () => "</li>\n";
  md.renderer.rules.footnote_anchor = () => "";
  parser = md;
  return md;
}

/** Markdown as HTML, in the shapes prepareHtml reads. */
export function markdownToHtml(source: string): string {
  return markdown().render(source);
}

/** An id the format accepts, made from any label a person typed for a footnote. */
export function footnoteId(label: string): string {
  if (ID_PATTERN.test(label)) return label;
  const slug = label.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+/, "").slice(0, 60);
  return ID_PATTERN.test(slug) ? slug : `fn-${slug || "note"}`.slice(0, 64);
}

export interface PreparedHtml {
  /** The body of the chapter, ready for the engine's parser. */
  body: HTMLElement;
  /** The footnotes that were found, by id: each one's own content. */
  notes: Map<string, HTMLElement>;
}

const BLOCKS = "p, h1, h2, h3, ul, ol, blockquote, figure";

/**
 * Tidy HTML source into what the engine's parser reads.
 *   - The footnote section is taken out and its notes returned by id.
 *   - A call, <sup><a href="#id">, becomes <sup data-footnote="id">, when a note with that id exists.
 *   - A block's id attribute becomes data-block-id.
 *   - A paragraph that holds only an image becomes that image.
 * `doc` is only used to parse: the result is never put on the page, and nothing in it runs.
 */
export function prepareHtml(source: string, doc: Document): PreparedHtml {
  const DomParser = doc.defaultView?.DOMParser;
  if (!DomParser) throw new Error("Reading HTML needs a browser.");
  const body = new DomParser().parseFromString(`<!doctype html><body>${source}`, "text/html").body;

  const notes = new Map<string, HTMLElement>();
  const renamed = new Map<string, string>();
  for (const item of body.querySelectorAll<HTMLElement>("section.footnotes li[id], ol.footnotes > li[id]")) {
    const id = footnoteId(item.id);
    if (notes.has(id)) continue;
    renamed.set(item.id, id);
    // A link back to the text is not part of the note.
    for (const back of item.querySelectorAll('a[href^="#ref-"], a.footnote-backref')) back.remove();
    notes.set(id, item);
  }
  for (const section of body.querySelectorAll("section.footnotes, ol.footnotes")) section.remove();

  for (const link of body.querySelectorAll<HTMLAnchorElement>('sup > a[href^="#"]')) {
    const id = renamed.get(decodeURIComponent(link.getAttribute("href")!.slice(1)));
    const sup = link.parentElement!;
    if (id === undefined || sup.children.length !== 1) continue;
    const call = body.ownerDocument.createElement("sup");
    call.setAttribute("data-footnote", id);
    sup.replaceWith(call);
  }

  for (const block of body.querySelectorAll<HTMLElement>(BLOCKS)) {
    if (block.parentElement === body && block.id) block.setAttribute("data-block-id", block.id);
  }
  for (const paragraph of body.querySelectorAll("p")) {
    const only = paragraph.children.length === 1 && paragraph.textContent?.trim() === "" ? paragraph.children[0] : null;
    if (only?.tagName === "IMG") paragraph.replaceWith(only);
  }
  return { body, notes };
}
