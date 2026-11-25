// The developer acceptance script.
//
// A developer has a small project of three files. They open two of them,
// edit one, rename a variable with find and replace, save, close the tab,
// come back, and find their work as they left it. Every step uses the
// keyboard and mouse as a person would. The files live in a store that the
// test page wrote itself, to the FileStore contract.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    host: any;
  }
}

const mod = process.platform === "darwin" ? "Meta" : "Control";

const open = async (page: Page, query = "") => {
  await page.goto(`/tests/browser/developer-workspace.html${query}`);
  await page.waitForFunction(() => window.host !== undefined);
  await page.evaluate(() => window.host.workspace.ready);
};
const fileButton = (page: Page, name: string | RegExp) => page.getByRole("navigation", { name: "Files" }).getByRole("button", { name });
const editor = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const status = (page: Page) => page.getByRole("status");
const stored = (page: Page) => page.evaluate(() => window.host.stored() as Record<string, string>);

test("developer script: open two files, edit, find and replace, save, come back", async ({ page }) => {
  await open(page);
  const seed: Record<string, string> = await page.evaluate(() => window.host.seed);

  await test.step("the workspace lists the project's files and opens none", async () => {
    await expect(page.getByRole("navigation", { name: "Files" }).getByRole("button")).toHaveText([
      "scale.js",
      "notes.txt",
      "README.md",
    ]);
    await expect(status(page)).toHaveText("No file open");
  });

  await test.step("open a source file", async () => {
    await fileButton(page, "scale.js").click();
    await expect(editor(page, "scale.js")).toBeVisible();
    await expect(editor(page, "scale.js")).toContainText("function scale(amount, from, to) {");
    await expect(fileButton(page, "scale.js")).toHaveAttribute("aria-current", "true");
    await expect(status(page)).toHaveText("scale.js: saved");
  });

  await test.step("open a second file and add a line to it", async () => {
    await fileButton(page, "notes.txt").click();
    await expect(editor(page, "notes.txt")).toBeVisible();
    await expect(editor(page, "scale.js")).toBeHidden();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type("Salt: 5 g");
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("notes.txt: unsaved changes");
    await expect(fileButton(page, "notes.txt, unsaved changes")).toBeVisible();
  });

  await test.step("switch back: the first file is as it was, and the second keeps its unsaved line", async () => {
    await fileButton(page, "scale.js").click();
    await expect(editor(page, "scale.js")).toBeVisible();
    await expect(status(page)).toHaveText("scale.js: saved");
    await expect(fileButton(page, "notes.txt, unsaved changes")).toBeVisible();
    expect(await stored(page), "nothing is written before a save").toEqual(seed);
  });

  await test.step("rename a variable with find and replace", async () => {
    await page.keyboard.press(`${mod}+f`);
    const panel = page.locator(".cm-search");
    await panel.locator("input[name=search]").fill("amount");
    await panel.locator("input[name=replace]").fill("grams");
    await panel.locator("button[name=replaceAll]").click();
    await expect(editor(page, "scale.js")).toContainText("function scale(grams, from, to) {");
    await expect(editor(page, "scale.js")).toContainText("return (grams * to) / from;");
    await expect(editor(page, "scale.js")).not.toContainText("amount");
    // The panel's own close button, not Escape: in WebKit a clicked button
    // does not take focus, so Escape after "replace all" goes nowhere.
    await panel.locator("button[name=close]").click();
    await expect(panel).toBeHidden();
    await expect(status(page)).toHaveText("scale.js: unsaved changes");
  });

  await test.step("save with the keyboard: this file is written, the other is not", async () => {
    await editor(page, "scale.js").click();
    await page.keyboard.press(`${mod}+s`);
    await expect(status(page)).toHaveText("scale.js: saved");
    await expect(fileButton(page, "scale.js")).not.toHaveClass(/oe-unsaved/);
    const files = await stored(page);
    expect(files["scale.js"]).toBe(
      "// Scale a recipe for more people.\nfunction scale(grams, from, to) {\n  return (grams * to) / from;\n}\n",
    );
    expect(files["notes.txt"], "the other file still waits for its own save").toBe(seed["notes.txt"]);
    expect(await page.evaluate(() => window.host.writes())).toBe(1);
  });

  await test.step("save the second file: its Windows line endings and final newline are kept", async () => {
    await fileButton(page, /notes\.txt/).click();
    await expect(editor(page, "notes.txt")).toContainText("Salt: 5 g");
    await page.keyboard.press(`${mod}+s`);
    await expect(status(page)).toHaveText("notes.txt: saved");
    expect((await stored(page))["notes.txt"]).toBe("Flour: 250 g\r\nButter: 125 g\r\nSalt: 5 g\r\n");
  });

  await test.step("come back after a reload: the saved text is there, and the untouched file is byte for byte the same", async () => {
    await page.reload();
    await page.waitForFunction(() => window.host !== undefined);
    await page.evaluate(() => window.host.workspace.ready);
    await expect(status(page)).toHaveText("No file open");
    await fileButton(page, "scale.js").click();
    await expect(editor(page, "scale.js")).toContainText("function scale(grams, from, to) {");
    await expect(status(page)).toHaveText("scale.js: saved");
    const files = await stored(page);
    expect(files["README.md"]).toBe(seed["README.md"]);
    expect(Object.keys(files)).toEqual(["scale.js", "notes.txt", "README.md"]);
  });
});

