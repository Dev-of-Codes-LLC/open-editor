# 0005: pnpm, Vitest in Node, Playwright against the built files

Date: 2026-11-25. Status: accepted.

## Decision

- **pnpm workspace**, as the plan's stack table says. One package today.
- **TypeScript**, strict. The build is Vite in library mode; `tsc` writes the type files.
- **Vitest** runs the unit tests in Node with no browser: the stored format,
  and what each entry point does before it touches a page. This also proves
  that importing the package needs no browser.
- **Playwright** runs the browser tests in Chromium, Firefox and WebKit. They
  run against the built standalone files, served by a static server with no
  build step (`scripts/serve.mjs`). So the tests exercise what a host with no
  bundler receives.
- **Retention** is tested in Chromium only. It needs the DevTools protocol.
- **Licences** are listed by `scripts/licenses.mjs`, which CI runs with `--check`.

## Why

Testing the built files, not the source, means a broken build fails the tests.
A static server with no transforms means the quickstart claim, "no bundler",
is tested and not assumed.

## Cost

The browser tests need a build first. `pnpm test:browser` after a source change
without `pnpm build` tests the old files.
