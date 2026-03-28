/**
 * CLI subprocess tests.
 *
 * Each test spawns `npx tsx cli.ts <command>` as a child process to validate
 * the bridge CLI end-to-end, including exit codes and JSON output shapes.
 *
 * Tests do NOT import from cli.ts — the CLI calls process.exit() so it must
 * be exercised via subprocess only.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { execFile as execFileCb } from "node:child_process";
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(SRC_DIR, "cli.ts");
// The orchestrator tsconfig.json defines @prism/* path aliases. tsx needs it
// explicitly because the package.json entries point to the package root (no
// built JS), so Node's default resolution fails without the TS path mapping.
const TSCONFIG_PATH = join(SRC_DIR, "..", "tsconfig.json");

/** Base npx tsx invocation with tsconfig so @prism/* aliases resolve. */
const TSX_ARGS = ["tsx", "--tsconfig", TSCONFIG_PATH, CLI_PATH];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFile("npx", [...TSX_ARGS, ...args], {
      env: { ...process.env },
      timeout: 30_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.code ?? 1,
    };
  }
}

async function runCliWithStdin(
  args: string[],
  stdin: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("npx", [...TSX_ARGS, ...args], {
      env: { ...process.env },
      timeout: 30_000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d; });
    proc.stderr.on("data", (d: Buffer) => { stderr += d; });
    proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Could not parse stdout as JSON:\n${raw}`);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "prism-cli-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Router / argument validation
// ---------------------------------------------------------------------------

describe("router", () => {
  it("no command returns error JSON and exits 1", async () => {
    const { stdout, exitCode } = await runCli([]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toBeTruthy();
    expect(typeof parsed.error).toBe("string");
  });

  it("unknown command returns error JSON and exits 1", async () => {
    const { stdout, exitCode } = await runCli(["not-a-real-command"]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/unknown command/i);
  });
});

// ---------------------------------------------------------------------------
// gate-check
// ---------------------------------------------------------------------------

describe("gate-check", () => {
  it("invalid fromPhase returns error and exits 1", async () => {
    const { stdout, exitCode } = await runCli([
      "gate-check", tmpDir, "invalid-phase", "plan",
    ]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/invalid fromPhase/i);
  });

  it("invalid toPhase returns error and exits 1", async () => {
    const { stdout, exitCode } = await runCli([
      "gate-check", tmpDir, "spec", "not-a-phase",
    ]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/invalid toPhase/i);
  });

  it("spec->plan on empty project (no spec) returns blocked with exit 1", async () => {
    // No spec written — should block, but gate-check itself succeeds structurally
    const { stdout, exitCode } = await runCli([
      "gate-check", tmpDir, "spec", "plan",
    ]);
    // No spec ID provided → blocked (exit 0 since command succeeded, gate just blocked)
    expect(exitCode).toBe(0);
    const parsed = parseJson(stdout) as { allowed: boolean; blockers: string[] };
    expect(parsed.allowed).toBe(false);
    expect(Array.isArray(parsed.blockers)).toBe(true);
  });

  it("identify_problem->spec (lightweight) returns allowed with exit 0", async () => {
    const { stdout, exitCode } = await runCli([
      "gate-check", tmpDir, "identify_problem", "spec",
    ]);
    expect(exitCode).toBe(0);
    const parsed = parseJson(stdout) as { allowed: boolean };
    expect(parsed.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// write-spec
// ---------------------------------------------------------------------------

describe("write-spec", () => {
  it("writes spec artifact and metadata.json exists on disk", async () => {
    const specId = "spec-cli-test-1";
    const input = JSON.stringify({
      title: "CLI Test Spec",
      type: "change",
      status: "approved",
      summary: "A spec written via the CLI",
      acceptanceCriteria: ["Feature works end-to-end"],
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["write-spec", tmpDir, specId],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { written: boolean; specId: string };
    expect(parsed.written).toBe(true);
    expect(parsed.specId).toBe(specId);

    // Verify file exists on disk (access resolves without throwing if file exists)
    const metadataPath = join(tmpDir, ".prism", "specs", specId, "metadata.json");
    await access(metadataPath); // throws if missing
  });

  it("returns error when stdin is empty", async () => {
    const { stdout, exitCode } = await runCliWithStdin(
      ["write-spec", tmpDir, "spec-empty"],
      "",
    );
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// write-plan
// ---------------------------------------------------------------------------

describe("write-plan", () => {
  it("writes plan artifact and returns written:true", async () => {
    const specId = "spec-for-plan";
    const planId = "plan-cli-test-1";
    const input = JSON.stringify({
      title: "CLI Test Plan",
      specId,
      phases: [{ title: "Phase One", description: "First phase" }],
      risks: ["schedule risk"],
      sequencingRationale: "linear",
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["write-plan", tmpDir, specId, planId],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      written: boolean;
      planId: string;
      specId: string;
    };
    expect(parsed.written).toBe(true);
    expect(parsed.planId).toBe(planId);
    expect(parsed.specId).toBe(specId);

    // Verify file exists
    const metadataPath = join(tmpDir, ".prism", "plans", planId, "metadata.json");
    await access(metadataPath); // throws if missing
  });
});

// ---------------------------------------------------------------------------
// write-task-graph
// ---------------------------------------------------------------------------

describe("write-task-graph", () => {
  it("writes task graph file and returns written:true", async () => {
    const planId = "plan-for-graph";
    const graph = JSON.stringify({ tasks: [{ id: "t-1", title: "Task One" }] });

    const { stdout, exitCode } = await runCliWithStdin(
      ["write-task-graph", tmpDir, planId],
      graph,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { written: boolean; planId: string };
    expect(parsed.written).toBe(true);
    expect(parsed.planId).toBe(planId);

    // Verify the task graph JSON file exists
    const taskGraphPath = join(tmpDir, ".prism", "plans", planId, "task-graph.json");
    await access(taskGraphPath); // throws if missing
  });

  it("returns error when stdin is invalid JSON", async () => {
    const { stdout, exitCode } = await runCliWithStdin(
      ["write-task-graph", tmpDir, "plan-bad"],
      "not valid json {{",
    );
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/invalid JSON/i);
  });
});

// ---------------------------------------------------------------------------
// record-review
// ---------------------------------------------------------------------------

describe("record-review", () => {
  it("writes review artifact with engineering type", async () => {
    const specId = "spec-review-cli";
    const input = JSON.stringify({
      verdict: "pass",
      summary: "Looks good to me",
      findings: [],
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["record-review", tmpDir, specId, "engineering"],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      written: boolean;
      specId: string;
      reviewType: string;
      verdict: string;
    };
    expect(parsed.written).toBe(true);
    expect(parsed.specId).toBe(specId);
    expect(parsed.reviewType).toBe("engineering");
    expect(parsed.verdict).toBe("pass");
  });

  it("returns error for invalid review type", async () => {
    const { stdout, exitCode } = await runCliWithStdin(
      ["record-review", tmpDir, "spec-1", "bad-review-type"],
      JSON.stringify({ verdict: "pass" }),
    );
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/invalid reviewType/i);
  });
});

// ---------------------------------------------------------------------------
// record-verification
// ---------------------------------------------------------------------------

describe("record-verification", () => {
  it("writes verification artifact and returns written:true", async () => {
    const runId = "run-cli-verify-1";
    const input = JSON.stringify({
      specId: "spec-v-1",
      passed: true,
      checksRun: ["lint", "test"],
      failures: [],
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["record-verification", tmpDir, runId],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      written: boolean;
      runId: string;
      passed: boolean;
    };
    expect(parsed.written).toBe(true);
    expect(parsed.runId).toBe(runId);
    expect(parsed.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// check-reviews
// ---------------------------------------------------------------------------

describe("check-reviews", () => {
  it("returns complete:false for a change spec with no reviews written", async () => {
    const specId = "spec-no-reviews";
    // change type requires engineering + qa
    const { stdout, exitCode } = await runCli([
      "check-reviews", tmpDir, specId, "change",
    ]);
    // Exits 0 — check-reviews itself succeeds, just reports incomplete
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      complete: boolean;
      reviews: { required: string[]; missing: string[] };
    };
    expect(parsed.complete).toBe(false);
    expect(parsed.reviews.required).toContain("engineering");
    expect(parsed.reviews.required).toContain("qa");
    expect(parsed.reviews.missing.length).toBeGreaterThan(0);
  });

  it("returns error for invalid specType", async () => {
    const { stdout, exitCode } = await runCli([
      "check-reviews", tmpDir, "spec-1", "bad-type",
    ]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/invalid specType/i);
  });
});

// ---------------------------------------------------------------------------
// checkpoint
// ---------------------------------------------------------------------------

describe("checkpoint", () => {
  it("writes checkpoint and both JSON and markdown files exist", async () => {
    const input = JSON.stringify({
      phase: "execute",
      progress: "50% complete",
      decisions: ["Use TypeScript"],
      nextSteps: ["Write tests"],
      blockers: [],
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["checkpoint", tmpDir],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      written: boolean;
      phase: string;
      id: string;
    };
    expect(parsed.written).toBe(true);
    expect(parsed.phase).toBe("execute");
    expect(parsed.id).toBeTruthy();

    // Verify latest.json and latest.md exist
    const jsonPath = join(tmpDir, ".prism", "checkpoints", "latest.json");
    const mdPath = join(tmpDir, ".prism", "checkpoints", "latest.md");
    await access(jsonPath); // throws if missing
    await access(mdPath); // throws if missing
  });
});

// ---------------------------------------------------------------------------
// resume
// ---------------------------------------------------------------------------

describe("resume", () => {
  it("returns cold_start for an empty project directory", async () => {
    const { stdout, exitCode } = await runCli([
      "resume", tmpDir, "proj-test",
    ]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      phase: string;
      source: string;
      activeSpecId: unknown;
    };
    expect(parsed.source).toBe("cold_start");
    expect(parsed.phase).toBe("understand");
    expect(parsed.activeSpecId).toBeNull();
  });

  it("returns artifact source when a spec exists", async () => {
    // First write a spec
    const specId = "spec-resume-test";
    await runCliWithStdin(
      ["write-spec", tmpDir, specId],
      JSON.stringify({
        title: "Resume Test Spec",
        type: "change",
        status: "approved",
        acceptanceCriteria: ["AC 1"],
      }),
    );

    const { stdout, exitCode } = await runCli([
      "resume", tmpDir, "proj-test",
    ]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { source: string; phase: string };
    // Should find the spec artifact and not cold start
    expect(parsed.source).not.toBe("cold_start");
  });
});

// ---------------------------------------------------------------------------
// release-state
// ---------------------------------------------------------------------------

describe("release-state", () => {
  it("returns error when specType arg is missing", async () => {
    const { stdout, exitCode } = await runCli([
      "release-state", tmpDir, "spec-1",
      // missing specType
    ]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toBeTruthy();
  });

  it("returns error for invalid specType", async () => {
    const { stdout, exitCode } = await runCli([
      "release-state", tmpDir, "spec-1", "invalid-type",
    ]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/invalid specType/i);
  });

  it("returns hold decision for a spec with no evidence", async () => {
    const specId = "spec-release-cli";
    // Write a spec so deriveReleaseState can find the spec type
    await runCliWithStdin(
      ["write-spec", tmpDir, specId],
      JSON.stringify({
        title: "Release State Test",
        type: "change",
        status: "approved",
        acceptanceCriteria: ["AC 1"],
      }),
    );

    const { stdout, exitCode } = await runCli([
      "release-state", tmpDir, specId, "change",
    ]);
    // Should exit 0 (command succeeds, just returns hold)
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      decision: string;
      implementationComplete: boolean;
      reviewsComplete: boolean;
      verificationComplete: boolean;
    };
    // No checkpoint, no reviews, no verification — should be hold
    expect(parsed.decision).toBe("hold");
    expect(parsed.implementationComplete).toBe(false);
    expect(parsed.reviewsComplete).toBe(false);
    expect(parsed.verificationComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// batch
// ---------------------------------------------------------------------------

describe("batch", () => {
  it("executes multiple commands and returns results array", async () => {
    const commands = JSON.stringify([
      { command: "gate-check", args: [tmpDir, "identify_problem", "spec"] },
      { command: "resume", args: [tmpDir, "proj-test"] },
    ]);

    const { stdout, exitCode } = await runCliWithStdin(["batch"], commands);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      results: Array<{ command: string; ok: boolean; data?: unknown; error?: string }>;
    };
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]!.command).toBe("gate-check");
    expect(parsed.results[0]!.ok).toBe(true);
    expect(parsed.results[1]!.command).toBe("resume");
    expect(parsed.results[1]!.ok).toBe(true);
  });

  it("returns per-command error for unknown command (best-effort)", async () => {
    const commands = JSON.stringify([
      { command: "resume", args: [tmpDir, "proj-test"] },
      { command: "not-a-command", args: [] },
      { command: "gate-check", args: [tmpDir, "identify_problem", "spec"] },
    ]);

    const { stdout, exitCode } = await runCliWithStdin(["batch"], commands);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      results: Array<{ command: string; ok: boolean; error?: string }>;
    };
    expect(parsed.results).toHaveLength(3);
    expect(parsed.results[0]!.ok).toBe(true);
    expect(parsed.results[1]!.ok).toBe(false);
    expect(parsed.results[1]!.error).toMatch(/unknown command/i);
    // Third command still executes despite second failing (best-effort)
    expect(parsed.results[2]!.ok).toBe(true);
  });

  it("returns empty results for empty array", async () => {
    const { stdout, exitCode } = await runCliWithStdin(["batch"], "[]");
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { results: unknown[] };
    expect(parsed.results).toHaveLength(0);
  });

  it("handles commands with stdin data", async () => {
    const commands = JSON.stringify([
      {
        command: "write-spec",
        args: [tmpDir, "spec-batch-1"],
        stdin: {
          title: "Batch Spec",
          type: "change",
          status: "approved",
          acceptanceCriteria: ["AC 1"],
        },
      },
    ]);

    const { stdout, exitCode } = await runCliWithStdin(["batch"], commands);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      results: Array<{ command: string; ok: boolean; data?: { written: boolean } }>;
    };
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]!.ok).toBe(true);
    expect(parsed.results[0]!.data?.written).toBe(true);

    // Verify file exists
    const metadataPath = join(tmpDir, ".prism", "specs", "spec-batch-1", "metadata.json");
    await access(metadataPath);
  });
});
