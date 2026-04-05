import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { EventLog } from "./event-log";

// ─── Public types (camelCase) ───

export type EntityScope = { entityType: "client"; entityId: string } | { entityType: "project"; entityId: string };

const SCOPE_COLUMN: Record<string, string> = {
  client: "client_account_id",
  project: "project_id",
};

function scopeCol(scope: EntityScope): string {
  const col = SCOPE_COLUMN[scope.entityType];
  if (!col) throw new Error(`Invalid entityType: ${scope.entityType}`);
  return col;
}

export interface ContextItemRow {
  id: string;
  clientAccountId: string | null;
  projectId: string | null;
  itemType: string;
  title: string;
  filePath: string | null;
  content: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  extractionStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeRow {
  id: string;
  clientAccountId: string | null;
  projectId: string | null;
  sourceItemId: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  flagged: boolean;
  sourceQuote: string | null;
  createdAt: string;
}

export interface SummaryRow {
  id: string;
  clientAccountId: string | null;
  projectId: string | null;
  summaryType: string;
  content: string;
  brandColors: string[] | null;
  sourceItemCount: number | null;
  generatedAt: string;
}

// ─── Raw DB types (snake_case) ───

interface RawContextItem {
  id: string;
  client_account_id: string | null;
  project_id: string | null;
  item_type: string;
  title: string;
  file_path: string | null;
  content: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  extraction_status: string;
  created_at: string;
  updated_at: string;
}

interface RawKnowledge {
  id: string;
  client_account_id: string | null;
  project_id: string | null;
  source_item_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  flagged: number;
  source_quote: string | null;
  created_at: string;
}

interface RawSummary {
  id: string;
  client_account_id: string | null;
  project_id: string | null;
  summary_type: string;
  content: string;
  brand_colors: string | null;
  source_item_count: number | null;
  generated_at: string;
}

export class ContextRepository {
  private eventLog: EventLog;

  constructor(private db: Database.Database) {
    this.eventLog = new EventLog(db);
  }

  // ─── Context Items ───

