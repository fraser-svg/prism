/**
 * Deploy detection subprocess tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
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
  tmpDir = await mkdtemp(join(tmpdir(), "prism-deploy-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// deploy-detect
// ---------------------------------------------------------------------------

describe("deploy-detect", () => {
  it("returns none for empty directory", async () => {
    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string; auto_deploy: boolean };
    expect(parsed.platform).toBe("none");
    expect(parsed.auto_deploy).toBe(false);
  });

  it("detects vercel from vercel.json", async () => {
    await writeFile(join(tmpDir, "vercel.json"), "{}", "utf-8");

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string };
    expect(parsed.platform).toBe("vercel");
  });

  it("detects vercel auto-deploy from .vercel/project.json with orgId", async () => {
    await mkdir(join(tmpDir, ".vercel"), { recursive: true });
    await writeFile(
      join(tmpDir, ".vercel", "project.json"),
      JSON.stringify({ orgId: "org_123", projectId: "proj_456" }),
      "utf-8",
    );

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string; auto_deploy: boolean };
    expect(parsed.platform).toBe("vercel");
    expect(parsed.auto_deploy).toBe(true);
  });

  it("detects netlify from netlify.toml", async () => {
    await writeFile(join(tmpDir, "netlify.toml"), "[build]\n  command = 'npm run build'\n", "utf-8");

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string };
    expect(parsed.platform).toBe("netlify");
  });

  it("detects railway from railway.toml", async () => {
    await writeFile(join(tmpDir, "railway.toml"), "", "utf-8");

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string };
    expect(parsed.platform).toBe("railway");
  });

  it("detects fly from fly.toml", async () => {
    await writeFile(join(tmpDir, "fly.toml"), "", "utf-8");

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string };
    expect(parsed.platform).toBe("fly");
  });

  it("detects render from render.yaml with auto_deploy", async () => {
    await writeFile(join(tmpDir, "render.yaml"), "services:\n  - type: web\n", "utf-8");

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string; auto_deploy: boolean };
    expect(parsed.platform).toBe("render");
    expect(parsed.auto_deploy).toBe(true);
  });

  it("vercel takes priority over netlify when both exist", async () => {
    await writeFile(join(tmpDir, "vercel.json"), "{}", "utf-8");
    await writeFile(join(tmpDir, "netlify.toml"), "", "utf-8");

    const { stdout, exitCode } = await runCli(["deploy-detect", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string };
    expect(parsed.platform).toBe("vercel");
  });

  it("returns error when projectRoot is missing", async () => {
    const { stdout, exitCode } = await runCli(["deploy-detect"]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/missing required argument/i);
  });
});

// ---------------------------------------------------------------------------
// deploy-trigger
// ---------------------------------------------------------------------------

describe("deploy-trigger", () => {
  it("returns not_triggered for empty directory (no platform)", async () => {
    const { stdout, exitCode } = await runCli(["deploy-trigger", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string; deploy_status: string };
    expect(parsed.platform).toBe("none");
    expect(parsed.deploy_status).toBe("not_triggered");
  });

  it("returns cli_not_installed when platform detected but CLI missing", async () => {
    await writeFile(join(tmpDir, "railway.toml"), "", "utf-8");

    // Railway CLI is almost certainly not installed in test environments
    const { stdout, exitCode } = await runCli(["deploy-trigger", tmpDir]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { platform: string; deploy_status: string };
    expect(parsed.platform).toBe("railway");
    // Either cli_not_installed (no railway CLI) or failed (CLI exists but no project)
    expect(["cli_not_installed", "failed"]).toContain(parsed.deploy_status);
  });

  it("returns error when projectRoot is missing", async () => {
    const { stdout, exitCode } = await runCli(["deploy-trigger"]);
    expect(exitCode).toBe(1);
    const parsed = parseJson(stdout) as { error: string };
    expect(parsed.error).toMatch(/missing required argument/i);
  });

  it("accepts --health-check flag without crashing", async () => {
    const { stdout, exitCode } = await runCli(["deploy-trigger", tmpDir, "--health-check"]);
    expect(exitCode).toBe(0);

    const parsed = parseJson(stdout) as { deploy_status: string };
    expect(parsed.deploy_status).toBe("not_triggered");
  });
});
