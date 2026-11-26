// The page at the root of the local server: both workspaces, already open.
import { expect, test } from "@playwright/test";

test("the root page opens a chapter and a file without a click, and keeps the keyboard", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Open Editor");

  // The book: a chapter is on screen with the Style menu above it.
  const chapter = page.getByRole("textbox", { name: "The Open Door", exact: true });
  await expect(chapter).toBeVisible();
  await expect(chapter).toContainText("At six the door opens.");
  await expect(page.locator("#book").getByRole("button", { name: "Style" })).toBeVisible();

  // The code: the first file is on screen.
  await expect(page.getByRole("textbox", { name: "scale.js", exact: true })).toContainText("function scale(amount, from, to) {");

  // Opening them did not take the keyboard or mark anything unsaved.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await expect(page.locator("#book").getByRole("status")).toHaveText("The Open Door: saved");
  await expect(page.locator("#code").getByRole("status")).toHaveText("scale.js: saved");

  // It says which build it shows.
  await expect(page.locator("#built")).toContainText("Built ");
  expect(errors).toEqual([]);
});

test("the Style menu works on the root page, and an export opens below the book", async ({ page }) => {
  await page.goto("/");
  const chapter = page.getByRole("textbox", { name: "The Open Door", exact: true });
  await chapter.click();
  await page.locator("#book").getByRole("button", { name: "Style" }).click();
  await page.getByRole("menuitemradio", { name: "Heading 2" }).click();
  await expect(page.locator("#book").getByRole("status")).toHaveText("The Open Door: unsaved changes");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  await expect(page.locator("#export")).toBeVisible();
  await expect(page.locator("#export")).toContainText("# The Bakery at Six");
});
