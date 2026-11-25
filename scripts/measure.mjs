// Print what was measured: the size of each standalone file, the packages
// inside it, and the retention figures from the last browser test run.
//
//   pnpm build && pnpm test:browser && pnpm measure
//
// Sizes come from packages/editor/dist/standalone/report.json, which the build
// writes. Retention comes from test-results/retention.json, which the
// retention test writes. Nothing here is a target; these are readings.

import { existsSync, readFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const read = (path) => (existsSync(here(path)) ? JSON.parse(readFileSync(here(path), "utf8")) : null);
const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

console.log("Machine");
console.log(`  ${cpus()[0].model.trim()}, ${cpus().length} logical cores, ${(totalmem() / 2 ** 30).toFixed(0)} GB memory`);
console.log(`  ${platform()} ${release()}, Node ${process.version}`);

const report = read("../packages/editor/dist/standalone/report.json");
if (!report) {
  console.log("\nNo size report. Run `pnpm build` first.");
  process.exit(1);
}

console.log("\nStandalone files (minified)");
console.log("  file             raw        gzip       brotli");
for (const entry of Object.values(report)) {
  for (const file of [entry.js, entry.css].filter(Boolean)) {
    console.log(`  ${file.file.padEnd(15)}  ${kb(file.bytes).padStart(9)}  ${kb(file.gzip).padStart(9)}  ${kb(file.brotli).padStart(9)}`);
  }
}

const engines = (packages) => ({
  codemirror: Object.keys(packages).filter((name) => /^@codemirror\/|^@lezer\//.test(name)).length,
  prosemirror: Object.keys(packages).filter((name) => /^prosemirror-|^@tiptap\//.test(name)).length,
});
console.log("\nEngine packages inside each file");
for (const [name, entry] of Object.entries(report)) {
  const count = engines(entry.packages);
  console.log(`  ${`${name}.js`.padEnd(15)}  CodeMirror and Lezer: ${String(count.codemirror).padStart(2)}   ProseMirror and Tiptap: ${String(count.prosemirror).padStart(2)}`);
}

const retention = read("../test-results/retention.json");
if (!retention) {
  console.log("\nNo retention figures. Run `pnpm test:browser` first.");
  process.exit(0);
}
console.log(`\nRetention (${retention.browser})`);
for (const profile of ["code", "manuscript"]) {
  const r = retention[profile];
  if (!r) continue;
  console.log(`  ${profile}: ${r.cycles} mount, edit and dispose cycles`);
  console.log(`    tracked objects alive after a forced collection: ${r.aliveAfterCollection} of ${r.trackedObjects}${r.alive.length ? ` (${r.alive.join("; ")})` : ""}`);
  console.log(`    DOM nodes ${r.nodes.before} -> ${r.nodes.after}, event listeners ${r.listeners.before} -> ${r.listeners.after}`);
  console.log(`    heap ${kb(r.heapBytes.before)} -> ${kb(r.heapBytes.after)} (${kb(r.heapBytes.growth)} more, ${(r.heapBytes.growth / r.cycles / 1000).toFixed(1)} kB for each cycle)`);
  console.log(`    createEditor: median ${r.createEditorMs.median} ms, slowest ${r.createEditorMs.max} ms`);
}
if (retention.control) {
  const c = retention.control;
  console.log(`  control: ${c.kept} editors kept and not destroyed`);
  console.log(`    alive while kept: ${c.aliveWhileKept} of ${c.trackedObjects}; after destroy: ${c.aliveAfterRelease}${c.alive.length ? ` (${c.alive.join("; ")})` : ""}`);
}
