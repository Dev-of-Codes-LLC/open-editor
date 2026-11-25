// The benchmark page for one subject: Tiptap. Written by make-pages.mjs.
import { run } from "../probe";
import { tiptap } from "../prose-subjects";

run("tiptap", await tiptap());
