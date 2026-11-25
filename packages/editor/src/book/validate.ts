// Check a manifest or a chapter document against format version 0.
//
//   const problems = validateChapter(JSON.parse(text));
//   if (problems.length > 0) console.error(problems.join("\n"));
//
// Each function returns a list of problems, empty when the value is valid.
// A problem names the place and what is wrong, in words a person can act on.
// These run anywhere: no browser, no dependencies.
//
// They check more than the JSON Schema files can: that ids are not used
// twice, that every footnote call has its note, and that a chapter in the
// manifest is not also in its removed list.

import { BOOK_FORMAT, CHAPTER_FORMAT, FORMAT_VERSION, ID_PATTERN } from "./types";
import type { Book, Chapter } from "./types";

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isId = (value: unknown): value is string => typeof value === "string" && ID_PATTERN.test(value);
const ID_RULE = "3 to 64 of a-z, 0-9, - and _, starting with a letter or digit";

/** A path next to the manifest: parts joined by "/", no "..", no leading "/", no scheme, no backslash. */
export function isRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  if (value.startsWith("/") || value.includes("\\") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

const isHttp = (value: unknown): value is string => typeof value === "string" && /^https?:\/\/\S+$/.test(value);

function extraKeys(value: Json, allowed: string[], at: string, problems: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push(`${at}: "${key}" is not part of the format`);
  }
}

function header(value: Json, format: string, at: string, problems: string[]): void {
  if (value.format !== format) problems.push(`${at}: format must be "${format}"`);
  if (value.version !== FORMAT_VERSION) {
    problems.push(`${at}: version must be ${FORMAT_VERSION}; this reader knows no other`);
  }
  if (!isId(value.id)) problems.push(`${at}: id must be ${ID_RULE}`);
}

// --- The manifest ----------------------------------------------------------------

export function validateBook(value: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(value)) return ["book: must be an object"];
  header(value, BOOK_FORMAT, "book", problems);
  extraKeys(value, ["format", "version", "id", "title", "authors", "language", "chapters", "removed"], "book", problems);
  if (!isText(value.title)) problems.push("book: title must be text");
  if (!Array.isArray(value.authors) || !value.authors.every(isText)) {
    problems.push("book: authors must be a list of names; it may be empty");
  }
  if (value.language !== undefined && !(typeof value.language === "string" && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value.language))) {
    problems.push('book: language must be a language tag such as "en" or "pt-BR"');
  }

  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  if (!Array.isArray(value.chapters)) {
    problems.push("book: chapters must be a list; it may be empty");
  } else {
    value.chapters.forEach((entry, n) => {
      const at = `book: chapter ${n + 1}`;
      if (!isObject(entry)) return void problems.push(`${at}: must be an object`);
      extraKeys(entry, ["id", "title", "file"], at, problems);
      if (!isId(entry.id)) problems.push(`${at}: id must be ${ID_RULE}`);
      else if (seenIds.has(entry.id)) problems.push(`${at}: id "${entry.id}" is used twice`);
      else seenIds.add(entry.id);
      if (!isText(entry.title)) problems.push(`${at}: title must be text`);
      if (!isRelativePath(entry.file)) {
        problems.push(`${at}: file must be a path next to the manifest, such as "chapters/${String(entry.id)}.json"`);
      } else if (seenFiles.has(entry.file)) problems.push(`${at}: file "${entry.file}" is used twice`);
      else seenFiles.add(entry.file);
    });
  }

  if (value.removed !== undefined) {
    if (!Array.isArray(value.removed)) {
      problems.push("book: removed must be a list");
    } else {
      value.removed.forEach((entry, n) => {
        const at = `book: removed chapter ${n + 1}`;
        if (!isObject(entry)) return void problems.push(`${at}: must be an object`);
        extraKeys(entry, ["id", "title"], at, problems);
        if (!isId(entry.id)) problems.push(`${at}: id must be ${ID_RULE}`);
        else if (seenIds.has(entry.id)) {
          problems.push(`${at}: id "${entry.id}" is used twice; a removed chapter's id is never used again`);
        } else seenIds.add(entry.id);
        if (!isText(entry.title)) problems.push(`${at}: title must be text`);
      });
    }
  }
  return problems;
}

// --- A chapter document ----------------------------------------------------------

interface Context {
  problems: string[];
  blockIds: Set<string>;
  /** The footnote ids called from the text, in order. */
  calls: string[];
  /** False inside a footnote, where a footnote call is not allowed. */
  footnotesAllowed: boolean;
}

