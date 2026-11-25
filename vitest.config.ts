import { defineConfig } from "vitest/config";

// The unit tests run in Node, with no browser: the stored format, and what
// each entry point does before it touches a page.
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
