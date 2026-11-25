// Measure every subject on its fixtures and write the raw results.
//
//   pnpm --filter open-editor-bench build
//   pnpm --filter open-editor-bench measure            all subjects, 5 runs each
//   node run.mjs --runs 3 --only monaco,codemirror     a quicker look
//
// One run is one fresh page: load the fixture, put the caret in the middle,
// type 150 keys, then 150 more. Every latency sample is kept in the results
// file, so the summary can be checked against them.
//
// Read bench/README.md for what the numbers mean and what they leave out.

import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus, platform, release, totalmem } from "node:os";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const RUNS = Number(option("--runs", "5"));
const KEYS = 150; // in each of the two batches
const KEY_GAP_MS = 30; // about 33 keys a second: fast typing, and slower than a frame
const VARIANT = option("--variant", ""); // a diagnostic switch some pages read; see src/code-subjects.ts
const ONLY = option("--only", "")?.split(",").filter(Boolean) ?? [];

const SUBJECTS = [
  { id: "codemirror", kind: "code", label: "CodeMirror 6" },
  { id: "open-editor-code", kind: "code", label: "Open Editor code profile (on CodeMirror 6)" },
  { id: "monaco", kind: "code", label: "Monaco" },
  { id: "tiptap", kind: "prose", label: "Tiptap (on ProseMirror)" },
  { id: "open-editor-chapter", kind: "prose", label: "Open Editor chapter editor (on Tiptap)" },
  { id: "lexical", kind: "prose", label: "Lexical" },
].filter((subject) => ONLY.length === 0 || ONLY.includes(subject.id));
const ONLY_FIXTURES = option("--fixtures", "")?.split(",").filter(Boolean) ?? [];
const ALL_FIXTURES = { code: ["code-tiny", "code-1mb", "code-long-lines"], prose: ["chapter-tiny", "chapter-20k"] };

const FIXTURES = Object.fromEntries(Object.entries(ALL_FIXTURES).map(([kind, list]) => [kind, list.filter((name) => ONLY_FIXTURES.length === 0 || ONLY_FIXTURES.includes(name))]));

if (!existsSync(here("dist/pages/codemirror.html"))) {
  console.error("No built pages. Run: pnpm --filter open-editor-bench build");
  process.exit(1);
}

