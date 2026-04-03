import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WorkspaceFacade, ClientRepository } from "@prism/workspace";
import { createApp } from "../apps/web/server/index";
import request from "supertest";

let facade: WorkspaceFacade;
let clients: ClientRepository;
let app: ReturnType<typeof createApp>["app"];

beforeAll(() => {
  // Use in-memory workspace for tests
  facade = new WorkspaceFacade();
  clients = new ClientRepository(facade.context.db.inner);
  const result = createApp(facade, clients);
  app = result.app;
});

afterAll(() => {
  facade.close();
});

describe("requireAuth middleware", () => {
  it("returns 401 when no session cookie is provided", async () => {
    const res = await request(app).get("/api/portfolio");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("returns 401 for POST routes without session", async () => {
    const res = await request(app)
      .post("/api/clients")
      .send({ name: "Test Client" });
    expect(res.status).toBe(401);
  });

  it("allows requests when SKIP_AUTH=true", async () => {
    const originalSkip = process.env.SKIP_AUTH;
    process.env.SKIP_AUTH = "true";

    try {
      const res = await request(app).get("/api/portfolio");
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    } finally {
      process.env.SKIP_AUTH = originalSkip;
    }
  });
});

describe("auth endpoints", () => {
  it("GET /api/auth/get-session returns null session when unauthenticated", async () => {
    const res = await request(app).get("/api/auth/get-session");
    expect(res.status).toBe(200);
  });

  it("POST /api/auth/sign-up/email creates a user", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Content-Type", "application/json")
      .send({
        name: "Test User",
        email: `test-${Date.now()}@example.com`,
        password: "TestPassword123!",
      });
    // Better Auth returns 200 with user+session on successful signup
    if (res.status !== 200) {
      console.log("Signup response:", res.status, JSON.stringify(res.body));
    }
    expect(res.status).toBe(200);
  });
});

describe("protected routes", () => {
  it("all API routes return 401 without auth", async () => {
    const routes = [
      { method: "get", path: "/api/portfolio" },
      { method: "post", path: "/api/clients" },
      { method: "post", path: "/api/projects" },
      { method: "post", path: "/api/projects/link" },
    ];

    for (const route of routes) {
      const res = await (request(app) as any)[route.method](route.path);
      expect(res.status).toBe(401);
    }
  });
});
