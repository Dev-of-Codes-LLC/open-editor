// The manuscript format, version 0. Two things check a file: the validator
// in the package and the JSON Schema files in /schema. These tests run the
// same good and bad examples through both, so the two cannot drift apart.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import { describe, test } from "vitest";
import {
  chapterFromMarkdown,
  chapterToMarkdown,
  moveChapter,
  removeChapter,
  resolveChapter,
  validateBook,
  validateChapter,
  validateChapterOf,
} from "../src/book/index";
import type { Book, Chapter } from "../src/book/index";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const json = (path: string) => JSON.parse(readFileSync(here(path), "utf8"));

const ajv = new Ajv2020({ allErrors: true });
const bookSchema = ajv.compile(json("../../../schema/book.schema.json"));
const chapterSchema = ajv.compile(json("../../../schema/chapter.schema.json"));

const book: Book = json("../../../examples/book/book.json");
const chapters: Chapter[] = book.chapters.map((entry) => json(`../../../examples/book/${entry.file}`));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** A copy of the example with one thing changed. */
const changed = <T>(value: T, change: (copy: any) => void): T => {
  const copy = clone(value);
  change(copy);
  return copy;
};

describe("the example book", () => {
  test("the manifest passes the validator and the JSON Schema", () => {
    assert.deepEqual(validateBook(book), []);
    assert.equal(bookSchema(book), true, JSON.stringify(bookSchema.errors));
  });

  test("every chapter passes both, and belongs to the manifest", () => {
    assert.equal(chapters.length, 3);
    for (const chapter of chapters) {
      assert.deepEqual(validateChapter(chapter), [], chapter.id);
      assert.equal(chapterSchema(chapter), true, `${chapter.id}: ${JSON.stringify(chapterSchema.errors)}`);
      assert.deepEqual(validateChapterOf(book, chapter), []);
    }
  });

  test("every file the book names is there", () => {
    for (const entry of book.chapters) assert.ok(existsSync(here(`../../../examples/book/${entry.file}`)), entry.file);
    for (const chapter of chapters) {
      for (const block of chapter.content) {
        if (block.type === "image") assert.ok(existsSync(here(`../../../examples/book/${block.attrs.src}`)), block.attrs.src);
      }
    }
  });

  test("the example uses every block, inline and mark type of the format", () => {
    const seen = new Set<string>();
    const walk = (node: any) => {
      if (node.type) seen.add(node.type);
      for (const mark of node.marks ?? []) seen.add(`mark:${mark.type}`);
      for (const child of node.content ?? []) walk(child);
    };
    for (const chapter of chapters) {
      chapter.content.forEach(walk);
      for (const note of Object.values(chapter.footnotes ?? {})) note.content.forEach(walk);
    }
    assert.deepEqual(
      [...seen].sort(),
      [
        "bulletList",
        "footnoteRef",
        "hardBreak",
        "heading",
        "image",
        "listItem",
        "mark:bold",
        "mark:italic",
        "mark:link",
        "orderedList",
        "paragraph",
        "text",
      ],
    );
  });
});

// Each bad example: what is wrong, the changed value, and a word the
// validator's message must hold. `schema: false` marks the rules a JSON
// Schema cannot express; there only the validator is expected to object.
interface Bad {
  name: string;
  value: unknown;
  says: RegExp;
  schema?: false;
}

const first = chapters[0];
const second = chapters[1];

const badBooks: Bad[] = [
  { name: "not an object", value: [], says: /must be an object/ },
  { name: "another format", value: changed(book, (b) => (b.format = "something.else")), says: /format must be/ },
  { name: "a version this reader does not know", value: changed(book, (b) => (b.version = 1)), says: /version must be 0/ },
  { name: "no title", value: changed(book, (b) => delete b.title), says: /title must be text/ },
  { name: "a blank title", value: changed(book, (b) => (b.title = "   ")), says: /title must be text/ },
  { name: "authors as one string", value: changed(book, (b) => (b.authors = "A. Writer")), says: /authors must be a list/ },
  { name: "a language that is not a tag", value: changed(book, (b) => (b.language = "English, mostly")), says: /language tag/ },
  { name: "an id with capitals", value: changed(book, (b) => (b.chapters[0].id = "Chapter-One")), says: /id must be/ },
  { name: "an id that is too short", value: changed(book, (b) => (b.chapters[0].id = "c1")), says: /id must be/ },
  { name: "a chapter file outside the book", value: changed(book, (b) => (b.chapters[0].file = "../secrets.json")), says: /path next to the manifest/ },
  { name: "a chapter file with a web address", value: changed(book, (b) => (b.chapters[0].file = "https://example.com/c.json")), says: /path next to the manifest/ },
  { name: "a chapter file from the root", value: changed(book, (b) => (b.chapters[0].file = "/etc/c.json")), says: /path next to the manifest/ },
  { name: "a field the format does not have", value: changed(book, (b) => (b.publisher = "Example Press")), says: /"publisher" is not part of the format/ },
  { name: "a chapter with a position number", value: changed(book, (b) => (b.chapters[0].order = 1)), says: /"order" is not part of the format/ },
  { name: "two chapters with one id", value: changed(book, (b) => (b.chapters[1].id = b.chapters[0].id)), says: /used twice/, schema: false },
  { name: "two chapters in one file", value: changed(book, (b) => (b.chapters[1].file = b.chapters[0].file)), says: /used twice/, schema: false },
  { name: "a removed chapter's id used again", value: changed(book, (b) => (b.chapters[0].id = b.removed[0].id)), says: /never used again/, schema: false },
];

