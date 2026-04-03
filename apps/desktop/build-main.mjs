import { build } from "esbuild";

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
    // Fix __dirname/__filename/require for ESM (needed by Electron for preload path)
    // Use aliased imports to avoid colliding with bundled code's own dirname/fileURLToPath
    js: 'import { createRequire as _cr } from "module"; import { fileURLToPath as _fu } from "url"; import { dirname as _dn } from "path"; const __filename = _fu(import.meta.url); const __dirname = _dn(__filename); const require = _cr(import.meta.url);',
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
