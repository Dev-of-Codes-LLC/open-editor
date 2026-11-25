// Each profile, driven through the shared API with real key presses.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    harness: any;
    editor: any;
  }
}

const open = async (page: Page) => {
  await page.goto("/tests/browser/harness.html");
  await page.waitForFunction(() => window.harness !== undefined);
};
const editable = (page: Page) => page.locator("#mount [contenteditable='true']");
const mod = process.platform === "darwin" ? "Meta" : "Control";

test.describe("code profile", () => {
  test("typing reaches the document and fires change", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.harness.mount({ profile: "code", document: "let a = 1;" }));
    await editable(page).click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type("\nlet b = 2;");
    expect(await page.evaluate(() => window.harness.editor().getDocument())).toBe("let a = 1;\nlet b = 2;");
    const changes: string[] = await page.evaluate(() => window.harness.changes());
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.at(-1)).toBe("let a = 1;\nlet b = 2;");
  });

  test("the editable area has the label the host gave", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.harness.mount({ profile: "code", label: "Recipe scaler" }));
    await expect(page.getByRole("textbox", { name: "Recipe scaler" })).toBeVisible();
  });

  test("undo and redo", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.harness.mount({ profile: "code", document: "one" }));
    await editable(page).click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type(" two");
    const result = await page.evaluate(() => {
      const editor = window.harness.editor();
      const undone = editor.execute("undo");
      const afterUndo = editor.getDocument();
      const redone = editor.execute("redo");
      return { undone, afterUndo, redone, afterRedo: editor.getDocument() };
    });
    expect(result).toEqual({ undone: true, afterUndo: "one", redone: true, afterRedo: "one two" });
  });

  test("find selects the next match, and says when there is none", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      window.harness.mount({ profile: "code", document: "const total = 1;\nreturn total;" });
      const editor = window.harness.editor();
      return {
        found: editor.execute("find", { query: "total" }),
        selected: window.getSelection()?.toString(),
        missing: editor.execute("find", { query: "absent" }),
        empty: editor.execute("find", { query: "" }),
      };
    });
    expect(result.found).toBe(true);
    expect(result.missing).toBe(false);
    expect(result.empty).toBe(false);
  });

  test("setDocument replaces the text and does not fire change", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      window.harness.mount({ profile: "code", document: "old" });
      window.harness.editor().setDocument("new text");
      return { document: window.harness.editor().getDocument(), changes: window.harness.changes().length };
    });
    expect(result).toEqual({ document: "new text", changes: 0 });
  });

  test("a file with Windows line endings keeps them", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.harness.mount({ profile: "code", document: "a\r\nb\r\n" }));
    await editable(page).click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type("c");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.harness.editor().getDocument())).toBe("a\r\nb\r\nc\r\n");
  });

  test("an unknown command is an error", async ({ page }) => {
    await open(page);
    const message = await page.evaluate(() => {
      window.harness.mount({ profile: "code" });
      try {
        window.harness.editor().execute("bold");
        return "no error";
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(message).toBe("Unknown command: bold");
  });

  test("destroy empties the mount, and the handle goes quiet", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      window.harness.mount({ profile: "code", document: "x" });
      const editor = window.harness.editor();
      editor.destroy();
      editor.destroy();
      return { children: window.harness.mountChildren(), execute: editor.execute("undo") };
    });
    expect(result).toEqual({ children: 0, execute: false });
  });
});

test.describe("manuscript profile", () => {
  test("typing reaches the document and fires change", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.harness.mount({ profile: "manuscript", document: "Chapter one." }));
    await editable(page).click();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.type(" It rained.");
    expect(await page.evaluate(() => window.harness.editor().getDocument())).toBe("Chapter one. It rained.");
    const changes: string[] = await page.evaluate(() => window.harness.changes());
    expect(changes.at(-1)).toBe("Chapter one. It rained.");
  });

  test("the bold shortcut is stored as bold", async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.harness.mount({ profile: "manuscript", document: "" }));
    await editable(page).click();
    await page.keyboard.type("plain ");
    await page.keyboard.press(`${mod}+b`);
    await page.keyboard.type("bold");
    expect(await page.evaluate(() => window.harness.editor().getDocument())).toBe("plain **bold**");
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a link that is not http or https is refused", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      window.harness.mount({ profile: "manuscript", document: "text" });
      const editor = window.harness.editor();
      return {
        bad: editor.execute("link", { href: "javascript:alert(1)" }),
        good: editor.execute("link", { href: "https://example.com/" }),
        document: editor.getDocument(),
      };
    });
    expect(result.bad).toBe(false);
    expect(result.good).toBe(true);
    expect(result.document).toContain("(https://example.com/)");
  });

  test("setDocument replaces the text and does not fire change", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      window.harness.mount({ profile: "manuscript", document: "old" });
      window.harness.editor().setDocument("- one\n- two");
      return { document: window.harness.editor().getDocument(), changes: window.harness.changes().length };
    });
    expect(result).toEqual({ document: "- one\n- two", changes: 0 });
  });

  test("destroy empties the mount, and the handle goes quiet", async ({ page }) => {
    await open(page);
    const result = await page.evaluate(() => {
      window.harness.mount({ profile: "manuscript", document: "x" });
      const editor = window.harness.editor();
      editor.destroy();
      editor.destroy();
      return { children: window.harness.mountChildren(), execute: editor.execute("bold") };
    });
    expect(result).toEqual({ children: 0, execute: false });
  });
});

test("the quickstart page takes typing in both profiles", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  const code = page.getByRole("textbox", { name: "Recipe scaler" });
  const manuscript = page.getByRole("textbox", { name: "Chapter one" });
  await expect(code).toBeVisible();
  await expect(manuscript).toBeVisible();

  await code.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("scale(250, 4, 6);");
  await expect(page.locator("#code-out")).toContainText("scale(250, 4, 6);");

  await manuscript.click();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type(" and salt");
  await expect(page.locator("#manuscript-out")).toContainText("- _patience and salt_");

  await page.screenshot({ path: testInfo.outputPath("quickstart.png"), fullPage: true });

  await page.getByRole("button", { name: "Remove the code editor" }).click();
  await page.getByRole("button", { name: "Remove the manuscript editor" }).click();
  await expect(page.locator("#code")).toBeEmpty();
  await expect(page.locator("#manuscript")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("a page that needs code loads one script and no stylesheet", async ({ page }) => {
  const loaded: string[] = [];
  page.on("response", (response) => loaded.push(new URL(response.url()).pathname));
  await page.goto("/tests/browser/single-profile.html");
  await page.waitForFunction(() => window.editor !== undefined);
  expect(await page.evaluate(() => window.editor.getDocument())).toBe("let a = 1;");
  expect(loaded.filter((path) => !path.endsWith("favicon.ico"))).toEqual([
    "/tests/browser/single-profile.html",
    "/packages/editor/dist/standalone/code.js",
  ]);
});
