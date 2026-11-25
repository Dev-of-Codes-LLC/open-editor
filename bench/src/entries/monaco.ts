// The benchmark page for one subject: Monaco. Written by make-pages.mjs.
import { run } from "../probe";
import { monaco } from "../code-subjects";

run("monaco", await monaco());
