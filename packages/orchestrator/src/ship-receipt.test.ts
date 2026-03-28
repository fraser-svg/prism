/**
 * Ship receipt subprocess tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.setConfig({ testTimeout: 30_000 });
import { execFile as execFileCb, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCb);

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(SRC_DIR, "cli.ts");
const TSCONFIG_PATH = join(SRC_DIR, "..", "tsconfig.json");
const TSX_ARGS = ["tsx", "--tsconfig", TSCONFIG_PATH, CLI_PATH];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  tmpDir = await mkdtemp(join(tmpdir(), "prism-receipt-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// record-ship
// ---------------------------------------------------------------------------

describe("record-ship", () => {
  it("writes receipt to .prism/ships/{specId}/receipt.json", async () => {
    const specId = "spec-receipt-1";
    const input = JSON.stringify({
      commitSha: "abc1234",
      commitMessage: "feat: test feature",
      branch: "feat/test",
      baseBranch: "main",
      prUrl: "https://github.com/test/test/pull/1",
      tagName: "prism/test-feature",
      specSummary: "Test feature implementation",
      reviewVerdicts: { engineering: "pass", qa: "pass" },
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["record-ship", tmpDir, specId],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      id: string;
      specId: string;
      commitSha: string;
      prUrl: string;
    };
    expect(parsed.specId).toBe(specId);
    expect(parsed.commitSha).toBe("abc1234");
    expect(parsed.prUrl).toBe("https://github.com/test/test/pull/1");

    // Verify file exists on disk
    const receiptPath = join(tmpDir, ".prism", "ships", specId, "receipt.json");
    await access(receiptPath); // throws if missing

    // Read and verify content
    const onDisk = JSON.parse(await readFile(receiptPath, "utf-8"));
    expect(onDisk.commitSha).toBe("abc1234");
    expect(onDisk.specSummary).toBe("Test feature implementation");
    expect(onDisk.shippedAt).toBeTruthy();
    expect(onDisk.reviewVerdicts.engineering).toBe("pass");
  });

  it("handles minimal receipt (only required fields)", async () => {
    const specId = "spec-minimal";
    const input = JSON.stringify({
      commitSha: "def5678",
      commitMessage: "feat: minimal",
      branch: "feat/min",
      baseBranch: "main",
    });

    const { stdout, exitCode } = await runCliWithStdin(
      ["record-ship", tmpDir, specId],
      input,
    );
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      specId: string;
      prUrl: null;
      deployUrl: null;
      tagName: null;
    };
    expect(parsed.specId).toBe(specId);
    expect(parsed.prUrl).toBeNull();
    expect(parsed.deployUrl).toBeNull();
    expect(parsed.tagName).toBeNull();
  });

  it("returns error when stdin is empty", async () => {
    const { stdout, exitCode } = await runCliWithStdin(
      ["record-ship", tmpDir, "spec-empty"],
      "",
    );
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toBeTruthy();
  });

  it("returns error when specId is missing", async () => {
    const { stdout, exitCode } = await runCli(["record-ship", tmpDir]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/missing required argument/i);
  });

  it("receipt via batch command works", async () => {
    const specId = "spec-batch-receipt";
    const commands = JSON.stringify([
      {
        command: "record-ship",
        args: [tmpDir, specId],
        stdin: {
          commitSha: "batch123",
          commitMessage: "feat: batch ship",
          branch: "feat/batch",
          baseBranch: "main",
          specSummary: "Batch test",
        },
      },
    ]);

    const { stdout, exitCode } = await runCliWithStdin(["batch"], commands);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as {
      results: Array<{ command: string; ok: boolean; data?: { specId: string } }>;
    };
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]!.ok).toBe(true);
    expect(parsed.results[0]!.data?.specId).toBe(specId);

    // Verify file written
    const receiptPath = join(tmpDir, ".prism", "ships", specId, "receipt.json");
    await access(receiptPath);
  });
});
