/**
 * Native better-sqlite3 loader for Electron.
 * Uses createRequire to load the native .node addon at runtime
 * rather than letting Vite try to bundle it.
 */

import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const Database = _require("better-sqlite3");

export default Database;
export type { Database as DatabaseType } from "better-sqlite3";
