# 0002: One package with three entry points

Date: 2026-11-25. Status: accepted.

## Decision

There is one package, `@devofcodes/editor`. It has three entry points:

| Import | Loads |
| --- | --- |
| `@devofcodes/editor/code` | CodeMirror only |
| `@devofcodes/editor/manuscript` | Tiptap and ProseMirror only |
| `@devofcodes/editor` | Both |

Each entry point exports `createEditor`. The build also writes one
self-contained file for each, for a page with no bundler.

The package is not on npm. The name is in `package.json` only, and the
package is marked private until there is a reason to publish.

## Why

The plan says a host that embeds a code field must not download manuscript
features, and the other way round. The plan's example API is also one
synchronous call: `const editor = createEditor({ profile })`. A synchronous
call cannot load an engine on demand. So the shared entry point holds both
engines, and a host that wants one engine imports that profile's entry point.

One package is less to maintain than three for one person. The entry points
can become packages later without a change to the hosts' code beyond the
import path.

## Measured

On 2026-11-25, minified, from `pnpm measure`:

| File | Raw | gzip | Engine packages inside |
| --- | ---: | ---: | --- |
| `code.js` | 544.3 kB | 161.7 kB | CodeMirror and Lezer only |
| `manuscript.js` | 478.7 kB | 134.2 kB | ProseMirror and Tiptap only |
| `editor.js` | 1021.3 kB | 294.9 kB | Both |

The build reads the list of packages inside each file from the bundler, and
a browser test loads a code-only page and checks that it fetched one script.

These are readings, not budgets. The plan sets size budgets after the first
measurements; none is set yet.

## Cost

A host that imports the shared entry point and uses one profile pays for both
engines. The README and the guide say so.
