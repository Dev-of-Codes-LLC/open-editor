// Word count, the two exports, and the step between the engine's JSON and a
// chapter document. No browser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { bookToHtml, bookToMarkdown, countWords, countWordsIn, validateChapter } from "../src/book/index";
import type { Book, Chapter } from "../src/book/index";
import { fromChapter, toChapter } from "../src/manuscript/editor-json";

const json = (path: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../examples/book/${path}`, import.meta.url)), "utf8"));
const book: Book = json("book.json");
const chapters = new Map<string, Chapter>(book.chapters.map((entry) => [entry.id, json(entry.file)]));
const first = chapters.get("ch-before-light")!;

const chapter = (content: Chapter["content"], footnotes?: Chapter["footnotes"]): Chapter => ({
  format: "open-editor.chapter",
  version: 0,
  id: "ch-test",
  content,
  ...(footnotes ? { footnotes } : {}),
});
const p = (text: string) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text }] });
const one: Book = { ...book, chapters: [{ id: "ch-test", title: "Test", file: "chapters/ch-test.json" }], removed: [] };

describe("word count", () => {
  test("counts the body text: paragraphs, headings and list items", () => {
    // 20 in the paragraph, 5 in the heading, 3 in the list.
    assert.equal(countWords(first, "en"), 28);
  });

  test("does not count footnotes, captions or alt text", () => {
    const loaf = chapters.get("ch-first-loaf")!;
    const withoutImage = { ...loaf, content: loaf.content.filter((block) => block.type !== "image") };
    assert.equal(countWords(loaf, "en"), countWords(withoutImage, "en"));
    assert.equal(countWords({ ...first, footnotes: undefined }, "en"), countWords(first, "en"));
  });

  test("a word with an apostrophe or a hyphen is one word, and numbers count", () => {
    assert.equal(countWordsIn("Don't over-prove it: 2 hours, not 12.", "en"), 7);
    assert.equal(countWordsIn("", "en"), 0);
    assert.equal(countWordsIn("  \n ", "en"), 0);
  });

  test("a language written without spaces is still counted", () => {
    assert.ok(countWordsIn("パン屋は六時に開きます。", "ja") > 3);
  });
});

describe("export to Markdown", () => {
  test("the example book, whole and in order", () => {
    const { text, lost } = bookToMarkdown(book, chapters);
    assert.deepEqual(lost, []);
    assert.ok(text.startsWith("# The Bakery at Six\n\nAn Example Author\n\n## Before Light\n\nThe kitchen was **quiet** before six."));
    assert.ok(text.includes("\n\n### What waits on the bench\n\n- flour\n- butter\n- _patience_\n\n[^fn-ovens]: A stone oven needs about two hours to come up to heat.\n\n## The First Loaf\n\n"));
    assert.ok(text.includes("![A round loaf with a cross cut in its top.](images/loaf.svg)\n\n_The first loaf, scored and ready._"));
    assert.ok(text.includes("1. Knock on the base. It should sound hollow.\n2. Look at the cut. It should have opened wide.\n3. Wait."));
    assert.ok(text.includes("At six the door opens.\\\nThe street is still dark"));
    assert.ok(text.endsWith("[^fn-warm]: Warm bread crackles as it cools.\n"));
  });

  test("text that looks like Markdown is written so that it stays text", () => {
    const { text } = bookToMarkdown(one, { "ch-test": chapter([p("# not a heading"), p("- not a list"), p("1. not a number"), p("2 * 3 = 6, a_b, [x] and <b>"), p("> not a quote")]) });
    assert.ok(text.includes("\\# not a heading"));
    assert.ok(text.includes("\\- not a list"));
    assert.ok(text.includes("\\1. not a number"));
    assert.ok(text.includes("2 \\* 3 = 6, a\\_b, \\[x\\] and \\<b>"));
    assert.ok(text.includes("\\> not a quote"));
  });

  test("a chapter whose document is missing is named, not skipped in silence", () => {
    const { text, lost } = bookToMarkdown(book, new Map([["ch-before-light", first]]));
    assert.deepEqual(lost, [
      'The chapter "The First Loaf" was left out: its document was not given.',
      'The chapter "The Open Door" was left out: its document was not given.',
    ]);
    assert.ok(!text.includes("## The First Loaf"));
  });
});

describe("export to HTML", () => {
  test("the example book, whole and in order", () => {
    const { text, lost } = bookToHtml(book, chapters);
    assert.deepEqual(lost, []);
    assert.ok(text.startsWith('<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">'));
    assert.ok(text.includes("  <title>The Bakery at Six</title>"));
    assert.ok(text.includes('  <section id="ch-before-light">\n    <h2>Before Light</h2>\n    <p>The kitchen was <strong>quiet</strong> before six.'));
    assert.ok(text.includes('since four<sup><a id="ref-ch-before-light-fn-ovens" href="#ch-before-light-fn-ovens">1</a></sup>, and the first trays were <em>almost</em> ready.</p>'));
    assert.ok(text.includes("    <h3>What waits on the bench</h3>\n    <ul>\n    <li>flour</li>"));
    assert.ok(text.includes('      <li id="ch-before-light-fn-ovens">A stone oven needs about two hours to come up to heat. <a href="#ref-ch-before-light-fn-ovens" aria-label="Back to the text">↩</a></li>'));
    assert.ok(text.includes('      <img src="images/loaf.svg" alt="A round loaf with a cross cut in its top.">\n      <figcaption>The first loaf, scored and ready.</figcaption>'));
    assert.ok(text.includes('<a href="https://example.com/cooling-bread">a guide to cooling</a>'));
    assert.ok(text.includes("At six the door opens.<br>The street is still dark"));
    assert.ok(text.endsWith("  </section>\n</body>\n</html>\n"));
  });

  test("text cannot add markup of its own", () => {
    const hostile: Book = { ...one, title: 'A <script>alert(1)</script> & "title"', chapters: [{ ...one.chapters[0], title: "<img src=x onerror=alert(1)>" }] };
    const { text } = bookToHtml(hostile, {
      "ch-test": chapter([
        p("</p><script>alert(2)</script>"),
        { type: "image", attrs: { src: 'x" onerror="alert(3)', alt: '"><script>alert(4)</script>' } },
        { type: "paragraph", content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href: "javascript:alert(5)" } }] }] },
      ]),
    });
    assert.ok(!text.includes("<script>"));
    assert.ok(!text.includes("<img src=x"));
    assert.ok(!text.includes('onerror="alert(3)"'));
    assert.ok(!text.includes("javascript:"));
    assert.ok(text.includes("&lt;script&gt;alert(2)&lt;/script&gt;"));
    assert.ok(text.includes("<p>link</p>"));
  });

  test("two chapters can each have a footnote with the same id", () => {
    const note = { "fn-one": { content: [p("A note.")] } };
    const body = [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Text" }, { type: "footnoteRef" as const, attrs: { id: "fn-one" } }] }];
    const two: Book = { ...one, chapters: [{ id: "ch-a11", title: "A", file: "a.json" }, { id: "ch-b22", title: "B", file: "b.json" }] };
    const { text } = bookToHtml(two, { "ch-a11": { ...chapter(body, note), id: "ch-a11" }, "ch-b22": { ...chapter(body, note), id: "ch-b22" } });
    const ids = [...text.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `an id is used twice: ${ids.join(", ")}`);
  });
});

describe("from the engine's JSON to a chapter", () => {
  test("every example chapter goes to the engine's shape and back unchanged", () => {
    for (const original of chapters.values()) {
      assert.deepEqual(toChapter(original.id, fromChapter(original), original.footnotes), original);
    }
  });

  test("what the engine adds is taken off, and the result is valid", () => {
    const loose = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "p-one" }, content: [{ type: "text", text: "One" }] },
        // A split paragraph: the engine copied the id.
        { type: "paragraph", attrs: { id: "p-one" }, content: [{ type: "text", text: "" }, { type: "text", text: "Two", marks: [{ type: "link", attrs: { href: "https://example.com/", target: "_blank", rel: "noopener", class: null } }, { type: "bold" }, { type: "bold" }] }] },
        { type: "heading", attrs: { id: null, level: 2 }, content: [{ type: "text", text: "Head" }] },
        { type: "orderedList", attrs: { id: null, start: 1, type: null }, content: [{ type: "listItem", content: [{ type: "paragraph", attrs: { id: "p-one" }, content: [{ type: "text", text: "Item" }] }] }] },
        { type: "paragraph", attrs: { id: null }, content: [{ type: "footnoteRef", attrs: { id: "fn-kept" } }, { type: "footnoteRef", attrs: { id: "fn-kept" } }, { type: "footnoteRef", attrs: { id: "fn-gone" } }] },
        { type: "paragraph", attrs: { id: null }, content: [{ type: "text", text: "bad link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "paragraph", attrs: { id: null } },
      ],
    };
    const notes = { "fn-kept": { content: [p("Kept.")] }, "fn-unused": { content: [p("Its call was deleted.")] } };
    const result = toChapter("ch-test", loose, notes);
    assert.deepEqual(validateChapter(result), []);
    assert.deepEqual(result.content, [
      { type: "paragraph", attrs: { id: "p-one" }, content: [{ type: "text", text: "One" }] },
      { type: "paragraph", content: [{ type: "text", text: "Two", marks: [{ type: "link", attrs: { href: "https://example.com/" } }, { type: "bold" }] }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Head" }] },
      { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item" }] }] }] },
      { type: "paragraph", content: [{ type: "footnoteRef", attrs: { id: "fn-kept" } }] },
      { type: "paragraph", content: [{ type: "text", text: "bad link" }] },
      { type: "paragraph" },
    ]);
    assert.deepEqual(Object.keys(result.footnotes ?? {}), ["fn-kept"]);
  });

  test("an empty chapter gives the engine one empty paragraph to type in", () => {
    assert.deepEqual(fromChapter(chapter([])), { type: "doc", content: [{ type: "paragraph" }] });
  });
});
