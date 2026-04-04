import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceDatabase } from "./workspace-database";
import { ContextRepository } from "./context-repository";
import { ExtractionPipeline, isTranscript } from "./extraction-pipeline";

function seedDb(db: ReturnType<typeof WorkspaceDatabase.open>) {
  db.inner
    .prepare("INSERT INTO client_accounts (id, name, slug) VALUES (?, ?, ?)")
    .run("client-1", "Acme Corp", "acme-corp");
  db.inner
    .prepare("INSERT INTO projects (id, name, slug, root_path) VALUES (?, ?, ?, ?)")
    .run("proj-1", "Widget App", "widget-app", "/tmp/widget");
}

function makeHaikuResponse(entries: Array<{ category: string; key: string; value: string; confidence: number }>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      content: [{ text: JSON.stringify(entries) }],
    }),
  };
}

// ─── isTranscript ───

describe("isTranscript", () => {
  it("detects Zoom-style transcript", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      `[00:${String(i).padStart(2, "0")}:00] Speaker ${i % 3}: This is line ${i} of the transcript discussion`,
    );
    expect(isTranscript(lines.join("\n"))).toBe(true);
  });

  it("detects Otter-style transcript with timestamps", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      `${String(i).padStart(2, "0")}:${String(i * 3 % 60).padStart(2, "0")} John Smith: We need to discuss the project timeline and deliverables`,
    );
    expect(isTranscript(lines.join("\n"))).toBe(true);
  });

  it("detects plain speaker labels", () => {
    const speakers = ["Alice", "Bob", "Charlie"];
    const lines = Array.from({ length: 25 }, (_, i) =>
      `${speakers[i % 3]}: This is a conversation about something important that we need to discuss`,
    );
    expect(isTranscript(lines.join("\n"))).toBe(true);
  });

  it("rejects normal prose as non-transcript", () => {
    const prose = `This is a normal document about software architecture.
It describes the system design in detail.
The architecture uses microservices with event sourcing.
Each service communicates through a message broker.
The data layer uses PostgreSQL with read replicas.
Authentication is handled by a central identity provider.
The frontend is a React SPA with server-side rendering.
Deployment is automated through CI/CD pipelines.
Monitoring uses Prometheus and Grafana dashboards.
Logging is centralized through ELK stack.
The API gateway handles rate limiting and auth.
Cache invalidation uses pub/sub patterns.`;
    expect(isTranscript(prose)).toBe(false);
  });

  it("rejects short content", () => {
    expect(isTranscript("Speaker 1: Hello\nSpeaker 2: Hi")).toBe(false);
  });

  it("handles Google Meet format", () => {
    const lines = Array.from({ length: 20 }, (_, i) =>
      `(${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}) Meeting Participant: This is my contribution to the discussion about the project roadmap`,
    );
    expect(isTranscript(lines.join("\n"))).toBe(true);
  });
});

// ─── ExtractionPipeline ───

