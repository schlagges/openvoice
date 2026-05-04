import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@openvoice/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      reportsDirectory: "coverage",
    },
    globals: false,
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
