import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceDatabase } from "./workspace-database";
import { ContextRepository } from "./context-repository";
import type { EntityScope } from "./context-repository";

function seedDb(db: ReturnType<typeof WorkspaceDatabase.open>) {
  db.inner
    .prepare("INSERT INTO client_accounts (id, name, slug) VALUES (?, ?, ?)")
    .run("client-1", "Acme Corp", "acme-corp");
  db.inner
    .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
    .run("proj-1", "Widget App", "widget-app", "/tmp/widget");
}

describe("ContextRepository", () => {
  let tmpDir: string;
  let wsDb: ReturnType<typeof WorkspaceDatabase.open>;
  let repo: ContextRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-ctx-test-"));
    wsDb = WorkspaceDatabase.open(join(tmpDir, "workspace.db"));
    seedDb(wsDb);
    repo = new ContextRepository(wsDb.inner);
  });

  afterEach(async () => {
    wsDb.close();
    await rm(tmpDir, { recursive: true });
  });

  // ─── addItem ───

  describe("addItem", () => {
    it("inserts and returns a context item with client scope", () => {
      const scope: EntityScope = { entityType: "client", entityId: "client-1" };
      const item = repo.addItem(scope, {
        itemType: "text_note",
        title: "Meeting Notes",
        content: "Discussed pricing strategy",
      });

      expect(item.id).toBeTruthy();
      expect(item.clientAccountId).toBe("client-1");
      expect(item.projectId).toBeNull();
      expect(item.itemType).toBe("text_note");
      expect(item.title).toBe("Meeting Notes");
      expect(item.content).toBe("Discussed pricing strategy");
      expect(item.extractionStatus).toBe("queued");
    });

    it("inserts and returns a context item with project scope", () => {
      const scope: EntityScope = { entityType: "project", entityId: "proj-1" };
      const item = repo.addItem(scope, {
        itemType: "file",
        title: "spec.md",
        content: "# Spec\nLogin flow",
        mimeType: "text/markdown",
        fileSizeBytes: 1024,
      });

      expect(item.projectId).toBe("proj-1");
      expect(item.clientAccountId).toBeNull();
      expect(item.mimeType).toBe("text/markdown");
      expect(item.fileSizeBytes).toBe(1024);
    });

    it("rejects items violating XOR constraint (both scopes null)", () => {
      // Direct SQL to bypass repository validation
      expect(() => {
        wsDb.inner
          .prepare(
            "INSERT INTO context_items (id, item_type, title) VALUES ('bad-1', 'text_note', 'Bad')",
          )
          .run();
      }).toThrow();
    });

    it("rejects items violating XOR constraint (both scopes set)", () => {
      expect(() => {
        wsDb.inner
          .prepare(
            "INSERT INTO context_items (id, client_account_id, project_id, item_type, title) VALUES ('bad-2', 'client-1', 'proj-1', 'text_note', 'Bad')",
          )
          .run();
      }).toThrow();
    });
  });

  // ─── getItems ───

  describe("getItems", () => {
    it("returns items by client scope", () => {
      const scope: EntityScope = { entityType: "client", entityId: "client-1" };
      repo.addItem(scope, { itemType: "text_note", title: "Note 1", content: "A" });
      repo.addItem(scope, { itemType: "text_note", title: "Note 2", content: "B" });

      const items = repo.getItems(scope);
      expect(items).toHaveLength(2);
    });

    it("returns items by project scope", () => {
      const scope: EntityScope = { entityType: "project", entityId: "proj-1" };
      repo.addItem(scope, { itemType: "file", title: "file.txt" });

      const items = repo.getItems(scope);
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe("file.txt");
    });

    it("returns empty array for scope with no items", () => {
      const items = repo.getItems({ entityType: "client", entityId: "client-1" });
      expect(items).toEqual([]);
    });
  });

  // ─── deleteItem ───

  describe("deleteItem", () => {
    it("removes item and returns true", () => {
      const item = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "Temp", content: "delete me" },
      );

      expect(repo.deleteItem(item.id)).toBe(true);
      expect(repo.getItem(item.id)).toBeNull();
    });

    it("CASCADE deletes associated knowledge", () => {
      const item = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Source", content: "tech stack is React" },
      );

      repo.insertKnowledge(item.id, [
        { category: "technical", key: "tech_stack", value: "React", confidence: 0.9 },
      ]);

      const knowledgeBefore = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
      expect(knowledgeBefore).toHaveLength(1);

      repo.deleteItem(item.id);

      const knowledgeAfter = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
      expect(knowledgeAfter).toHaveLength(0);
    });

    it("returns false for nonexistent item", () => {
      expect(repo.deleteItem("nonexistent-id")).toBe(false);
    });
  });

  // ─── updateExtractionStatus ───

  describe("updateExtractionStatus", () => {
    it("transitions status correctly", () => {
      const item = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "Test", content: "content" },
      );
      expect(item.extractionStatus).toBe("queued");

      repo.updateExtractionStatus(item.id, "extracting");
      expect(repo.getItem(item.id)!.extractionStatus).toBe("extracting");

      repo.updateExtractionStatus(item.id, "extracted");
      expect(repo.getItem(item.id)!.extractionStatus).toBe("extracted");
    });
  });

  // ─── insertKnowledge ───

  describe("insertKnowledge", () => {
    it("batch inserts knowledge entries", () => {
      const item = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Brief", content: "details" },
      );

      const entries = [
        { category: "business", key: "pain_points", value: "Manual invoicing", confidence: 0.9 },
        { category: "technical", key: "tech_stack", value: "Node.js + React", confidence: 0.85 },
        { category: "design", key: "brand_colors", value: "#FF5733 and #3366CC", confidence: 0.7 },
      ];

      const inserted = repo.insertKnowledge(item.id, entries);
      expect(inserted).toHaveLength(3);
      expect(inserted[0].category).toBe("business");
      expect(inserted[1].confidence).toBe(0.85);
      expect(inserted[2].sourceItemId).toBe(item.id);
    });

    it("throws for deleted item", () => {
      const item = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "Gone", content: "content" },
      );
      repo.deleteItem(item.id);

      expect(() => {
        repo.insertKnowledge(item.id, [
          { category: "business", key: "test", value: "v", confidence: 0.8 },
        ]);
      }).toThrow(/not found/);
    });
  });

  // ─── getKnowledge ───

  describe("getKnowledge", () => {
    it("lists knowledge by scope with confidence values", () => {
      const item = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "Notes", content: "content" },
      );

      repo.insertKnowledge(item.id, [
        { category: "business", key: "budget", value: "$50k", confidence: 0.95 },
        { category: "history", key: "previous_vendor", value: "Acme Inc", confidence: 0.6 },
      ]);

      const knowledge = repo.getKnowledge({ entityType: "client", entityId: "client-1" });
      expect(knowledge).toHaveLength(2);
      expect(knowledge[0].confidence).toBe(0.95);
      expect(knowledge[1].confidence).toBe(0.6);
    });
  });

  // ─── flagKnowledge ───

  describe("flagKnowledge", () => {
    it("sets flagged to true", () => {
      const item = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Src", content: "c" },
      );

      const [entry] = repo.insertKnowledge(item.id, [
        { category: "business", key: "wrong", value: "Incorrect fact", confidence: 0.8 },
      ]);

      expect(entry.flagged).toBe(false);
      expect(repo.flagKnowledge(entry.id)).toBe(true);

      const updated = repo.getKnowledgeById(entry.id);
      expect(updated!.flagged).toBe(true);
    });

    it("returns false for nonexistent entry", () => {
      expect(repo.flagKnowledge("nonexistent")).toBe(false);
    });
  });

  // ─── upsertSummary ───

  describe("upsertSummary", () => {
    it("inserts a new summary", () => {
      const summary = repo.upsertSummary(
        { entityType: "client", entityId: "client-1" },
        "client_profile",
        "# Client Profile\n\nAcme Corp overview",
      );

      expect(summary.id).toBeTruthy();
      expect(summary.summaryType).toBe("client_profile");
      expect(summary.content).toContain("Acme Corp");
      expect(summary.clientAccountId).toBe("client-1");
      expect(summary.projectId).toBeNull();
    });

    it("updates existing summary via COALESCE index", () => {
      const scope: EntityScope = { entityType: "project", entityId: "proj-1" };

      const first = repo.upsertSummary(scope, "project_brief", "Version 1");
      const second = repo.upsertSummary(scope, "project_brief", "Version 2");

      expect(second.id).toBe(first.id);
      expect(second.content).toBe("Version 2");
    });

    it("stores brand colors as JSON array", () => {
      const summary = repo.upsertSummary(
        { entityType: "client", entityId: "client-1" },
        "client_profile",
        "Profile with colors",
        ["#FF5733", "#3366CC"],
      );

      expect(summary.brandColors).toEqual(["#FF5733", "#3366CC"]);
    });
  });

  // ─── getSummary ───

  describe("getSummary", () => {
    it("returns the latest summary for a scope", () => {
      repo.upsertSummary(
        { entityType: "client", entityId: "client-1" },
        "client_profile",
        "Latest profile",
      );

      const summary = repo.getSummary(
        { entityType: "client", entityId: "client-1" },
        "client_profile",
      );
      expect(summary).not.toBeNull();
      expect(summary!.content).toBe("Latest profile");
    });

    it("returns null for nonexistent scope", () => {
      const summary = repo.getSummary({ entityType: "project", entityId: "proj-1" });
      expect(summary).toBeNull();
    });
  });

  // ─── searchKnowledge ───

  describe("searchKnowledge", () => {
    it("finds knowledge via FTS match", () => {
      const item = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Tech", content: "stack info" },
      );

      repo.insertKnowledge(item.id, [
        { category: "technical", key: "framework", value: "React with TypeScript", confidence: 0.9 },
        { category: "business", key: "market", value: "Enterprise SaaS", confidence: 0.8 },
      ]);

      const results = repo.searchKnowledge("React");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((r) => r.value.includes("React"))).toBe(true);
    });

    it("returns empty for empty query", () => {
      expect(repo.searchKnowledge("")).toEqual([]);
      expect(repo.searchKnowledge("   ")).toEqual([]);
    });
  });

  // ─── FTS trigger sync ───

  describe("FTS trigger sync", () => {
    it("reflects inserts in FTS index", () => {
      const item = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "FTS test", content: "content" },
      );

      repo.insertKnowledge(item.id, [
        { category: "technical", key: "database", value: "PostgreSQL with PostGIS", confidence: 0.9 },
      ]);

      const results = repo.searchKnowledge("PostgreSQL");
      expect(results).toHaveLength(1);
    });

    it("reflects deletes in FTS index via CASCADE", () => {
      const item = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Source", content: "c" },
      );

      repo.insertKnowledge(item.id, [
        { category: "design", key: "style", value: "Minimalist brutalism", confidence: 0.7 },
      ]);

      // Verify searchable
      expect(repo.searchKnowledge("brutalism")).toHaveLength(1);

      // Delete source item (CASCADE deletes knowledge, triggers FTS delete)
      repo.deleteItem(item.id);

      expect(repo.searchKnowledge("brutalism")).toHaveLength(0);
    });
  });

  // ─── Reconciliation ───

  describe("reconciliation", () => {
    it("getStrandedItems returns items in extracting/queued status", () => {
      const item1 = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "Stranded 1", content: "c" },
      );
      // item1 starts as 'queued' by default

      const item2 = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Stranded 2", content: "c" },
      );
      repo.updateExtractionStatus(item2.id, "extracting");

      const item3 = repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: "Done", content: "c" },
      );
      repo.updateExtractionStatus(item3.id, "extracted");

      const stranded = repo.getStrandedItems();
      expect(stranded).toHaveLength(2);
      expect(stranded.map((s) => s.id).sort()).toEqual([item1.id, item2.id].sort());
    });

    it("resetStrandedItems changes extracting to queued", () => {
      const item = repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: "Stuck", content: "c" },
      );
      repo.updateExtractionStatus(item.id, "extracting");

      const count = repo.resetStrandedItems();
      expect(count).toBe(1);

      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("queued");
    });
  });
});
