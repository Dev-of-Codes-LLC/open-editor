# Engine comparison

The same documents in each engine, in one browser, on one machine. This is the evidence behind [decision 0001](../docs/decisions/0001-engines.md).

Results: [`results/`](results/). Each run writes a JSON file with every sample, and `report.mjs` makes the Markdown page next to it.

## Run it

```bash
pnpm install
pnpm build                                   # the editor package
pnpm --filter open-editor-bench build        # the six pages
pnpm --filter open-editor-bench measure      # about 20 minutes; writes results/<date>.json
node bench/report.mjs results/<date>.json    # writes results/<date>.md
```

Close other programs first. Do not use the machine while it runs.

A quicker look: `node run.mjs --runs 2 --only monaco,codemirror --fixtures code-1mb`.

## What is compared

| Subject | What it is |
| --- | --- |
| CodeMirror 6 | The engine alone, with the extensions our code profile uses |
| Open Editor code profile | `createEditor({ profile: "code" })`, with a host that listens for `change` |
| Monaco | Its core editor with JavaScript colours, find and bracket matching. No TypeScript language service, and no suggestions while typing: the CodeMirror subjects have neither |
| Tiptap | The engine alone, with the extensions our chapter editor uses |
| Open Editor chapter editor | `createChapterEditor`, with its toolbar, and a host that listens for `change` |
| Lexical | Its rich-text, list and history packages |

Each engine gets the same text, the same box (900 by 560 pixels, scrolling inside) and, for code, the same type (14 px Consolas).

Our own profiles are in the list on purpose. The difference between an engine alone and our profile on it is what our code costs.

## The documents

They are made in the page from a fixed seed (`src/fixtures.ts`), so every engine and every run gets the same characters, and no large file is in the repository.

| Name | What |
| --- | --- |
| `code-1mb` | About 1 MB of ordinary JavaScript, 25,000 lines |
| `code-long-lines` | About 1 MB of JavaScript in 20 lines of about 50,000 characters each |
| `chapter-20k` | One chapter of 20,000 words, with headings and some bold and italic |
| `code-tiny`, `chapter-tiny` | Controls: 2 kB of code and 300 words. They show each engine's floor |

## What is measured

One run is one fresh page. It loads the document, puts the caret in the middle, types 150 keys 30 ms apart, then 150 more. Five runs for each row.

| Column | Meaning |
| --- | --- |
| Load | From the call that builds the editor to the end of the second frame after it. The engine's code is already loaded |
| Work for each key | Main-thread time the browser spent because of one key: the growth of the browser's own task-time counter over 150 keys, less what the page spends idle over the same stretch, divided by 150. Script and layout are two parts of it |
| Range over runs | The lowest and highest "work for each key" of the five runs |
| To next frame | From the time the browser received a key to the end of the next frame's paint work: the median of each run's p50 and p95, and the largest single figure |
| Heap after load | The JavaScript heap after a forced collection |
| Files | The JavaScript and CSS the page fetched, compressed |

The tables use the second 150 keys. The first 150 are reported under each table.

## How to read "to next frame"

It is what a person waits, and most of it can be the wait for the screen. On a 60 Hz screen the next frame is anywhere from 0 to 17 ms away, whatever the engine does. So this column answers "is it fast enough". It is a poor way to tell two fast engines apart. "Work for each key" is the column for that.

The controls show this: a 2 kB file gives the same "to next frame" as a 1 MB file.

## What the runner checks

A comparison is only worth something if every engine did the same thing. The runner checks three things, writes them into the results, and prints "NOT A VALID COMPARISON" when one fails:

- every key arrived in the document, in every run;
- no page raised an error;
- on each code document, every subject typed at the same line and column.

The third check exists because the first version of this benchmark got it wrong. One subject typed one line below the others, and for an hour it looked as if our code profile was 50% slower than the engine under it.

## What these numbers leave out

- **One machine, one browser.** A fast desktop and headless Chromium. Nothing here says how a phone or Safari behaves.
- **No screen.** Headless Chromium paints to memory. The compositor and the display are not in any figure.
- **Latin text, typed at one place.** No paste, no composition input, no selection, no scrolling, no undo.
- **Typing only.** Open time, search, and memory under long use are not compared beyond the load and heap columns.
- **The heap figure is the page's.** Monaco does some work in a worker, and a worker has its own heap, which is not counted.
- **Peak memory is not measured.** The plan asks for it. This is the heap after a collection, at two points.
- **"Work for each key" is an average.** It cannot show a single slow key. The largest "to next frame" figure is the nearest thing to that.
- **Monaco's long-line limits.** By default Monaco stops drawing a line after 10,000 characters. On the long-lines document the keys go in at column 50,000, so with the default Monaco does not draw them. A second results file has the same run with the limits off.
- **File sizes are for these builds.** Each engine is configured as described above, not at its smallest or its largest.
- **Not a test.** Nothing here runs in CI, and no budget is set.
