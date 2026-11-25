# 0001: CodeMirror 6 for code, Tiptap's open-source packages for manuscripts

Date: 2026-11-25. Status: accepted, now with a first comparison behind it.

## Decision

The code profile runs on CodeMirror 6. The manuscript profile and the chapter editor run on Tiptap's open-source packages and ProseMirror. We use the released packages and do not fork them.

This was first decided before any comparison, because a small thing that works teaches more than a plan. The comparison is now done, on one machine, and the choice stays. The numbers are in [`bench/results/2026-11-25.md`](../../bench/results/2026-11-25.md), and how they were taken is in [`bench/README.md`](../../bench/README.md).

## What the comparison found

Measured on 2026-11-25 on an AMD Ryzen 9 9900X with 94 GB of memory, Windows 11, headless Chromium 159. Five runs for each row. "Work" is main-thread time for one key.

**Code: CodeMirror 6 against Monaco.**

| | CodeMirror 6 | Monaco |
| --- | ---: | ---: |
| Work for each key, 1 MB of ordinary lines | 4.1 ms | 2.1 ms |
| Load, 1 MB of ordinary lines | 33 ms | 102 ms |
| Heap after load, 1 MB | 7.2 MB | 23.8 MB |
| Files the page fetches, gzip | 157 kB | 761 kB |
| Work for each key at the end of a 50,000-character line | 31 ms | 3.5 ms, without drawing it |
| The same, with Monaco made to draw the line | 31 ms | 117 ms |

- On ordinary files both are far inside one screen frame for each key. Monaco does about half the work. Nobody could see that difference.
- CodeMirror loads three times faster, holds a third of the memory, and is a fifth of the size.
- Long lines are CodeMirror's weak spot. At the end of a 50,000-character line it needs 31 ms for each key, and its wait to the next frame was 39 ms at p95. That is slower than the 32 ms the plan proposes.
- Monaco looks ten times faster there only because, by default, it stops drawing a line after 10,000 characters. The typed keys were at column 50,000 and were not on screen. With that limit off, Monaco needs 117 ms for each key.

**Manuscripts: Tiptap against Lexical**, on one chapter of 20,000 words.

| | Tiptap | Lexical |
| --- | ---: | ---: |
| Work for each key | 1.8 ms | 2.4 ms |
| Load | 32 ms | 33 ms |
| Heap after load | 2.8 MB | 2.7 MB |
| Files the page fetches, gzip | 114 kB | 89 kB |

There is no difference here that matters. Both are fast, and the ranges of the five runs overlap. Lexical is 25 kB smaller.

**Our own code on top of the engines.** The code profile and the chapter editor were measured beside the bare engines.

| | Engine alone | Our profile on it |
| --- | ---: | ---: |
| Code, 1 MB of ordinary lines | 4.1 ms | 4.6 ms |
| Code, end of a 50,000-character line | 31.2 ms | 29.1 ms |
| Chapter of 20,000 words | 1.8 ms | 1.7 ms |

Our code costs about half a millisecond for each key on the 1 MB file, with overlapping ranges, and nothing that shows on the other two. The chapter editor adds 16 kB to the files.

## Why the choice stays

- **Code.** The plan puts mobile input, accessibility and small embeds first, and says Monaco excludes mobile support. Monaco's edge in work for each key is real and invisible. Its costs in size, memory and load are visible on every page that embeds a code field.
- **Manuscripts.** Speed does not separate the two. The reasons to stay are the ones this project already paid for: the manuscript format has the shape of ProseMirror's JSON (decision 0007), and the chapter editor and its tests exist. Lexical's smaller size is not worth a rewrite.

## What this comparison does not show

- It is one fast desktop and one headless browser. It says nothing about a phone or Safari.
- It is typing Latin text at one place. No paste, no composition input, no scrolling.
- Peak memory was not measured, only the heap after a collection.
- The plan's 32 ms target names "reference hardware" and does not say which. So no target is called met. On this machine the wait to the next frame was 18 ms at p95 for a 1 MB file and 15 ms for a 20,000-word chapter.
- One thing is not explained. CodeMirror's median wait to the next frame is about 9 ms, on a 2 kB file as on a 1 MB file, while its work is 3 to 4 ms. Monaco, Tiptap and Lexical wait about 2 ms. The controls rule out the document. It is an open issue.

## Licences

Every package that ships is MIT today. `THIRD-PARTY.md` lists them, and `node scripts/licenses.mjs --check` fails the build on a licence that is not on the allowed list. Tiptap also sells features and a hosted service. They are not in its MIT packages, and nothing here uses them.

Monaco and Lexical are MIT too. They are dependencies of the `bench` package only. Nothing in the editor package imports them, and they are not in `THIRD-PARTY.md` because they do not ship.

## What would change this

- **Long lines.** If hosts open minified files often, CodeMirror needs a guard of its own: stop drawing, or warn, past some line length. That is cheaper than changing engine.
- **A measurement on a phone**, or with composition input, that goes against either engine.
- **A need for Monaco's language services.** The plan keeps a Monaco adapter as a later option for hosts that already have one.
