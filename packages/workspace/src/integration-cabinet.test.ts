import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "@prism/core";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { IntegrationCabinet } from "./integration-cabinet";
import type { HealthResult } from "./integration-cabinet";

describe("IntegrationCabinet", () => {
  let tmpDir: string;
  let ctx: WorkspaceContext;
  let cabinet: IntegrationCabinet;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-test-cabinet-"));
    const home = join(tmpDir, ".prism") as AbsolutePath;
    ctx = WorkspaceManager.initialize(home);
    cabinet = new IntegrationCabinet(ctx.db.inner);
  });

  afterEach(async () => {
    ctx.db.close();
    await rm(tmpDir, { recursive: true });
  });

  it("registers a new integration", () => {
    const integration = cabinet.register("github", "default", { org: "acme" });
    expect(integration.provider).toBe("github");
    expect(integration.instanceLabel).toBe("default");
    expect(integration.status).toBe("disconnected");
    expect(integration.config).toEqual({ org: "acme" });
  });

  it("registers same provider with different instance labels", () => {
    const work = cabinet.register("github", "work");
    const personal = cabinet.register("github", "personal");

    expect(work.id).not.toBe(personal.id);
    expect(work.instanceLabel).toBe("work");
    expect(personal.instanceLabel).toBe("personal");
  });

  it("lists all integrations", () => {
    cabinet.register("github", "default");
    cabinet.register("linear", "default");

    const all = cabinet.list();
    expect(all).toHaveLength(2);
  });

  it("rejects duplicate provider+instance_label", () => {
    cabinet.register("github", "default");
    expect(() => cabinet.register("github", "default")).toThrow();
  });

  it("removes an integration", () => {
    cabinet.register("github", "default");
    cabinet.remove("github", "default");

    const all = cabinet.list();
    expect(all).toHaveLength(0);
  });

  it("health check with mock adapter", async () => {
    cabinet.register("github", "default");
    cabinet.registerHealthAdapter("github", async () => ({
      status: "connected",
      message: "OK",
    }));

    const result = await cabinet.checkHealth("github", "default");
    expect(result.status).toBe("connected");
  });

  it("health check without adapter returns stored status", async () => {
    cabinet.register("github", "default");

    const result = await cabinet.checkHealth("github", "default");
    expect(result.status).toBe("disconnected");
    expect(result.message).toBe("No health adapter registered");
  });

  it("health check handles timeout", async () => {
    cabinet.register("github", "default");
    cabinet.registerHealthAdapter(
      "github",
      () => new Promise<HealthResult>((resolve) => setTimeout(() => resolve({ status: "connected", message: "OK" }), 10000)),
    );

    const result = await cabinet.checkHealth("github", "default");
    expect(result.status).toBe("unavailable");
    expect(result.message).toBe("Health check timeout");
  }, 10000);

  it("health check for nonexistent integration", async () => {
    const result = await cabinet.checkHealth("nonexistent", "default");
    expect(result.status).toBe("unavailable");
  });

  it("checkAllHealth with mixed results", async () => {
    cabinet.register("github", "default");
    cabinet.register("linear", "default");

    cabinet.registerHealthAdapter("github", async () => ({
      status: "connected",
      message: "OK",
    }));
    // linear has no adapter

    const results = await cabinet.checkAllHealth();
    expect(results).toHaveLength(2);

    const github = results.find((r) => r.provider === "github");
    const linear = results.find((r) => r.provider === "linear");
    expect(github?.result.status).toBe("connected");
    expect(linear?.result.message).toBe("No health adapter registered");
  });

  it("stores scope as array", () => {
    const integration = cabinet.register(
      "github",
      "default",
      {},
      ["repo", "user"],
    );
    expect(integration.scope).toEqual(["repo", "user"]);
  });
});
