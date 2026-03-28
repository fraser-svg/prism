import { existsSync } from "node:fs";
import type Database from "better-sqlite3";
import type { ProjectBadge } from "./types";

export class ProjectHealth {
  constructor(
    private db: Database.Database,
    private stalenessThresholdDays: number,
  ) {}

  computeBadge(projectId: string): ProjectBadge {
    const project = this.db
      .prepare("SELECT root_path, status FROM projects WHERE id = ?")
      .get(projectId) as { root_path: string; status: string } | undefined;

    if (!project) return "unreachable";

    // Check if project directory is reachable
    if (!existsSync(project.root_path)) return "unreachable";

    // Check artifact index for this project
    const artifacts = this.db
      .prepare(
        "SELECT entity_type, entity_id, updated_at FROM artifact_index WHERE project_id = ?",
      )
      .all(projectId) as Array<{
      entity_type: string;
      entity_id: string;
      updated_at: string;
    }>;

    if (artifacts.length === 0) return "new";

    // Check for blockers in events
    const blockerEvents = this.db
      .prepare(
        "SELECT COUNT(*) as c FROM events WHERE project_id = ? AND event_type = 'blocker:active'",
      )
      .get(projectId) as { c: number };

    if (blockerEvents.c > 0) return "blocked";

    // Check for pending reviews
    const reviewArtifacts = artifacts.filter(
      (a) => a.entity_type === "review",
    );
    const runArtifacts = artifacts.filter((a) => a.entity_type === "run");
    if (
      runArtifacts.length > 0 &&
      reviewArtifacts.length < runArtifacts.length
    ) {
      return "needs-review";
    }

    // Check staleness
    const thresholdMs = this.stalenessThresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const hasStale = artifacts.some((a) => {
      const updated = new Date(a.updated_at + "Z").getTime();
      return now - updated > thresholdMs;
    });

    if (hasStale) return "stale";

    return "healthy";
  }

  computeAllBadges(): Array<{ projectId: string; badge: ProjectBadge }> {
    const projects = this.db
      .prepare("SELECT id FROM projects WHERE status = 'active'")
      .all() as Array<{ id: string }>;

    return projects.map((p) => ({
      projectId: p.id,
      badge: this.computeBadge(p.id),
    }));
  }
}
