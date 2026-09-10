import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    // The access suites share fixtures (a second user, a team) on the one
    // local database; running files in parallel makes them trample each
    // other. Serial is a few seconds slower and deterministic.
    fileParallelism: false,
  },
});
