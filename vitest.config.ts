import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Other sessions' git worktrees live under .claude/; don't run their copies.
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/**"],
  },
});