  addItem(
    scope: EntityScope,
    item: {
      itemType: string;
      title: string;
      filePath?: string;
      content?: string;
      mimeType?: string;
      fileSizeBytes?: number;
    },
  ): ContextItemRow {
    const id = randomUUID();
    const clientAccountId = scope.entityType === "client" ? scope.entityId : null;
    const projectId = scope.entityType === "project" ? scope.entityId : null;

    this.db
      .prepare(
        `INSERT INTO context_items (id, client_account_id, project_id, item_type, title, file_path, content, mime_type, file_size_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        clientAccountId,
        projectId,
        item.itemType,
        item.title,
        item.filePath ?? null,
        item.content ?? null,
        item.mimeType ?? null,
        item.fileSizeBytes ?? null,
      );

    this.eventLog.append({
      eventType: "context:item-added",
      summary: `Added context item: ${item.title}`,
      metadata: { itemId: id, itemType: item.itemType, entityType: scope.entityType, entityId: scope.entityId },
    });

    return this.toContextItem(
      this.db.prepare("SELECT * FROM context_items WHERE id = ?").get(id) as RawContextItem,
    );
  }

  getItems(scope: EntityScope): ContextItemRow[] {
    const col = scopeCol(scope);
    const rows = this.db
      .prepare(`SELECT * FROM context_items WHERE ${col} = ? ORDER BY created_at DESC`)
      .all(scope.entityId) as RawContextItem[];
    return rows.map((r) => this.toContextItem(r));
  }

  getItem(id: string): ContextItemRow | null {
    const row = this.db
      .prepare("SELECT * FROM context_items WHERE id = ?")
      .get(id) as RawContextItem | undefined;
    return row ? this.toContextItem(row) : null;
  }

  deleteItem(id: string): ContextItemRow | null {
    const item = this.getItem(id);
    if (!item) return null;

    // CASCADE will delete associated extracted_knowledge rows (and FTS triggers fire)
    this.db.prepare("DELETE FROM context_items WHERE id = ?").run(id);

    this.eventLog.append({
      eventType: "context:item-deleted",
      summary: `Deleted context item: ${item.title}`,
      metadata: { itemId: id },
    });

    return item;
  }

  updateExtractionStatus(id: string, status: string): void {
    this.db
      .prepare("UPDATE context_items SET extraction_status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, id);
  }

  // ─── Extracted Knowledge ───

  insertKnowledge(
    itemId: string,
    entries: Array<{
      category: string;
      key: string;
      value: string;
      confidence: number;
      source_quote?: string;
    }>,
  ): KnowledgeRow[] {
    const item = this.getItem(itemId);
    if (!item) throw new Error(`Context item ${itemId} not found`);

    const inserted: KnowledgeRow[] = [];
    const insert = this.db.prepare(
      `INSERT INTO extracted_knowledge (id, client_account_id, project_id, source_item_id, category, key, value, confidence, source_quote)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    this.db.transaction(() => {
      for (const entry of entries) {
        const kid = randomUUID();
        insert.run(
          kid,
          item.clientAccountId,
          item.projectId,
          itemId,
          entry.category,
          entry.key,
          entry.value,
          entry.confidence,
          entry.source_quote ?? null,
        );
        const raw = this.db
          .prepare("SELECT * FROM extracted_knowledge WHERE id = ?")
          .get(kid) as RawKnowledge;
        inserted.push(this.toKnowledge(raw));
      }
    })();

    this.eventLog.append({
      eventType: "context:knowledge-extracted",
      summary: `Extracted ${entries.length} knowledge entries from item ${item.title}`,
      metadata: { itemId, count: entries.length },
    });

    return inserted;
  }

  getKnowledge(scope: EntityScope): KnowledgeRow[] {
    const col = scopeCol(scope);
    const rows = this.db
      .prepare(`SELECT * FROM extracted_knowledge WHERE ${col} = ? ORDER BY created_at DESC`)
      .all(scope.entityId) as RawKnowledge[];
    return rows.map((r) => this.toKnowledge(r));
  }

  getKnowledgeById(id: string): KnowledgeRow | null {
    const row = this.db
      .prepare("SELECT * FROM extracted_knowledge WHERE id = ?")
      .get(id) as RawKnowledge | undefined;
    return row ? this.toKnowledge(row) : null;
  }

  flagKnowledge(id: string): boolean {
    const result = this.db
      .prepare("UPDATE extracted_knowledge SET flagged = 1 WHERE id = ?")
      .run(id);
    if (result.changes === 0) return false;

    this.eventLog.append({
      eventType: "context:knowledge-flagged",
      summary: `Flagged knowledge entry ${id} as incorrect`,
      metadata: { knowledgeId: id },
    });

    return true;
  }

  clearKnowledgeForItem(itemId: string): number {
    const result = this.db
      .prepare("DELETE FROM extracted_knowledge WHERE source_item_id = ?")
      .run(itemId);
    return result.changes;
  }

  searchKnowledge(query: string, scope?: EntityScope): KnowledgeRow[] {
    if (!query.trim()) return [];
    try {
      // Wrap in double-quotes to force phrase search, neutralizing FTS5 operators
      const safeQuery = `"${query.replace(/"/g, '""')}"`;
      let sql = `SELECT ek.* FROM extracted_knowledge ek
         JOIN knowledge_fts fts ON ek.rowid = fts.rowid
         WHERE knowledge_fts MATCH ?`;
      const params: unknown[] = [safeQuery];

      if (scope) {
        const col = scopeCol(scope);
        sql += ` AND ek.${col} = ?`;
        params.push(scope.entityId);
      }

      sql += " ORDER BY rank";

      const rows = this.db.prepare(sql).all(...params) as RawKnowledge[];
      return rows.map((r) => this.toKnowledge(r));
    } catch {
      // FTS5 syntax errors (malformed MATCH queries) return empty results
      return [];
    }
  }

  // ─── Knowledge Summaries ───

  upsertSummary(
    scope: EntityScope,
    summaryType: string,
    content: string,
    brandColors?: string[],
  ): SummaryRow {
    const clientAccountId = scope.entityType === "client" ? scope.entityId : null;
    const projectId = scope.entityType === "project" ? scope.entityId : null;

    // Count source items for this scope
    const col = scopeCol(scope);
    const countResult = this.db
      .prepare(`SELECT COUNT(*) as c FROM context_items WHERE ${col} = ?`)
      .get(scope.entityId) as { c: number };

    // Use INSERT OR REPLACE keyed by the COALESCE unique index
    // First check if one exists
    const existing = this.db
      .prepare(
        `SELECT id FROM knowledge_summaries
         WHERE COALESCE(client_account_id, '') = COALESCE(?, '')
         AND COALESCE(project_id, '') = COALESCE(?, '')
         AND summary_type = ?`,
      )
      .get(clientAccountId, projectId, summaryType) as { id: string } | undefined;

    const id = existing?.id ?? randomUUID();

    if (existing) {
      this.db
        .prepare(
          `UPDATE knowledge_summaries
           SET content = ?, brand_colors = ?, source_item_count = ?, generated_at = datetime('now')
           WHERE id = ?`,
        )
        .run(content, brandColors ? JSON.stringify(brandColors) : null, countResult.c, id);
    } else {
      this.db
        .prepare(
          `INSERT INTO knowledge_summaries (id, client_account_id, project_id, summary_type, content, brand_colors, source_item_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, clientAccountId, projectId, summaryType, content, brandColors ? JSON.stringify(brandColors) : null, countResult.c);
    }

    this.eventLog.append({
      eventType: "context:summary-updated",
      summary: `Updated ${summaryType} summary`,
      metadata: { entityType: scope.entityType, entityId: scope.entityId, summaryType },
    });

    return this.toSummary(
      this.db.prepare("SELECT * FROM knowledge_summaries WHERE id = ?").get(id) as RawSummary,
    );
  }

  getSummary(scope: EntityScope, summaryType?: string): SummaryRow | null {
    const clientAccountId = scope.entityType === "client" ? scope.entityId : null;
    const projectId = scope.entityType === "project" ? scope.entityId : null;

    let query = `SELECT * FROM knowledge_summaries
      WHERE COALESCE(client_account_id, '') = COALESCE(?, '')
      AND COALESCE(project_id, '') = COALESCE(?, '')`;
    const params: unknown[] = [clientAccountId, projectId];

    if (summaryType) {
      query += " AND summary_type = ?";
      params.push(summaryType);
    }

    query += " ORDER BY generated_at DESC LIMIT 1";

    const row = this.db.prepare(query).get(...params) as RawSummary | undefined;
    return row ? this.toSummary(row) : null;
  }

  // ─── Reconciliation ───

  getStrandedItems(): ContextItemRow[] {
    const rows = this.db
      .prepare("SELECT * FROM context_items WHERE extraction_status IN ('extracting', 'queued')")
      .all() as RawContextItem[];
    return rows.map((r) => this.toContextItem(r));
  }

  resetStrandedItems(): number {
    const result = this.db
      .prepare("UPDATE context_items SET extraction_status = 'queued' WHERE extraction_status = 'extracting'")
      .run();
    return result.changes;
  }

  // ─── Row transforms ───

  private toContextItem(raw: RawContextItem): ContextItemRow {
    return {
      id: raw.id,
      clientAccountId: raw.client_account_id,
      projectId: raw.project_id,
      itemType: raw.item_type,
      title: raw.title,
      filePath: raw.file_path,
      content: raw.content,
      mimeType: raw.mime_type,
      fileSizeBytes: raw.file_size_bytes,
      extractionStatus: raw.extraction_status,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }

  private toKnowledge(raw: RawKnowledge): KnowledgeRow {
    return {
      id: raw.id,
      clientAccountId: raw.client_account_id,
      projectId: raw.project_id,
      sourceItemId: raw.source_item_id,
      category: raw.category,
      key: raw.key,
      value: raw.value,
      confidence: raw.confidence,
      flagged: raw.flagged === 1,
      sourceQuote: raw.source_quote,
      createdAt: raw.created_at,
    };
  }

  private toSummary(raw: RawSummary): SummaryRow {
    return {
      id: raw.id,
      clientAccountId: raw.client_account_id,
      projectId: raw.project_id,
      summaryType: raw.summary_type,
      content: raw.content,
      brandColors: raw.brand_colors ? (() => { try { return JSON.parse(raw.brand_colors); } catch { return null; } })() : null,
      sourceItemCount: raw.source_item_count,
      generatedAt: raw.generated_at,
    };
  }
}
