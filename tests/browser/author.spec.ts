// The author acceptance script.
//
// An author has a book of three chapters. They open a chapter, add a
// heading and a sentence, move a chapter to the front, read the word count,
// save, export the book to Markdown and to HTML, close the tab, come back,
// and find the book as they left it. Every step uses the keyboard and mouse
// as a person would. The book is the example in /examples/book, in a store
// that the test page wrote itself.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const mod = process.platform === "darwin" ? "Meta" : "Control";

const open = async (page: Page, query = "") => {
  await page.goto(`/tests/browser/author-workspace.html${query}`);
  await page.waitForFunction(() => window.host !== undefined);
};
const ready = async (page: Page, query = "") => {
  await open(page, query);
  await page.evaluate(() => window.host.workspace.ready);
};
const chapters = (page: Page) => page.getByRole("navigation", { name: "Chapters" });
const chapterButton = (page: Page, name: string | RegExp) => chapters(page).locator("button.oe-file").filter({ hasText: name });
const titles = (page: Page) => chapters(page).locator("button.oe-file");
const editor = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const status = (page: Page) => page.getByRole("status");
// Open a chapter and wait until the caret is in it, as a person would before typing.
const openChapter = async (page: Page, name: string) => {
  await chapterButton(page, name).click();
  await expect(editor(page, name)).toBeFocused();
};
const counts = (page: Page) => page.locator(".oe-counts");
const stored = (page: Page) => page.evaluate(() => window.host.stored() as Record<string, string>);
const words = (page: Page) => page.evaluate(() => window.host.workspace.wordCount() as { book: number; chapter: number | null });

