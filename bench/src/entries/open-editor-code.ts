// The benchmark page for one subject: Open Editor code profile. Written by make-pages.mjs.
import { run } from "../probe";
import { openEditorCode } from "../code-subjects";

run("open-editor-code", await openEditorCode());
