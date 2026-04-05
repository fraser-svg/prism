import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Anthropic SDK before importing engine
const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: "text", text: "Mock assistant reply" }],
  usage: { input_tokens: 100, output_tokens: 50 },
});

vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

import { ConversationEngine } from "./conversation-engine";
import type { PipelineSession } from "./conversation-engine";

// ─── Mock Helpers ───

function createMockDb(rows: Record<string, unknown>[] = []) {
  return {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue(rows),
      get: vi.fn().mockReturnValue(undefined),
      run: vi.fn(),
    }),
  };
}

function createMockFacade(dbRows: Record<string, unknown>[] = []) {
  const mockDb = createMockDb(dbRows);
  return {
    integrations: {
      getByProvider: vi.fn().mockReturnValue({
        status: "connected",
        config: { apiKey: "sk-test-key" },
      }),
    },
    contextRepo: {
      getKnowledge: vi.fn().mockReturnValue([]),
      getSummary: vi.fn().mockReturnValue(null),
    },
    context: {
      db: { inner: mockDb },
    },
    _mockDb: mockDb,
  };
}

// ─── Tests ───

describe("ConversationEngine", () => {
  let facade: ReturnType<typeof createMockFacade>;
  let engine: ConversationEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    facade = createMockFacade();
    engine = new ConversationEngine(facade as any);
  });

  // ─── Session CRUD ───

  describe("session management", () => {
    it("startSession creates a new session", () => {
      const session = engine.startSession("proj-1", "user-1");

      expect(session).toBeDefined();
      expect(session.projectId).toBe("proj-1");
      expect(session.userId).toBe("user-1");
      expect(session.phase).toBe("understand");
      expect(session.status).toBe("active");
      expect(session.conversationHistory).toEqual([]);
      expect(session.cost).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      });
    });

    it("startSession returns existing active session for same key", () => {
      const first = engine.startSession("proj-1", "user-1");
      const second = engine.startSession("proj-1", "user-1");

      expect(first.id).toBe(second.id);
    });

    it("getSession retrieves a started session", () => {
      engine.startSession("proj-1", "user-1");
      const session = engine.getSession("proj-1", "user-1");

      expect(session).toBeDefined();
      expect(session!.projectId).toBe("proj-1");
    });

    it("getSession returns undefined for unknown session", () => {
      expect(engine.getSession("no-proj", "no-user")).toBeUndefined();
    });

    it("completeSession sets status to completed", () => {
      engine.startSession("proj-1", "user-1");
      engine.completeSession("proj-1", "user-1");

      const session = engine.getSession("proj-1", "user-1");
      expect(session!.status).toBe("completed");
    });

    it("getSnapshot returns null for missing session", () => {
      expect(engine.getSnapshot("x", "y")).toBeNull();
    });

    it("getSnapshot returns session data", () => {
      engine.startSession("proj-1", "user-1");
      const snapshot = engine.getSnapshot("proj-1", "user-1");

      expect(snapshot).not.toBeNull();
      expect(snapshot!.phase).toBe("understand");
      expect(snapshot!.status).toBe("active");
    });
  });

  // ─── Session Key Format ───

  describe("session key format", () => {
    it("isolates sessions by projectId:userId", () => {
      const s1 = engine.startSession("proj-a", "user-1");
      const s2 = engine.startSession("proj-b", "user-1");
      const s3 = engine.startSession("proj-a", "user-2");

      expect(s1.id).not.toBe(s2.id);
      expect(s1.id).not.toBe(s3.id);
      expect(s2.id).not.toBe(s3.id);
    });

    it("same project+user always resolves to the same session", () => {
      engine.startSession("proj-a", "user-1");
      const retrieved = engine.getSession("proj-a", "user-1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.projectId).toBe("proj-a");
      expect(retrieved!.userId).toBe("user-1");
    });
  });

  // ─── Pre-Filled Fields ───

  describe("getPreFilledFields", () => {
    it("returns knowledge entries with confidence >= 0.7", async () => {
      facade.contextRepo.getKnowledge.mockReturnValue([
        { key: "name", value: "Acme", confidence: 0.9, category: "input", flagged: false },
        { key: "budget", value: "10k", confidence: 0.5, category: "input", flagged: false },
        { key: "stack", value: "React", confidence: 0.7, category: "inferred", flagged: false },
      ]);

      const fields = await engine.getPreFilledFields("proj-1");

      expect(fields).toHaveLength(2);
      expect(fields[0]).toEqual({
        key: "name",
        value: "Acme",
        confidence: 0.9,
        source: "input",
      });
      expect(fields[1]).toEqual({
        key: "stack",
        value: "React",
        confidence: 0.7,
        source: "inferred",
      });
    });

    it("excludes flagged entries even with high confidence", async () => {
      facade.contextRepo.getKnowledge.mockReturnValue([
        { key: "name", value: "Acme", confidence: 0.95, category: "input", flagged: true },
      ]);

      const fields = await engine.getPreFilledFields("proj-1");
      expect(fields).toHaveLength(0);
    });

    it("returns empty array when no knowledge exists", async () => {
      facade.contextRepo.getKnowledge.mockReturnValue([]);
      const fields = await engine.getPreFilledFields("proj-1");
      expect(fields).toEqual([]);
    });
  });

  // ─── Cost Accumulation ───

  describe("cost tracking", () => {
    it("accumulates cost after sendMessage", async () => {
      engine.startSession("proj-1", "user-1");

      const reply = await engine.sendMessage("proj-1", "user-1", "Hello");

      expect(reply.role).toBe("assistant");
      expect(reply.content).toBe("Mock assistant reply");

      const session = engine.getSession("proj-1", "user-1")!;
      expect(session.cost.inputTokens).toBe(100);
      expect(session.cost.outputTokens).toBe(50);
      expect(session.cost.costUsd).toBeGreaterThan(0);

      // Verify cost math: (100/1000)*0.003 + (50/1000)*0.015 = 0.0003 + 0.00075 = 0.00105
      expect(session.cost.costUsd).toBeCloseTo(0.00105, 5);
    });

    it("accumulates cost across multiple messages", async () => {
      engine.startSession("proj-1", "user-1");

      await engine.sendMessage("proj-1", "user-1", "First");
      await engine.sendMessage("proj-1", "user-1", "Second");

      const session = engine.getSession("proj-1", "user-1")!;
      expect(session.cost.inputTokens).toBe(200);
      expect(session.cost.outputTokens).toBe(100);
      expect(session.cost.costUsd).toBeCloseTo(0.0021, 5);
    });

    it("throws when sending to non-existent session", async () => {
      await expect(
        engine.sendMessage("no-proj", "no-user", "hi"),
      ).rejects.toThrow("No active session");
    });
  });

  // ─── DB Reload with Corrupt JSON ───

  describe("DB reload resilience", () => {
    it("falls back to empty history when conversation_history is corrupt JSON", () => {
      const corruptRow = {
        id: "ps-corrupt",
        project_id: "proj-c",
        user_id: "user-c",
        phase: "understand",
        conversation_history: "NOT VALID JSON {{{",
        active_spec_id: null,
        autopilot: 0,
        total_input_tokens: 10,
        total_output_tokens: 5,
        total_cost_usd: 0.001,
        status: "active",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z",
      };

      const corruptFacade = createMockFacade([corruptRow]);
      const corruptEngine = new ConversationEngine(corruptFacade as any);

      const session = corruptEngine.getSession("proj-c", "user-c");
      expect(session).toBeDefined();
      expect(session!.conversationHistory).toEqual([]);
    });

    it("loads valid JSON history from DB correctly", () => {
      const validHistory = JSON.stringify([
        { role: "user", content: "Hello", timestamp: "2026-04-05T00:00:00Z" },
      ]);

      const validRow = {
        id: "ps-valid",
        project_id: "proj-v",
        user_id: "user-v",
        phase: "spec",
        conversation_history: validHistory,
        active_spec_id: "spec-1",
        autopilot: 1,
        total_input_tokens: 200,
        total_output_tokens: 100,
        total_cost_usd: 0.05,
        status: "active",
        created_at: "2026-04-05T00:00:00Z",
        updated_at: "2026-04-05T00:00:00Z",
      };

      const validFacade = createMockFacade([validRow]);
      const validEngine = new ConversationEngine(validFacade as any);

      const session = validEngine.getSession("proj-v", "user-v");
      expect(session).toBeDefined();
      expect(session!.conversationHistory).toHaveLength(1);
      expect(session!.conversationHistory[0].content).toBe("Hello");
      expect(session!.phase).toBe("spec");
      expect(session!.autopilot).toBe(true);
      expect(session!.activeSpecId).toBe("spec-1");
    });
  });

  // ─── Phase Change Resets History ───

  describe("phase transitions", () => {
    it("setPhase resets conversation history", async () => {
      engine.startSession("proj-1", "user-1");
      await engine.sendMessage("proj-1", "user-1", "Hello");

      const before = engine.getSession("proj-1", "user-1")!;
      expect(before.conversationHistory.length).toBeGreaterThan(0);

      engine.setPhase("proj-1", "user-1", "spec");

      const after = engine.getSession("proj-1", "user-1")!;
      expect(after.phase).toBe("spec");
      expect(after.conversationHistory).toEqual([]);
    });

    it("setPhase is a no-op when session does not exist", () => {
      // Should not throw
      engine.setPhase("no-proj", "no-user", "plan");
    });

    it("setPhase persists to DB", () => {
      engine.startSession("proj-1", "user-1");
      engine.setPhase("proj-1", "user-1", "plan");

      const prepareCall = facade._mockDb.prepare;
      // persistSession is called by both startSession and setPhase
      expect(prepareCall).toHaveBeenCalled();
    });
  });

  // ─── Emitter ───

  describe("event emitter", () => {
    it("getEmitter returns an EventEmitter for a session", () => {
      const emitter = engine.getEmitter("proj-1", "user-1");
      expect(emitter).toBeDefined();
      expect(typeof emitter.on).toBe("function");
    });

    it("getEmitter returns the same emitter for the same key", () => {
      const e1 = engine.getEmitter("proj-1", "user-1");
      const e2 = engine.getEmitter("proj-1", "user-1");
      expect(e1).toBe(e2);
    });
  });

  // ─── Autopilot & Spec ID Setters ───

  describe("setters", () => {
    it("setAutopilot updates session flag", () => {
      engine.startSession("proj-1", "user-1");
      engine.setAutopilot("proj-1", "user-1", true);

      expect(engine.getSession("proj-1", "user-1")!.autopilot).toBe(true);
    });

    it("setActiveSpecId updates session", () => {
      engine.startSession("proj-1", "user-1");
      engine.setActiveSpecId("proj-1", "user-1", "spec-42");

      expect(engine.getSession("proj-1", "user-1")!.activeSpecId).toBe(
        "spec-42",
      );
    });
  });

  // ─── Conversation History Retrieval ───

  describe("getConversationHistory", () => {
    it("returns null for unknown session ID", () => {
      const result = engine.getConversationHistory("unknown-id");
      expect(result).toBeNull();
    });

    it("returns parsed history from DB", () => {
      const history = [
        { role: "user", content: "Hi", timestamp: "2026-04-05T00:00:00Z" },
      ];
      facade._mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue({
          conversation_history: JSON.stringify(history),
        }),
      });

      const result = engine.getConversationHistory("ps-123");
      expect(result).toEqual(history);
    });

    it("returns empty array for corrupt JSON in DB", () => {
      facade._mockDb.prepare.mockReturnValueOnce({
        get: vi.fn().mockReturnValue({
          conversation_history: "BROKEN{{{",
        }),
      });

      const result = engine.getConversationHistory("ps-bad");
      expect(result).toEqual([]);
    });
  });
});
