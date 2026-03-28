import type Database from "better-sqlite3";

export interface SearchResult {
  projectId: string;
  projectName: string;
  entityType: string;
  entityId: string;
  title: string | null;
  contentPreview: string | null;
  updatedAt: string;
}

export class ArtifactSearch {
  constructor(private db: Database.Database) {}

  search(query: string): SearchResult[] {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // Tokenize by whitespace, strip FTS5 operators, wrap in double quotes for AND semantics
    const tokens = trimmed.split(/\s+/).map((t) => {
      // Strip FTS5 special characters and operators
      const clean = t.replace(/["*()^]/g, "").replace(/^(AND|OR|NOT|NEAR)$/i, "");
      return clean ? `"${clean}"` : "";
    }).filter(Boolean);

    if (tokens.length === 0) return [];

    const ftsQuery = tokens.join(" ");

    const rows = this.db
      .prepare(
        `SELECT ai.project_id, p.name as project_name, ai.entity_type, ai.entity_id, ai.title, ai.content_preview, ai.updated_at
         FROM artifact_fts fts
         JOIN artifact_index ai ON ai.id = fts.rowid
         JOIN projects p ON p.id = ai.project_id
         WHERE artifact_fts MATCH ?
         AND p.status = 'active'
         ORDER BY rank`,
      )
      .all(ftsQuery) as Array<{
      project_id: string;
      project_name: string;
      entity_type: string;
      entity_id: string;
      title: string | null;
      content_preview: string | null;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      entityType: r.entity_type,
      entityId: r.entity_id,
      title: r.title,
      contentPreview: r.content_preview,
      updatedAt: r.updated_at,
    }));
  }

  upsertIndex(entry: {
    projectId: string;
    entityType: string;
    entityId: string;
    title?: string;
    contentPreview?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO artifact_index (project_id, entity_type, entity_id, title, content_preview, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(project_id, entity_type, entity_id) DO UPDATE SET
           title = excluded.title,
           content_preview = excluded.content_preview,
           updated_at = datetime('now')`,
      )
      .run(
        entry.projectId,
        entry.entityType,
        entry.entityId,
        entry.title ?? null,
        entry.contentPreview ?? null,
      );
  }

  removeIndex(projectId: string, entityType: string, entityId: string): void {
    this.db
      .prepare(
        "DELETE FROM artifact_index WHERE project_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .run(projectId, entityType, entityId);
  }
}
