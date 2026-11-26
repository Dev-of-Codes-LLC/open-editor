// The Style menu of the chapter editor, and the keyboard shortcut of every
// style in it. Each test builds a chapter editor of its own on the author
// page's spare element and reads back the chapter the editor writes.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type Mark = { type: string };
type Node = { type: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: Node[] };

async function mount(page: Page, options: { shortcuts?: "mac" | "windows"; content?: Node[] } = {}) {
  await page.goto("/tests/browser/author-workspace.html");
  await page.waitForFunction(() => window.host !== undefined);
  await page.evaluate((given) => {
    const chapter = { format: "open-editor.chapter", version: 0, id: "ch-spare", content: given.content ?? [{ type: "paragraph" }] };
    (window as any).spare = window.host.createChapterEditor({ mount: window.host.spare, chapter, label: "Spare", shortcuts: given.shortcuts });
  }, options);
  await page.getByRole("textbox", { name: "Spare" }).click();
  await expect(page.getByRole("textbox", { name: "Spare" })).toBeFocused();
  // For a short time after a click (under 300 ms) the engine holds the caret where the click put it, and undoes a
  // caret key pressed in that time. A person is slower than that; a test must wait.
  await page.waitForTimeout(300);
}
const chapter = (page: Page) => page.evaluate(() => (window as any).spare.getChapter() as { content: Node[] });
const problems = (page: Page) => page.evaluate(() => window.host.validateChapter((window as any).spare.getChapter()) as string[]);
const spare = (page: Page) => page.locator("#spare");
const styleButton = (page: Page) => spare(page).getByRole("button", { name: "Style" });
const menu = (page: Page) => spare(page).getByRole("menu", { name: "Style" });
// The engine reads "Mod" as Command where the browser says it runs on Apple hardware, and as Ctrl elsewhere.
const modOf = (page: Page) => page.evaluate(() => (/mac|iphone|ipad|ipod/i.test(navigator.platform) ? "Meta" : "Control"));

const MARKS: [label: string, mark: string, keys: string][] = [
  ["Bold", "bold", "b"],
  ["Italic", "italic", "i"],
  ["Underline", "underline", "u"],
  ["Strikethrough", "strike", "Shift+s"],
  ["Highlight", "highlight", "Shift+h"],
  ["Code", "code", "e"],
  ["Superscript", "superscript", "Period"],
  ["Subscript", "subscript", "Comma"],
];

test("the Style menu lists every style, with Windows keys", async ({ page }) => {
  await mount(page, { shortcuts: "windows" });
  await styleButton(page).click();
  await expect(menu(page).locator(".oe-style-item")).toHaveText([
    "BoldCtrl+B",
    "ItalicCtrl+I",
    "UnderlineCtrl+U",
    "StrikethroughCtrl+Shift+S",
    "HighlightCtrl+Shift+H",
    "CodeCtrl+E",
    "SuperscriptCtrl+.",
    "SubscriptCtrl+,",
    "Normal textCtrl+Alt+0",
    "Heading 1Ctrl+Alt+1",
    "Heading 2Ctrl+Alt+2",
    "Heading 3Ctrl+Alt+3",
    "Bullet listCtrl+Shift+8",
    "Numbered listCtrl+Shift+7",
    "Block quoteCtrl+Shift+B",
    "Copy formattingCtrl+Alt+C",
    "Paste formattingCtrl+Alt+V",
    "Clear formattingCtrl+\\",
  ]);
});

test("the Style menu shows Mac keys on a Mac", async ({ page }) => {
  await mount(page, { shortcuts: "mac" });
  await styleButton(page).click();
  await expect(menu(page).locator(".oe-style-keys")).toHaveText([
    "⌘B", "⌘I", "⌘U", "⇧⌘S", "⇧⌘H", "⌘E", "⌘.", "⌘,",
    "⌥⌘0", "⌥⌘1", "⌥⌘2", "⌥⌘3", "⇧⌘8", "⇧⌘7", "⇧⌘B", "⌥⌘C", "⌥⌘V", "⌘\\",
  ]);
  await expect(menu(page).getByRole("menuitemcheckbox", { name: "Strikethrough" })).toHaveAttribute("aria-keyshortcuts", "Meta+Shift+S");
});

