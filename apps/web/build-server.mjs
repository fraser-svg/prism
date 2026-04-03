import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgs = resolve(__dirname, "../../packages");

await build({
  entryPoints: ["server/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/server/index.js",
  // Keep native modules external — they resolve from node_modules at runtime
  external: ["better-sqlite3"],
  alias: {
    "@prism/core": resolve(pkgs, "core/src/index.ts"),
    "@prism/memory": resolve(pkgs, "memory/src/index.ts"),
    "@prism/orchestrator": resolve(pkgs, "orchestrator/src/index.ts"),
    "@prism/orchestrator/pipeline-snapshot": resolve(pkgs, "orchestrator/src/pipeline-snapshot.ts"),
    "@prism/guardian": resolve(pkgs, "guardian/src/index.ts"),
    "@prism/execution": resolve(pkgs, "execution/src/index.ts"),
    "@prism/workspace": resolve(pkgs, "workspace/src/index.ts"),
    "@prism/ui": resolve(pkgs, "ui/src/index.ts"),
  },
  banner: {
    // ESM needs createRequire for native modules like better-sqlite3
    js: `import { createRequire } from "module"; const require = createRequire(import.meta.url);`,
  },
});

console.log("Server bundled -> dist/server/index.js");
