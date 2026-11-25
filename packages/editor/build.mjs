// Build the package two ways.
//
//   dist/*.js             for a project with a bundler. The engines stay as
//                         imports, so the project's own bundler shares them.
//   dist/standalone/*.js  for a page with no bundler. Each file holds its
//                         engine, so one <script type="module"> is enough.
//
// The standalone build also writes dist/standalone/report.json: the size of
// each file and the packages inside it. scripts/measure.mjs prints it.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { build } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const pkg = JSON.parse(readFileSync(here("package.json"), "utf8"));
const external = Object.keys(pkg.dependencies).map((name) => new RegExp(`^${name}(/|$)`));

rmSync(here("dist"), { recursive: true, force: true });

await build({
  root: here("."),
  logLevel: "warn",
  build: {
    outDir: here("dist"),
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: {
        index: here("src/index.ts"),
        code: here("src/code/index.ts"),
        manuscript: here("src/manuscript/index.ts"),
        markdown: here("src/manuscript/markdown.ts"),
        files: here("src/files.ts"),
        "code-workspace": here("src/workspace/code.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: { external },
  },
});

// The package of a module id: "@codemirror/view", "prosemirror-model", or
// "(this package)" for our own files.
function packageOf(id) {
  const path = id.replace(/\\/g, "/").replace(/^\0/, "");
  const at = path.lastIndexOf("/node_modules/");
  if (at < 0) return "(this package)";
  const parts = path.slice(at + "/node_modules/".length).split("/");
  return parts[0].startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

const report = {};
for (const [name, entry] of [
  ["code", "src/standalone/code.ts"],
  ["manuscript", "src/standalone/manuscript.ts"],
  ["editor", "src/standalone/editor.ts"],
  ["code-workspace", "src/standalone/code-workspace.ts"],
]) {
  const result = await build({
    root: here("."),
    logLevel: "warn",
    build: {
      outDir: here("dist/standalone"),
      emptyOutDir: false,
      lib: {
        entry: here(entry),
        formats: ["es"],
        fileName: () => `${name}.js`,
        cssFileName: name,
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => r.output);
  const chunks = outputs.filter((o) => o.type === "chunk");
  if (chunks.length !== 1) throw new Error(`${name}: expected one file, got ${chunks.length}`);
  const packages = {};
  for (const id of Object.keys(chunks[0].modules)) {
    const p = packageOf(id);
    packages[p] = (packages[p] ?? 0) + 1;
  }
  const sizes = (file) => {
    const bytes = readFileSync(here(`dist/standalone/${file}`));
    return { bytes: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length };
  };
  const css = outputs.find((o) => o.type === "asset" && o.fileName.endsWith(".css"));
  report[name] = {
    js: { file: `${name}.js`, ...sizes(`${name}.js`) },
    css: css ? { file: css.fileName, ...sizes(css.fileName) } : null,
    packages: Object.fromEntries(Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))),
  };
}

// The stylesheet for bundler users: the same file the standalone build made.
mkdirSync(here("dist"), { recursive: true });
writeFileSync(here("dist/manuscript.css"), readFileSync(here("dist/standalone/manuscript.css")));
writeFileSync(here("dist/code-workspace.css"), readFileSync(here("dist/standalone/code-workspace.css")));
writeFileSync(here("dist/standalone/report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("built dist/ and dist/standalone/");
