// The benchmark page for one subject: CodeMirror 6. Written by make-pages.mjs.
import { run } from "../probe";
import { codemirror } from "../code-subjects";

run("codemirror", await codemirror());
