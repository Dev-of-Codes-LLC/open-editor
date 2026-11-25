# Open Editor

An open-source editor SDK that treats two kinds of writing as equals: source
code and book manuscripts. One TypeScript API, no framework needed.

- **Code** runs on [CodeMirror 6](https://codemirror.net/).
- **Manuscripts** run on [Tiptap's open-source packages](https://tiptap.dev/docs/editor/getting-started/overview) and [ProseMirror](https://prosemirror.net/).

The full plan is public: <https://devofcodes.com/open-editor.html>. It is
sized for a team of eight to ten. This repository is one person's first slice
of it, built for fun.

## Where this stands

This is early. It is not a product and it is not on npm.

What exists today:

- One `createEditor` call with two profiles, `"code"` and `"manuscript"`.
- A quickstart page in plain JavaScript, with no bundler.
- A draft manuscript format: a book as a manifest and one document for each chapter, with a validator and JSON Schema files. The editor does not use it yet.
- A small developer workspace: a file list and a code editor over a file store that the host owns.
- A developer acceptance script, run as a browser test: open two files, edit, find and replace, save, reload.
- Tests that mount, edit and dispose each profile 50 times and ask the browser what is still alive.
- Measured file sizes for each profile.

What does not exist yet: chapters, export, collaboration, comments,
extensions, language servers, and everything else in the plan. The
[issues](../../issues) hold the next pieces in build order.

## Try it

You need Node 22.18 or newer and [pnpm](https://pnpm.io/) (`corepack enable pnpm`).

```bash
git clone https://github.com/Dev-of-Codes-LLC/open-editor.git
cd open-editor
pnpm install
pnpm build
pnpm quickstart
```

Open <http://127.0.0.1:4173/>. The page is `examples/quickstart/index.html`.
The developer workspace is at <http://127.0.0.1:4173/examples/workspace/>.

## The API

```js
import { createEditor } from "./packages/editor/dist/standalone/editor.js";

const editor = createEditor({
  mount: document.getElementById("editor"),
  profile: "code",               // or "manuscript"
  document: "let a = 1;",
});

const stop = editor.on("change", (document) => save(document));
editor.execute("find", { query: "a" });
editor.getDocument();
editor.setDocument("let b = 2;");
editor.destroy();
```

A document is always a string: source text for `"code"`, a small Markdown
subset for `"manuscript"`. The guide has the options, the commands of each
profile, and what was and was not checked:
[docs/features/two-profiles.md](docs/features/two-profiles.md).

A page that needs one profile loads one file:

| File in `packages/editor/dist/standalone/` | Holds |
| --- | --- |
| `code.js` | The code profile and CodeMirror |
| `manuscript.js` and `manuscript.css` | The manuscript profile, Tiptap and ProseMirror |
| `editor.js` and `editor.css` | Both |
| `code-workspace.js` and `code-workspace.css` | The developer workspace, the code profile and CodeMirror |

The workspace has its own guide:
[docs/features/developer-workspace.md](docs/features/developer-workspace.md).

## Develop

```bash
pnpm typecheck      # TypeScript
pnpm test           # unit tests, in Node, no browser
pnpm build          # packages/editor/dist
pnpm test:browser       # browser tests: Chromium, Firefox, WebKit
pnpm measure        # print sizes and retention figures
node scripts/licenses.mjs --check
```

The first browser run needs `pnpm exec playwright install`.

## Layout

```
packages/editor/       the SDK: createEditor, src/code/, src/manuscript/
examples/              quickstart, developer workspace, and an example book
schema/                JSON Schema files for the manuscript format
tests/browser/             browser tests
scripts/               static server, measurements, licence list
docs/decisions/        one short record for each choice
docs/features/         guides
```

## Licence

Our code is under [Apache-2.0](LICENSE). The engines keep their own licences,
all MIT today: see [THIRD-PARTY.md](THIRD-PARTY.md) and [NOTICE](NOTICE).
Tiptap also sells features and a hosted service. Nothing here uses them.
