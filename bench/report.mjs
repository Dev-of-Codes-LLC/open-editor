// Turn a results file into a Markdown page with one table for each fixture.
//
//   node report.mjs results/2026-11-25.json            writes results/2026-11-25.md
//   node report.mjs results/a.json --extra results/b.json   adds the rows of a second file, marked
//
// Every figure in the tables is in the JSON file, with the samples behind it.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const args = process.argv.slice(2);
const main = JSON.parse(readFileSync(here(args[0]), "utf8"));
const extraAt = args.indexOf("--extra");
const extra = extraAt >= 0 ? JSON.parse(readFileSync(here(args[extraAt + 1]), "utf8")) : null;
const extraNote = extraAt >= 0 ? (args[args.indexOf("--extra-label") + 1] ?? "second file") : "";

const FIXTURES = {
  "code-tiny": "Control: 2 kB of JavaScript",
  "code-1mb": "1 MB of JavaScript, ordinary lines",
  "code-long-lines": "1 MB of JavaScript in 20 lines of about 50,000 characters",
  "chapter-tiny": "Control: a chapter of 300 words",
  "chapter-20k": "A chapter of 20,000 words",
};

const rows = [...main.subjects.map((entry) => ({ ...entry, note: "" })), ...(extra ? extra.subjects.map((entry) => ({ ...entry, note: ` (${extraNote})` })) : [])];
const spread = (list) => `${Math.min(...list).toFixed(2)} to ${Math.max(...list).toFixed(2)}`;

const out = [];
out.push(`# Engine comparison, ${main.date}`, "");
out.push(`Written by \`bench/report.mjs\` from \`${args[0]}\`${extra ? ` and \`${args[extraAt + 1]}\`` : ""}. Do not edit by hand. Read \`bench/README.md\` first: it says what each column means and what these numbers leave out.`, "");
out.push("| | |", "|---|---|");
out.push(`| Machine | ${main.machine.cpu}, ${main.machine.logicalCores} logical cores, ${main.machine.memoryGB} GB memory |`);
out.push(`| System | ${main.machine.os}, Node ${main.machine.node} |`);
out.push(`| Browser | ${main.browser} |`);
out.push(`| Runs | ${main.settings.runs} fresh pages for each row; ${main.settings.keysPerBatch} keys, then ${main.settings.keysPerBatch} more, ${main.settings.keyGapMs} ms apart |`);
out.push(`| Versions | ${Object.entries(main.versions).filter(([, v]) => v !== "unknown").map(([name, v]) => `${name} ${v}`).join(", ")} |`);
out.push(`| Checks | ${main.valid ? "Every key arrived, no page raised an error, and the code subjects typed at the same line and column." : `NOT A VALID COMPARISON: ${main.faults.join("; ")}`} |`, "");

for (const [fixture, title] of Object.entries(FIXTURES)) {
  const here = rows.filter((entry) => entry.fixture === fixture);
  if (here.length === 0) continue;
  out.push(`## ${title}`, "");
  const place = here.find((entry) => entry.summary.typedAt)?.summary.typedAt;
  out.push(`Document length: ${here[0].summary.documentLength.toLocaleString("en")} characters.${place ? ` Keys typed at line ${place.line.toLocaleString("en")}, column ${place.column.toLocaleString("en")}, on a line of ${place.lineLength.toLocaleString("en")} characters.` : " Keys typed at the end of a one-word paragraph in the middle."}`, "");
  out.push("| Subject | Load, ms | Work for each key, ms | of which script | of which layout | Range over runs | To next frame: p50 | p95 | max | Heap after load, MB | Files, kB gzip |");
  out.push("|---|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|");
  for (const entry of here) {
    const s = entry.summary;
    const k = s.next150;
    out.push(`| ${entry.label}${entry.note} | ${s.toFirstFrameMs} | ${k.workPerKey.toFixed(2)} | ${k.scriptPerKey.toFixed(2)} | ${k.layoutPerKey.toFixed(2)} | ${spread(k.workPerKeyRuns)} | ${k.toFrame.p50} | ${k.toFrame.p95} | ${k.toFrame.max} | ${s.heapAfterLoadMB} | ${s.filesGzipKB} |`);
  }
  out.push("", "The key figures are from the second 150 keys of each run. The first 150, which include the engine warming up:", "");
  out.push("| Subject | Work for each key, ms | To next frame: p50 | p95 | max |", "|---|---:|---:|---:|---:|");
  for (const entry of here) {
    const k = entry.summary.first150;
    out.push(`| ${entry.label}${entry.note} | ${k.workPerKey.toFixed(2)} | ${k.toFrame.p50} | ${k.toFrame.p95} | ${k.toFrame.max} |`);
  }
  out.push("");
}

const target = here(args[0].replace(/\.json$/, ".md"));
writeFileSync(target, out.join("\n"));
console.log(`Wrote ${args[0].replace(/\.json$/, ".md")}`);
