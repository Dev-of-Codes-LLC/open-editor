// Build one page for each subject. Each page loads only its own engine, so
// the files a page fetches are that engine's cost.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
export const subjects = ["codemirror", "open-editor-code", "monaco", "tiptap", "open-editor-chapter", "lexical"];

export default defineConfig({
  root: here("."),
  base: "./",
  logLevel: "warn",
  build: {
    outDir: here("dist"),
    emptyOutDir: true,
    target: "esnext",
    chunkSizeWarningLimit: 10000,
    rollupOptions: { input: Object.fromEntries(subjects.map((id) => [id, here(`pages/${id}.html`)])) },
  },
  worker: { format: "es" },
});
