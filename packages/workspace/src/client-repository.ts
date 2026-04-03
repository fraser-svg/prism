import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { EventLog } from "./event-log";

export interface ClientRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawClientRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export class ClientRepository {
  private eventLog: EventLog;

  constructor(private db: Database.Database) {
    this.eventLog = new EventLog(db);
  }

  create(name: string, notes?: string): ClientRow {
    const id = randomUUID();

    // Wrap slug generation + insert in a transaction to prevent TOCTOU race
    // when two concurrent creates use the same name
    const row = this.db.transaction(() => {
      const slug = this.generateSlug(name);
      this.db
        .prepare(
          "INSERT INTO client_accounts (id, name, slug, notes) VALUES (?, ?, ?, ?)",
        )
        .run(id, name, slug, notes ?? null);
      return this.db
        .prepare("SELECT * FROM client_accounts WHERE id = ?")
        .get(id) as RawClientRow;
    })();

    this.eventLog.append({
      eventType: "client:created",
      summary: `Created client: ${name}`,
      metadata: { clientId: id, slug: row.slug },
    });

    return this.toClientRow(row);
  }

  get(id: string): ClientRow | null {
    const row = this.db
      .prepare("SELECT * FROM client_accounts WHERE id = ?")
      .get(id) as RawClientRow | undefined;
    return row ? this.toClientRow(row) : null;
  }

  list(options?: { includeArchived?: boolean }): ClientRow[] {
    const includeArchived = options?.includeArchived ?? false;
    const query = includeArchived
      ? "SELECT * FROM client_accounts ORDER BY name ASC"
      : "SELECT * FROM client_accounts WHERE status = 'active' ORDER BY name ASC";

    const rows = this.db.prepare(query).all() as RawClientRow[];
    return rows.map((r) => this.toClientRow(r));
  }

  update(
    id: string,
    fields: { name?: string; notes?: string },
  ): ClientRow | null {
    const existing = this.get(id);
    if (!existing) return null;

    const sets: string[] = ["updated_at = datetime('now')"];
    const params: unknown[] = [];

    if (fields.name !== undefined) {
      sets.push("name = ?");
      params.push(fields.name);
    }
    if (fields.notes !== undefined) {
      sets.push("notes = ?");
      params.push(fields.notes);
    }

    params.push(id);
    this.db
      .prepare(`UPDATE client_accounts SET ${sets.join(", ")} WHERE id = ?`)
      .run(...params);

    this.eventLog.append({
      eventType: "client:updated",
      summary: `Updated client: ${fields.name ?? existing.name}`,
      metadata: { clientId: id },
    });

    return this.get(id);
  }

  archive(id: string): void {
    const client = this.get(id);
    if (!client) return;

    this.db
      .prepare(
        "UPDATE client_accounts SET status = 'archived', updated_at = datetime('now') WHERE id = ?",
      )
      .run(id);

    this.eventLog.append({
      eventType: "client:archived",
      summary: `Archived client: ${client.name}`,
      metadata: { clientId: id },
    });
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existing = this.db
      .prepare("SELECT slug FROM client_accounts WHERE slug = ?")
      .get(base) as { slug: string } | undefined;

    if (!existing) return base;

    for (let i = 2; i <= 11; i++) {
      const candidate = `${base}-${i}`;
      const dup = this.db
        .prepare("SELECT slug FROM client_accounts WHERE slug = ?")
        .get(candidate) as { slug: string } | undefined;
      if (!dup) return candidate;
    }

    throw new Error(
      `Failed to generate unique slug for "${name}" after 10 retries`,
    );
  }

  private toClientRow(raw: RawClientRow): ClientRow {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      status: raw.status,
      notes: raw.notes,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }
}
