// The "manuscript" profile: prose on Tiptap's open-source packages and ProseMirror.
//
//   const editor = createEditor({ mount: element, profile: "manuscript", document: "Some **notes**." });
//   editor.on("change", (document) => save(document));
//   editor.destroy();
//
// The document is a string in a small Markdown subset (see markdown.ts).
// Importing this file needs no browser; createEditor does.
//
// This is the smallest prose surface: paragraphs, bold, italic, links and
// bullet lists. It has no headings, chapters, footnotes or export yet.

import { Editor } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { changeHandlers, checkOptions } from "../contract";
import type { BaseOptions, EditorHandle } from "../contract";
import { fromMarkdown, toMarkdown } from "./markdown";
import type { Doc } from "./markdown";

export { fromMarkdown, toMarkdown, toPlainText } from "./markdown";
export { renderMarkdown } from "./render";

export type ManuscriptCommand =
  | "bold"
  | "italic"
  | "bulletList"
  | "link"
  | "unlink"
  | "undo"
  | "redo"
  | "focus";
export interface ManuscriptCommandArgs {
  /** For "link": a full http or https address. */
  href?: string;
}

export interface ManuscriptOptions extends BaseOptions {
  profile?: "manuscript";
  /** Grey text shown while the editor is empty. */
  placeholder?: string;
  /** Show the row of formatting buttons. Default: true. */
  toolbar?: boolean;
}

export type ManuscriptEditor = EditorHandle<ManuscriptCommand, ManuscriptCommandArgs>;

const isHttp = (href: string) => /^https?:\/\/\S+$/.test(href);

export function createEditor(options: ManuscriptOptions): ManuscriptEditor {
  checkOptions(options, "manuscript");

  const doc = options.mount.ownerDocument;
  const root = doc.createElement("div");
  root.className = "oe oe-manuscript";
  const surface = doc.createElement("div");
  surface.className = "oe-surface";
  const handlers = changeHandlers();
  let destroyed = false;

  const read = (): string => toMarkdown(editor.getJSON() as Doc);

  const editor: Editor = new Editor({
    element: surface,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https"],
        isAllowedUri: (url) => isHttp(url),
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      BulletList,
      // One paragraph for each item: the stored format has one line for each.
      ListItem.extend({ content: "paragraph" }),
      UndoRedo,
      Placeholder.configure({ placeholder: options.placeholder ?? "" }),
    ],
    content: fromMarkdown(options.document ?? ""),
    editorProps: {
      attributes: {
        class: "oe-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": options.label ?? "Manuscript",
      },
    },
    onUpdate: () => handlers.emit(read()),
  });

  function execute(command: ManuscriptCommand, args: ManuscriptCommandArgs = {}): boolean {
    if (destroyed) return false;
    const chain = editor.chain().focus();
    switch (command) {
      case "bold":
        return chain.toggleBold().run();
      case "italic":
        return chain.toggleItalic().run();
      case "bulletList":
        return chain.toggleBulletList().run();
      case "link": {
        const href = (args.href ?? "").trim();
        if (!isHttp(href)) return false;
        if (editor.state.selection.empty && !editor.isActive("link")) {
          // Nothing selected: put the address in as its own link.
          return chain
            .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
            .run();
        }
        return chain.extendMarkRange("link").setLink({ href }).run();
      }
      case "unlink":
        return chain.extendMarkRange("link").unsetLink().run();
      case "undo":
        return chain.undo().run();
      case "redo":
        return chain.redo().run();
      case "focus":
        return chain.run();
      default:
        throw new Error(`Unknown command: ${String(command)}`);
    }
  }

  // --- The row of buttons -------------------------------------------------------

  let refresh = () => {};
  if (options.toolbar !== false) {
    const bar = doc.createElement("div");
    bar.className = "oe-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "Formatting");

    const linkRow = doc.createElement("div");
    linkRow.className = "oe-link";
    linkRow.hidden = true;
    const address = doc.createElement("input");
    address.type = "url";
    address.placeholder = "https://";
    address.setAttribute("aria-label", "Link address");

    const button = (text: string, name: string, title: string, run: () => void) => {
      const el = doc.createElement("button");
      el.type = "button";
      el.className = `oe-button oe-${name}`;
      el.textContent = text;
      el.title = title;
      el.setAttribute("aria-label", title);
      el.setAttribute("aria-pressed", "false");
      // Keep the selection in the text when a button is pressed.
      el.addEventListener("mousedown", (event) => event.preventDefault());
      el.addEventListener("click", run);
      return el;
    };

    const closeLink = () => {
      linkRow.hidden = true;
      address.value = "";
    };
    const applyLink = () => {
      if (execute("link", { href: address.value })) closeLink();
      else address.setCustomValidity("Use a full address that starts with http:// or https://");
      address.reportValidity();
    };
    address.addEventListener("input", () => address.setCustomValidity(""));
    address.addEventListener("keydown", (event) => {
      // Enter applies the link; it must not send the form the editor sits in.
      if (event.key === "Enter") {
        event.preventDefault();
        applyLink();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeLink();
        execute("focus");
      }
    });

    const bold = button("B", "bold", "Bold", () => execute("bold"));
    const italic = button("I", "italic", "Italic", () => execute("italic"));
    const list = button("List", "list", "Bullet list", () => execute("bulletList"));
    const link = button("Link", "link", "Link", () => {
      if (!linkRow.hidden) return closeLink();
      linkRow.hidden = false;
      address.value = editor.getAttributes("link").href ?? "";
      address.focus();
    });
    const apply = button("Apply", "apply", "Apply the link", applyLink);
    const remove = button("Remove", "remove", "Remove the link", () => {
      execute("unlink");
      closeLink();
    });
    apply.removeAttribute("aria-pressed");
    remove.removeAttribute("aria-pressed");

    bar.append(bold, italic, list, link);
    linkRow.append(address, apply, remove);
    root.append(bar, linkRow);

    refresh = () => {
      bold.setAttribute("aria-pressed", String(editor.isActive("bold")));
      italic.setAttribute("aria-pressed", String(editor.isActive("italic")));
      list.setAttribute("aria-pressed", String(editor.isActive("bulletList")));
      link.setAttribute("aria-pressed", String(editor.isActive("link")));
      remove.disabled = !editor.isActive("link");
    };
    editor.on("transaction", refresh);
    refresh();
  }

  root.append(surface);
  options.mount.append(root);

  return {
    on: handlers.on,
    execute,
    getDocument: read,
    setDocument(document) {
      if (destroyed) return;
      editor.commands.setContent(fromMarkdown(document), { emitUpdate: false });
      refresh();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      handlers.clear();
      editor.destroy();
      root.remove();
    },
  };
}
