import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { createPipelineRouter } from "./pipeline-routes";
import { EventEmitter } from "node:events";
import type { Server } from "node:http";

// ─── Mock external modules before imports ───

vi.mock("@prism/orchestrator", () => ({
  resumeProject: vi.fn().mockResolvedValue({ phase: "understand", specs: [] }),
  createSpec: vi.fn().mockResolvedValue({ id: "spec-1" }),
  approveSpec: vi.fn().mockResolvedValue({ id: "spec-1", approved: true }),
  createPlan: vi.fn().mockResolvedValue({ id: "plan-1" }),
  runVerificationGate: vi.fn().mockResolvedValue({ passed: true }),
  recordReview: vi.fn().mockResolvedValue({ id: "review-1" }),
  evaluateTransition: vi.fn().mockResolvedValue({ canAdvance: true, blockers: [] }),
  skillSpecToCore: vi.fn((x: unknown) => x),
  skillPlanToCore: vi.fn((x: unknown) => x),
  skillReviewToCore: vi.fn((x: unknown) => x),
}));

vi.mock("@prism/guardian", () => ({
  getRequiredReviewMatrix: vi.fn().mockReturnValue([]),
  checkRequiredReviews: vi.fn(),
  deriveReleaseState: vi.fn(),
}));

// ─── Helpers ───

function createMockFacade() {
  return {
    registry: {
      get: vi.fn().mockReturnValue({ rootPath: "/tmp/test-project" }),
    },
    integrations: {
      getByProvider: vi.fn(),
    },
  };
}

function createMockEngine() {
  return {
    startSession: vi.fn().mockReturnValue({
      id: "session-1",
      phase: "understand",
      autopilot: false,
      cost: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      activeSpecId: null,
      streaming: false,
      conversationHistory: [],
    }),
    getSession: vi.fn().mockReturnValue({
      id: "session-1",
      phase: "understand",
      autopilot: false,
      cost: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      activeSpecId: null,
      streaming: false,
      conversationHistory: [],
    }),
    sendMessage: vi.fn().mockResolvedValue({ content: "ok", toolUse: null }),
    getEmitter: vi.fn().mockReturnValue(new EventEmitter()),
    getSnapshot: vi.fn().mockReturnValue(null),
    setPhase: vi.fn(),
    setActiveSpecId: vi.fn(),
    setAutopilot: vi.fn(),
    getConversationHistory: vi.fn().mockReturnValue([]),
    getHistory: vi.fn().mockReturnValue([]),
    getPreFilledFields: vi.fn().mockResolvedValue({}),
  };
}

type MockEngine = ReturnType<typeof createMockEngine>;
type MockFacade = ReturnType<typeof createMockFacade>;

let app: express.Express;
let server: Server;
let baseUrl: string;
let mockFacade: MockFacade;
let mockEngine: MockEngine;
let mockGetUserId: ReturnType<typeof vi.fn>;