function blockId(attrs: unknown, at: string, ctx: Context): void {
  if (!isObject(attrs) || attrs.id === undefined) return;
  if (!isId(attrs.id)) ctx.problems.push(`${at}: id must be ${ID_RULE}`);
  else if (ctx.blockIds.has(attrs.id)) ctx.problems.push(`${at}: id "${attrs.id}" is used twice`);
  else ctx.blockIds.add(attrs.id);
}

function inline(nodes: unknown, at: string, ctx: Context): void {
  if (nodes === undefined) return;
  if (!Array.isArray(nodes)) return void ctx.problems.push(`${at}: content must be a list`);
  nodes.forEach((node, n) => {
    const here = `${at}, inline ${n + 1}`;
    if (!isObject(node)) return void ctx.problems.push(`${here}: must be an object`);
    switch (node.type) {
      case "text": {
        extraKeys(node, ["type", "text", "marks"], here, ctx.problems);
        if (typeof node.text !== "string" || node.text === "") ctx.problems.push(`${here}: text must not be empty`);
        if (node.marks === undefined) break;
        if (!Array.isArray(node.marks)) {
          ctx.problems.push(`${here}: marks must be a list`);
          break;
        }
        const seen = new Set<unknown>();
        for (const mark of node.marks) {
          if (!isObject(mark) || !["bold", "italic", "link"].includes(mark.type as string)) {
            ctx.problems.push(`${here}: a mark must be bold, italic or link`);
            continue;
          }
          if (seen.has(mark.type)) ctx.problems.push(`${here}: the ${String(mark.type)} mark is there twice`);
          seen.add(mark.type);
          if (mark.type === "link") {
            extraKeys(mark, ["type", "attrs"], here, ctx.problems);
            if (!isObject(mark.attrs) || !isHttp(mark.attrs.href)) {
              ctx.problems.push(`${here}: a link needs attrs.href, a full http or https address`);
            } else extraKeys(mark.attrs, ["href"], `${here}, link`, ctx.problems);
          } else extraKeys(mark, ["type"], here, ctx.problems);
        }
        break;
      }
      case "hardBreak":
        extraKeys(node, ["type"], here, ctx.problems);
        break;
      case "footnoteRef":
        extraKeys(node, ["type", "attrs"], here, ctx.problems);
        if (!ctx.footnotesAllowed) ctx.problems.push(`${here}: a footnote cannot call another footnote`);
        if (!isObject(node.attrs) || !isId(node.attrs.id)) {
          ctx.problems.push(`${here}: a footnote call needs attrs.id, ${ID_RULE}`);
        } else {
          extraKeys(node.attrs, ["id"], `${here}, footnoteRef`, ctx.problems);
          ctx.calls.push(node.attrs.id);
        }
        break;
      default:
        ctx.problems.push(`${here}: "${String(node.type)}" is not an inline type (text, hardBreak, footnoteRef)`);
    }
  });
}

function paragraph(node: unknown, at: string, ctx: Context, withId: boolean): void {
  if (!isObject(node) || node.type !== "paragraph") return void ctx.problems.push(`${at}: must be a paragraph`);
  extraKeys(node, ["type", "attrs", "content"], at, ctx.problems);
  if (node.attrs !== undefined) {
    if (!isObject(node.attrs)) ctx.problems.push(`${at}: attrs must be an object`);
    else {
      extraKeys(node.attrs, withId ? ["id"] : [], at, ctx.problems);
      if (withId) blockId(node.attrs, at, ctx);
    }
  }
  inline(node.content, at, ctx);
}

function list(node: Json, at: string, ctx: Context): void {
  extraKeys(node, ["type", "attrs", "content"], at, ctx.problems);
  if (node.attrs !== undefined) {
    if (!isObject(node.attrs)) ctx.problems.push(`${at}: attrs must be an object`);
    else extraKeys(node.attrs, ["id"], at, ctx.problems);
  }
  blockId(node.attrs, at, ctx);
  if (!Array.isArray(node.content) || node.content.length === 0) {
    return void ctx.problems.push(`${at}: a list needs at least one item`);
  }
  node.content.forEach((item, n) => {
    const here = `${at}, item ${n + 1}`;
    if (!isObject(item) || item.type !== "listItem") return void ctx.problems.push(`${here}: must be a listItem`);
    extraKeys(item, ["type", "content"], here, ctx.problems);
    if (!Array.isArray(item.content) || item.content.length === 0) {
      return void ctx.problems.push(`${here}: an item needs at least one paragraph`);
    }
    item.content.forEach((child, k) => paragraph(child, `${here}, paragraph ${k + 1}`, ctx, false));
  });
}

