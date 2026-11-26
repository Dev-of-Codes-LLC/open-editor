// The three views of a chapter: formatted, Markdown and HTML. Each test builds
// a chapter editor on the author page's spare element, from one of the example
// chapters, and reads back the chapter the editor writes.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

type Node = { type: string; text?: string; marks?: { type: string }[]; attrs?: Record<string, unknown>; content?: Node[] };
type Chapter = { id: string; content: Node[]; footnotes?: Record<string, { content: Node[] }> };

const FILES = ["chapters/ch-before-light.json", "chapters/ch-first-loaf.json", "chapters/ch-open-door.json"];

async function mount(page: Page, file: string): Promise<Chapter> {
  await page.goto("/tests/browser/author-workspace.html");
  await page.waitForFunction(() => window.host !== undefined);
  return page.evaluate((path) => {
    const chapter = JSON.parse(window.host.seed[path]);
    (window as any).spare = window.host.createChapterEditor({ mount: window.host.spare, chapter, label: "Spare", imageUrl: (src: string) => `/examples/book/${src}` });
    return chapter;
  }, file);
}
const chapter = (page: Page) => page.evaluate(() => (window as any).spare.getChapter() as Chapter);
const problems = (page: Page) => page.evaluate(() => window.host.validateChapter((window as any).spare.getChapter()) as string[]);
const spare = (page: Page) => page.locator("#spare");
const viewButton = (page: Page, name: string) => spare(page).getByRole("radiogroup", { name: "View" }).getByRole("radio", { name });
const formatted = (page: Page) => page.getByRole("textbox", { name: "Spare", exact: true });
const source = (page: Page) => page.getByRole("textbox", { name: "Spare, source" });
const sourceText = (page: Page) => page.evaluate(() => [...document.querySelectorAll("#spare .oe-source .cm-line")].map((line) => line.textContent).join("\n"));
const modOf = (page: Page) => page.evaluate(() => (/mac|iphone|ipad|ipod/i.test(navigator.platform) ? "Meta" : "Control"));
// The same chapter whatever order its keys are in.
const flat = (value: unknown): string => JSON.stringify(value, (_key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
// Type at the very end of the source.
async function typeAtEnd(page: Page, text: string) {
  await source(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press(`${await modOf(page)}+End`);
  await page.keyboard.type(text);
}

test("the switch offers three views and starts on the formatted one", async ({ page }) => {
  await mount(page, FILES[0]);
  await expect(spare(page).getByRole("radiogroup", { name: "View" }).getByRole("radio")).toHaveText(["Formatted", "Markdown", "HTML"]);
  await expect(viewButton(page, "Formatted")).toHaveAttribute("aria-checked", "true");
  await expect(formatted(page)).toBeVisible();
  await expect(source(page)).toHaveCount(0);
});

test("the Markdown view shows the chapter as Markdown", async ({ page }) => {
  await mount(page, FILES[0]);
  await viewButton(page, "Markdown").click();
  await expect(viewButton(page, "Markdown")).toHaveAttribute("aria-checked", "true");
  await expect(formatted(page)).toBeHidden();
  await expect(source(page)).toBeFocused();
  expect(await sourceText(page)).toBe(
    [
      "The kitchen was **quiet** before six. The ovens had been on since four[^fn-ovens], and the first trays were _almost_ ready.",
      "",
      "# What waits on the bench",
      "",
      "- flour",
      "- butter",
      "- _patience_",
      "",
      "[^fn-ovens]: A stone oven needs about two hours to come up to heat.",
      "",
    ].join("\n"),
  );
});

test("the HTML view shows the chapter as HTML, with each block's id", async ({ page }) => {
  await mount(page, FILES[1]);
  await viewButton(page, "HTML").click();
  const text = await sourceText(page);
  expect(text).toContain("<p>The first loaf of the day is never sold. It tells the baker how the oven feels.</p>");
  expect(text).toContain('<figure id="img-loaf">\n  <img src="images/loaf.svg" alt="A round loaf with a cross cut in its top.">\n  <figcaption>The first loaf, scored and ready.</figcaption>\n</figure>');
  expect(text).toContain('<a href="https://example.com/cooling-bread">a guide to cooling</a>');
});

for (const file of FILES) {
  for (const view of ["Markdown", "HTML"] as const) {
    test(`${file} survives a trip through the ${view} view unchanged`, async ({ page }) => {
      const original = await mount(page, file);
      await viewButton(page, view).click();
      // Touch the source so that it is read back, and leave it as it was.
      await typeAtEnd(page, "x");
      await page.keyboard.press("Backspace");
      await viewButton(page, "Formatted").click();
      expect(flat(await chapter(page))).toBe(flat(original));
      expect(await problems(page)).toEqual([]);
    });
  }
}

test("what is typed in the Markdown view shows up formatted", async ({ page }) => {
  await mount(page, FILES[0]);
  await viewButton(page, "Markdown").click();
  await typeAtEnd(page, "\n## Later\n\nThe shelves are **empty** by ~~ten~~ nine.\n");
  await viewButton(page, "Formatted").click();
  await expect(formatted(page).getByRole("heading", { name: "Later", level: 2 })).toBeVisible();
  await expect(formatted(page).locator("strong", { hasText: "empty" })).toBeVisible();
  await expect(formatted(page).locator("s", { hasText: "ten" })).toBeVisible();
  const now = await chapter(page);
  expect(now.content.slice(-2)).toEqual([
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Later" }] },
    { type: "paragraph", content: [{ type: "text", text: "The shelves are " }, { type: "text", text: "empty", marks: [{ type: "bold" }] }, { type: "text", text: " by " }, { type: "text", text: "ten", marks: [{ type: "strike" }] }, { type: "text", text: " nine." }] },
  ]);
  // The blocks that were not touched kept their ids, and the footnote is still there.
  expect(now.content[0].attrs).toEqual({ id: "p-kitchen-quiet" });
  expect(now.content[1].attrs).toEqual({ id: "h-what-waits", level: 1 });
  expect(Object.keys(now.footnotes ?? {})).toEqual(["fn-ovens"]);
  expect(await problems(page)).toEqual([]);
});

test("what is typed in the HTML view shows up formatted", async ({ page }) => {
  await mount(page, FILES[0]);
  await viewButton(page, "HTML").click();
  await source(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press(`${await modOf(page)}+Home`);
  await page.keyboard.type('<blockquote id="q-new"><p>Added <u>here</u>.</p></blockquote>\n');
  await viewButton(page, "Formatted").click();
  await expect(formatted(page).locator("blockquote u", { hasText: "here" })).toBeVisible();
  expect((await chapter(page)).content[0]).toEqual({
    type: "blockquote",
    attrs: { id: "q-new" },
    content: [{ type: "paragraph", content: [{ type: "text", text: "Added " }, { type: "text", text: "here", marks: [{ type: "underline" }] }, { type: "text", text: "." }] }],
  });
  expect(await problems(page)).toEqual([]);
});

test("an edit in the formatted view shows in Markdown, and an edit there shows in HTML", async ({ page }) => {
  await mount(page, FILES[2]);
  await formatted(page).click();
  await page.waitForTimeout(300);
  await page.keyboard.press(`${await modOf(page)}+End`);
  await page.keyboard.type(" Typed formatted.");
  await viewButton(page, "Markdown").click();
  expect(await sourceText(page)).toContain("Typed formatted.");
  await typeAtEnd(page, "\nTyped in **Markdown**.\n");
  await viewButton(page, "HTML").click();
  expect(await sourceText(page)).toContain("<p>Typed in <strong>Markdown</strong>.</p>");
  expect(await problems(page)).toEqual([]);
});

test("a footnote written in Markdown becomes a footnote of the chapter", async ({ page }) => {
  await mount(page, FILES[1]);
  await viewButton(page, "Markdown").click();
  await typeAtEnd(page, "\nBread keeps a day[^keep].\n\n[^keep]: Two, in a tin.\n");
  await viewButton(page, "Formatted").click();
  await expect(page.locator("#spare").getByRole("list", { name: "Footnotes" }).getByRole("listitem")).toHaveText(["Two, in a tin."]);
  const now = await chapter(page);
  expect(now.footnotes).toEqual({ keep: { content: [{ type: "paragraph", content: [{ type: "text", text: "Two, in a tin." }] }] } });
  expect(await problems(page)).toEqual([]);
});

test("a script, a handler and a picture from the web typed into the HTML view are dropped, and nothing runs", async ({ page }) => {
  await mount(page, FILES[0]);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await viewButton(page, "HTML").click();
  await source(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press(`${await modOf(page)}+Home`);
  await page.keyboard.type('<script>window.ran = "script"</script><p onclick="window.ran = \'click\'" style="color:red">Kept text</p><img src="https://example.com/track.png" onerror="window.ran = \'error\'"><iframe src="https://example.com/"></iframe>\n');
  await viewButton(page, "Formatted").click();
  await formatted(page).getByText("Kept text").click();
  expect(await page.evaluate(() => (window as any).ran)).toBeUndefined();
  expect(requests.filter((url) => url.includes("example.com"))).toEqual([]);
  const now = await chapter(page);
  expect(now.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Kept text" }] });
  expect(JSON.stringify(now)).not.toContain("example.com");
  expect(JSON.stringify(now)).not.toContain("window.ran");
  expect(await problems(page)).toEqual([]);
  // The paragraph came back without the handler and the style.
  await viewButton(page, "HTML").click();
  expect(await sourceText(page)).toContain("<p>Kept text</p>");
});

test("styles belong to the formatted view: the Style button is off in the other two", async ({ page }) => {
  await mount(page, FILES[0]);
  const style = spare(page).getByRole("button", { name: "Style" });
  await expect(style).toBeEnabled();
  await viewButton(page, "Markdown").click();
  await expect(style).toBeDisabled();
  await expect(spare(page).getByRole("list", { name: "Footnotes" })).toBeHidden();
  await viewButton(page, "Formatted").click();
  await expect(style).toBeEnabled();
  await expect(spare(page).getByRole("list", { name: "Footnotes" })).toBeVisible();
});

test("the arrow keys move through the three views", async ({ page }) => {
  await mount(page, FILES[0]);
  await viewButton(page, "Formatted").focus();
  await page.keyboard.press("ArrowRight");
  await expect(viewButton(page, "Markdown")).toHaveAttribute("aria-checked", "true");
  await expect(viewButton(page, "Markdown")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(viewButton(page, "HTML")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(viewButton(page, "Formatted")).toHaveAttribute("aria-checked", "true");
  await expect(formatted(page)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(viewButton(page, "HTML")).toHaveAttribute("aria-checked", "true");
});

test("in the workspace, Save right after typing in the Markdown view writes what was typed", async ({ page }) => {
  await page.goto("/tests/browser/author-workspace.html");
  await page.waitForFunction(() => window.host !== undefined);
  await page.evaluate(() => window.host.workspace.ready);
  await page.getByRole("navigation", { name: "Chapters" }).locator("button.oe-file").filter({ hasText: "Before Light" }).click();
  await expect(page.getByRole("textbox", { name: "Before Light", exact: true })).toBeFocused();
  await page.locator("#mount").getByRole("radio", { name: "Markdown" }).click();
  const mod = await modOf(page);
  await page.waitForTimeout(100);
  await page.keyboard.press(`${mod}+End`);
  await page.keyboard.type("\nThe till opens at **six**.\n");
  // No pause: the save must not wait for the typing to settle.
  await page.keyboard.press(`${mod}+s`);
  await expect(page.locator("#mount").getByRole("status")).toHaveText("Before Light: saved");
  const saved: Chapter = JSON.parse((await page.evaluate(() => window.host.stored() as Record<string, string>))["chapters/ch-before-light.json"]);
  expect(saved.content.at(-1)).toEqual({ type: "paragraph", content: [{ type: "text", text: "The till opens at " }, { type: "text", text: "six", marks: [{ type: "bold" }] }, { type: "text", text: "." }] });
  expect(saved.content[0].attrs).toEqual({ id: "p-kitchen-quiet" });
  expect(await page.evaluate((c) => window.host.validateChapter(c), saved)).toEqual([]);
  // The word count followed.
  await expect(page.locator("#mount .oe-counts")).toContainText("33 words in this chapter");
});