describe("ExtractionPipeline", () => {
  let tmpDir: string;
  let wsDb: ReturnType<typeof WorkspaceDatabase.open>;
  let repo: ContextRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-pipeline-test-"));
    wsDb = WorkspaceDatabase.open(join(tmpDir, "workspace.db"));
    seedDb(wsDb);
    repo = new ContextRepository(wsDb.inner);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    wsDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("extracts knowledge on happy path", async () => {
    const mockResponse = makeHaikuResponse([
      { category: "business", key: "pain_points", value: "Manual invoicing takes 3 hours daily", confidence: 0.95 },
      { category: "technical", key: "tech_stack", value: "Legacy PHP monolith", confidence: 0.85 },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as unknown as Response);

    // Create pipeline BEFORE adding items to avoid constructor re-queue picking them up
    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Discovery Notes", content: "Client uses manual invoicing on PHP system" },
    );

    pipeline.enqueue(item.id);

    // Wait for async processing
    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("extracted");
    }, { timeout: 5000 });

    const knowledge = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
    expect(knowledge).toHaveLength(2);
    expect(knowledge.some((k) => k.key === "pain_points")).toBe(true);
  });

  it("leaves status as stored when no API key", async () => {
    const pipeline = new ExtractionPipeline(wsDb.inner, () => null);

    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "No key test", content: "Some content to extract from" },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("stored");
    }, { timeout: 5000 });
  });

  it("truncates content over 100KB before extraction", async () => {
    let capturedBody: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
      capturedBody = opts?.body as string;
      return makeHaikuResponse([]) as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const bigContent = "x".repeat(150 * 1024);
    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Big doc", content: bigContent },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).not.toBe("queued");
      expect(updated!.extractionStatus).not.toBe("extracting");
    }, { timeout: 5000 });

    // The body sent to fetch should contain truncated content (100KB, not 150KB)
    expect(capturedBody).toBeTruthy();
    const parsed = JSON.parse(capturedBody!);
    const promptContent = parsed.messages[0].content;
    // The content sent should be <= 100KB + prompt overhead
    expect(promptContent.length).toBeLessThan(bigContent.length);
  });

  it("resets stranded items on startup reconciliation", async () => {
    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Stranded", content: "stuck in extracting" },
    );
    repo.updateExtractionStatus(item.id, "extracting");

    // Creating the pipeline triggers reconciliation: extracting → queued → re-enqueued → processed
    // With no API key, processed items end up as 'stored'
    const _pipeline = new ExtractionPipeline(wsDb.inner, () => null);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("stored");
    }, { timeout: 5000 });
  });

  it("handles 429 rate limit with backoff", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "0" }),
          json: async () => ({ error: "rate_limited" }),
        } as unknown as Response;
      }
      return makeHaikuResponse([
        { category: "business", key: "test", value: "Retried successfully", confidence: 0.8 },
      ]) as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Rate test", content: "Content for rate limit test" },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("extracted");
    }, { timeout: 10000 });

    expect(callCount).toBe(2);
  });

  it("handles 5xx server error with retry", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          headers: new Headers(),
          json: async () => ({ error: "internal" }),
        } as unknown as Response;
      }
      return makeHaikuResponse([
        { category: "technical", key: "retry", value: "Recovered from 500", confidence: 0.7 },
      ]) as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Server error", content: "Content for 5xx test" },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("extracted");
    }, { timeout: 10000 });

    expect(callCount).toBe(2);
  });

  it("marks as failed on malformed JSON response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [{ text: "This is not JSON at all, just plain text response" }],
      }),
    } as unknown as Response);

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Malformed", content: "Content that returns bad JSON" },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("failed");
    }, { timeout: 5000 });
  });

  it("marks as failed on empty response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ content: [] }),
    } as unknown as Response);

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Empty", content: "Content but empty response" },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      const updated = repo.getItem(item.id);
      expect(updated!.extractionStatus).toBe("failed");
    }, { timeout: 5000 });
  });

  it("respects max 3 concurrent extractions", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 50));
      concurrentCount--;
      return makeHaikuResponse([
        { category: "business", key: "test", value: "fact", confidence: 0.8 },
      ]) as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    // Create 5 items AFTER pipeline to avoid constructor re-queue
    const items = Array.from({ length: 5 }, (_, i) =>
      repo.addItem(
        { entityType: "project", entityId: "proj-1" },
        { itemType: "text_note", title: `Item ${i}`, content: `Content for item ${i}` },
      ),
    );

    for (const item of items) {
      pipeline.enqueue(item.id);
    }

    await vi.waitFor(() => {
      const allDone = items.every((item) => {
        const updated = repo.getItem(item.id);
        return updated!.extractionStatus === "extracted";
      });
      expect(allDone).toBe(true);
    }, { timeout: 10000 });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it("does not double-queue the same item in pending queue", async () => {
    // Use a slow mock — fills all 3 active slots, leaving subsequent items in queue
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return makeHaikuResponse([]) as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    // Create 4 items — 3 will go active, 1 stays in queue
    const items = Array.from({ length: 4 }, (_, i) =>
      repo.addItem(
        { entityType: "client", entityId: "client-1" },
        { itemType: "text_note", title: `Item ${i}`, content: `Content ${i}` },
      ),
    );

    for (const item of items) {
      pipeline.enqueue(item.id);
    }

    // 3 active + 1 in queue
    expect(pipeline.activeExtractions).toBe(3);
    expect(pipeline.queueSize).toBe(1);

    // Enqueue items[3] again — it's already in the queue, should be deduped
    pipeline.enqueue(items[3].id);
    expect(pipeline.queueSize).toBe(1); // Still 1, not 2

    // Wait for all to complete
    await vi.waitFor(() => {
      expect(pipeline.queueSize + pipeline.activeExtractions).toBe(0);
    }, { timeout: 5000 });
  });
});
