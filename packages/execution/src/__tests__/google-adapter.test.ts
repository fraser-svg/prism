import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TaskNode, EntityId, RelativePath } from "@prism/core";
import type { ExecutionContext } from "../provider-adapter";
import { GoogleAdapter } from "../google-adapter";

function makeTask(overrides?: Partial<TaskNode>): TaskNode {
  return {
    id: "task-goog-1" as EntityId,
    title: "Test google task",
    description: "Generate a component",
    ownerType: "agent",
    status: "ready",
    dependsOn: [],
    verificationRequirements: [],
    artifactsTouched: [] as RelativePath[],
    ...overrides,
  };
}

let testDir: string;
let scriptsDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `prism-google-adapter-test-${Date.now()}`);
  scriptsDir = join(testDir, "scripts");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(join(testDir, "project", ".prism", "staging"), { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    projectRoot: join(testDir, "project"),
    filesToRead: [],
    constraints: "",
    sharedContext: "",
    ...overrides,
  };
}

async function writeWorkerScript(content: string): Promise<void> {
  const scriptPath = join(scriptsDir, "prism-gemini-worker.sh");
  await writeFile(scriptPath, content, { mode: 0o755 });
}

describe("GoogleAdapter", () => {
  it("has correct provider identity and capabilities", () => {
    const adapter = new GoogleAdapter(scriptsDir);
    expect(adapter.providerId).toBe("google");
    expect(adapter.displayName).toBe("Google (Gemini)");
    expect(adapter.capabilities()).toContain("code_generation");
    expect(adapter.capabilities()).toContain("visual_design");
  });

  it("parses result.json on success", async () => {
    const task = makeTask();
    const ctx = makeContext();

    // Write a fake worker script that creates result.json
    await writeWorkerScript(`#!/bin/bash
WORKER_ID="$2"
ROOT="$1"
STAGING="$ROOT/.prism/staging/$WORKER_ID"
mkdir -p "$STAGING"
cat > "$STAGING/result.json" << 'ENDJSON'
{"status":"completed","worker_id":"test","provider":"google","model":"gemini-2.5-pro","file_manifest":["src/App.tsx"],"staging_path":"staging/test"}
ENDJSON
echo "SUCCESS -> $STAGING/result.json"
`);

    const adapter = new GoogleAdapter(scriptsDir);
    const result = await adapter.execute(task, ctx);

    expect(result.status).toBe("success");
    expect(result.fileManifest).toEqual(["src/App.tsx"]);
  });

  it("parses result.json on failure", async () => {
    const task = makeTask();
    const ctx = makeContext();

    await writeWorkerScript(`#!/bin/bash
WORKER_ID="$2"
ROOT="$1"
STAGING="$ROOT/.prism/staging/$WORKER_ID"
mkdir -p "$STAGING"
cat > "$STAGING/result.json" << 'ENDJSON'
{"status":"failed","worker_id":"test","provider":"google","model":"gemini-2.5-pro","reason":"API returned 500","file_manifest":[]}
ENDJSON
echo "FAIL: test -> $STAGING/result.json"
`);

    const adapter = new GoogleAdapter(scriptsDir);
    const result = await adapter.execute(task, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("API returned 500");
    expect(result.fileManifest).toEqual([]);
  });

  it("handles missing result.json (script crashed)", async () => {
    const task = makeTask();
    const ctx = makeContext();

    await writeWorkerScript(`#!/bin/bash
# Script crashes without writing result.json
exit 0
`);

    const adapter = new GoogleAdapter(scriptsDir);
    const result = await adapter.execute(task, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("result.json");
  });

  it("handles invalid JSON in result.json", async () => {
    const task = makeTask();
    const ctx = makeContext();

    await writeWorkerScript(`#!/bin/bash
WORKER_ID="$2"
ROOT="$1"
STAGING="$ROOT/.prism/staging/$WORKER_ID"
mkdir -p "$STAGING"
echo "NOT VALID JSON" > "$STAGING/result.json"
`);

    const adapter = new GoogleAdapter(scriptsDir);
    const result = await adapter.execute(task, ctx);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("parse");
  });

  it("handles script not found (ENOENT)", async () => {
    const adapter = new GoogleAdapter("/nonexistent/scripts");
    const result = await adapter.execute(makeTask(), makeContext());

    expect(result.status).toBe("failed");
    expect(result.error).toBeDefined();
  });

  it("kills process group on timeout", async () => {
    const task = makeTask();
    const ctx = makeContext({ timeoutMs: 500 });

    await writeWorkerScript(`#!/bin/bash
# Hang forever
sleep 60
`);

    const adapter = new GoogleAdapter(scriptsDir);
    const start = Date.now();
    const result = await adapter.execute(task, ctx);
    const elapsed = Date.now() - start;

    expect(result.status).toBe("timeout");
    expect(result.error).toContain("timed out");
    expect(elapsed).toBeLessThan(5000);
  });

  it("returns cost estimate", () => {
    const adapter = new GoogleAdapter(scriptsDir);
    const estimate = adapter.estimateCost(makeTask());
    expect(estimate).not.toBeNull();
    expect(estimate!.estimatedCostUsd).toBeGreaterThan(0);
  });
});
