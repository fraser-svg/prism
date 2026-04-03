import type Database from "better-sqlite3";

/** Matches ArtifactWriteCallback from @prism/memory without circular dependency */
type ArtifactWriteEvent = {
  action: "write" | "delete";
  entityType: string;
  entityId: string;
  projectId: string;
  contentPreview?: string;
};

export interface EventRecord {
  id: number;
  projectId: string | null;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface EventQueryOptions {
  projectId?: string;
  eventType?: string;
  since?: string;
  limit?: number;
}

export class EventLog {
  constructor(private db: Database.Database) {}

  append(event: {
    projectId?: string | null;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        "INSERT INTO events (project_id, event_type, summary, metadata) VALUES (?, ?, ?, ?)",
      )
      .run(
        event.projectId ?? null,
        event.eventType,
        event.summary,
        event.metadata ? JSON.stringify(event.metadata) : null,
      );
  }

  query(options: EventQueryOptions = {}): EventRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.projectId !== undefined) {
      conditions.push("project_id = ?");
      params.push(options.projectId);
    }
    if (options.eventType !== undefined) {
      conditions.push("event_type = ?");
      params.push(options.eventType);
    }
    if (options.since !== undefined) {
      conditions.push("timestamp >= ?");
      params.push(options.since);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options.limit ?? 100;

    const rows = this.db
      .prepare(
        `SELECT id, project_id, event_type, summary, metadata, timestamp FROM events ${where} ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(...params, limit) as Array<{
      id: number;
      project_id: string | null;
      event_type: string;
      summary: string;
      metadata: string | null;
      timestamp: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      eventType: r.event_type,
      summary: r.summary,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
      timestamp: r.timestamp,
    }));
  }

  recentForProject(projectId: string, limit = 10): EventRecord[] {
    return this.query({ projectId, limit });
  }

  /**
   * Log a structured session event for observability.
   * Use for tracking user sessions end-to-end: what Prism recommended,
   * what the user chose, what failed, and why.
   */
  logSession(event: {
    projectId?: string | null;
    action: "session:start" | "session:end" | "session:decision" | "session:error" | "session:gate" | "session:stage_transition" | "artifact:created" | "artifact:deleted" | "desktop:action_started" | "desktop:action_completed" | "desktop:action_failed" | "desktop:message" | "desktop:pipeline_updated" | "routing:completed";
    summary: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.append({
      projectId: event.projectId,
      eventType: event.action,
      summary: event.summary,
      metadata: event.metadata,
    });
  }

  /**
   * Retrieve the full session timeline for a project, ordered chronologically.
   * Useful for reconstructing what happened during a user session.
   */
  sessionTimeline(projectId: string, limit = 50): EventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, event_type, summary, metadata, timestamp
         FROM events
         WHERE project_id = ? AND (event_type LIKE 'session:%' OR event_type LIKE 'artifact:%')
         ORDER BY timestamp ASC, id ASC
         LIMIT ?`,
      )
      .all(projectId, limit) as Array<{
      id: number;
      project_id: string | null;
      event_type: string;
      summary: string;
      metadata: string | null;
      timestamp: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      eventType: r.event_type,
      summary: r.summary,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
      timestamp: r.timestamp,
    }));
  }

  /**
   * Retrieve the full timeline for a project including both session and desktop events.
   * Used by the Electron desktop shell to display the session drawer timeline.
   */
  desktopTimeline(projectId: string, limit = 50): EventRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, project_id, event_type, summary, metadata, timestamp
         FROM events
         WHERE project_id = ? AND (event_type LIKE 'session:%' OR event_type LIKE 'artifact:%' OR event_type LIKE 'desktop:%')
         ORDER BY timestamp ASC, id ASC
         LIMIT ?`,
      )
      .all(projectId, limit) as Array<{
      id: number;
      project_id: string | null;
      event_type: string;
      summary: string;
      metadata: string | null;
      timestamp: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      eventType: r.event_type,
      summary: r.summary,
      metadata: r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : null,
      timestamp: r.timestamp,
    }));
  }
}

/**
 * Create an ArtifactWriteCallback that emits artifact:created events to EventLog.
 * Eng review decision 1A: single source of truth for artifact tracking.
 * Eng review decision 13A: try-catch to prevent EventLog errors from blocking writes.
 */
export function createEventLogWriteCallback(eventLog: EventLog): (event: ArtifactWriteEvent) => void {
  return (event) => {
    try {
      const action = event.action === "delete" ? "artifact:deleted" as const : "artifact:created" as const;
      eventLog.logSession({
        projectId: event.projectId || null,
        action,
        summary: `${event.entityType} ${event.entityId} ${event.action}d`,
        metadata: {
          entityType: event.entityType,
          entityId: event.entityId,
          projectId: event.projectId,
          contentPreview: event.contentPreview,
        },
      });
    } catch (err) {
      // Eng review 13A: callback failure is non-fatal, warn but don't block
      console.warn(`EventLog write callback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}
