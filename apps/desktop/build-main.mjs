import { build } from "esbuild";
import { cpSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Main process — ESM (workspace packages use import.meta)
await build({
  entryPoints: ["src/main/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: "dist/main",
  format: "esm",
  external: ["electron", "better-sqlite3"],
  sourcemap: true,
  banner: {
    // Fix __dirname/__filename for ESM — avoid named imports to prevent conflicts with bundled code
    js: 'import { createRequire as _cr } from "module"; const require = _cr(import.meta.url); const __filename = new URL(import.meta.url).pathname; const __dirname = __filename.slice(0, __filename.lastIndexOf("/"));',
  },
});

// Preload — CJS (sandbox mode requires require())
await build({
  entryPoints: ["src/main/preload.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  outdir: "dist/main",
  format: "cjs",
  external: ["electron"],
  sourcemap: true,
});

// Copy migrations so workspace-database.ts can find them at runtime
cpSync(
  resolve(__dirname, "../../packages/workspace/src/migrations"),
  resolve(__dirname, "dist/main/migrations"),
  { recursive: true },
);
