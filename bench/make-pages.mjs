// Write the page and the entry file of each subject. They differ in three
// words, so they are made from one list here and not kept by hand.
//
//   node make-pages.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const subjects = {
  codemirror: ["code-subjects", "codemirror", "CodeMirror 6"],
  "open-editor-code": ["code-subjects", "openEditorCode", "Open Editor code profile"],
  monaco: ["code-subjects", "monaco", "Monaco"],
  tiptap: ["prose-subjects", "tiptap", "Tiptap"],
  "open-editor-chapter": ["prose-subjects", "openEditorChapter", "Open Editor chapter editor"],
  lexical: ["prose-subjects", "lexical", "Lexical"],
};

mkdirSync(here("pages"), { recursive: true });
mkdirSync(here("src/entries"), { recursive: true });

for (const [id, [file, fn, title]] of Object.entries(subjects)) {
  const styles = id === "open-editor-chapter" ? 'import "@devofcodes/editor/book-workspace.css";\n' : "";
  const entry = [
    `// The benchmark page for one subject: ${title}. Written by make-pages.mjs.`,
    `${styles}import { run } from "../probe";`,
    `import { ${fn} } from "../${file}";`,
    "",
    `run("${id}", await ${fn}());`,
    "",
  ].join("\n");
  writeFileSync(here(`src/entries/${id}.ts`), entry);

  const page = [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    `    <title>Bench: ${title}</title>`,
    "    <style>",
    "      body { margin: 16px; font: 16px/1.5 system-ui, sans-serif; }",
    "      /* The same box for every engine: 900 by 560, scrolling inside. */",
    "      #host { width: 900px; height: 560px; overflow: auto; border: 1px solid #c9c2b4; }",
    "      #host [contenteditable] { outline: none; }",
    "      /* The same type for every code engine: 14px Consolas, as Monaco uses on Windows. */",
    "      #host .cm-editor { border: 0 !important; }",
    "      #host .cm-scroller { font: 14px/19px Consolas, 'Courier New', monospace !important; max-height: 560px !important; min-height: 0 !important; }",
    "      #host .cm-content, #host .cm-gutters { font: inherit !important; }",
    "    </style>",
    "  </head>",
    "  <body>",
    '    <div id="host"></div>',
    `    <script type="module" src="../src/entries/${id}.ts"></script>`,
    "  </body>",
    "</html>",
    "",
  ].join("\n");
  writeFileSync(here(`pages/${id}.html`), page);
}
console.log(`Wrote ${Object.keys(subjects).length} pages and entries.`);
