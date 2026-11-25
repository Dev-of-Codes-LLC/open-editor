# 0004: How retention is measured, and what is allowed to stay

Date: 2026-11-25. Status: accepted, with two open questions.

## Decision

The plan asks for "no retained editor resources after repeated mounting and
disposal". We test it this way, in Chromium:

1. A test page builds an editor, a test types into it with real key presses,
   and the page destroys it. This runs 50 times for each profile, after three
   warm-up cycles.
2. For each editor the page keeps a weak reference to three objects: the
   handle, the root element, and the engine's own editable element.
3. The test forces a garbage collection through the DevTools protocol. A weak
   reference that still resolves is an object that something holds.
4. The test also reads the browser's own counts of DOM nodes and event
   listeners, before and after.
5. A control case keeps ten editors without destroying them. All 30 of their
   objects must show as alive. This proves the check can fail.

When an object stays alive, `tests/browser/retainers.ts` takes a heap snapshot and
prints the chain of references that holds it.

## What was measured

On 2026-11-25, Chromium 159, on an AMD Ryzen 9 9900X with 94 GB of memory,
Windows 11:

| | Code | Manuscript |
| --- | ---: | ---: |
| Tracked objects alive after 50 cycles | 0 of 159 | 1 of 159 |
| DOM nodes, before and after | 22 and 22 | 41 and 41 |
| Event listeners, before and after | 26 and 26 | 40 and 40 |
| Heap growth over 50 cycles | 494 kB | 738 kB |
| Heap growth over 200 cycles | 661 kB | 1,106 kB |
| Heap growth over 400 cycles | 699 kB | 1,328 kB |

## The two things that stay, and why they are allowed

Both are one object, not one for each mount. Both come from a module-level
variable inside an engine. We do not fork the engines, so the test allows
exactly these and fails on anything more.

**Manuscript: the last editor that was typed in.** ProseMirror's history
package keeps the plugin list of the last editor state that recorded an undo
step, in a module-level variable. One of Tiptap's plugins holds its editor,
and the editor holds the element it was built in. So one destroyed editor
stays until the next manuscript editor records an undo step and takes its
place. The heap snapshot shows this chain directly.

**Code: only when the host destroys the editor after it left the page.**
CodeMirror reuses one module-level `Range` to measure text. When the editor's
element is already off the page at destroy time, that `Range` stays inside
the detached element and holds it. In the normal order, destroy first, the
`Range` moves into the live page and holds nothing. The control case shows
this, because it destroys its editors late on purpose.

## Open questions

1. **Heap growth in the manuscript profile.** Between 200 and 400 cycles the
   heap still grows by about 1.1 kB for each cycle. The code profile grows by
   about 0.2 kB for each cycle over the same range, which is about what the
   test page's own bookkeeping costs. No tracked object explains the
   manuscript figure. The cause is not found. It is an open issue.
2. **Upstream.** Both module-level variables could be reported to their
   projects. Whether to do that, and how, is an open issue. Nothing was sent.

## Not covered

- Firefox and WebKit. The test needs the Chromium DevTools protocol.
- Editors with large documents, long sessions, or many editors on one page.
- Memory held outside the JavaScript heap.
