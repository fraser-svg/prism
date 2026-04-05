import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceDatabase } from "./workspace-database";
import { ContextRepository } from "./context-repository";
import { ExtractionPipeline, isTranscript, chunkContent } from "./extraction-pipeline";

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

    // Verify recompileSummary also ran (summary should be upserted)
    const summary = repo.getSummary({ entityType: "project", entityId: "proj-1" });
    expect(summary).not.toBeNull();
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

    // 1: extraction (429), 2: extraction retry (success), 3: recompileSummary→compileSummary
    expect(callCount).toBe(3);
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

    // 1: extraction (500), 2: extraction retry (success), 3: recompileSummary→compileSummary
    expect(callCount).toBe(3);
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
    // No API key → processItem resolves immediately (sets "stored"), no fetch calls
    // This isolates the queue deduplication logic from extraction timing
    const pipeline = new ExtractionPipeline(wsDb.inner, () => null);

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

    // Synchronously: 3 active slots filled, 1 in queue (microtasks haven't run yet)
    expect(pipeline.activeExtractions).toBe(3);
    expect(pipeline.queueSize).toBe(1);

    // Enqueue items[3] again — it's already in the queue, should be deduped
    pipeline.enqueue(items[3].id);
    expect(pipeline.queueSize).toBe(1); // Still 1, not 2

    // Wait for all to complete (microtasks resolve processItem calls)
    await vi.waitFor(() => {
      expect(pipeline.queueSize + pipeline.activeExtractions).toBe(0);
    }, { timeout: 5000 });
  });

  // ─── T1-T3: compileSummary / recompileSummary ───

  it("T1: recompileSummary generates narrative summary via Haiku", async () => {
    let capturedPrompt = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
      const body = JSON.parse(opts?.body as string);
      capturedPrompt = body.messages[0].content;
      // Return narrative text (not JSON array)
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          content: [{ text: "# Client Profile\n\nAcme Corp is a SaaS company..." }],
        }),
      } as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    // Seed some knowledge
    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Notes", content: "Acme is a SaaS company" },
    );
    repo.insertKnowledge(item.id, [
      { category: "business", key: "industry", value: "SaaS platform", confidence: 0.9 },
      { category: "technical", key: "stack", value: "React + Node.js", confidence: 0.85 },
    ]);

    await pipeline.recompileSummary({ entityType: "client", entityId: "client-1" });

    // Should have called Haiku with a synthesis prompt
    expect(capturedPrompt).toContain("client profile");
    expect(capturedPrompt).toContain("SaaS platform");
    expect(capturedPrompt).toContain("React + Node.js");

    // Summary should be upserted
    const summary = repo.getSummary({ entityType: "client", entityId: "client-1" });
    expect(summary).not.toBeNull();
    expect(summary!.content).toContain("Acme Corp");
  });

  it("T2: recompileSummary falls back to buildSummary when no API key", async () => {
    const pipeline = new ExtractionPipeline(wsDb.inner, () => null);

    // Seed knowledge
    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Notes", content: "some content" },
    );
    repo.insertKnowledge(item.id, [
      { category: "business", key: "model", value: "Subscription billing", confidence: 0.9 },
    ]);

    await pipeline.recompileSummary({ entityType: "project", entityId: "proj-1" });

    const summary = repo.getSummary({ entityType: "project", entityId: "proj-1" });
    expect(summary).not.toBeNull();
    expect(summary!.content).toContain("Subscription billing");
    expect(summary!.content).toContain("# Project Brief");
  });

  it("T3: recompileSummary excludes flagged knowledge from summary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        content: [{ text: "# Profile\n\nSummary based on good facts only" }],
      }),
    } as unknown as Response);

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Notes", content: "content" },
    );
    const knowledge = repo.insertKnowledge(item.id, [
      { category: "business", key: "good", value: "Keep this", confidence: 0.9 },
      { category: "business", key: "bad", value: "Flag this", confidence: 0.8 },
    ]);

    // Flag one entry
    repo.flagKnowledge(knowledge[1].id);

    let capturedPrompt = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, opts) => {
      const body = JSON.parse(opts?.body as string);
      capturedPrompt = body.messages[0].content;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ content: [{ text: "# Profile\nOnly good facts" }] }),
      } as unknown as Response;
    });

    await pipeline.recompileSummary({ entityType: "client", entityId: "client-1" });

    expect(capturedPrompt).toContain("Keep this");
    expect(capturedPrompt).not.toContain("Flag this");
  });

  // ─── T19: clearKnowledgeForItem (idempotent re-extract) ───

  it("T19: re-extraction clears old knowledge before inserting new", async () => {
    let extractionCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      extractionCount++;
      const entries = extractionCount === 1
        ? [{ category: "business", key: "v1", value: "First extraction", confidence: 0.9 }]
        : [{ category: "technical", key: "v2", value: "Second extraction", confidence: 0.85 }];
      return makeHaikuResponse(entries) as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Re-extract test", content: "Content for re-extraction" },
    );

    // First extraction
    pipeline.enqueue(item.id);
    await vi.waitFor(() => {
      expect(repo.getItem(item.id)!.extractionStatus).toBe("extracted");
    }, { timeout: 5000 });

    const firstKnowledge = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
    expect(firstKnowledge.some((k) => k.key === "v1")).toBe(true);

    // Re-extract — should clear old knowledge
    repo.updateExtractionStatus(item.id, "queued");
    pipeline.enqueue(item.id);
    await vi.waitFor(() => {
      const k = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
      return expect(k.some((e) => e.key === "v2")).toBe(true);
    }, { timeout: 5000 });

    const finalKnowledge = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
    // Old v1 knowledge should be gone
    expect(finalKnowledge.some((k) => k.key === "v1")).toBe(false);
    expect(finalKnowledge.some((k) => k.key === "v2")).toBe(true);
  });

  // ─── T27-T30: Fixes ───

  it("T27: failure split — knowledge persists even if compileSummary fails", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // Extraction succeeds
        return makeHaikuResponse([
          { category: "business", key: "fact", value: "Important fact", confidence: 0.9 },
        ]) as unknown as Response;
      }
      // compileSummary fails
      return { ok: false, status: 500, headers: new Headers(), json: async () => ({}) } as unknown as Response;
    });

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Failure split", content: "Content for failure test" },
    );

    pipeline.enqueue(item.id);

    await vi.waitFor(() => {
      expect(repo.getItem(item.id)!.extractionStatus).toBe("extracted");
    }, { timeout: 5000 });

    // Knowledge should persist despite summary failure
    const knowledge = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
    expect(knowledge.length).toBeGreaterThan(0);
    expect(knowledge[0].value).toBe("Important fact");
  });

  it("T28: recompileSummary falls back to buildSummary on Haiku API error", async () => {
    // First call succeeds (for any lingering extraction), subsequent fail
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({ error: "service_unavailable" }),
    } as unknown as Response);

    const pipeline = new ExtractionPipeline(wsDb.inner, () => "sk-test-key");

    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Notes", content: "content" },
    );
    repo.insertKnowledge(item.id, [
      { category: "business", key: "model", value: "B2B SaaS", confidence: 0.9 },
    ]);

    await pipeline.recompileSummary({ entityType: "client", entityId: "client-1" });

    // Should have fallen back to buildSummary
    const summary = repo.getSummary({ entityType: "client", entityId: "client-1" });
    expect(summary).not.toBeNull();
    expect(summary!.content).toContain("B2B SaaS");
    expect(summary!.content).toContain("# Client Profile");
  });
});

