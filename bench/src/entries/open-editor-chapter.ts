// The benchmark page for one subject: Open Editor chapter editor. Written by make-pages.mjs.
import "@devofcodes/editor/book-workspace.css";
import { run } from "../probe";
import { openEditorChapter } from "../prose-subjects";

run("open-editor-chapter", await openEditorChapter());