test("unsaved text and undo history survive a switch to another file", async ({ page }) => {
  await open(page);
  await fileButton(page, "scale.js").click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("scale(250, 4, 6);");
  await fileButton(page, "README.md").click();
  await expect(editor(page, "README.md")).toBeVisible();
  await fileButton(page, /scale\.js/).click();
  await expect(editor(page, "scale.js")).toContainText("scale(250, 4, 6);");
  await page.keyboard.press(`${mod}+z`);
  await expect(editor(page, "scale.js")).not.toContainText("scale(250, 4, 6);");
  await expect(status(page)).toHaveText("scale.js: saved");
});

test("a refused write leaves the file unsaved and says why", async ({ page }) => {
  await open(page, "?fail");
  await fileButton(page, "notes.txt").click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("Salt: 5 g");
  await page.keyboard.press(`${mod}+s`);
  await expect(status(page)).toHaveText("notes.txt: not saved. The disk is full.");
  await expect(fileButton(page, "notes.txt, unsaved changes")).toBeVisible();
  expect(await page.evaluate(() => window.host.workspace.isDirty("notes.txt"))).toBe(true);
  // The host's own call hears about it too.
  const message = await page.evaluate(() => window.host.workspace.save().then(() => "saved", (error: Error) => error.message));
  expect(message).toBe("The disk is full.");
  // Typing again clears the old message; the file is still unsaved.
  await page.keyboard.type("!");
  await expect(status(page)).toHaveText("notes.txt: unsaved changes");
});

test("the host hears open, change and save, in order", async ({ page }) => {
  await open(page);
  await fileButton(page, "README.md").click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("x");
  await page.keyboard.press(`${mod}+s`);
  await expect(status(page)).toHaveText("README.md: saved");
  expect(await page.evaluate(() => window.host.events())).toEqual(["open README.md", "change README.md", "save README.md"]);
});

test("a file that cannot be read says so and opens nothing", async ({ page }) => {
  await open(page);
  const message = await page.evaluate(() =>
    window.host.workspace.open("missing.js").then(() => "opened", (error: Error) => error.message),
  );
  expect(message).toBe("No such file: missing.js");
  await expect(status(page)).toHaveText("could not open missing.js. No such file: missing.js");
  expect(await page.evaluate(() => window.host.workspace.current())).toBe(null);
});

test("destroy removes the workspace and every editor in it", async ({ page }) => {
  await open(page);
  await fileButton(page, "scale.js").click();
  await fileButton(page, "notes.txt").click();
  const result = await page.evaluate(() => {
    window.host.workspace.destroy();
    window.host.workspace.destroy();
    return { children: window.host.mountChildren(), editors: document.querySelectorAll(".cm-editor").length };
  });
  expect(result).toEqual({ children: 0, editors: 0 });
});

test("the example page opens, edits and saves a file", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/workspace/");
  await page.getByRole("button", { name: "scale.js" }).click();
  await expect(page.locator("#stored")).toContainText("function scale(amount, from, to) {");
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("scale(250, 4, 6);");
  await expect(page.getByRole("status")).toHaveText("scale.js: unsaved changes");
  await page.screenshot({ path: testInfo.outputPath("workspace.png"), fullPage: true });
  await page.keyboard.press(`${mod}+s`);
  await expect(page.getByRole("status")).toHaveText("scale.js: saved");
  await expect(page.locator("#stored")).toContainText("scale(250, 4, 6);");
  expect(errors).toEqual([]);
});

test("replaceAll, as a command of the code profile", async ({ page }) => {
  await page.goto("/tests/browser/harness.html");
  await page.waitForFunction(() => window.harness !== undefined);
  const result = await page.evaluate(() => {
    window.harness.mount({ profile: "code", document: "a + a + b" });
    const editor = window.harness.editor();
    const replaced = editor.execute("replaceAll", { query: "a", replacement: "x" });
    const after = editor.getDocument();
    const none = editor.execute("replaceAll", { query: "zzz", replacement: "x" });
    const empty = editor.execute("replaceAll", { query: "" });
    editor.execute("undo");
    return { replaced, after, none, empty, undone: editor.getDocument() };
  });
  expect(result).toEqual({ replaced: true, after: "x + x + b", none: false, empty: false, undone: "a + a + b" });
});