test("every text style has a shortcut that sets it, and what is written is valid", async ({ page }) => {
  await mount(page);
  const mod = await modOf(page);
  for (const [label, , keys] of MARKS) {
    await page.keyboard.press(`${mod}+${keys}`);
    await page.keyboard.type(label);
    await page.keyboard.press(`${mod}+${keys}`);
    await page.keyboard.type(" ");
  }
  const written = (await chapter(page)).content[0].content!.filter((node) => node.marks);
  expect(written.map((node) => [node.text, node.marks!.map((mark) => mark.type)])).toEqual(MARKS.map(([label, mark]) => [label, [mark]]));
  expect(await problems(page)).toEqual([]);
});

test("every paragraph style has a shortcut that sets it", async ({ page }) => {
  await mount(page, { content: [{ type: "paragraph", content: [{ type: "text", text: "One line." }] }] });
  const mod = await modOf(page);
  const first = async () => {
    const block = (await chapter(page)).content[0];
    return block.type === "heading" ? `heading ${block.attrs!.level}` : block.type;
  };
  for (const [keys, expected] of [
    ["Alt+Digit1", "heading 1"],
    ["Alt+Digit2", "heading 2"],
    ["Alt+Digit3", "heading 3"],
    ["Alt+Digit0", "paragraph"],
    ["Shift+Digit8", "bulletList"],
    ["Shift+Digit8", "paragraph"],
    ["Shift+Digit7", "orderedList"],
    ["Shift+Digit7", "paragraph"],
    ["Shift+b", "blockquote"],
    ["Shift+b", "paragraph"],
  ]) {
    await page.keyboard.press(`${mod}+${keys}`);
    expect(await first(), `after ${mod}+${keys}`).toBe(expected);
    expect(await problems(page)).toEqual([]);
  }
});

test("the menu sets text styles and stays open, then a paragraph style closes it", async ({ page }) => {
  await mount(page);
  await styleButton(page).click();
  await expect(styleButton(page)).toHaveAttribute("aria-expanded", "true");
  const underline = menu(page).getByRole("menuitemcheckbox", { name: "Underline" });
  await underline.click();
  await menu(page).getByRole("menuitemcheckbox", { name: "Highlight" }).click();
  await expect(underline).toHaveAttribute("aria-checked", "true");
  await expect(menu(page)).toBeVisible();
  await menu(page).getByRole("menuitemradio", { name: "Block quote" }).click();
  await expect(menu(page)).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Spare" })).toBeFocused();
  await page.keyboard.type("Fresh at six.");
  expect((await chapter(page)).content).toEqual([
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Fresh at six.", marks: [{ type: "underline" }, { type: "highlight" }] }] }] },
  ]);
  expect(await problems(page)).toEqual([]);
});

test("the menu shows what is set where the caret is", async ({ page }) => {
  await mount(page, {
    content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title", marks: [{ type: "italic" }] }] }],
  });
  await styleButton(page).click();
  const checked = await menu(page).locator('[aria-checked="true"]').locator(".oe-style-label").allTextContents();
  expect(checked).toEqual(["Italic", "Heading 2"]);
});

