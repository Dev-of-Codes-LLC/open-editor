// The file store contract, on the store that ships: memoryFiles. No browser.
import assert from "node:assert/strict";
import { test } from "vitest";
import { memoryFiles } from "../src/files";

test("a memory store lists, reads and writes", async () => {
  const files = memoryFiles({ "b.txt": "two\r\n", "a/one.js": "let a = 1;\n" });
  assert.deepEqual(await files.list(), ["b.txt", "a/one.js"]);
  assert.equal(await files.read("b.txt"), "two\r\n");
  await files.write("b.txt", "changed");
  assert.equal(await files.read("b.txt"), "changed");
});

test("a write to a new path adds the file at the end of the list", async () => {
  const files = memoryFiles({ "a.txt": "" });
  await files.write("new.txt", "x");
  assert.deepEqual(await files.list(), ["a.txt", "new.txt"]);
});

test("reading a file that is not there rejects with a message a person can read", async () => {
  await assert.rejects(memoryFiles().read("missing.txt"), /No such file: missing\.txt/);
});

test("the store keeps its own copy of the starting files", async () => {
  const initial = { "a.txt": "one" };
  const files = memoryFiles(initial);
  await files.write("a.txt", "two");
  assert.equal(initial["a.txt"], "one");
});

test("the workspace entry point imports where there is no browser, and names what it needs", async () => {
  const { createCodeWorkspace } = await import("../src/workspace/code");
  assert.throws(() => createCodeWorkspace({} as never), /mount/);
  assert.throws(() => createCodeWorkspace({ mount: {} as HTMLElement } as never), /files/);
});
