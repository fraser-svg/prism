import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

function workspacePath(pathname: string): string {
  return fileURLToPath(new URL(pathname, import.meta.url));
}

const prismAliases = {
  "@prism/core": workspacePath("../../packages/core/src/index.ts"),
  "@prism/workspace": workspacePath("../../packages/workspace/src/index.ts"),
  "@prism/orchestrator": workspacePath("../../packages/orchestrator/src/index.ts"),
  "@prism/memory": workspacePath("../../packages/memory/src/index.ts"),
  "@prism/guardian": workspacePath("../../packages/guardian/src/index.ts"),
  "@prism/execution": workspacePath("../../packages/execution/src/index.ts"),
};

/**
 * Externalize better-sqlite3 from the bundle.
 * electron-vite sets ssr.noExternal=true which bundles everything.
 * This plugin intercepts the import during resolveId and marks it external
 * before Vite's SSR resolution can pull it into the bundle.
 */
function externalNativeModules(): Plugin {
  return {
    name: "external-native-modules",
    enforce: "pre",
    resolveId(source) {
      if (source === "better-sqlite3") {
        return { id: "better-sqlite3", external: true };
      }
    },
  };
}

export default defineConfig({
  main: {
    plugins: [
      externalNativeModules(),
      externalizeDepsPlugin({
        exclude: [
          "@prism/core",
          "@prism/workspace",
          "@prism/orchestrator",
          "@prism/memory",
          "@prism/guardian",
          "@prism/execution",
        ],
      }),
    ],
    build: {
      rollupOptions: {
        input: "src/main/index.ts",
      },
    },
    resolve: { alias: prismAliases },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: "src/preload/index.ts",
      },
    },
    resolve: { alias: prismAliases },
  },
  renderer: {
    plugins: [react()],
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: "src/renderer/index.html",
      },
    },
  },
});
