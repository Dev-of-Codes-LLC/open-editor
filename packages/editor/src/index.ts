// One call for both profiles:
//
//   import { createEditor } from "@devofcodes/editor";
//   const code = createEditor({ mount: a, profile: "code", document: "let a = 1;" });
//   const prose = createEditor({ mount: b, profile: "manuscript", document: "Some **notes**." });
//
// This entry point loads both engines. A page that needs one profile imports
// "@devofcodes/editor/code" or "@devofcodes/editor/manuscript" instead, and
// loads one engine only.

import { createEditor as createCodeEditor } from "./code/index";
import type { CodeEditor, CodeOptions } from "./code/index";
import { createEditor as createManuscriptEditor } from "./manuscript/index";
import type { ManuscriptEditor, ManuscriptOptions } from "./manuscript/index";

export type { BaseOptions, EditorHandle, Profile } from "./contract";
export type { CodeCommand, CodeCommandArgs, CodeEditor, CodeLanguage, CodeOptions } from "./code/index";
export type {
  ManuscriptCommand,
  ManuscriptCommandArgs,
  ManuscriptEditor,
  ManuscriptOptions,
} from "./manuscript/index";
export { fromMarkdown, toMarkdown, toPlainText, renderMarkdown } from "./manuscript/index";

export function createEditor(options: CodeOptions & { profile: "code" }): CodeEditor;
export function createEditor(options: ManuscriptOptions & { profile: "manuscript" }): ManuscriptEditor;
export function createEditor(
  options: (CodeOptions & { profile: "code" }) | (ManuscriptOptions & { profile: "manuscript" }),
): CodeEditor | ManuscriptEditor {
  if (!options || !options.mount) {
    throw new Error("createEditor needs a mount: the element to build the editor in.");
  }
  switch (options.profile) {
    case "code":
      return createCodeEditor(options);
    case "manuscript":
      return createManuscriptEditor(options);
    default:
      throw new Error(
        `createEditor needs a profile: "code" or "manuscript", not ${JSON.stringify((options as { profile?: unknown }).profile)}.`,
      );
  }
}
