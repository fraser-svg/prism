import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { UsageGate } from "@prism/workspace";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Run migrations in order
  const migrationsDir = join(__dirname, "../packages/workspace/src/migrations");
  const migrationFiles = ["001-initial.sql", "002-client-accounts.sql", "003-auth.sql", "004-context.sql", "005-usage-billing.sql"];

  // Create migrations table first
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))");

  for (const file of migrationFiles) {
    try {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      db.exec(sql);
    } catch {
      // Some migrations may reference tables from other migrations; skip non-critical ones
    }
  }

  return db;
}

describe("UsageGate", () => {
  let db: Database.Database;
  let gate: UsageGate;

  beforeEach(() => {
    db = createTestDb();
    gate = new UsageGate(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("getUsage", () => {
    it("auto-creates usage row for new user", () => {
      const usage = gate.getUsage("user-1");
      expect(usage.used).toBe(0);
      expect(usage.limit).toBe(50);
      expect(usage.remaining).toBe(50);
      expect(usage.isPaid).toBe(false);
    });

    it("returns correct values after actions are recorded", () => {
      gate.recordAction("user-1");
      gate.recordAction("user-1");
      const usage = gate.getUsage("user-1");
      expect(usage.used).toBe(2);
      expect(usage.remaining).toBe(48);
    });
  });

  describe("recordAction", () => {
    it("returns true when under limit", () => {
      expect(gate.recordAction("user-1")).toBe(true);
    });

    it("returns false when at free limit (50)", () => {
      // Fill up to limit
      for (let i = 0; i < 50; i++) {
        expect(gate.recordAction("user-1")).toBe(true);
      }
      // 51st should fail
      expect(gate.recordAction("user-1")).toBe(false);

      const usage = gate.getUsage("user-1");
      expect(usage.used).toBe(50);
      expect(usage.remaining).toBe(0);
    });

    it("is atomic — cannot exceed limit via concurrent-like calls", () => {
      // Fill to 49
      for (let i = 0; i < 49; i++) {
        gate.recordAction("user-1");
      }

      // Both try to take the last slot — only one should succeed
      const result1 = gate.recordAction("user-1");
      const result2 = gate.recordAction("user-1");

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(gate.getUsage("user-1").used).toBe(50);
    });
  });

  describe("isSubscribed", () => {
    it("returns false for users with no subscription", () => {
      expect(gate.isSubscribed("user-1")).toBe(false);
    });

    it("returns true after setSubscription", () => {
      gate.setSubscription("user-1", "cus_123", "sub_123", "2026-05-01T00:00:00Z");
      expect(gate.isSubscribed("user-1")).toBe(true);
    });

    it("returns false after cancelSubscription", () => {
      gate.setSubscription("user-1", "cus_123", "sub_123", "2026-05-01T00:00:00Z");
      gate.cancelSubscription("cus_123");
      expect(gate.isSubscribed("user-1")).toBe(false);
    });
  });

  describe("paid user limits", () => {
    it("paid user gets 500 daily cap instead of 50", () => {
      gate.setSubscription("user-1", "cus_123", "sub_123", "2026-05-01T00:00:00Z");
      const usage = gate.getUsage("user-1");
      expect(usage.limit).toBe(500);
      expect(usage.isPaid).toBe(true);
    });
  });

  describe("setSubscription", () => {
    it("upserts — calling twice updates instead of duplicating", () => {
      gate.setSubscription("user-1", "cus_123", "sub_123", "2026-05-01T00:00:00Z");
      gate.setSubscription("user-1", "cus_456", "sub_456", "2026-06-01T00:00:00Z");

      expect(gate.isSubscribed("user-1")).toBe(true);
      expect(gate.getStripeCustomerId("user-1")).toBe("cus_456");
    });
  });

  describe("getStripeCustomerId", () => {
    it("returns null for users with no subscription", () => {
      expect(gate.getStripeCustomerId("user-1")).toBeNull();
    });

    it("returns customer ID after subscription", () => {
      gate.setSubscription("user-1", "cus_123", "sub_123", "2026-05-01T00:00:00Z");
      expect(gate.getStripeCustomerId("user-1")).toBe("cus_123");
    });
  });

  describe("getUserByStripeCustomer", () => {
    it("returns null for unknown customer", () => {
      expect(gate.getUserByStripeCustomer("cus_unknown")).toBeNull();
    });

    it("returns user ID for known customer", () => {
      gate.setSubscription("user-1", "cus_123", "sub_123", "2026-05-01T00:00:00Z");
      expect(gate.getUserByStripeCustomer("cus_123")).toBe("user-1");
    });
  });

  describe("idempotency", () => {
    it("isEventProcessed returns false for new event", () => {
      expect(gate.isEventProcessed("evt_123")).toBe(false);
    });

    it("isEventProcessed returns true after marking", () => {
      gate.markEventProcessed("evt_123");
      expect(gate.isEventProcessed("evt_123")).toBe(true);
    });

    it("markEventProcessed is idempotent", () => {
      gate.markEventProcessed("evt_123");
      gate.markEventProcessed("evt_123"); // should not throw
      expect(gate.isEventProcessed("evt_123")).toBe(true);
    });
  });

  describe("daily reset", () => {
    it("resets counter when period_start is in the past", () => {
      // Record some actions
      gate.recordAction("user-1");
      gate.recordAction("user-1");
      expect(gate.getUsage("user-1").used).toBe(2);

      // Manually set period_start to yesterday
      db.prepare("UPDATE user_usage SET period_start = date('now', '-1 day') WHERE user_id = ?")
        .run("user-1");

      // Next access should reset
      const usage = gate.getUsage("user-1");
      expect(usage.used).toBe(0);
      expect(usage.remaining).toBe(50);
    });
  });
});
