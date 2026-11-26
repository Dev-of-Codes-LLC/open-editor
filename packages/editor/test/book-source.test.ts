// A chapter as Markdown source and as HTML source, and Markdown on its way
// back in. The last step back, from HTML into a chapter, needs a browser and
// is tested there (tests/browser/views.spec.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { chapterToHtmlSource, chapterToMarkdownSource, keepBlockIds } from "../src/book/index";
import type { Chapter } from "../src/book/index";
import { footnoteId, markdownToHtml } from "../src/manuscript/source";

const json = (path: string): Chapter => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../examples/book/chapters/${path}`, import.meta.url)), "utf8"));
const first = json("ch-before-light.json");
const loaf = json("ch-first-loaf.json");

describe("a chapter as Markdown source", () => {
  test("the first example chapter, exactly", () => {
    assert.equal(
      chapterToMarkdownSource(first),
      [
        "The kitchen was **quiet** before six. The ovens had been on since four[^fn-ovens], and the first trays were _almost_ ready.",
        "",
        "# What waits on the bench",
        "",
        "- flour",
        "- butter",
        "- _patience_",
        "",
        "[^fn-ovens]: A stone oven needs about two hours to come up to heat.",
        "",
      ].join("\n"),
    );
  });

  test("a heading starts at one #, and an image keeps its caption in its title", () => {
    const text = chapterToMarkdownSource(loaf);
    assert.ok(text.includes('![A round loaf with a cross cut in its top.](images/loaf.svg "The first loaf, scored and ready.")'), text);
    assert.ok(text.includes("\n# How to read a loaf\n"), text);
    assert.ok(text.includes("1. Knock on the base."), text);
  });

  test("an empty chapter is empty text", () => {
    assert.equal(chapterToMarkdownSource({ ...first, content: [], footnotes: undefined }), "");
  });
});

describe("a chapter as HTML source", () => {
  test("the first example chapter, exactly", () => {
    assert.equal(
      chapterToHtmlSource(first),
      [
        '<p id="p-kitchen-quiet">The kitchen was <strong>quiet</strong> before six. The ovens had been on since four<sup><a href="#fn-ovens">1</a></sup>, and the first trays were <em>almost</em> ready.</p>',
        '<h1 id="h-what-waits">What waits on the bench</h1>',
        "<ul>",
        "  <li>flour</li>",
        "  <li>butter</li>",
        "  <li><em>patience</em></li>",
        "</ul>",
        "",
        '<section class="footnotes">',
        "  <ol>",
        '    <li id="fn-ovens">A stone oven needs about two hours to come up to heat.</li>',
        "  </ol>",
        "</section>",
        "",
      ].join("\n"),
    );
  });

  test("an image is a figure with the path in the book, not an address made for a page", () => {
    const text = chapterToHtmlSource(loaf);
    assert.ok(text.includes('<figure id="img-loaf">\n  <img src="images/loaf.svg" alt="A round loaf with a cross cut in its top.">\n  <figcaption>The first loaf, scored and ready.</figcaption>\n</figure>'), text);
  });

  test("text cannot add markup of its own", () => {
    const text = chapterToHtmlSource({ ...first, footnotes: undefined, content: [{ type: "paragraph", content: [{ type: "text", text: '<script>alert(1)</script> & "quotes"' }] }] });
    assert.equal(text, '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; "quotes"</p>\n');
  });
});

describe("Markdown on its way back in", () => {
  test("a footnote call and its note come out in the shape the HTML view uses", () => {
    const html = markdownToHtml("Text[^fn-ovens].\n\n[^fn-ovens]: A note.\n");
    assert.ok(html.includes('<sup><a href="#fn-ovens">1</a></sup>'), html);
    assert.ok(html.includes('<section class="footnotes"><ol>'), html);
    assert.ok(html.includes('<li id="fn-ovens"><p>A note.</p>'), html);
    assert.ok(!html.includes("↩"), html);
  });

  test("the signs for each style become the tags the engine reads", () => {
    const html = markdownToHtml("**b** _i_ ~~s~~ `c` <u>u</u> <mark>h</mark> x<sup>2</sup> y<sub>2</sub>\n\n# One\n\n> Quoted.\n\n1. first\n");
    for (const part of ["<strong>b</strong>", "<em>i</em>", "<s>s</s>", "<code>c</code>", "<u>u</u>", "<mark>h</mark>", "<sup>2</sup>", "<sub>2</sub>", "<h1>One</h1>", "<blockquote>", "<ol>"]) {
      assert.ok(html.includes(part), `${part} missing from ${html}`);
    }
  });

  test("an image's title is kept for its caption, and a backslash at a line's end is a line break", () => {
    assert.ok(markdownToHtml('![alt](images/a.svg "cap")').includes('<img src="images/a.svg" alt="alt" title="cap">'));
    assert.ok(markdownToHtml("one\\\ntwo").includes("one<br>"));
  });

  test("a footnote label a person typed becomes an id the format accepts", () => {
    assert.equal(footnoteId("fn-ovens"), "fn-ovens");
    assert.equal(footnoteId("1"), "fn-1");
    assert.equal(footnoteId("My Note!"), "my-note-");
    assert.match(footnoteId("?"), /^[a-z0-9][a-z0-9_-]{2,63}$/);
  });
});

describe("block ids after a trip through Markdown", () => {
  // A deep copy with the ids taken off, as a chapter looks when it has been read back from Markdown.
  const copy = (chapter: Chapter): Chapter => JSON.parse(JSON.stringify(chapter));
  const strip = (original: Chapter, chapter = copy(original)): Chapter => ({ ...chapter, content: chapter.content.map((block) => ({ ...block, attrs: block.type === "heading" ? { level: block.attrs.level } : block.type === "image" ? { ...block.attrs, id: undefined } : undefined }) as never) });

  test("an unchanged block gets its id back", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(keepBlockIds(first, strip(first)))), first);
    assert.deepEqual(JSON.parse(JSON.stringify(keepBlockIds(loaf, strip(loaf)))), loaf);
  });

  test("an edited block comes back without one, and no id is given twice", () => {
    const edited = strip(first);
    (edited.content[1] as any).content[0].text = "What waits on the table";
    edited.content.push(JSON.parse(JSON.stringify(strip(first).content[0])));
    const result = keepBlockIds(first, edited);
    assert.equal((result.content[0] as any).attrs.id, "p-kitchen-quiet");
    assert.equal((result.content[1] as any).attrs.id, undefined);
    assert.equal((result.content.at(-1) as any).attrs?.id, undefined);
  });
});
