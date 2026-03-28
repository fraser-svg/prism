/**
 * deploy.ts — Deploy detection and triggering for Prism Stage 5.
 *
 * Detects deployment platform from config files, optionally triggers
 * deploy via platform CLI, and polls for health check.
 *
 * Usage:
 *   cli.ts deploy-detect <projectRoot>
 *   cli.ts deploy-trigger <projectRoot> [--health-check]
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AbsolutePath } from "@prism/core";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeployDetectResult {
  platform: "vercel" | "netlify" | "railway" | "fly" | "render" | "none";
  auto_deploy: boolean;
  cli_available: boolean;
  message: string;
}

interface DeployTriggerResult {
  platform: string;
  deploy_status: "triggered" | "verified_live" | "timeout" | "cli_not_installed" | "not_triggered" | "failed";
  deploy_url: string | null;
  message: string;
}

// ---------------------------------------------------------------------------
// File existence check
// ---------------------------------------------------------------------------

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function cliAvailable(name: string): Promise<boolean> {
  try {
    await execFile("which", [name], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Platform detection (ordered priority)
// ---------------------------------------------------------------------------

async function detectPlatform(
  root: string,
): Promise<{ platform: DeployDetectResult["platform"]; autoDeploy: boolean }> {
  // 1. Vercel
  if (await exists(join(root, "vercel.json")) || await exists(join(root, ".vercel"))) {
    let autoDeploy = false;
    try {
      const raw = await readFile(join(root, ".vercel", "project.json"), "utf-8");
      const proj = JSON.parse(raw);
      autoDeploy = !!proj.orgId;
    } catch { /* no project.json */ }
    return { platform: "vercel", autoDeploy };
  }

  // 2. Netlify
  if (await exists(join(root, "netlify.toml")) || await exists(join(root, ".netlify"))) {
    let autoDeploy = false;
    try {
      await access(join(root, ".netlify", "state.json"));
      autoDeploy = true;
    } catch { /* no state.json */ }
    return { platform: "netlify", autoDeploy };
  }

  // 3. Railway
  if (await exists(join(root, "railway.toml"))) {
    return { platform: "railway", autoDeploy: false };
  }

  // 4. Fly.io
  if (await exists(join(root, "fly.toml"))) {
    return { platform: "fly", autoDeploy: false };
  }

  // 5. Render
  if (await exists(join(root, "render.yaml"))) {
    return { platform: "render", autoDeploy: true };
  }

  return { platform: "none", autoDeploy: false };
}

// ---------------------------------------------------------------------------
// Health check polling
// ---------------------------------------------------------------------------

async function pollHealth(url: string, maxMs = 30_000, intervalMs = 5_000): Promise<"verified_live" | "timeout"> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4_000) });
      if (response.ok) return "verified_live";
    } catch {
      // Not live yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return "timeout";
}

// ---------------------------------------------------------------------------
// CLI command map
// ---------------------------------------------------------------------------

const PLATFORM_CLI: Record<string, { cmd: string; args: string[] }> = {
  vercel: { cmd: "vercel", args: ["--prod"] },
  netlify: { cmd: "netlify", args: ["deploy", "--prod"] },
  railway: { cmd: "railway", args: ["up"] },
  fly: { cmd: "fly", args: ["deploy"] },
  render: { cmd: "render", args: ["deploy"] },
};

// ---------------------------------------------------------------------------
// Exported commands
// ---------------------------------------------------------------------------

export async function execDeployDetect(args: string[]): Promise<DeployDetectResult> {
  const projectRoot = args[0] as AbsolutePath;
  if (!projectRoot) throw new Error("missing required argument: projectRoot");

  const { platform, autoDeploy } = await detectPlatform(projectRoot);

  if (platform === "none") {
    return {
      platform: "none",
      auto_deploy: false,
      cli_available: false,
      message: "No deployment platform detected.",
    };
  }

  const cli = PLATFORM_CLI[platform];
  const hasCmd = cli ? await cliAvailable(cli.cmd) : false;

  let message: string;
  if (autoDeploy) {
    message = `${platform} will auto-deploy when the PR merges.`;
  } else if (hasCmd) {
    message = `${platform} detected. CLI available — ready to deploy.`;
  } else {
    message = `${platform} detected but CLI not installed.`;
  }

  return {
    platform,
    auto_deploy: autoDeploy,
    cli_available: hasCmd,
    message,
  };
}

export async function execDeployTrigger(args: string[]): Promise<DeployTriggerResult> {
  const projectRoot = args[0] as AbsolutePath;
  if (!projectRoot) throw new Error("missing required argument: projectRoot");

  const doHealthCheck = args.includes("--health-check");
  const { platform } = await detectPlatform(projectRoot);

  if (platform === "none") {
    return { platform: "none", deploy_status: "not_triggered", deploy_url: null, message: "No platform detected." };
  }

  const cli = PLATFORM_CLI[platform];
  if (!cli) {
    return { platform, deploy_status: "not_triggered", deploy_url: null, message: `No CLI mapping for ${platform}.` };
  }

  const hasCmd = await cliAvailable(cli.cmd);
  if (!hasCmd) {
    return { platform, deploy_status: "cli_not_installed", deploy_url: null, message: `${cli.cmd} CLI not installed.` };
  }

  // Trigger deploy
  let deployUrl: string | null = null;
  try {
    const { stdout } = await execFile(cli.cmd, cli.args, { cwd: projectRoot, timeout: 120_000 });
    // Try to extract URL from output
    const urlMatch = stdout.match(/https?:\/\/[^\s)]+/);
    deployUrl = urlMatch ? urlMatch[0] : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { platform, deploy_status: "failed", deploy_url: null, message: `Deploy failed: ${msg}` };
  }

  // Health check
  if (doHealthCheck && deployUrl) {
    const healthStatus = await pollHealth(deployUrl);
    return {
      platform,
      deploy_status: healthStatus,
      deploy_url: deployUrl,
      message: healthStatus === "verified_live"
        ? `Deploy live at ${deployUrl}`
        : `Deploy triggered but health check timed out. URL: ${deployUrl}`,
    };
  }

  return {
    platform,
    deploy_status: "triggered",
    deploy_url: deployUrl,
    message: deployUrl ? `Deployed to ${deployUrl}` : "Deploy triggered (no URL captured).",
  };
}