test("author script: open a book, edit a chapter, move a chapter, count, save, export, come back", async ({ page }) => {
  await ready(page);
  const seed: Record<string, string> = await page.evaluate(() => window.host.seed);
  let before = { book: 0, chapter: null as number | null };

  await test.step("the workspace lists the chapters in reading order, with the book's word count", async () => {
    await expect(titles(page)).toHaveText(["Before Light", "The First Loaf", "The Open Door"]);
    await expect(status(page)).toHaveText("The Bakery at Six: saved");
    before = await words(page);
    expect(before.book).toBeGreaterThan(100);
    await expect(counts(page)).toHaveText(`${before.book} words in the book`);
  });

  await test.step("open a chapter: its text, its footnote and its number are there, and nothing is marked unsaved", async () => {
    await openChapter(page, "Before Light");
    const text = editor(page, "Before Light");
    await expect(text).toBeVisible();
    await expect(text).toContainText("The kitchen was quiet before six.");
    await expect(text.getByRole("heading", { name: "What waits on the bench" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Footnotes" }).getByRole("listitem")).toHaveText([
      "A stone oven needs about two hours to come up to heat.",
    ]);
    await expect(status(page)).toHaveText("Before Light: saved");
  });

  await test.step("open another chapter: its image shows, with its description", async () => {
    await openChapter(page, "The First Loaf");
    await expect(editor(page, "The First Loaf").getByRole("img", { name: "A round loaf with a cross cut in its top." })).toBeVisible();
    await expect(status(page)).toHaveText("The First Loaf: saved");
  });

  await test.step("add a heading and a sentence to the last chapter", async () => {
    await openChapter(page, "The Open Door");
    await expect(editor(page, "The Open Door")).toBeVisible();
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Heading" }).click();
    await page.keyboard.type("Later");
    await page.keyboard.press("Enter");
    await page.keyboard.type("The shelves are empty by nine.");
    await expect(editor(page, "The Open Door").getByRole("heading", { name: "Later" })).toBeVisible();
    await expect(status(page)).toHaveText("The Open Door: unsaved changes");
    await expect(chapters(page).getByRole("button", { name: "The Open Door, unsaved changes" })).toBeVisible();
  });

  await test.step("the word count follows: seven more words, in the chapter and in the book", async () => {
    const after = await words(page);
    expect(after.book).toBe(before.book + 7);
    await expect(counts(page)).toHaveText(`${after.chapter} words in this chapter, ${after.book} words in the book`);
  });

  await test.step("move the last chapter to the front: the order changes, its id does not", async () => {
    await page.getByRole("button", { name: 'Move "The Open Door" up' }).click();
    await page.getByRole("button", { name: 'Move "The Open Door" up' }).click();
    await expect(titles(page)).toHaveText(["The Open Door", "Before Light", "The First Loaf"]);
    await expect(page.getByRole("button", { name: 'Move "The Open Door" up' })).toBeDisabled();
    const ids: string[] = await page.evaluate(() => window.host.workspace.book().chapters.map((entry: { id: string }) => entry.id));
    expect(ids).toEqual(["ch-open-door", "ch-before-light", "ch-first-loaf"]);
    await expect(editor(page, "The Open Door")).toContainText("The shelves are empty by nine.");
    expect(await stored(page), "nothing is written before a save").toEqual(seed);
  });

  await test.step("save with the keyboard: one chapter and the manifest are written, and both are valid", async () => {
    await editor(page, "The Open Door").click();
    await page.keyboard.press(`${mod}+s`);
    await expect(status(page)).toHaveText("The Open Door: saved");
    expect(await page.evaluate(() => window.host.writes())).toEqual(["chapters/ch-open-door.json", "book.json"]);
    const files = await stored(page);
    const book = JSON.parse(files["book.json"]);
    expect(book.chapters.map((entry: { id: string }) => entry.id)).toEqual(["ch-open-door", "ch-before-light", "ch-first-loaf"]);
    expect(book.chapters.map((entry: { file: string }) => entry.file).sort()).toEqual(JSON.parse(seed["book.json"]).chapters.map((entry: { file: string }) => entry.file).sort());
    expect(book.removed).toEqual(JSON.parse(seed["book.json"]).removed);
    const problems = await page.evaluate((text) => {
      const all = JSON.parse(text);
      return [...window.host.validateBook(JSON.parse(all["book.json"])), ...window.host.validateChapter(JSON.parse(all["chapters/ch-open-door.json"]))];
    }, JSON.stringify(files));
    expect(problems).toEqual([]);
    expect(JSON.parse(files["chapters/ch-open-door.json"]).content.slice(-2)).toEqual([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Later" }] },
      { type: "paragraph", content: [{ type: "text", text: "The shelves are empty by nine." }] },
    ]);
  });

  await test.step("the two chapters that were opened and not edited are byte for byte the same", async () => {
    const files = await stored(page);
    expect(files["chapters/ch-before-light.json"]).toBe(seed["chapters/ch-before-light.json"]);
    expect(files["chapters/ch-first-loaf.json"]).toBe(seed["chapters/ch-first-loaf.json"]);
  });

  await test.step("export to Markdown: the whole book, in the new order, with nothing left out", async () => {
    const result: { text: string; lost: string[] } = await page.evaluate(() => window.host.workspace.exportBook("markdown"));
    expect(result.lost).toEqual([]);
    const text = result.text;
    expect(text.startsWith("# The Bakery at Six\n\nAn Example Author\n\n## The Open Door\n\n")).toBe(true);
    const order = ["## The Open Door", "### Later", "The shelves are empty by nine.", "## Before Light", "### What waits on the bench", "## The First Loaf"].map((part) => text.indexOf(part));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("since four[^fn-ovens], and the first trays were _almost_ ready.");
    expect(text).toContain("[^fn-ovens]: A stone oven needs about two hours to come up to heat.");
    expect(text).toContain("![A round loaf with a cross cut in its top.](images/loaf.svg)");
    expect(text).toContain("1. Knock on the base. It should sound hollow.");
    expect(text).toContain("[a guide to cooling](https://example.com/cooling-bread)");
  });

  await test.step("export to HTML: a page a browser can read, with working footnote links", async () => {
    const html: string = await page.evaluate(async () => (await window.host.workspace.exportBook("html")).text);
    const facts = await page.evaluate((text) => {
      const doc = new DOMParser().parseFromString(text, "text/html");
      const note = doc.querySelector('sup a[href^="#"]')!;
      const target = doc.getElementById(note.getAttribute("href")!.slice(1));
      return {
        lang: doc.documentElement.lang,
        title: doc.title,
        h1: doc.querySelector("h1")?.textContent,
        sections: [...doc.querySelectorAll("section")].map((s) => `${s.id}: ${s.querySelector("h2")?.textContent}`),
        headings: [...doc.querySelectorAll("h3")].map((h) => h.textContent),
        image: doc.querySelector("img")?.getAttribute("alt"),
        caption: doc.querySelector("figcaption")?.textContent,
        numbered: doc.querySelectorAll("ol:not(.footnotes) > li").length,
        noteNumber: note.textContent,
        noteText: target?.textContent,
        back: target?.querySelector("a")?.getAttribute("href") === `#${note.id}`,
        scripts: doc.querySelectorAll("script").length,
      };
    }, html);
    expect(facts).toEqual({
      lang: "en",
      title: "The Bakery at Six",
      h1: "The Bakery at Six",
      sections: ["ch-open-door: The Open Door", "ch-before-light: Before Light", "ch-first-loaf: The First Loaf"],
      headings: ["Later", "What waits on the bench", "How to read a loaf"],
      image: "A round loaf with a cross cut in its top.",
      caption: "The first loaf, scored and ready.",
      numbered: 3,
      noteNumber: "1",
      noteText: "Warm bread crackles as it cools. ↩",
      back: true,
      scripts: 0,
    });
  });

  await test.step("the Export HTML button hands the author a file", async () => {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export HTML" }).click()]);
    expect(download.suggestedFilename()).toBe("bakery-at-six.html");
  });

  await test.step("come back after a reload: the order and the new text are there", async () => {
    await page.reload();
    await page.waitForFunction(() => window.host !== undefined);
    await page.evaluate(() => window.host.workspace.ready);
    await expect(titles(page)).toHaveText(["The Open Door", "Before Light", "The First Loaf"]);
    await expect(status(page)).toHaveText("The Bakery at Six: saved");
    await openChapter(page, "The Open Door");
    await expect(editor(page, "The Open Door").getByRole("heading", { name: "Later" })).toBeVisible();
    await expect(editor(page, "The Open Door")).toContainText("The shelves are empty by nine.");
    await expect(status(page)).toHaveText("The Open Door: saved");
  });
});

test("every example chapter comes back from the editor exactly as it went in", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const out: Record<string, boolean> = {};
    for (const [path, text] of Object.entries(window.host.seed as Record<string, string>)) {
      if (path === "book.json") continue;
      const chapter = JSON.parse(text);
      const editor = window.host.createChapterEditor({ mount: window.host.spare, chapter });
      // Compare as text with sorted keys, so only a real difference counts.
      const flat = (value: unknown): string =>
        JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
      out[path] = flat(editor.getChapter()) === flat(chapter);
      editor.destroy();
    }
    return out;
  });
  expect(result).toEqual({
    "chapters/ch-before-light.json": true,
    "chapters/ch-first-loaf.json": true,
    "chapters/ch-open-door.json": true,
  });
});

