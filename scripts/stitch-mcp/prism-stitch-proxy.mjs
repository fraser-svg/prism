#!/usr/bin/env node
// prism-stitch-proxy.mjs — MCP proxy for Google Stitch SDK
// Reads API key from macOS Keychain, launches StitchProxy on stdio transport.

import { execSync } from "node:child_process";

// --- Phase 1: SDK import ---
let StitchProxy, StdioServerTransport;
try {
  ({ StitchProxy } = await import("@google/stitch-sdk"));
  ({ StdioServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/stdio.js"
  ));
} catch {
  console.error(
    "Stitch SDK not found. Run: cd scripts/stitch-mcp && npm install"
  );
  process.exit(1);
}

// --- Phase 2: Keychain read ---
let apiKey;
try {
  apiKey = execSync(
    'security find-generic-password -s "prism-stitch" -a "prism" -w 2>/dev/null',
    { encoding: "utf-8" }
  ).trim();
} catch {
  console.error(
    "Stitch API key not found in Keychain. Run: prism: connect stitch"
  );
  process.exit(1);
}

if (!apiKey) {
  console.error(
    "Stitch API key is empty in Keychain. Run: prism: connect stitch"
  );
  process.exit(1);
}

// --- Phase 3: StitchProxy construction + start ---
let proxy;
try {
  proxy = new StitchProxy({ apiKey });
} catch {
  console.error("Failed to create StitchProxy. Check your API key format.");
  process.exit(1);
}

// Clean shutdown
const shutdown = async () => {
  try {
    await proxy.close();
  } catch {
    // best-effort cleanup
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("unhandledRejection", (err) => {
  console.error("Stitch proxy fatal error:", err);
  process.exit(1);
});

console.error("Stitch MCP proxy started");

const transport = new StdioServerTransport();
await proxy.start(transport);
