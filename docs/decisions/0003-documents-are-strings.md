# 0003: A document is a string, and each profile names its own commands

Date: 2026-11-25. Status: accepted for the first slice.

## Decision

- `getDocument()`, `setDocument()` and the `"change"` event all carry a string.
- For `"code"` the string is the source text. The editor writes it back with
  the line ending the text came with: `\r\n` when the text has more of those
  than bare `\n`, else `\n`. A file with mixed endings comes back with one.
- For `"manuscript"` the string is a small Markdown subset: paragraphs, line
  breaks, bold, italic, links and bullet lists. Nothing else is Markdown
  there: a `#` is a `#`.
- Each profile has its own commands. `"find"` exists for code. `"bold"`
  exists for manuscripts. An unknown command is an error, not a silent no.
- `extensions` and `storage` are in the options, as the plan's example shows,
  but passing either is an error. They do not pretend to work.

## Why

A string is the smallest thing a host can save, compare and send. The plan
keeps source text and structured documents as two models; a string per
profile does not merge them, it only gives both the same shape at the edge.

The plan says engine features must not be flattened into one restrictive
common API. Separate command lists follow that: the shared part is small
(`on`, `execute`, `getDocument`, `setDocument`, `destroy`) and the rest
belongs to the profile.

## Cost, and what would change this

The Markdown subset cannot hold headings, footnotes, images or chapters. The
plan's manuscript schema needs all of them. When the draft schema lands, the
manuscript document becomes that schema, and the Markdown subset becomes one
import and export format. That is a breaking change to the manuscript
profile, and it is expected.