// ─── T11-T18: chunkContent ───

describe("chunkContent", () => {
  it("T11: returns single chunk for content under 50KB", () => {
    const content = "x".repeat(1000);
    const chunks = chunkContent(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(content);
  });

  it("T12: returns empty array for empty/whitespace content", () => {
    expect(chunkContent("")).toHaveLength(0);
    expect(chunkContent("   ")).toHaveLength(0);
    expect(chunkContent("\n\n")).toHaveLength(0);
  });

  it("T13: splits on paragraph boundaries first", () => {
    const para1 = "a".repeat(30 * 1024);
    const para2 = "b".repeat(30 * 1024);
    const content = para1 + "\n\n" + para2;
    const chunks = chunkContent(content);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("T14: falls back to line boundaries for oversized paragraphs", () => {
    // One big paragraph with line breaks but no paragraph breaks
    const lines = Array.from({ length: 20 }, (_, i) => "line-" + i + "-" + "x".repeat(5 * 1024));
    const content = lines.join("\n");
    const chunks = chunkContent(content);
    // Each chunk should be ≤ 50KB
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50 * 1024);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("T15: hard-cuts content with no boundaries", () => {
    const content = "x".repeat(200 * 1024); // 200KB, no newlines
    const chunks = chunkContent(content);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50 * 1024);
    }
    expect(chunks.length).toBe(4); // 200KB / 50KB = 4
  });

  it("T16: caps at MAX_CHUNKS (10) chunks", () => {
    const content = "x".repeat(600 * 1024); // 600KB > 500KB cap
    const chunks = chunkContent(content);
    expect(chunks.length).toBeLessThanOrEqual(10);
  });

  it("T17: preserves all content for content exactly at chunk boundary", () => {
    const content = "x".repeat(50 * 1024); // Exactly 50KB
    const chunks = chunkContent(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(content);
  });

  it("T18: handles mixed paragraph sizes correctly", () => {
    const small = "small paragraph";
    const big = "y".repeat(60 * 1024); // > 50KB, needs line split
    const medium = "z".repeat(20 * 1024);
    const content = [small, big, medium].join("\n\n");
    const chunks = chunkContent(content);
    // All chunks should be ≤ 50KB
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50 * 1024);
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── T5-T6: searchKnowledge (ContextRepository) ───

describe("ContextRepository.searchKnowledge", () => {
  let tmpDir: string;
  let wsDb: ReturnType<typeof WorkspaceDatabase.open>;
  let repo: ContextRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-search-test-"));
    wsDb = WorkspaceDatabase.open(join(tmpDir, "workspace.db"));
    seedDb(wsDb);
    repo = new ContextRepository(wsDb.inner);
  });

  afterEach(async () => {
    wsDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("T5: searchKnowledge scopes results to entity", () => {
    // Add knowledge to two different clients
    const item1 = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Client 1 notes", content: "content" },
    );
    repo.insertKnowledge(item1.id, [
      { category: "business", key: "model", value: "Enterprise subscription platform", confidence: 0.9 },
    ]);

    const item2 = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Project notes", content: "content" },
    );
    repo.insertKnowledge(item2.id, [
      { category: "business", key: "model", value: "Enterprise mobile application", confidence: 0.85 },
    ]);

    // Search scoped to client-1 should only return client-1 knowledge
    const clientResults = repo.searchKnowledge("Enterprise", { entityType: "client", entityId: "client-1" });
    expect(clientResults.length).toBe(1);
    expect(clientResults[0].value).toContain("subscription");

    // Search without scope should return both
    const allResults = repo.searchKnowledge("Enterprise");
    expect(allResults.length).toBe(2);
  });

  it("T6: searchKnowledge returns empty on FTS5 syntax error", () => {
    const item = repo.addItem(
      { entityType: "client", entityId: "client-1" },
      { itemType: "text_note", title: "Notes", content: "content" },
    );
    repo.insertKnowledge(item.id, [
      { category: "business", key: "test", value: "Some value", confidence: 0.9 },
    ]);

    // Malformed FTS5 query — should not throw, returns empty
    const results = repo.searchKnowledge("AND OR NOT {}[]");
    expect(results).toEqual([]);
  });

  it("T6b: searchKnowledge returns empty for blank query", () => {
    expect(repo.searchKnowledge("")).toEqual([]);
    expect(repo.searchKnowledge("   ")).toEqual([]);
  });
});

// ─── T29: clearKnowledgeForItem (ContextRepository) ───

describe("ContextRepository.clearKnowledgeForItem", () => {
  let tmpDir: string;
  let wsDb: ReturnType<typeof WorkspaceDatabase.open>;
  let repo: ContextRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-clear-test-"));
    wsDb = WorkspaceDatabase.open(join(tmpDir, "workspace.db"));
    seedDb(wsDb);
    repo = new ContextRepository(wsDb.inner);
  });

  afterEach(async () => {
    wsDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("T29: clearKnowledgeForItem deletes knowledge for specific item only", () => {
    const item1 = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Item 1", content: "content 1" },
    );
    const item2 = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Item 2", content: "content 2" },
    );

    repo.insertKnowledge(item1.id, [
      { category: "business", key: "k1", value: "From item 1", confidence: 0.9 },
    ]);
    repo.insertKnowledge(item2.id, [
      { category: "technical", key: "k2", value: "From item 2", confidence: 0.85 },
    ]);

    // Clear only item1's knowledge
    const deleted = repo.clearKnowledgeForItem(item1.id);
    expect(deleted).toBe(1);

    // item2's knowledge should remain
    const remaining = repo.getKnowledge({ entityType: "project", entityId: "proj-1" });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe("k2");
  });

  it("T29b: clearKnowledgeForItem returns 0 for item with no knowledge", () => {
    const item = repo.addItem(
      { entityType: "project", entityId: "proj-1" },
      { itemType: "text_note", title: "Empty", content: "no knowledge" },
    );
    expect(repo.clearKnowledgeForItem(item.id)).toBe(0);
  });
});