function block(node: unknown, at: string, ctx: Context): void {
  if (!isObject(node)) return void ctx.problems.push(`${at}: must be an object`);
  switch (node.type) {
    case "paragraph":
      paragraph(node, at, ctx, true);
      break;
    case "heading":
      extraKeys(node, ["type", "attrs", "content"], at, ctx.problems);
      if (!isObject(node.attrs) || ![1, 2, 3].includes(node.attrs.level as number)) {
        ctx.problems.push(`${at}: a heading needs attrs.level 1, 2 or 3`);
      } else extraKeys(node.attrs, ["id", "level"], at, ctx.problems);
      blockId(node.attrs, at, ctx);
      inline(node.content, at, ctx);
      break;
    case "bulletList":
    case "orderedList":
      list(node, at, ctx);
      break;
    case "image":
      extraKeys(node, ["type", "attrs"], at, ctx.problems);
      if (!isObject(node.attrs)) {
        ctx.problems.push(`${at}: an image needs attrs with src and alt`);
        break;
      }
      extraKeys(node.attrs, ["id", "src", "alt", "caption"], at, ctx.problems);
      blockId(node.attrs, at, ctx);
      if (!isRelativePath(node.attrs.src)) {
        ctx.problems.push(`${at}: src must be a path next to the manifest, such as "images/oven.png"`);
      }
      if (typeof node.attrs.alt !== "string") {
        ctx.problems.push(`${at}: alt must say what the image shows; use "" for decoration`);
      }
      if (node.attrs.caption !== undefined && !isText(node.attrs.caption)) {
        ctx.problems.push(`${at}: caption must be text when it is there`);
      }
      break;
    default:
      ctx.problems.push(
        `${at}: "${String(node.type)}" is not a block type (paragraph, heading, bulletList, orderedList, image)`,
      );
  }
}

export function validateChapter(value: unknown): string[] {
  const problems: string[] = [];
  if (!isObject(value)) return ["chapter: must be an object"];
  header(value, CHAPTER_FORMAT, "chapter", problems);
  extraKeys(value, ["format", "version", "id", "content", "footnotes"], "chapter", problems);

  const ctx: Context = { problems, blockIds: new Set(), calls: [], footnotesAllowed: true };
  if (!Array.isArray(value.content)) problems.push("chapter: content must be a list of blocks; it may be empty");
  else value.content.forEach((node, n) => block(node, `block ${n + 1}`, ctx));

  const notes = value.footnotes;
  const noteIds = new Set<string>();
  if (notes !== undefined) {
    if (!isObject(notes)) {
      problems.push("chapter: footnotes must be an object, from footnote id to footnote");
    } else {
      const inside: Context = { ...ctx, calls: [], footnotesAllowed: false };
      for (const [id, note] of Object.entries(notes)) {
        const at = `footnote "${id}"`;
        if (!isId(id)) problems.push(`${at}: id must be ${ID_RULE}`);
        noteIds.add(id);
        if (!isObject(note) || !Array.isArray(note.content) || note.content.length === 0) {
          problems.push(`${at}: needs content with at least one paragraph`);
          continue;
        }
        extraKeys(note, ["content"], at, problems);
        note.content.forEach((child, k) => paragraph(child, `${at}, paragraph ${k + 1}`, inside, false));
      }
    }
  }

  const called = new Set<string>();
  for (const id of ctx.calls) {
    if (called.has(id)) problems.push(`footnote "${id}": is called twice; each call needs its own footnote`);
    called.add(id);
    if (!noteIds.has(id)) problems.push(`footnote "${id}": is called in the text and has no note`);
  }
  for (const id of noteIds) {
    if (!called.has(id)) problems.push(`footnote "${id}": has a note and is never called in the text`);
  }
  return problems;
}

/** A chapter against its manifest: the manifest lists it, and under the same id. */
export function validateChapterOf(book: Book, chapter: Chapter): string[] {
  if (book.chapters.some((entry) => entry.id === chapter.id)) return [];
  if (book.removed?.some((entry) => entry.id === chapter.id)) {
    return [`chapter "${chapter.id}": the manifest lists this chapter as removed`];
  }
  return [`chapter "${chapter.id}": is not in the manifest`];
}
