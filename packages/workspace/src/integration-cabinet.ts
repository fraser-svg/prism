import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { EventLog } from "./event-log";

export interface IntegrationRow {
  id: string;
  provider: string;
  instanceLabel: string;
  status: string;
  scope: string[] | null;
  config: Record<string, unknown> | null;
  registeredAt: string;
}

export interface HealthResult {
  status: "connected" | "degraded" | "needs_reauth" | "unavailable";
  message: string;
}

export type HealthAdapter = (
  config: Record<string, unknown> | null,
) => Promise<HealthResult>;

export class IntegrationCabinet {
  private eventLog: EventLog;
  private healthAdapters = new Map<string, HealthAdapter>();

  constructor(private db: Database.Database) {
    this.eventLog = new EventLog(db);
  }

  register(
    provider: string,
    instanceLabel: string,
    config?: Record<string, unknown>,
    scope?: string[],
  ): IntegrationRow {
    const id = randomUUID();

    this.db
      .prepare(
        "INSERT INTO integrations (id, provider, instance_label, scope, config) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        id,
        provider,
        instanceLabel,
        scope ? JSON.stringify(scope) : null,
        config ? JSON.stringify(config) : null,
      );

    this.eventLog.append({
      eventType: "integration:registered",
      summary: `Registered integration: ${provider}/${instanceLabel}`,
    });

    return this.getById(id)!;
  }

  list(): IntegrationRow[] {
    const rows = this.db
      .prepare("SELECT * FROM integrations ORDER BY registered_at DESC")
      .all() as RawIntegrationRow[];

    return rows.map((r) => this.toIntegrationRow(r));
  }

  remove(provider: string, instanceLabel: string): void {
    this.db
      .prepare(
        "DELETE FROM integrations WHERE provider = ? AND instance_label = ?",
      )
      .run(provider, instanceLabel);

    this.eventLog.append({
      eventType: "integration:removed",
      summary: `Removed integration: ${provider}/${instanceLabel}`,
    });
  }

  registerHealthAdapter(provider: string, adapter: HealthAdapter): void {
    this.healthAdapters.set(provider, adapter);
  }

  ensureRegistered(
    provider: string,
    instanceLabel: string,
    config?: Record<string, unknown>,
  ): void {
    const id = randomUUID();
    const changes = this.db
      .prepare(
        "INSERT OR IGNORE INTO integrations (id, provider, instance_label, scope, config) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, provider, instanceLabel, null, config ? JSON.stringify(config) : null);

    if (changes.changes > 0) {
      this.eventLog.append({
        eventType: "integration:registered",
        summary: `Registered integration: ${provider}/${instanceLabel}`,
      });
    }
  }

  getByProvider(provider: string): IntegrationRow | null {
    const row = this.db
      .prepare(
        "SELECT * FROM integrations WHERE provider = ? ORDER BY registered_at DESC LIMIT 1",
      )
      .get(provider) as RawIntegrationRow | undefined;
    return row ? this.toIntegrationRow(row) : null;
  }

  async checkHealth(
    provider: string,
    instanceLabel: string,
  ): Promise<HealthResult> {
    const row = this.db
      .prepare(
        "SELECT * FROM integrations WHERE provider = ? AND instance_label = ?",
      )
      .get(provider, instanceLabel) as RawIntegrationRow | undefined;

    if (!row) {
      return { status: "unavailable", message: "Integration not found" };
    }

    const adapter = this.healthAdapters.get(provider);
    if (!adapter) {
      // No adapter — return current stored status
      return {
        status: row.status as HealthResult["status"],
        message: "No health adapter registered",
      };
    }

    const config = row.config
      ? (JSON.parse(row.config) as Record<string, unknown>)
      : null;

    try {
      const result = await Promise.race([
        adapter(config),
        new Promise<HealthResult>((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), 5000),
        ),
      ]);

      // Update status in DB
      this.db
        .prepare(
          "UPDATE integrations SET status = ? WHERE provider = ? AND instance_label = ?",
        )
        .run(result.status, provider, instanceLabel);

      return result;
    } catch (err) {
      const result: HealthResult = {
        status: "unavailable",
        message: err instanceof Error ? err.message : String(err),
      };
      this.db
        .prepare(
          "UPDATE integrations SET status = ? WHERE provider = ? AND instance_label = ?",
        )
        .run("unavailable", provider, instanceLabel);
      return result;
    }
  }

  async checkAllHealth(): Promise<
    Array<{ provider: string; instanceLabel: string; result: HealthResult }>
  > {
    const integrations = this.list();

    return Promise.all(
      integrations.map(async (integration) => ({
        provider: integration.provider,
        instanceLabel: integration.instanceLabel,
        result: await this.checkHealth(
          integration.provider,
          integration.instanceLabel,
        ),
      })),
    );
  }

  private getById(id: string): IntegrationRow | null {
    const row = this.db
      .prepare("SELECT * FROM integrations WHERE id = ?")
      .get(id) as RawIntegrationRow | undefined;
    return row ? this.toIntegrationRow(row) : null;
  }

  private toIntegrationRow(raw: RawIntegrationRow): IntegrationRow {
    return {
      id: raw.id,
      provider: raw.provider,
      instanceLabel: raw.instance_label,
      status: raw.status,
      scope: raw.scope ? (JSON.parse(raw.scope) as string[]) : null,
      config: raw.config
        ? (JSON.parse(raw.config) as Record<string, unknown>)
        : null,
      registeredAt: raw.registered_at,
    };
  }
}

interface RawIntegrationRow {
  id: string;
  provider: string;
  instance_label: string;
  status: string;
  scope: string | null;
  config: string | null;
  registered_at: string;
}