test("splitting a paragraph that has an id does not make a second block with that id", async ({ page }) => {
  await ready(page);
  await openChapter(page, "Before Light");
  await editor(page, "Before Light").getByText("quiet").click();
  await page.keyboard.press("Enter");
  await page.keyboard.press(`${mod}+s`);
  await expect(status(page)).toHaveText("Before Light: saved");
  const saved = JSON.parse((await stored(page))["chapters/ch-before-light.json"]);
  expect(await page.evaluate((c) => window.host.validateChapter(c), saved)).toEqual([]);
  const ids = saved.content.map((block: { attrs?: { id?: string } }) => block.attrs?.id).filter(Boolean);
  expect(ids).toEqual(["p-kitchen-quiet", "h-what-waits"]);
  expect(saved.content.length).toBe(4);
});

test("deleting a footnote's call removes its note, and undo brings both back", async ({ page }) => {
  await ready(page);
  await openChapter(page, "The Open Door");
  const notes = page.getByRole("list", { name: "Footnotes" }).getByRole("listitem");
  await expect(notes).toHaveCount(1);
  // The call sits just before the last full stop of the chapter.
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await expect(notes).toHaveCount(0);
  await page.keyboard.press(`${mod}+s`);
  await expect(status(page)).toHaveText("The Open Door: saved");
  let saved = JSON.parse((await stored(page))["chapters/ch-open-door.json"]);
  expect(saved.footnotes).toBeUndefined();
  expect(await page.evaluate((c) => window.host.validateChapter(c), saved)).toEqual([]);

  await editor(page, "The Open Door").click();
  await page.keyboard.press(`${mod}+z`);
  await expect(notes).toHaveText(["Warm bread crackles as it cools."]);
  await page.keyboard.press(`${mod}+s`);
  await expect(status(page)).toHaveText("The Open Door: saved");
  saved = JSON.parse((await stored(page))["chapters/ch-open-door.json"]);
  expect(Object.keys(saved.footnotes)).toEqual(["fn-warm"]);
});

