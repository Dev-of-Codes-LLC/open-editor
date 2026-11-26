// The text styles and the block quote, through both exports and the step out
// of the engine. No browser.
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { bookToHtml, bookToMarkdown, chapterToMarkdown, countWords, validateChapter } from "../src/book/index";
import type { Block, Book, Chapter, SimpleMark } from "../src/book/index";
import { toChapter } from "../src/manuscript/editor-json";
import { STYLES, shortcutText } from "../src/manuscript/chapter";

const book: Book = { format: "open-editor.book", version: 0, id: "styles", title: "Styles", authors: [], chapters: [{ id: "ch-one", title: "One", file: "one.json" }] };
const chapter = (content: Block[]): Chapter => ({ format: "open-editor.chapter", version: 0, id: "ch-one", content });
const styled = (text: string, ...marks: SimpleMark[]) => ({ type: "text" as const, text, marks: marks.map((type) => ({ type })) });
const plain = (text: string) => ({ type: "text" as const, text });

const every = chapter([
  {
    type: "paragraph",
    content: [styled("b", "bold"), plain(" "), styled("i", "italic"), plain(" "), styled("u", "underline"), plain(" "), styled("s", "strike"), plain(" "), styled("h", "highlight"), plain(" "), styled("c", "code"), plain(" x"), styled("2", "superscript"), plain(" y"), styled("2", "subscript")],
  },
  { type: "blockquote", content: [{ type: "paragraph", content: [plain("First.")] }, { type: "paragraph", content: [plain("Second.")] }] },
]);

describe("the styles in the exports", () => {
  test("the example chapter is valid", () => {
    assert.deepEqual(validateChapter(every), []);
  });

  test("Markdown: what Markdown can say it says, and the rest is written as inline HTML", () => {
    const { text, lost } = bookToMarkdown(book, { "ch-one": every });
    assert.deepEqual(lost, []);
    assert.ok(text.includes("**b** _i_ <u>u</u> ~~s~~ <mark>h</mark> `c` x<sup>2</sup> y<sub>2</sub>"), text);
    assert.ok(text.includes("> First.\n>\n> Second."), text);
  });

  test("HTML: one tag for each style", () => {
    const { text } = bookToHtml(book, { "ch-one": every });
    assert.ok(text.includes("<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <mark>h</mark> <code>c</code> x<sup>2</sup> y<sub>2</sub></p>"), text);
    assert.ok(text.includes("    <blockquote>\n      <p>First.</p>\n      <p>Second.</p>\n    </blockquote>"), text);
  });

  test("styles that overlap nest properly, whatever order they were set in", () => {
    const both = chapter([{ type: "paragraph", content: [styled("a", "underline", "bold"), styled("b", "bold"), styled("c", "strike", "bold")] }]);
    assert.ok(bookToHtml(book, { "ch-one": both }).text.includes("<p><strong><u>a</u>b<s>c</s></strong></p>"));
    assert.ok(bookToMarkdown(book, { "ch-one": both }).text.includes("**<u>a</u>b~~c~~**"));
  });

  test("code is written as it is, and a tilde or a backtick in plain text stays text", () => {
    const tricky = chapter([{ type: "paragraph", content: [styled("a * b < `c`", "code"), plain(" and ~~not struck~~ and `not code`")] }]);
    const markdown = bookToMarkdown(book, { "ch-one": tricky }).text;
    // Two backticks around it, because the code holds one; and a space each side, because it ends with one.
    assert.ok(markdown.includes("`` a * b < `c` `` and \\~\\~not struck\\~\\~ and \\`not code\\`"), markdown);
    assert.ok(bookToHtml(book, { "ch-one": tricky }).text.includes("<code>a * b &lt; `c`</code>"));
  });

  test("the small Markdown subset drops the new styles and says so", () => {
    assert.deepEqual(chapterToMarkdown(every), {
      markdown: "**b** _i_ u s h c x2 y2\n\nFirst.\n\nSecond.",
      lost: [
        "6 pieces of text lost a style the subset does not have (underline, strikethrough, highlight, code, superscript or subscript)",
        "1 block quote was written as plain paragraphs",
      ],
    });
  });

  test("the words in a block quote are counted", () => {
    // Eight in the paragraph ("x2" and "y2" are one word each) and two in the quote.
    assert.equal(countWords(every, "en"), 10);
  });
});

describe("the styles on the way out of the engine", () => {
  test("every simple mark is kept, once, and superscript wins over a later subscript", () => {
    const result = toChapter("ch-one", {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "underline" }, { type: "underline" }, { type: "strike" }, { type: "highlight", attrs: { color: null } }, { type: "code" }, { type: "superscript" }, { type: "subscript" }, { type: "textStyle" }] }] },
        { type: "blockquote", attrs: { id: null }, content: [{ type: "paragraph", attrs: { id: "p-inside" }, content: [{ type: "text", text: "quoted" }] }, { type: "bulletList", content: [] }] },
        { type: "blockquote", content: [] },
      ],
    });
    assert.deepEqual(validateChapter(result), []);
    assert.deepEqual(result.content, [
      { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "underline" }, { type: "strike" }, { type: "highlight" }, { type: "code" }, { type: "superscript" }] }] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }] },
    ]);
  });
});

describe("the list of styles", () => {
  const items = STYLES.flatMap((group) => group.items);

  test("no two styles share a shortcut", () => {
    const keys = items.map((item) => item.keys.toLowerCase());
    assert.equal(new Set(keys).size, keys.length);
  });

  test("a shortcut reads the way each platform writes it", () => {
    assert.equal(shortcutText("Mod-b", false), "Ctrl+B");
    assert.equal(shortcutText("Mod-b", true), "⌘B");
    assert.equal(shortcutText("Mod-Shift-s", false), "Ctrl+Shift+S");
    assert.equal(shortcutText("Mod-Shift-s", true), "⇧⌘S");
    assert.equal(shortcutText("Mod-Alt-1", false), "Ctrl+Alt+1");
    assert.equal(shortcutText("Mod-Alt-1", true), "⌥⌘1");
    assert.equal(shortcutText("Mod-\\", false), "Ctrl+\\");
  });

  test("the menu offers what was asked for, and more", () => {
    assert.deepEqual(
      items.map((item) => item.label),
      ["Bold", "Italic", "Underline", "Strikethrough", "Highlight", "Code", "Superscript", "Subscript", "Normal text", "Heading 1", "Heading 2", "Heading 3", "Bullet list", "Numbered list", "Block quote", "Copy formatting", "Paste formatting", "Clear formatting"],
    );
  });
});
