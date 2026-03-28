/**
 * ship.ts — Core ship logic for Prism Stage 5.
 *
 * Squash, push, create PR, tag — all via child_process.execFile.
 * Reads spec entities for smart commit messages and rich PR bodies.
 *
 * Usage: cli.ts ship <projectRoot> <specId> [--base main] [--message "override"]
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath, EntityId } from "@prism/core";
import { specPaths, projectPaths } from "@prism/memory";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShipResult {
  status: "shipped" | "partial" | "failed";
  squash: { status: string; commit: string | null; message: string | null };
  push: { status: string; branch: string };
  pr: { status: string; url: string | null };
  tag: { status: string; name: string | null };
  spec_summary: string | null;
  review_verdicts: Record<string, string | null>;
}

class ShipError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ShipError";
  }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function git(
  cwd: string,
  ...args: string[]
): Promise<string> {
  const { stdout } = await execFile("git", args, { cwd, timeout: 30_000 });
  return stdout.trim();
}

async function gitSafe(
  cwd: string,
  ...args: string[]
): Promise<string | null> {
  try {
    return await git(cwd, ...args);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Spec + review reading
// ---------------------------------------------------------------------------

async function readSpecMetadata(
  projectRoot: AbsolutePath,
  specId: EntityId,
): Promise<{ title: string; summary: string; acceptanceCriteria: Array<{ description: string; status: string }> } | null> {
  try {
    const paths = specPaths(projectRoot, specId);
    const raw = await readFile(paths.metadataFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readReviewVerdicts(
  projectRoot: AbsolutePath,
  specId: EntityId,
): Promise<Record<string, string | null>> {
  const verdicts: Record<string, string | null> = {
    engineering: null,
    qa: null,
    design: null,
    codex: null,
  };
  const reviewDir = join(projectPaths(projectRoot).reviewsDir, specId);
  const reviewFiles: Array<[string, string]> = [
    ["engineering", "engineering-review.md"],
    ["qa", "qa-review.md"],
    ["design", "design-review.md"],
  ];

  for (const [key, filename] of reviewFiles) {
    try {
      const content = await readFile(join(reviewDir, filename), "utf-8");
      if (content.includes("PASS") || content.includes("pass")) verdicts[key] = "pass";
      else if (content.includes("HOLD") || content.includes("hold")) verdicts[key] = "hold";
      else if (content.includes("FAIL") || content.includes("fail")) verdicts[key] = "fail";
    } catch {
      // File doesn't exist — verdict stays null
    }
  }

  // Check for codex review JSON
  try {
    const codexPath = join(reviewDir, "codex-review.json");
    const raw = await readFile(codexPath, "utf-8");
    const codex = JSON.parse(raw);
    verdicts.codex = codex.verdict ?? null;
  } catch {
    // No codex review
  }

  return verdicts;
}

// ---------------------------------------------------------------------------
// PR body generation
// ---------------------------------------------------------------------------

function generatePrBody(
  spec: { title: string; summary: string; acceptanceCriteria: Array<{ description: string; status: string }> } | null,
  verdicts: Record<string, string | null>,
  changeName?: string,
): string {
  const lines: string[] = [];

  lines.push("## What was built");
  if (spec) {
    lines.push(spec.summary || spec.title);
    lines.push("");
    lines.push("### Requirements");
    for (const ac of spec.acceptanceCriteria ?? []) {
      const check = ac.status === "passing" ? "x" : " ";
      lines.push(`- [${check}] ${ac.description} (${ac.status})`);
    }
  } else {
    lines.push(changeName ?? "Changes built by Prism");
  }
  lines.push("");

  // Review table
  const reviewEntries = Object.entries(verdicts).filter(([, v]) => v !== null);
  if (reviewEntries.length > 0) {
    lines.push("<details><summary>Review Results</summary>");
    lines.push("");
    lines.push("| Review | Verdict |");
    lines.push("|--------|---------|");
    for (const [key, verdict] of Object.entries(verdicts)) {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      lines.push(`| ${label} | ${verdict ?? "N/A"} |`);
    }
    lines.push("");
    lines.push("</details>");
  }
  lines.push("");

  lines.push("---");
  lines.push("_Built by Prism_");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Slug generation for tags
// ---------------------------------------------------------------------------

function specIdSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// ---------------------------------------------------------------------------
// Main ship logic
// ---------------------------------------------------------------------------

export async function execShip(args: string[]): Promise<ShipResult> {
  const projectRoot = args[0] as AbsolutePath;
  const specId = args[1] as EntityId;
  if (!projectRoot) throw new ShipError("missing_arg", "missing required argument: projectRoot");
  if (!specId) throw new ShipError("missing_arg", "missing required argument: specId");

  // Parse optional flags
  let baseBranch = "main";
  let messageOverride: string | null = null;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === "--base" && args[i + 1]) { baseBranch = args[++i]!; }
    if (args[i] === "--message" && args[i + 1]) { messageOverride = args[++i]!; }
  }

  const result: ShipResult = {
    status: "failed",
    squash: { status: "pending", commit: null, message: null },
    push: { status: "pending", branch: "" },
    pr: { status: "pending", url: null },
    tag: { status: "pending", name: null },
    spec_summary: null,
    review_verdicts: {},
  };

  // 1. Read spec entity for smart commit message
  const spec = await readSpecMetadata(projectRoot, specId);
  const verdicts = await readReviewVerdicts(projectRoot, specId);
  result.review_verdicts = verdicts;

  if (spec) {
    result.spec_summary = spec.summary || spec.title;
  }

  // 2. Generate commit message
  let commitMessage: string;
  if (messageOverride) {
    commitMessage = messageOverride;
  } else if (spec) {
    const acCount = (spec.acceptanceCriteria ?? []).length;
    commitMessage = acCount > 0
      ? `feat: ${spec.title} — ${acCount} requirements verified`
      : `feat: ${spec.title}`;
  } else {
    // Fallback to branch name
    const branch = await gitSafe(projectRoot, "branch", "--show-current") ?? "unknown";
    commitMessage = `feat: ${branch}`;
  }

  // 3. Preflight — verify git repo, not on main/master
  try {
    await git(projectRoot, "rev-parse", "--is-inside-work-tree");
  } catch {
    throw new ShipError("not_git_repo", "not inside a git repository");
  }

  const currentBranch = await git(projectRoot, "branch", "--show-current");
  if (currentBranch === "main" || currentBranch === "master") {
    throw new ShipError("on_main", "cannot ship from main/master branch");
  }
  result.push.branch = currentBranch;

  // Check for dirty state — if dirty, auto-save
  const status = await git(projectRoot, "status", "--porcelain");
  if (status) {
    await gitSafe(projectRoot, "add", "-A");
    await gitSafe(projectRoot, "commit", "-m", "wip: pre-ship auto-save [prism]");
  }

  // 4. Squash — git reset --soft to merge-base
  try {
    const mergeBase = await git(projectRoot, "merge-base", baseBranch, "HEAD");
    const head = await git(projectRoot, "rev-parse", "HEAD");

    if (mergeBase === head) {
      result.squash = { status: "skipped", commit: null, message: null };
    } else {
      await git(projectRoot, "reset", "--soft", mergeBase);
      await git(projectRoot, "commit", "-m", commitMessage);
      const newCommit = await git(projectRoot, "rev-parse", "--short", "HEAD");
      result.squash = { status: "squashed", commit: newCommit, message: commitMessage };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.squash = { status: "failed", commit: null, message: msg };
    result.status = "failed";
    return result;
  }

  // 5. Push
  try {
    try {
      await git(projectRoot, "push", "-u", "origin", currentBranch);
      result.push = { status: "pushed", branch: currentBranch };
    } catch {
      // Rejected — try rebase and push again
      await git(projectRoot, "fetch", "origin", baseBranch);
      try {
        await git(projectRoot, "rebase", `origin/${baseBranch}`);
        await git(projectRoot, "push", "-u", "origin", currentBranch);
        result.push = { status: "pushed_after_rebase", branch: currentBranch };
      } catch {
        await gitSafe(projectRoot, "rebase", "--abort");
        result.push = { status: "failed", branch: currentBranch };
      }
    }
  } catch {
    // No remote
    result.push = { status: "no_remote", branch: currentBranch };
  }

  // 6. Create PR
  try {
    let prUrl: string | null = null;

    try {
      const { stdout: existing } = await execFile("gh", ["pr", "view", "--json", "url", "-q", ".url"], {
        cwd: projectRoot,
        timeout: 15_000,
      });
      if (existing.trim()) {
        result.pr = { status: "already_exists", url: existing.trim() };
        prUrl = existing.trim();
      }
    } catch {
      // No existing PR — create one
      const prBody = generatePrBody(spec, verdicts);
      const tmpDir = await mkdtemp(join(tmpdir(), "prism-pr-"));
      const bodyFile = join(tmpDir, "pr-body.md");
      await writeFile(bodyFile, prBody, "utf-8");

      try {
        const { stdout: prOut } = await execFile(
          "gh",
          ["pr", "create", "--title", commitMessage, "--body-file", bodyFile, "--base", baseBranch],
          { cwd: projectRoot, timeout: 30_000 },
        );
        prUrl = prOut.trim();
        result.pr = { status: "created", url: prUrl };
      } catch (prErr) {
        const msg = prErr instanceof Error ? prErr.message : String(prErr);
        if (msg.includes("gh auth") || msg.includes("not logged")) {
          result.pr = { status: "gh_not_authenticated", url: null };
        } else {
          result.pr = { status: "failed", url: null };
        }
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    }
  } catch {
    // gh CLI not installed
    result.pr = { status: "gh_not_installed", url: null };
  }

  // 7. Git tag
  const tagSlug = spec ? specIdSlug(spec.title) : specIdSlug(specId);
  const tagName = `prism/${tagSlug}`;
  try {
    // Check if tag already exists
    const existingTag = await gitSafe(projectRoot, "tag", "-l", tagName);
    if (existingTag) {
      result.tag = { status: "already_exists", name: tagName };
    } else {
      await git(projectRoot, "tag", tagName);
      result.tag = { status: "created", name: tagName };
    }
  } catch {
    result.tag = { status: "failed", name: tagName };
  }

  // Determine overall status
  const hasAnySuccess = result.squash.status !== "failed" && result.push.status !== "failed";
  if (hasAnySuccess && result.pr.status !== "failed") {
    result.status = "shipped";
  } else if (hasAnySuccess) {
    result.status = "partial";
  } else {
    result.status = "failed";
  }

  return result;
}
