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
    // Other checkouts of this repo live under .claude/worktrees; their tests
    // describe their own commit, not this one.
    exclude: ["node_modules/**", ".claude/**", ".next/**", ".next-e2e/**", "pc-worker/**", "e2e/**"],
    // The access suites share fixtures (a second user, a team) on the one
    // local database; running files in parallel makes them trample each
    // other. Serial is a few seconds slower and deterministic.
    fileParallelism: false,
  },
});
