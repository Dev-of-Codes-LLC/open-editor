// The benchmark page for one subject: Lexical. Written by make-pages.mjs.
import { run } from "../probe";
import { lexical } from "../prose-subjects";

run("lexical", await lexical());
