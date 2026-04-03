import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FetchTransport } from "./transport";

describe("FetchTransport", () => {
  const transport = new FetchTransport();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: Partial<Response>) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ data: {} }),
      ...response,
    });
  }

  it("returns data on successful response", async () => {
    mockFetch({
      ok: true,
      json: () => Promise.resolve({ data: { projects: [], clients: [] } }),
    });

    const result = await transport.listPortfolio();
    expect(result).toEqual({ data: { projects: [], clients: [] } });
  });

  it("returns error on network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await transport.listPortfolio();
    expect(result.error).toBe("Network error — is the server running?");
    expect(result.data).toBeUndefined();
  });

  it("returns error on HTTP 500 with JSON body", async () => {
    mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ error: "Database connection failed" }),
    });

    const result = await transport.listPortfolio();
    expect(result.error).toBe("Database connection failed");
  });

  it("returns error on HTTP 500 with non-JSON body", async () => {
    mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    });

    const result = await transport.listPortfolio();
    expect(result.error).toBe("HTTP 500: Internal Server Error");
  });

  it("returns error when successful response is not JSON", async () => {
    mockFetch({
      ok: true,
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });

    const result = await transport.listPortfolio();
    expect(result.error).toBe("Invalid response from server");
  });

  it("sends correct method and body for POST requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "c1" } }),
    });
    globalThis.fetch = fetchMock;

    await transport.createClient("Acme", "Notes");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Acme", notes: "Notes" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("sends correct method and body for PATCH requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: {} }),
    });
    globalThis.fetch = fetchMock;

    await transport.updateClient("c1", { name: "Updated" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/clients/c1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      }),
    );
  });

  it("constructs correct URL for project pipeline", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { stages: [] } }),
    });
    globalThis.fetch = fetchMock;

    await transport.getProjectPipeline("proj-123");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/proj-123/pipeline",
      expect.any(Object),
    );
  });
});