const badChapters: Bad[] = [
  { name: "not an object", value: "text", says: /must be an object/ },
  { name: "the manifest's format", value: changed(first, (c) => (c.format = "open-editor.book")), says: /format must be/ },
  { name: "no content", value: changed(first, (c) => delete c.content), says: /content must be a list/ },
  { name: "a block type the format does not have", value: changed(first, (c) => (c.content[0].type = "table")), says: /"table" is not a block type/ },
  { name: "an inline type the format does not have", value: changed(first, (c) => (c.content[0].content[0] = { type: "emoji", name: "bread" })), says: /"emoji" is not an inline type/ },
  { name: "empty text", value: changed(first, (c) => (c.content[0].content[0].text = "")), says: /text must not be empty/ },
  { name: "a mark the format does not have", value: changed(first, (c) => (c.content[0].content[1].marks = [{ type: "underline" }])), says: /bold, italic or link/ },
  { name: "a link that is not http or https", value: changed(second, (c) => (c.content[3].content[2].content[0].content[1].marks[0].attrs.href = "javascript:alert(1)")), says: /http or https/ },
  { name: "a heading with no level", value: changed(first, (c) => delete c.content[1].attrs.level), says: /level 1, 2 or 3/ },
  { name: "a heading of level 4", value: changed(first, (c) => (c.content[1].attrs.level = 4)), says: /level 1, 2 or 3/ },
  { name: "a list with no items", value: changed(first, (c) => (c.content[2].content = [])), says: /at least one item/ },
  { name: "a list inside a list item", value: changed(first, (c) => (c.content[2].content[0].content[0] = clone(first.content[2]))), says: /must be a paragraph/ },
  { name: "an image with no alt", value: changed(second, (c) => delete c.content[1].attrs.alt), says: /alt must say/ },
  { name: "an image from the web", value: changed(second, (c) => (c.content[1].attrs.src = "https://example.com/loaf.png")), says: /src must be a path/ },
  { name: "a footnote with no paragraph", value: changed(first, (c) => (c.footnotes["fn-ovens"].content = [])), says: /at least one paragraph/ },
  { name: "a footnote that calls a footnote", value: changed(first, (c) => c.footnotes["fn-ovens"].content[0].content.push({ type: "footnoteRef", attrs: { id: "fn-ovens" } })), says: /cannot call another footnote/ },
  { name: "a field the format does not have", value: changed(first, (c) => (c.wordCount = 40)), says: /"wordCount" is not part of the format/ },
  { name: "a footnote call with no note", value: changed(first, (c) => delete c.footnotes), says: /has no note/, schema: false },
  { name: "a note that is never called", value: changed(first, (c) => c.content[0].content.splice(3, 1)), says: /never called/, schema: false },
  { name: "one note called twice", value: changed(first, (c) => c.content[1].content.push({ type: "footnoteRef", attrs: { id: "fn-ovens" } })), says: /called twice/, schema: false },
  { name: "two blocks with one id", value: changed(first, (c) => (c.content[1].attrs.id = c.content[0].attrs.id)), says: /used twice/, schema: false },
  { name: "the same mark twice", value: changed(first, (c) => c.content[0].content[1].marks.push({ type: "bold" })), says: /there twice/, schema: false },
];

