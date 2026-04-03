import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskNode, EntityId, RelativePath, ProviderCapability } from "@prism/core";
import type { ProviderAdapter, TaskResult, ExecutionContext } from "@prism/execution";
import type { IntegrationCabinet, HealthResult } from "../../../workspace/src/integration-cabinet";
import { RuntimeMode } from "@prism/execution";
import { ModelRouter, resolveCapabilities, ROUTING_TABLE, ROUTE_HINT_MAP } from "../model-router";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(overrides?: Partial<TaskNode>): TaskNode {
  return {
    id: "task-1" as EntityId,
    title: "Test task",
    description: "Do something",
    ownerType: "agent",
    status: "ready",
    dependsOn: [],
    verificationRequirements: [],
    artifactsTouched: [] as RelativePath[],
    ...overrides,
  };
}

function makeContext(): ExecutionContext {
  return {
    projectRoot: "/tmp/test",
    filesToRead: [],
    constraints: "",
    sharedContext: "",
  };
}

function makeAdapter(
  providerId: string,
  caps: ProviderCapability[],
  executeResult?: Partial<TaskResult>,
): ProviderAdapter {
  return {
    providerId: providerId as any,
    displayName: `Mock ${providerId}`,
    capabilities: () => caps,
    execute: vi.fn(async () => ({
      status: "success" as const,
      fileManifest: ["out.ts"],
      output: "done",
      ...executeResult,
    })),
  };
}

function makeCabinet(healthResults?: Record<string, HealthResult>): IntegrationCabinet {
  return {
    ensureRegistered: vi.fn(),
    checkHealth: vi.fn(async (provider: string) => {
      if (healthResults && healthResults[provider]) {
        return healthResults[provider];
      }
      return { status: "connected", message: "ok" } as HealthResult;
    }),
    registerHealthAdapter: vi.fn(),
  } as unknown as IntegrationCabinet;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveCapabilities", () => {
  it("uses task.capabilities when present", () => {
    const task = makeTask({ capabilities: ["reasoning", "verification"] });
    expect(resolveCapabilities(task)).toEqual(["reasoning", "verification"]);
  });

  it("maps routeHint to capabilities as fallback", () => {
    const task = makeTask({ routeHint: "visual" });
    expect(resolveCapabilities(task)).toEqual(["visual_design"]);
  });

  it("maps screen routeHint to visual_design", () => {
    const task = makeTask({ routeHint: "screen" });
    expect(resolveCapabilities(task)).toEqual(["visual_design"]);
  });

  it("maps backend routeHint to code_generation", () => {
    const task = makeTask({ routeHint: "backend" });
    expect(resolveCapabilities(task)).toEqual(["code_generation"]);
  });

  it("defaults to code_generation when no capabilities or routeHint", () => {
    const task = makeTask();
    expect(resolveCapabilities(task)).toEqual(["code_generation"]);
  });
});

describe("ModelRouter", () => {
  let router: ModelRouter;
  let cabinet: IntegrationCabinet;

  beforeEach(() => {
    cabinet = makeCabinet();
    router = new ModelRouter(cabinet, RuntimeMode.HEADLESS);
  });

  it("routes to primary provider when healthy", async () => {
    const anthropic = makeAdapter("anthropic", ["code_generation"]);
    router.registerAdapter(anthropic);

    const result = await router.route(
      makeTask({ capabilities: ["code_generation"] }),
      makeContext(),
    );

    expect(result.status).toBe("success");
    expect(anthropic.execute).toHaveBeenCalled();
  });

  it("falls back when primary is unhealthy", async () => {
    cabinet = makeCabinet({
      anthropic: { status: "unavailable", message: "down" },
      google: { status: "connected", message: "ok" },
    });
    router = new ModelRouter(cabinet, RuntimeMode.HEADLESS);

    const anthropic = makeAdapter("anthropic", ["code_generation"]);
    const google = makeAdapter("google", ["code_generation"]);
    router.registerAdapter(anthropic);
    router.registerAdapter(google);

    const result = await router.route(
      makeTask({ capabilities: ["code_generation"] }),
      makeContext(),
    );

    expect(result.status).toBe("success");
    expect(anthropic.execute).not.toHaveBeenCalled();
    expect(google.execute).toHaveBeenCalled();
  });

  it("returns failed when all providers are down", async () => {
    cabinet = makeCabinet({
      anthropic: { status: "unavailable", message: "down" },
      google: { status: "unavailable", message: "down" },
    });
    router = new ModelRouter(cabinet, RuntimeMode.HEADLESS);

    router.registerAdapter(makeAdapter("anthropic", ["code_generation"]));
    router.registerAdapter(makeAdapter("google", ["code_generation"]));

    const result = await router.route(
      makeTask({ capabilities: ["code_generation"] }),
      makeContext(),
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("No healthy provider");
  });

  it("returns skipped for anthropic tasks in SKILL mode", async () => {
    router = new ModelRouter(cabinet, RuntimeMode.SKILL);
    router.registerAdapter(makeAdapter("anthropic", ["reasoning"]));

    const result = await router.route(
      makeTask({ capabilities: ["reasoning"] }),
      makeContext(),
    );

    expect(result.status).toBe("skipped");
  });

  it("routes non-anthropic tasks normally in SKILL mode", async () => {
    router = new ModelRouter(cabinet, RuntimeMode.SKILL);
    const stitch = makeAdapter("stitch", ["visual_design"]);
    const google = makeAdapter("google", ["visual_design"]);
    router.registerAdapter(stitch);
    router.registerAdapter(google);

    const result = await router.route(
      makeTask({ capabilities: ["visual_design"] }),
      makeContext(),
    );

    expect(result.status).toBe("success");
    expect(stitch.execute).toHaveBeenCalled();
  });

  it("treats health check timeout as unavailable", async () => {
    // Create a cabinet that hangs on health check
    const slowCabinet = {
      ensureRegistered: vi.fn(),
      checkHealth: vi.fn(
        () => new Promise<HealthResult>((resolve) => setTimeout(() => resolve({ status: "connected", message: "ok" }), 10_000)),
      ),
      registerHealthAdapter: vi.fn(),
    } as unknown as IntegrationCabinet;

    router = new ModelRouter(slowCabinet, RuntimeMode.HEADLESS);
    router.registerAdapter(makeAdapter("anthropic", ["tool_use"]));

    const result = await router.route(
      makeTask({ capabilities: ["tool_use"] }),
      makeContext(),
    );

    // tool_use has no fallback, so if primary times out → failed
    expect(result.status).toBe("failed");
    expect(result.error).toContain("No healthy provider");
  }, 10_000);

  it("returns failed for unknown capability", async () => {
    const result = await router.route(
      makeTask({ capabilities: ["unknown_thing" as ProviderCapability] }),
      makeContext(),
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Unknown capability");
  });

  it("uses health cache on subsequent calls", async () => {
    router.registerAdapter(makeAdapter("anthropic", ["code_generation"]));

    await router.route(makeTask({ capabilities: ["code_generation"] }), makeContext());
    await router.route(makeTask({ capabilities: ["code_generation"] }), makeContext());

    // checkHealth should only be called once (cached)
    expect(cabinet.checkHealth).toHaveBeenCalledTimes(1);
  });

  it("lazy-registers providers with cabinet on registerAdapter", () => {
    const adapter = makeAdapter("anthropic", ["reasoning"]);
    router.registerAdapter(adapter);

    expect(cabinet.ensureRegistered).toHaveBeenCalledWith("anthropic", "default");
  });
});