test("a refused write leaves the book unsaved and says why", async ({ page }) => {
  await ready(page, "?fail");
  await page.getByRole("button", { name: 'Move "Before Light" down' }).click();
  await expect(status(page)).toHaveText("The Bakery at Six: unsaved changes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("The Bakery at Six: not saved. The disk is full.");
  expect(await page.evaluate(() => window.host.workspace.isDirty())).toBe(true);
  const message = await page.evaluate(() => window.host.workspace.save().then(() => "saved", (error: Error) => error.message));
  expect(message).toBe("The disk is full.");
});

test("a book that is not valid is not opened, and the reason is on the page", async ({ page }) => {
  await open(page, "?broken");
  const message = await page.evaluate(() => window.host.workspace.ready.then(() => "opened", (error: Error) => error.message));
  expect(message).toContain("book.json is not a valid book.");
  expect(message).toContain("used twice");
  await expect(status(page)).toContainText("Could not open the book. book.json is not a valid book.");
  await expect(titles(page)).toHaveCount(0);
});

test("the host hears open, change, move and save", async ({ page }) => {
  await ready(page);
  await openChapter(page, "The Open Door");
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("!");
  await page.getByRole("button", { name: 'Move "The Open Door" up' }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(status(page)).toHaveText("The Open Door: saved");
  expect(await page.evaluate(() => window.host.events())).toEqual([
    "open ch-open-door",
    "change ch-open-door",
    "move ch-open-door",
    "save ch-open-door",
  ]);
});

test("the Save button is off until something changed, and the arrows work from the keyboard", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: 'Move "Before Light" down' }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(titles(page)).toHaveText(["The First Loaf", "The Open Door", "Before Light"]);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  // At the end of the list "down" is off, so the keyboard lands on "up" for the same chapter.
  await expect(page.getByRole("button", { name: 'Move "Before Light" up' })).toBeFocused();
});

test("destroy removes the workspace and every editor in it", async ({ page }) => {
  await ready(page);
  await openChapter(page, "Before Light");
  await openChapter(page, "The First Loaf");
  const result = await page.evaluate(() => {
    window.host.workspace.destroy();
    window.host.workspace.destroy();
    return { children: window.host.mountChildren(), editors: document.querySelectorAll(".ProseMirror").length };
  });
  expect(result).toEqual({ children: 0, editors: 0 });
});

test("the example page opens a chapter, takes typing and shows an export", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/examples/author/");
  await page.getByRole("navigation", { name: "Chapters" }).locator("button.oe-file").filter({ hasText: "Before Light" }).click();
  await expect(page.getByRole("textbox", { name: "Before Light", exact: true })).toBeFocused();
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("The first tray comes out at half past five.");
  await expect(page.getByRole("status")).toHaveText("Before Light: unsaved changes");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await expect(page.locator("#export")).toContainText("The first tray comes out at half past five.");
  await page.screenshot({ path: testInfo.outputPath("author.png"), fullPage: true });
  expect(errors).toEqual([]);
});
