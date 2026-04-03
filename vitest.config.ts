import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function workspacePath(pathname: string): string {
  return fileURLToPath(new URL(pathname, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      "@prism/core": workspacePath("./packages/core/src/index.ts"),
      "@prism/memory": workspacePath("./packages/memory/src/index.ts"),
      "@prism/orchestrator": workspacePath("./packages/orchestrator/src/index.ts"),
      "@prism/guardian": workspacePath("./packages/guardian/src/index.ts"),
      "@prism/execution": workspacePath("./packages/execution/src/index.ts"),
      "@prism/ui": workspacePath("./packages/ui/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