// --- A static server for bench/dist ----------------------------------------------
const root = here("dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".ttf": "font/ttf" };
const server = createServer((request, response) => {
  const file = normalize(join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  const inside = file.startsWith(root.endsWith(sep) ? root : root + sep);
  if (!inside || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// --- Numbers ---------------------------------------------------------------------
const round = (n) => Math.round(n * 10) / 10;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const median = (values) => percentile(values, 50);
const summary = (samples) => ({ count: samples.length, p50: round(percentile(samples, 50)), p95: round(percentile(samples, 95)), max: round(Math.max(...samples)) });

async function heap(page, cdp) {
  for (let pass = 0; pass < 2; pass++) {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(50);
  }
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((m) => m.name === "JSHeapUsedSize").value;
}

// The browser's running totals of main-thread time, in milliseconds.
async function mainThread(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const ms = (name) => metrics.find((m) => m.name === name).value * 1000;
  return { at: Date.now(), task: ms("TaskDuration"), script: ms("ScriptDuration"), layout: ms("LayoutDuration"), style: ms("RecalcStyleDuration") };
}

async function oneRun(browser, subject, fixture) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fetched = new Set();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === base && /\.(js|css)$/.test(url.pathname)) fetched.add(url.pathname);
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  await page.goto(`${base}/pages/${subject.id}.html?fixture=${fixture}${VARIANT ? `&variant=${VARIANT}` : ""}`);
  await page.waitForFunction(() => window.bench !== undefined, null, { timeout: 60000 });
  const load = await page.evaluate(() => window.bench.load());
  const heapAfterLoad = await heap(page, cdp);

  await page.evaluate(() => window.bench.placeCaret());
  await page.waitForTimeout(200);
  if (subject.kind === "code") {
    // End of the marker line first. One subject arrives with the marker
    // selected, and an arrow key would only collapse that selection.
    await page.keyboard.press("End");
    // For the long-lines file, go up one line and to its end: that puts the
    // caret at the end of a line of about 50,000 characters.
    if (fixture === "code-long-lines") {
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("End");
    }
  }
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.bench.length());
  await page.evaluate(() => window.bench.takeSamples());

  // What the page costs while nothing is typed (a blinking caret, timers), for each second.
  const idle0 = await mainThread(cdp);
  await page.waitForTimeout(1500);
  const idle1 = await mainThread(cdp);
  const idlePerMs = (idle1.task - idle0.task) / (idle1.at - idle0.at);

  const batches = [];
  for (let batch = 0; batch < 2; batch++) {
    const text = Array.from({ length: KEYS }, (_, n) => "abcdefghij"[n % 10]).join("");
    const m0 = await mainThread(cdp);
    await page.keyboard.type(text, { delay: KEY_GAP_MS });
    await page.waitForTimeout(400);
    const m1 = await mainThread(cdp);
    const toFrame = (await page.evaluate(() => window.bench.takeSamples())).map(round);
    const perKey = (field) => Math.round(((m1[field] - m0[field]) / KEYS) * 100) / 100;
    batches.push({
      toFrame,
      // Main-thread time for each key: all tasks, with the idle cost of the same stretch taken off.
      workPerKey: Math.round(((m1.task - m0.task - idlePerMs * (m1.at - m0.at)) / KEYS) * 100) / 100,
      scriptPerKey: perKey("script"),
      layoutPerKey: perKey("layout"),
      stylePerKey: perKey("style"),
    });
  }
  const after = await page.evaluate(() => window.bench.length());
  const typedAt = await page.evaluate(() => window.bench.typedAt());
  const heapAfterTyping = await heap(page, cdp);

  let raw = 0;
  let gzip = 0;
  for (const path of fetched) {
    const bytes = readFileSync(join(root, path));
    raw += bytes.length;
    gzip += gzipSync(bytes).length;
  }
  await context.close();
  return {
    load: { mountMs: round(load.mountMs), toFirstFrameMs: round(load.toFirstFrameMs) },
    heapAfterLoad,
    heapAfterTyping,
    documentLength: before,
    typedAt,
    idleMsPerSecond: Math.round(idlePerMs * 1000 * 10) / 10,
    keysArrived: after - before,
    first150: batches[0],
    next150: batches[1],
    files: { count: fetched.size, raw, gzip },
    errors,
  };
}

// --- Run -------------------------------------------------------------------------
const browser = await chromium.launch();
const results = {
  date: new Date().toISOString().slice(0, 10),
  machine: { cpu: cpus()[0].model.trim(), logicalCores: cpus().length, memoryGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()}`, node: process.version },
  browser: `chromium ${browser.version()}, headless`,
  settings: { runs: RUNS, keysPerBatch: KEYS, keyGapMs: KEY_GAP_MS, viewport: "1280x800", editorBox: "900x560" },
  versions: Object.fromEntries(
    ["@codemirror/view", "@codemirror/state", "monaco-editor", "@tiptap/core", "prosemirror-view", "lexical"].map((name) => {
      try {
        const path = name === "prosemirror-view" ? here("../packages/editor/node_modules/@tiptap/pm/node_modules/prosemirror-view/package.json") : here(`node_modules/${name}/package.json`);
        return [name, JSON.parse(readFileSync(path, "utf8")).version];
      } catch {
        return [name, "unknown"];
      }
    }),
  ),
  subjects: [],
};

for (const subject of SUBJECTS) {
  for (const fixture of FIXTURES[subject.kind]) {
    const runs = [];
    for (let n = 0; n < RUNS; n++) {
      process.stdout.write(`${subject.id} on ${fixture}: run ${n + 1} of ${RUNS}\r`);
      runs.push(await oneRun(browser, subject, fixture));
    }
    const all = (pick) => runs.map(pick);
    // The median over the runs of each run's p50 and p95, and the largest single figure of any run.
    const two = (n) => Math.round(n * 100) / 100;
    const batch = (pick) => ({
      toFrame: over((r) => pick(r).toFrame),
      workPerKey: two(median(all((r) => pick(r).workPerKey))),
      workPerKeyRuns: all((r) => pick(r).workPerKey),
      scriptPerKey: two(median(all((r) => pick(r).scriptPerKey))),
      layoutPerKey: two(median(all((r) => pick(r).layoutPerKey))),
      stylePerKey: two(median(all((r) => pick(r).stylePerKey))),
    });
    const over = (pick) => ({ p50: round(median(all((r) => summary(pick(r)).p50))), p95: round(median(all((r) => summary(pick(r)).p95))), max: round(Math.max(...all((r) => summary(pick(r)).max))) });
    const entry = {
      subject: subject.id,
      label: subject.label,
      fixture,
      summary: {
        // The median over the runs of each run's own figure.
        toFirstFrameMs: round(median(all((r) => r.load.toFirstFrameMs))),
        first150: batch((r) => r.first150),
        next150: batch((r) => r.next150),
        idleMsPerSecond: round(median(all((r) => r.idleMsPerSecond))),
        heapAfterLoadMB: round(median(all((r) => r.heapAfterLoad)) / 1e6),
        heapAfterTypingMB: round(median(all((r) => r.heapAfterTyping)) / 1e6),
        filesRawKB: round(runs[0].files.raw / 1000),
        filesGzipKB: round(runs[0].files.gzip / 1000),
        documentLength: runs[0].documentLength,
        typedAt: runs[0].typedAt,
        keysArrived: all((r) => r.keysArrived),
        samples: all((r) => [r.first150.toFrame.length, r.next150.toFrame.length]),
        errors: runs.flatMap((r) => r.errors),
      },
      runs,
    };
    results.subjects.push(entry);
    const s = entry.summary;
    console.log(`${subject.id.padEnd(20)} ${fixture.padEnd(16)} load ${String(s.toFirstFrameMs).padStart(6)} ms   work/key ${String(s.next150.workPerKey).padStart(6)} ms (script ${String(s.next150.scriptPerKey).padStart(5)}, layout ${String(s.next150.layoutPerKey).padStart(5)})   to frame p50 ${String(s.next150.toFrame.p50).padStart(5)} p95 ${String(s.next150.toFrame.p95).padStart(5)} max ${String(s.next150.toFrame.max).padStart(6)}   heap ${String(s.heapAfterLoadMB).padStart(5)} MB   ${String(s.filesGzipKB).padStart(6)} kB gzip`);
  }
}
await browser.close();
server.close();

// A comparison is only worth something if every engine was measured doing
// the same thing. Three checks, written into the results and printed:
//   - every key arrived in the document, in every run;
//   - no page raised an error;
//   - on each code fixture, every subject typed at the same line and column.
const faults = [];
for (const entry of results.subjects) {
  const s = entry.summary;
  if (s.keysArrived.some((n) => n !== KEYS * 2)) faults.push(`${entry.subject} on ${entry.fixture}: keys arrived ${s.keysArrived.join(", ")}, expected ${KEYS * 2} in each run`);
  if (s.errors.length > 0) faults.push(`${entry.subject} on ${entry.fixture}: page error: ${s.errors[0]}`);
}
for (const fixture of new Set(results.subjects.map((entry) => entry.fixture))) {
  const places = results.subjects.filter((entry) => entry.fixture === fixture && entry.summary.typedAt).map((entry) => [entry.subject, JSON.stringify(entry.summary.typedAt)]);
  if (new Set(places.map(([, place]) => place)).size > 1) faults.push(`${fixture}: the subjects typed at different places: ${places.map(([id, place]) => `${id} ${place}`).join("; ")}`);
}
results.valid = faults.length === 0;
results.faults = faults;
console.log(faults.length === 0 ? "\nChecks: every key arrived, no page errors, and the code subjects typed at the same place." : `\nNOT A VALID COMPARISON:\n  ${faults.join("\n  ")}`);

mkdirSync(here("results"), { recursive: true });
const name = option("--out", `results/${results.date}.json`);
writeFileSync(here(name), JSON.stringify(results) + "\n");
console.log(`\nWrote bench/${name}`);
