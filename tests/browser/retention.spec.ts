// Mount, edit and dispose each profile many times, then ask the browser what
// is still alive. Chromium only: it needs the DevTools protocol to force a
// garbage collection and to count nodes and listeners.
//
// What "alive" means here: the harness keeps a weak reference to three things
// per editor (the handle, the root element, the engine's editable element).
// After a forced collection, a weak reference that still resolves is an
// object something is holding on to.
//
// One known exception, in the "manuscript" profile. The history package of
// ProseMirror keeps the plugin list of the last editor that recorded an undo
// step in a module-level variable. One of Tiptap's plugins holds its editor,
// and the editor holds the element it was built in. So the last manuscript
// editor that was typed in stays alive after destroy, until the next one
// takes its place. It is one editor, not one per mount. The test allows
// exactly that and nothing more. See docs/decisions/0004-retention.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";
import { retainerPaths } from "./retainers";

const CYCLES = Number(process.env.CYCLES ?? 50);
// The most tracked objects each profile may leave alive, and which.
const ALLOWED = {
  code: [] as { editor: "last"; kind: string }[],
  manuscript: [{ editor: "last" as const, kind: "root element" }],
};
const results: Record<string, unknown> = {};

async function collect(page: Page, cdp: CDPSession) {
  // Twice, with a turn of the event loop between: the first pass can leave
  // objects that only the second can free.
  for (let pass = 0; pass < 2; pass++) {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.evaluate(() => new Promise((done) => setTimeout(done, 20)));
  }
  await cdp.send("HeapProfiler.collectGarbage");
}

async function metrics(cdp: CDPSession) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const pick = (name: string) => metrics.find((m) => m.name === name)?.value ?? NaN;
  return { nodes: pick("Nodes"), listeners: pick("JSEventListeners"), heapBytes: pick("JSHeapUsedSize") };
}

async function open(page: Page) {
  await page.goto("/tests/browser/harness.html");
  await page.waitForFunction(() => window.harness !== undefined);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  return cdp;
}

async function cycle(page: Page, profile: "code" | "manuscript", n: number) {
  const document = profile === "code" ? "let a = 1;\n" : "Some **notes**.";
  const took: number = await page.evaluate((options) => window.harness.mount(options), { profile, document });
  await page.locator("#mount [contenteditable='true']").click();
  await page.keyboard.type(`edit ${n} `);
  const changes: string[] = await page.evaluate(() => window.harness.changes());
  expect(changes.length, `cycle ${n}: typing fired change`).toBeGreaterThan(0);
  expect(changes.at(-1), `cycle ${n}: the typed text is in the document`).toContain(`edit ${n}`);
  await page.evaluate(() => window.harness.destroy());
  expect(await page.evaluate(() => window.harness.mountChildren()), `cycle ${n}: mount is empty`).toBe(0);
  return took;
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

test.describe("retention", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "needs the Chromium DevTools protocol");

  for (const profile of ["code", "manuscript"] as const) {
    test(`${profile}: ${CYCLES} mount, edit and dispose cycles keep nothing alive that is not allowed`, async ({ page }) => {
      const cdp = await open(page);

      // Three warm-up cycles first, so one-time costs (the engine's shared
      // style sheet, caches, compiled code) are in the "before" figures.
      for (let n = 1; n <= 3; n++) await cycle(page, profile, n);
      await collect(page, cdp);
      const before = await metrics(cdp);
      const trackedBefore: number = await page.evaluate(() => window.harness.tracked());

      const mountMs: number[] = [];
      for (let n = 1; n <= CYCLES; n++) mountMs.push(await cycle(page, profile, n));
      await collect(page, cdp);
      const after = await metrics(cdp);

      const tracked: number = await page.evaluate(() => window.harness.tracked());
      const alive: number = await page.evaluate(() => window.harness.alive());
      const lastEditor = tracked / 3 - 1;
      const aliveList: { editor: number; kind: string }[] = await page.evaluate(() => window.harness.aliveList());
      results[profile] = {
        cycles: CYCLES,
        trackedObjects: tracked,
        aliveAfterCollection: alive,
        alive: aliveList.map((item) => `${item.kind} of editor ${item.editor + 1} of ${lastEditor + 1}`),
        nodes: { before: before.nodes, after: after.nodes, growth: after.nodes - before.nodes },
        listeners: { before: before.listeners, after: after.listeners, growth: after.listeners - before.listeners },
        heapBytes: { before: before.heapBytes, after: after.heapBytes, growth: after.heapBytes - before.heapBytes },
        createEditorMs: {
          median: Number(median(mountMs).toFixed(2)),
          max: Number(Math.max(...mountMs).toFixed(2)),
        },
      };
      console.log(`retention ${profile}: ${JSON.stringify(results[profile])}`);

      expect(tracked - trackedBefore).toBe(CYCLES * 3);
      expect(
        aliveList.map((item) => ({ editor: item.editor === lastEditor ? "last" : item.editor, kind: item.kind })),
        "objects still alive after a forced collection",
      ).toEqual(ALLOWED[profile]);
      expect(after.nodes - before.nodes, "DOM nodes kept").toBeLessThanOrEqual(0);
      expect(after.listeners - before.listeners, "event listeners kept").toBeLessThanOrEqual(0);
    });
  }

  // The check above is only worth something if it can fail. This is the
  // mistake it must see: editors taken off the page, never destroyed, and
  // still held by the host.
  test("control: editors that are kept and not destroyed are counted as alive", async ({ page }) => {
    const cdp = await open(page);
    const KEPT = 10;
    for (let n = 0; n < KEPT; n++) {
      await page.evaluate((profile) => {
        window.harness.mount({ profile, document: "kept" });
        window.harness.forget();
      }, n % 2 === 0 ? "code" : "manuscript");
    }
    await collect(page, cdp);
    const aliveWhileKept: number = await page.evaluate(() => window.harness.alive());

    await page.evaluate(() => window.harness.release());
    await collect(page, cdp);
    const aliveAfterRelease: number = await page.evaluate(() => window.harness.alive());

    const aliveList: { editor: number; kind: string }[] = await page.evaluate(() => window.harness.aliveList());

    // These editors were destroyed after their element had left the page.
    // In that order CodeMirror can keep one root element too: it reuses one
    // module-level Range for measuring text, and a Range inside a detached
    // tree stays in that tree. So at most one root element for each engine
    // may remain. See docs/decisions/0004-retention.md.
    results.control = {
      kept: KEPT,
      trackedObjects: KEPT * 3,
      aliveWhileKept,
      aliveAfterRelease,
      alive: aliveList.map((item) => `${item.kind} of editor ${item.editor + 1} of ${KEPT}`),
    };
    console.log(`retention control: ${JSON.stringify(results.control)}`);
    if (aliveAfterRelease > 0) console.log((await retainerPaths(cdp, "oe oe-")).join("\n\n"));
    expect(aliveWhileKept).toBe(KEPT * 3);
    expect(aliveAfterRelease).toBeLessThanOrEqual(2);
    expect(aliveList.every((item) => item.kind === "root element" && item.editor >= KEPT - 2)).toBe(true);
  });

  test.afterAll(async ({ browser }) => {
    if (Object.keys(results).length === 0) return;
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/retention.json",
      JSON.stringify({ browser: `${browser.browserType().name()} ${browser.version()}`, ...results }, null, 2) + "\n",
    );
  });
});