test("the menu works from the keyboard alone", async ({ page }) => {
  await mount(page);
  await styleButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(menu(page).getByRole("menuitemcheckbox", { name: "Bold" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitemcheckbox", { name: "Italic" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu(page).getByRole("menuitem", { name: "Clear formatting" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu(page).getByRole("menuitemcheckbox", { name: "Bold" })).toBeFocused();
  await page.keyboard.press("n");
  await expect(menu(page).getByRole("menuitemradio", { name: "Normal text" })).toBeFocused();
  await page.keyboard.press("n");
  await expect(menu(page).getByRole("menuitemradio", { name: "Numbered list" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Spare" })).toBeFocused();
  expect((await chapter(page)).content[0].type).toBe("orderedList");

  await styleButton(page).focus();
  await page.keyboard.press("ArrowUp");
  await expect(menu(page).getByRole("menuitem", { name: "Clear formatting" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Spare" })).toBeFocused();
});

test("a click outside closes the menu", async ({ page }) => {
  await mount(page);
  await styleButton(page).click();
  await expect(menu(page)).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(menu(page)).toBeHidden();
});

test("superscript and subscript replace each other", async ({ page }) => {
  await mount(page);
  const mod = await modOf(page);
  await page.keyboard.press(`${mod}+Period`);
  await page.keyboard.press(`${mod}+Comma`);
  await page.keyboard.type("2");
  expect((await chapter(page)).content[0].content).toEqual([{ type: "text", text: "2", marks: [{ type: "subscript" }] }]);
});

test("clear formatting takes every style off the selection", async ({ page }) => {
  await mount(page, {
    content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Loud", marks: [{ type: "bold" }, { type: "underline" }, { type: "highlight" }] }] }],
  });
  const mod = await modOf(page);
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.press(`${mod}+Backslash`);
  expect((await chapter(page)).content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "Loud" }] }]);
});

test("the strikethrough shortcut does not save the book", async ({ page }) => {
  await page.goto("/tests/browser/author-workspace.html");
  await page.waitForFunction(() => window.host !== undefined);
  await page.evaluate(() => window.host.workspace.ready);
  await page.getByRole("navigation", { name: "Chapters" }).locator("button.oe-file").filter({ hasText: "The Open Door" }).click();
  await expect(page.getByRole("textbox", { name: "The Open Door", exact: true })).toBeFocused();
  const mod = await modOf(page);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press(`${mod}+Shift+s`);
  await page.keyboard.type("old");
  await expect(page.getByRole("status")).toHaveText("The Open Door: unsaved changes");
  expect(await page.evaluate(() => window.host.writes())).toEqual([]);
  // The plain save key still saves, and the new style is in the file.
  await page.keyboard.press(`${mod}+s`);
  await expect(page.getByRole("status")).toHaveText("The Open Door: saved");
  const saved = JSON.parse((await page.evaluate(() => window.host.stored() as Record<string, string>))["chapters/ch-open-door.json"]);
  expect(saved.content.at(-1).content.at(-1)).toEqual({ type: "text", text: "old", marks: [{ type: "strike" }] });
});

// --- Copy formatting and paste formatting -----------------------------------------

const two: Node[] = [
  { type: "paragraph", content: [{ type: "text", text: "Styled", marks: [{ type: "bold" }, { type: "underline" }, { type: "highlight" }] }, { type: "text", text: " then plain " }, { type: "text", text: "slanted", marks: [{ type: "italic" }] }] },
];
const marksOf = async (page: Page) => (await chapter(page)).content[0].content!.map((node) => [node.text, (node.marks ?? []).map((mark) => mark.type)]);
// Select one word by double-clicking it.
const selectWord = (page: Page, word: string) => spare(page).getByText(word, { exact: true }).dblclick();

test("paste formatting is off until something is copied", async ({ page }) => {
  await mount(page, { content: two });
  await styleButton(page).click();
  const paste = menu(page).getByRole("menuitem", { name: "Paste formatting" });
  await expect(paste).toHaveAttribute("aria-disabled", "true");
  // A person can still click a greyed-out item. Nothing must happen.
  await paste.click({ force: true });
  await expect(menu(page)).toBeVisible();
  expect(await marksOf(page)).toEqual([["Styled", ["bold", "underline", "highlight"]], [" then plain ", []], ["slanted", ["italic"]]]);
});

test("copy formatting from one word and paste it onto another, with the shortcuts", async ({ page }) => {
  await mount(page, { content: two });
  const mod = await modOf(page);
  await selectWord(page, "Styled");
  await page.keyboard.press(`${mod}+Alt+c`);
  await selectWord(page, "slanted");
  await page.keyboard.press(`${mod}+Alt+v`);
  // The target gets exactly the copied styles: its own italic is gone.
  expect(await marksOf(page)).toEqual([["Styled", ["bold", "underline", "highlight"]], [" then plain ", []], ["slanted", ["bold", "underline", "highlight"]]]);
  expect(await problems(page)).toEqual([]);
  // One undo takes the paste back.
  await page.keyboard.press(`${mod}+z`);
  expect((await marksOf(page))[2]).toEqual(["slanted", ["italic"]]);
});

test("copy and paste formatting from the menu", async ({ page }) => {
  await mount(page, { content: two });
  await selectWord(page, "slanted");
  await styleButton(page).click();
  await menu(page).getByRole("menuitem", { name: "Copy formatting" }).click();
  await expect(menu(page)).toBeHidden();
  await selectWord(page, "Styled");
  await styleButton(page).click();
  const paste = menu(page).getByRole("menuitem", { name: "Paste formatting" });
  await expect(paste).not.toHaveAttribute("aria-disabled", "true");
  await paste.click();
  expect(await marksOf(page)).toEqual([["Styled", ["italic"]], [" then plain ", []], ["slanted", ["italic"]]]);
});

test("copying plain text and pasting it takes the styles off", async ({ page }) => {
  await mount(page, { content: two });
  const mod = await modOf(page);
  // Put the caret inside the plain words, with nothing selected: the copy reads the styles at the caret.
  await page.keyboard.press(`${mod}+Home`);
  for (let n = 0; n < 9; n++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press(`${mod}+Alt+c`);
  await selectWord(page, "Styled");
  await page.keyboard.press(`${mod}+Alt+v`);
  expect(await marksOf(page)).toEqual([["Styled then plain ", []], ["slanted", ["italic"]]]);
});

test("with nothing selected, paste formatting styles what is typed next", async ({ page }) => {
  await mount(page, { content: two });
  const mod = await modOf(page);
  await selectWord(page, "Styled");
  await page.keyboard.press(`${mod}+Alt+c`);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.press(`${mod}+Alt+v`);
  await page.keyboard.type("!");
  expect((await marksOf(page)).at(-1)).toEqual(["!", ["bold", "underline", "highlight"]]);
});

test("formatting copied in one chapter can be pasted in another", async ({ page }) => {
  await page.goto("/tests/browser/author-workspace.html");
  await page.waitForFunction(() => window.host !== undefined);
  await page.evaluate(() => window.host.workspace.ready);
  const mod = await modOf(page);
  const open = async (name: string) => {
    await page.getByRole("navigation", { name: "Chapters" }).locator("button.oe-file").filter({ hasText: name }).click();
    await expect(page.getByRole("textbox", { name, exact: true })).toBeFocused();
  };
  await open("Before Light");
  await page.getByRole("textbox", { name: "Before Light", exact: true }).getByText("quiet", { exact: true }).dblclick();
  await page.keyboard.press(`${mod}+Alt+c`);
  await open("The First Loaf");
  await page.getByRole("textbox", { name: "The First Loaf", exact: true }).getByText("How to read a loaf").dblclick();
  await page.keyboard.press(`${mod}+Alt+v`);
  await page.keyboard.press(`${mod}+s`);
  await expect(page.getByRole("status")).toHaveText("The First Loaf: saved");
  const saved = JSON.parse((await page.evaluate(() => window.host.stored() as Record<string, string>))["chapters/ch-first-loaf.json"]);
  const heading = saved.content.find((block: Node) => block.type === "heading");
  expect(heading.content.some((node: Node) => (node.marks ?? []).some((mark) => mark.type === "bold"))).toBe(true);
  expect(await page.evaluate((c) => window.host.validateChapter(c), saved)).toEqual([]);
});
