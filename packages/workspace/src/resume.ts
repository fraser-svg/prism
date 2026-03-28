import type Database from "better-sqlite3";
import type { ProjectResume } from "./types";

export class ResumeBuilder {
  constructor(private db: Database.Database) {}

  buildResume(projectId: string): ProjectResume | null {
    const project = this.db
      .prepare("SELECT id, name FROM projects WHERE id = ? AND status = 'active'")
      .get(projectId) as { id: string; name: string } | undefined;

    if (!project) return null;

    const artifacts = this.db
      .prepare(
        "SELECT entity_type, entity_id, title, content_preview, updated_at FROM artifact_index WHERE project_id = ? ORDER BY updated_at DESC",
      )
      .all(projectId) as Array<{
      entity_type: string;
      entity_id: string;
      title: string | null;
      content_preview: string | null;
      updated_at: string;
    }>;

    const specs = artifacts.filter((a) => a.entity_type === "spec");
    const plans = artifacts.filter((a) => a.entity_type === "plan");
    const runs = artifacts.filter((a) => a.entity_type === "run");
    const reviews = artifacts.filter((a) => a.entity_type === "review");
    const checkpoints = artifacts.filter((a) => a.entity_type === "checkpoint");

    // Derive checkpoint summary
    const lastCheckpoint = checkpoints[0];
    const lastCheckpointSummary = lastCheckpoint?.content_preview
      ? lastCheckpoint.content_preview.slice(0, 200)
      : null;

    // Derive open blockers from events
    const blockerEvents = this.db
      .prepare(
        "SELECT summary FROM events WHERE project_id = ? AND event_type = 'blocker:active' ORDER BY timestamp DESC LIMIT 5",
      )
      .all(projectId) as Array<{ summary: string }>;
    const openBlockers = blockerEvents.map((e) => e.summary);

    // Derive pending reviews
    const pendingReviews: string[] = [];
    if (runs.length > 0 && reviews.length < runs.length) {
      pendingReviews.push(`${runs.length - reviews.length} run(s) awaiting review`);
    }

    // Derive recommended next action
    const recommendedNextAction = this.deriveNextAction(
      specs,
      plans,
      runs,
      reviews,
      checkpoints,
      openBlockers,
    );

    return {
      projectId: project.id,
      projectName: project.name,
      lastCheckpointSummary,
      openBlockers,
      pendingReviews,
      recommendedNextAction,
    };
  }

  private deriveNextAction(
    specs: Array<{ title: string | null }>,
    plans: Array<{ title: string | null }>,
    runs: Array<{ title: string | null }>,
    reviews: Array<{ title: string | null }>,
    checkpoints: Array<{ content_preview: string | null }>,
    openBlockers: string[],
  ): string {
    if (openBlockers.length > 0) {
      return `Resolve blocker: ${openBlockers[0]}`;
    }

    if (specs.length === 0) {
      return "Start your first spec";
    }

    if (plans.length === 0) {
      const specName = specs[0].title ?? "latest spec";
      return `Create a plan for ${specName}`;
    }

    if (runs.length === 0) {
      return "Start building";
    }

    if (reviews.length < runs.length) {
      return "Run reviews";
    }

    return "Check project status";
  }
}
