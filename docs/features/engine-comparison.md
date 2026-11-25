# Engine comparison

The same documents in CodeMirror 6, Monaco, Tiptap and Lexical, measured in one browser on one machine.

| | |
|---|---|
| Status | Merged 2026-11-25 |
| Area | The evidence behind the choice of engines |
| Delivered in | [Pull request 15](https://github.com/Dev-of-Codes-LLC/open-editor/pull/15), brought to `main` in [Pull request 18](https://github.com/Dev-of-Codes-LLC/open-editor/pull/18) |
| Decisions | [0001 engines](../decisions/0001-engines.md) |
| Related | [Results of 2026-11-25](../../bench/results/2026-11-25.md), [how it is measured](../../bench/README.md), [the plan](https://devofcodes.com/open-editor.html) |

## At a glance

- The choice of engines stays: CodeMirror 6 for code, Tiptap for manuscripts.
- On ordinary files every engine does a few milliseconds of work for each key. Nobody could see the differences.
- CodeMirror is a fifth of Monaco's size, loads three times faster, and holds a third of the memory.
- CodeMirror is slow at the end of a very long line: 31 ms for each key at column 50,000.
- Our own profiles cost at most half a millisecond for each key on top of the engines.
- These are readings from one fast desktop. No target of the plan is called met.

## Why it exists

The engines were chosen before any measurement. The plan asks for a comparison on the hardest documents, with the same documents, hardware and features for each side. This is that comparison, cut down to what one person can run in a day.

## How it works

One command runs every engine on every document and writes each sample to a file.

1. Run `pnpm install`, `pnpm build` and `pnpm bench:build`.
2. Run `pnpm bench`. It takes about 20 minutes. Do not use the machine while it runs.
3. Run `node bench/report.mjs results/<date>.json`. It writes the tables.

One run is one fresh page. It loads a document, puts the caret in the middle, types 150 keys, then 150 more. Each row is five runs.

### The results, 2026-11-25

AMD Ryzen 9 9900X, 94 GB of memory, Windows 11, headless Chromium 159. "Work" is main-thread time for one key.

| Document | Subject | Work for each key | Load | Heap | Files, gzip |
|---|---|---:|---:|---:|---:|
| 1 MB of code | CodeMirror 6 | 4.1 ms | 33 ms | 7.2 MB | 157 kB |
| | Our code profile | 4.6 ms | 30 ms | 6.5 MB | 158 kB |
| | Monaco | 2.1 ms | 102 ms | 23.8 MB | 761 kB |
| 50,000-character lines | CodeMirror 6 | 31.2 ms | 38 ms | 6.5 MB | 157 kB |
| | Our code profile | 29.1 ms | 35 ms | 6.2 MB | 158 kB |
| | Monaco, as it comes | 3.5 ms | 402 ms | 10.0 MB | 761 kB |
| | Monaco, drawing the whole line | 117.1 ms | 837 ms | 52.8 MB | 761 kB |
| Chapter of 20,000 words | Tiptap | 1.8 ms | 32 ms | 2.8 MB | 114 kB |
| | Our chapter editor | 1.7 ms | 31 ms | 2.9 MB | 130 kB |
| | Lexical | 2.4 ms | 33 ms | 2.7 MB | 89 kB |

The full tables, with the wait to the next frame at p50, p95 and max, are in the results page.

### Two measures, and why

**The wait to the next frame** is what a person feels. On a 60 Hz screen that wait is anywhere from 0 to 17 ms whatever the engine does. The controls show it: a 2 kB file gives the same wait as a 1 MB file. So it answers "is it fast enough" and cannot tell two fast engines apart.

**Work for each key** is the main-thread time the browser spent because of the key, from the browser's own counters. It is the measure that separates the engines.

## What it guarantees

The runner checks three things on every run and prints "NOT A VALID COMPARISON" when one fails.

- **Every key arrived** in the document, in every run.
- **No page raised an error.**
- **Every code engine typed at the same line and column.**

Every figure in a table is in the JSON file next to it, with the samples behind it.

## What it does not do

- **One machine, one browser.** Nothing here says how a phone or Safari behaves.
- **No screen.** Headless Chromium paints to memory.
- **Typing Latin text at one place.** No paste, composition input, scrolling or search.
- **No peak memory.** The heap is read after a collection, at two points.
- **Not a test.** It does not run in CI, and no budget is set.

> **Limitation:** Monaco, as it comes, stops drawing a line after 10,000 characters. On the long-lines document the keys go in at column 50,000, so Monaco's 3.5 ms is for keys it does not draw. The row "drawing the whole line" turns that limit off.

> **Not verified:** CodeMirror's median wait to the next frame is about 9 ms on every document, the 2 kB control too, while Monaco, Tiptap and Lexical wait about 2 ms. Its work is only 3 to 4 ms. The cause is not found.

## Verification

| Check | Outcome |
|---|---|
| Every key arrived, in all 80 runs | pass |
| No page error | pass |
| Code engines typed at the same place | pass |
| A second machine, or a phone | not checked |
| A browser with a screen | not checked |

One finding about the benchmark itself: its first version let one subject type a line below the others. For a while that made our code profile look 50% slower than the engine under it. The third check above exists because of that.

## Technical appendix

| What | Where |
| --- | --- |
| How to run it and how to read it | `bench/README.md` |
| The documents, made from a fixed seed | `bench/src/fixtures.ts` |
| The six subjects | `bench/src/code-subjects.ts`, `bench/src/prose-subjects.ts` |
| The timing in the page | `bench/src/probe.ts` |
| The runner and its checks | `bench/run.mjs` |
| The tables | `bench/report.mjs` |
| Raw results | `bench/results/2026-11-25.json`, `bench/results/2026-11-25-monaco-no-line-limit.json` |

Monaco and Lexical are MIT. They are dependencies of the `bench` package only and do not ship in the editor.
