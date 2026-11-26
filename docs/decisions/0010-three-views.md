# 0010: Three views of one chapter: formatted, Markdown and HTML

Date: 2026-11-25. Status: accepted.

## Decision

A chapter can be seen and edited three ways, and all three edit the same chapter document.

1. **Formatted** is the editing engine.
2. **Markdown** and **HTML** show the chapter as source text in our own code editor.
3. **Writing source is our code.** `chapterToMarkdownSource` and `chapterToHtmlSource` write the two from a chapter document. They need no browser.
4. **Reading source goes one way in.** Markdown is turned into HTML by `markdown-it`. HTML is tidied, and then the engine's own parser builds the chapter. There is no second parser of ours.
5. **Source is read back a quarter of a second after the typing stops**, and at once when the view changes, when the host asks for the chapter, and before a save or an export.
6. **The format's rules hold in every view.** What comes back is a valid chapter document, whatever was typed.

## What each view writes

| In the chapter | Markdown | HTML |
| --- | --- | --- |
| Heading 1, 2, 3 | `#`, `##`, `###` | `<h1>`, `<h2>`, `<h3>` |
| Bold, italic | `**b**`, `_i_` | `<strong>`, `<em>` |
| Strikethrough, code | `~~s~~`, `` `c` `` | `<s>`, `<code>` |
| Underline, highlight | `<u>`, `<mark>` | `<u>`, `<mark>` |
| Superscript, subscript | `<sup>`, `<sub>` | `<sup>`, `<sub>` |
| Block quote | `> ` | `<blockquote>` |
| Lists | `- ` and `1. ` | `<ul>`, `<ol>` |
| Image with a caption | `![alt](path "caption")` | `<figure>` with `<img>` and `<figcaption>` |
| Footnote | `[^id]` and `[^id]: note` | `<sup><a href="#id">` and a list in `<section class="footnotes">` |
| A block's id | no place for it | `id="..."` |

## Why

**Why one way in.** The engine's parser already knows the format: it keeps only the node and mark types the schema has. Sending both kinds of source through it means one set of rules. A `<script>`, an `onclick`, a `style` attribute or an `<iframe>` typed into the HTML view does not survive it, and nothing in the text is ever run. A test types all four and checks that nothing ran and nothing was fetched.

**Why a library for Markdown.** Authors will type Markdown nobody foresaw. `markdown-it` is a tested CommonMark parser, MIT. A parser of ours would be a second thing to get wrong.

**Why our own writers and not the engine's.** The engine's HTML carries its own marks: addresses made for the page, and class names. Source that a person edits should be clean, and it should hold the path of an image in the book, not an address.

**Why images from the web are refused.** The format says an image is a file of the book. A web address typed into a source view is refused where it is read, so the editor never creates the image and the page never asks for it.

**Why block ids are matched after Markdown.** Markdown has no place for a block's id. After a read from Markdown, a block whose kind and text are unchanged gets its old id back. An edited block comes back without one. HTML keeps ids as attributes, so it needs no matching.

**Why the code editor for source.** It is ours, and source is what it is for: line numbers, search, undo. It got one new option, `wrapLines`, because prose lines are long.

## Measured

On 2026-11-25, minified, from `pnpm measure`:

| File | Before | After |
| --- | ---: | ---: |
| `book-workspace.js`, gzip | 142.7 kB | 357.2 kB |

The author workspace now carries the code editor (about 160 kB) and the Markdown parser. That is two and a half times the size, for a feature some authors will never open.

## Licences

`markdown-it` and `markdown-it-footnote` are MIT. `markdown-it` installs `argparse` for its own command-line tool, under PSF-2.0, which is not on the allowed list. Nothing here imports it and it is in no built file. The owner allowed it by name on 2026-11-25. `scripts/licenses.mjs` holds that as an exception for this one package, and `THIRD-PARTY.md` shows it.

## Cost, and what would change this

- **Size.** Load the source views only when one is first opened. That would return the workspace to about its old size for authors who stay in the formatted view. Not done.
- **No syntax colours** in the source views.
- **A switch of view rewrites the source in one layout.** A person's own spacing and line breaks in the Markdown are not kept.
- **An empty paragraph does not survive Markdown**, which cannot say one.
- **Undo in the formatted view after a source edit goes back in large steps.** Each read of the source replaces the document.
- **A large chapter is read back whole** on each pause in typing. Not measured on the 20,000-word chapter.
- **Markdown that the format cannot hold is flattened, with no message**: a table, a code block, a list inside a list. The exports report what they leave out; the source views do not yet.
