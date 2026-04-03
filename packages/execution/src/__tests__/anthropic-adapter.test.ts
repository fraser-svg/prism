import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TaskNode, EntityId, RelativePath } from "@prism/core";
import type { ExecutionContext } from "../provider-adapter";

// Mock the runtime-mode module before importing the adapter
vi.mock("../runtime-mode", () => ({
  RuntimeMode: { SKILL: "skill", HEADLESS: "headless" },
  detectRuntimeMode: vi.fn(() => "headless"),
}));

import { AnthropicAdapter } from "../anthropic-adapter";
import { detectRuntimeMode } from "../runtime-mode";

const mockDetect = vi.mocked(detectRuntimeMode);

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

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    projectRoot: "/tmp/test-project",
    filesToRead: [],
    constraints: "",
    sharedContext: "",
    ...overrides,
  };
}

describe("AnthropicAdapter", () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    adapter = new AnthropicAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns correct capabilities", () => {
    expect(adapter.capabilities()).toEqual([
      "reasoning",
      "code_generation",
      "verification",
      "tool_use",
    ]);
  });

  it("has correct provider identity", () => {
    expect(adapter.providerId).toBe("anthropic");
    expect(adapter.displayName).toBe("Anthropic (Claude)");
  });

  describe("execute() in SKILL mode", () => {
    it("returns skipped status", async () => {
      mockDetect.mockReturnValue("skill" as any);

      const result = await adapter.execute(makeTask(), makeContext());

      expect(result.status).toBe("skipped");
      expect(result.fileManifest).toEqual([]);
      expect(result.output).toBe("");
    });
  });

  describe("execute() in HEADLESS mode", () => {
    beforeEach(() => {
      mockDetect.mockReturnValue("headless" as any);
    });

    it("returns failed when SDK is not installed", async () => {
      // The dynamic import of @anthropic-ai/sdk will fail since it's not installed in test env
      const result = await adapter.execute(makeTask(), makeContext());

      expect(result.status).toBe("failed");
      expect(result.error).toBeDefined();
    });
  });

  describe("estimateCost()", () => {
    it("returns cost estimate based on description length", () => {
      const task = makeTask({ description: "A".repeat(2000) });
      const estimate = adapter.estimateCost(task);

      expect(estimate).not.toBeNull();
      expect(estimate!.inputTokens).toBeGreaterThan(0);
      expect(estimate!.outputTokens).toBeGreaterThan(0);
      expect(estimate!.estimatedCostUsd).toBeGreaterThan(0);
    });

    it("uses minimum token estimate for short descriptions", () => {
      const task = makeTask({ description: "short" });
      const estimate = adapter.estimateCost(task);

      expect(estimate!.inputTokens).toBe(500);
    });
  });
});