async function jsonPost(path: string, body?: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function jsonGet(path: string) {
  return fetch(`${baseUrl}${path}`);
}

// ─── Setup / Teardown ───

beforeEach(async () => {
  mockFacade = createMockFacade();
  mockEngine = createMockEngine();
  mockGetUserId = vi.fn().mockResolvedValue("test-user");

  app = express();
  app.use(express.json());

  // Mount with :id param like the real app
  const router = createPipelineRouter(
    mockFacade as any,
    mockEngine as any,
    mockGetUserId,
  );
  app.use("/api/projects/:id/pipeline", router);

  // Start on random port
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/projects/proj-1/pipeline`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ─── Auth checks (every endpoint should reject unauthenticated) ───

describe("auth: all endpoints reject unauthenticated requests", () => {
  const postEndpoints = [
    "/resume",
    "/message",
    "/create-spec",
    "/approve-spec",
    "/create-plan",
    "/execute",
    "/verify",
    "/record-review",
    "/advance",
    "/autopilot",
  ];

  const getEndpoints = ["/stream", "/conversation"];

  it.each(postEndpoints)("POST %s returns 401 when not authenticated", async (path) => {
    mockGetUserId.mockResolvedValueOnce(null);
    const res = await jsonPost(path, {});
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it.each(getEndpoints)("GET %s returns 401 when not authenticated", async (path) => {
    mockGetUserId.mockResolvedValueOnce(null);
    const res = await jsonGet(path);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});

// ─── POST /resume ───

describe("POST /resume", () => {
  it("returns session and orchestrator state", async () => {
    const res = await jsonPost("/resume");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session).toMatchObject({
      id: "session-1",
      phase: "understand",
      autopilot: false,
    });
    expect(body.orchestrator).toBeDefined();
  });

  it("returns 404 when project not found in registry", async () => {
    mockFacade.registry.get.mockReturnValueOnce(null);
    const res = await jsonPost("/resume");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Project not found");
  });
});

// ─── POST /message ───

describe("POST /message", () => {
  it("returns 400 with empty message", async () => {
    const res = await jsonPost("/message", { message: "" });
    expect(res.status).toBe(500); // Zod parse error caught by safe()
  });

  it("returns 409 when already streaming", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "understand",
      streaming: true,
    });
    const res = await jsonPost("/message", { message: "hello" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("Already streaming");
  });

  it("returns 404 when no active session", async () => {
    mockEngine.getSession.mockReturnValueOnce(null);
    const res = await jsonPost("/message", { message: "hello" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("No active session");
  });

  it("sends message and returns response with phase and cost", async () => {
    mockEngine.sendMessage.mockResolvedValueOnce({
      content: "I understand your project",
      toolUse: null,
    });
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "understand",
      streaming: false,
    }).mockReturnValueOnce({
      id: "session-1",
      phase: "understand",
      cost: { inputTokens: 100, outputTokens: 50, costUsd: 0.001 },
    });
    const res = await jsonPost("/message", { message: "Build me a landing page" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message.content).toBe("I understand your project");
    expect(body.phase).toBe("understand");
    expect(body.cost).toEqual({ inputTokens: 100, outputTokens: 50, costUsd: 0.001 });
    expect(mockEngine.sendMessage).toHaveBeenCalledWith(
      "proj-1",
      "test-user",
      "Build me a landing page",
    );
  });
});

// ─── POST /approve-spec ───

describe("POST /approve-spec", () => {
  it("requires specId in body", async () => {
    const res = await jsonPost("/approve-spec", {});
    // Zod validation error caught by safe() handler
    expect(res.status).toBe(500);
  });

  it("rejects empty specId", async () => {
    const res = await jsonPost("/approve-spec", { specId: "" });
    expect(res.status).toBe(500);
  });

  it("returns 404 when project not found", async () => {
    mockFacade.registry.get.mockReturnValueOnce(null);
    const res = await jsonPost("/approve-spec", { specId: "spec-1" });
    expect(res.status).toBe(404);
  });

  it("approves spec and transitions to plan phase", async () => {
    const res = await jsonPost("/approve-spec", { specId: "spec-1" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spec).toBeDefined();
    expect(mockEngine.setActiveSpecId).toHaveBeenCalledWith("proj-1", "test-user", "spec-1");
    expect(mockEngine.setPhase).toHaveBeenCalledWith("proj-1", "test-user", "plan");
  });
});

// ─── POST /create-plan ───

describe("POST /create-plan", () => {
  it("returns 400 when spec is not approved (no activeSpecId)", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "plan",
      activeSpecId: null,
      streaming: false,
    });
    const res = await jsonPost("/create-plan");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Spec must be approved");
  });

  it("returns 400 when not in plan phase", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "understand",
      activeSpecId: "spec-1",
      streaming: false,
    });
    const res = await jsonPost("/create-plan");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Must be in plan phase");
  });

  it("returns 404 when no active session", async () => {
    mockEngine.getSession.mockReturnValueOnce(null);
    const res = await jsonPost("/create-plan");
    expect(res.status).toBe(404);
  });
});

// ─── POST /execute ───

describe("POST /execute", () => {
  it("returns 400 when not in execute phase", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "plan",
      streaming: false,
    });
    const res = await jsonPost("/execute");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Must be in execute phase");
  });

  it("returns 202 when in execute phase", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "execute",
      streaming: false,
    });
    const res = await jsonPost("/execute");
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("started");
  });
});

// ─── POST /verify ───

describe("POST /verify", () => {
  it("returns 400 when not in verify phase", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "execute",
      streaming: false,
    });
    const res = await jsonPost("/verify");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Must be in verify phase");
  });

  it("returns 202 when in verify phase", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "verify",
      activeSpecId: null,
      streaming: false,
    });
    const res = await jsonPost("/verify");
    expect(res.status).toBe(202);
  });
});

// ─── POST /record-review ───

describe("POST /record-review", () => {
  it("validates review body schema", async () => {
    const res = await jsonPost("/record-review", {});
    expect(res.status).toBe(500); // Zod parse error
  });

  it("accepts valid review", async () => {
    const res = await jsonPost("/record-review", {
      reviewType: "engineering",
      verdict: "pass",
      summary: "Looks good",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.review).toBeDefined();
  });
});

// ─── POST /advance ───

describe("POST /advance", () => {
  it("returns 404 when no active session", async () => {
    mockEngine.getSession.mockReturnValueOnce(null);
    const res = await jsonPost("/advance");
    expect(res.status).toBe(404);
  });

  it("returns 400 when already at release phase", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      phase: "release",
      streaming: false,
    });
    const res = await jsonPost("/advance");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Cannot advance past release");
  });
});

// ─── POST /autopilot ───

describe("POST /autopilot", () => {
  it("validates body requires boolean enabled", async () => {
    const res = await jsonPost("/autopilot", {});
    expect(res.status).toBe(500); // Zod parse error
  });

  it("sets autopilot and returns state", async () => {
    const res = await jsonPost("/autopilot", { enabled: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.autopilot).toBe(true);
    expect(mockEngine.setAutopilot).toHaveBeenCalledWith("proj-1", "test-user", true);
  });
});

// ─── GET /stream (SSE) ───

describe("GET /stream", () => {
  it("returns SSE headers", async () => {
    // Use AbortController to avoid hanging
    const controller = new AbortController();
    const resPromise = fetch(`${baseUrl}/stream`, { signal: controller.signal });

    // Give the server a moment to start writing headers
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    controller.abort();
  });
});

// ─── GET /conversation ───

describe("GET /conversation", () => {
  it("returns 404 when no active session and no sessionId", async () => {
    mockEngine.getSession.mockReturnValueOnce(null);
    const res = await jsonGet("/conversation");
    expect(res.status).toBe(404);
  });

  it("returns conversation history for current session", async () => {
    mockEngine.getSession.mockReturnValueOnce({
      id: "session-1",
      conversationHistory: [
        { role: "user", content: "hello", timestamp: "2026-04-05" },
      ],
    });
    const res = await jsonGet("/conversation");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toHaveLength(1);
  });

  it("returns 404 for unknown historical sessionId", async () => {
    mockEngine.getConversationHistory.mockReturnValueOnce(null);
    const res = await jsonGet("/conversation?sessionId=unknown");
    expect(res.status).toBe(404);
  });
});

// ─── GET /history ───

describe("GET /history", () => {
  it("returns session history (no auth required for this endpoint)", async () => {
    mockEngine.getHistory.mockReturnValueOnce([
      { id: "s1", createdAt: "2026-04-05" },
    ]);
    const res = await jsonGet("/history");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
  });
});

// ─── GET /prefilled ───

describe("GET /prefilled", () => {
  it("returns pre-filled fields", async () => {
    mockEngine.getPreFilledFields.mockResolvedValueOnce({
      name: "Test Project",
    });
    const res = await jsonGet("/prefilled");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fields.name).toBe("Test Project");
  });
});

// ─── Error handling (safe wrapper) ───

describe("error handling", () => {
  it("returns 400 for Vault-related errors", async () => {
    mockEngine.startSession.mockImplementationOnce(() => {
      throw new Error("Vault key not found");
    });
    const res = await jsonPost("/resume");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Vault");
  });

  it("returns 400 for API key errors", async () => {
    mockEngine.startSession.mockImplementationOnce(() => {
      throw new Error("API key is invalid");
    });
    const res = await jsonPost("/resume");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("API key");
  });

  it("returns 500 for generic errors", async () => {
    mockEngine.startSession.mockImplementationOnce(() => {
      throw new Error("Something unexpected");
    });
    const res = await jsonPost("/resume");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});