describe("what the format refuses", () => {
  for (const [kind, list, validate, schema] of [
    ["manifest", badBooks, validateBook, bookSchema],
    ["chapter", badChapters, validateChapter, chapterSchema],
  ] as const) {
    for (const bad of list) {
      test(`${kind}: ${bad.name}`, () => {
        const problems = validate(bad.value);
        assert.ok(problems.length > 0, "the validator accepted it");
        assert.ok(problems.some((problem) => bad.says.test(problem)), `no message matched ${bad.says}: ${problems.join(" | ")}`);
        if (bad.schema === false) {
          assert.equal(schema(bad.value), true, "this rule was thought to be beyond a JSON Schema, and the schema caught it");
        } else {
          assert.equal(schema(bad.value), false, "the JSON Schema accepted it");
        }
      });
    }
  }

  test("a chapter the manifest does not list, or lists as removed, is named", () => {
    assert.match(validateChapterOf(book, { ...first, id: "ch-somewhere-else" })[0], /is not in the manifest/);
    assert.match(validateChapterOf(book, { ...first, id: "ch-a-note-on-flour" })[0], /as removed/);
  });
});

describe("changes that span chapters", () => {
  test("a move changes the order and nothing else", () => {
    const moved = moveChapter(book, "ch-open-door", 0);
    assert.deepEqual(moved.chapters.map((entry) => entry.id), ["ch-open-door", "ch-before-light", "ch-first-loaf"]);
    assert.deepEqual([...moved.chapters].sort((a, b) => a.id.localeCompare(b.id)), [...book.chapters].sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual({ ...moved, chapters: null }, { ...book, chapters: null });
    assert.deepEqual(validateBook(moved), []);
    assert.equal(book.chapters[0].id, "ch-before-light", "the manifest that was passed in is unchanged");
  });

  test("a move past either end stops at the end", () => {
    assert.equal(moveChapter(book, "ch-before-light", 99).chapters.at(-1)?.id, "ch-before-light");
    assert.equal(moveChapter(book, "ch-open-door", -5).chapters[0].id, "ch-open-door");
  });

  test("an id still points at its chapter after a move", () => {
    const moved = moveChapter(book, "ch-first-loaf", 2);
    assert.deepEqual(resolveChapter(book, "ch-first-loaf"), { state: "present", title: "The First Loaf", position: 1 });
    assert.deepEqual(resolveChapter(moved, "ch-first-loaf"), { state: "present", title: "The First Loaf", position: 2 });
  });

  test("a removed chapter leaves its id and title behind", () => {
    const after = removeChapter(book, "ch-first-loaf");
    assert.deepEqual(after.chapters.map((entry) => entry.id), ["ch-before-light", "ch-open-door"]);
    assert.deepEqual(resolveChapter(after, "ch-first-loaf"), { state: "removed", title: "The First Loaf" });
    assert.deepEqual(resolveChapter(after, "ch-never-existed"), { state: "unknown" });
    assert.deepEqual(validateBook(after), []);
    assert.equal(bookSchema(after), true);
    assert.equal(book.chapters.length, 3, "the manifest that was passed in is unchanged");
  });

  test("moving or removing a chapter that is not there is an error", () => {
    assert.throws(() => moveChapter(book, "ch-missing", 0), /No chapter with the id "ch-missing"/);
    assert.throws(() => removeChapter(book, "ch-a-note-on-flour"), /No chapter with the id/);
  });
});

describe("Markdown in and out", () => {
  const subset = [
    "One paragraph.",
    "Two lines\nin one paragraph.",
    "First.\n\nSecond.",
    "**bold** then _italic_ then **_both_**",
    "[a link](https://example.com/a_b) and [**a bold link**](https://example.com/)",
    "Before.\n\n- one\n- two\n- _three_\n\nAfter.",
    "",
  ];

  test("every part of the subset reads in as a valid chapter and writes back as the same text, with nothing lost", () => {
    for (const markdown of subset) {
      const chapter = chapterFromMarkdown("ch-imported", markdown);
      assert.deepEqual(validateChapter(chapter), [], markdown);
      assert.equal(chapterSchema(chapter), true, markdown);
      assert.deepEqual(chapterToMarkdown(chapter), { markdown, lost: [] }, markdown);
    }
  });

  test("a chapter with more than the subset is written as far as it goes, and the rest is reported", () => {
    assert.deepEqual(chapterToMarkdown(first), {
      markdown: "The kitchen was **quiet** before six. The ovens had been on since four, and the first trays were _almost_ ready.\n\nWhat waits on the bench\n\n- flour\n- butter\n- _patience_",
      lost: ["1 footnote was left out", "1 heading was written as a plain paragraph"],
    });
    assert.deepEqual(chapterToMarkdown(second).lost, [
      "1 image was left out",
      "1 heading was written as a plain paragraph",
      "1 numbered list was written as a bullet list",
    ]);
  });

  test("what export writes is itself a valid chapter when read back", () => {
    for (const chapter of chapters) {
      const back = chapterFromMarkdown(chapter.id, chapterToMarkdown(chapter).markdown);
      assert.deepEqual(validateChapter(back), []);
      assert.deepEqual(chapterToMarkdown(back).lost, []);
    }
  });
});
