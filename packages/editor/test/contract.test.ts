// What holds for every entry point before a browser is involved.
import assert from "node:assert/strict";
import { test } from "vitest";
import { detectLineEnding } from "../src/code/line-endings";

test("every entry point imports where there is no browser", async () => {
  assert.equal(typeof document, "undefined");
  const both = await import("../src/index");
  const code = await import("../src/code/index");
  const manuscript = await import("../src/manuscript/index");
  assert.equal(typeof both.createEditor, "function");
  assert.equal(typeof code.createEditor, "function");
  assert.equal(typeof manuscript.createEditor, "function");
});

test("createEditor with no mount says so, in every entry point", async () => {
  const both = await import("../src/index");
  const code = await import("../src/code/index");
  const manuscript = await import("../src/manuscript/index");
  assert.throws(() => both.createEditor({} as never), /mount/);
  assert.throws(() => code.createEditor({} as never), /mount/);
  assert.throws(() => manuscript.createEditor({} as never), /mount/);
});

test("the shared entry point needs a profile it knows", async () => {
  const { createEditor } = await import("../src/index");
  const mount = {} as HTMLElement;
  assert.throws(() => createEditor({ mount } as never), /profile/);
  assert.throws(() => createEditor({ mount, profile: "slides" } as never), /"code" or "manuscript"/);
});

test("a single-profile entry point refuses the other profile", async () => {
  const code = await import("../src/code/index");
  const manuscript = await import("../src/manuscript/index");
  const mount = {} as HTMLElement;
  assert.throws(() => code.createEditor({ mount, profile: "manuscript" } as never), /"code" profile only/);
  assert.throws(() => manuscript.createEditor({ mount, profile: "code" } as never), /"manuscript" profile only/);
});

test("extensions and storage are refused, not ignored", async () => {
  const { createEditor } = await import("../src/index");
  const mount = {} as HTMLElement;
  for (const profile of ["code", "manuscript"] as const) {
    assert.throws(() => createEditor({ mount, profile, extensions: [{}] } as never), /extensions/);
    assert.throws(() => createEditor({ mount, profile, storage: {} } as never), /storage/);
    // An empty list of extensions is the same as none: it gets as far as building the editor.
    assert.throws(() => createEditor({ mount, profile, extensions: [] } as never), (error: Error) => !/extensions/.test(error.message));
  }
});

test("the code profile refuses a language it does not have", async () => {
  const { createEditor } = await import("../src/code/index");
  assert.throws(() => createEditor({ mount: {} as HTMLElement, language: "cobol" as never }), /Unknown language/);
});

test("a document's line ending is the one it has more of", () => {
  assert.equal(detectLineEnding(""), "\n");
  assert.equal(detectLineEnding("one line"), "\n");
  assert.equal(detectLineEnding("a\nb\nc"), "\n");
  assert.equal(detectLineEnding("a\r\nb\r\nc"), "\r\n");
  assert.equal(detectLineEnding("a\r\nb\nc\nd"), "\n");
  assert.equal(detectLineEnding("a\r\nb\r\nc\nd"), "\r\n");
});
