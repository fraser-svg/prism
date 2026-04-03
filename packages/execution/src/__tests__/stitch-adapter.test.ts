import { describe, it, expect, vi, afterEach } from "vitest";
import type { TaskNode, EntityId, RelativePath } from "@prism/core";
import type { ExecutionContext } from "../provider-adapter";

vi.mock("../runtime-mode", () => ({
  RuntimeMode: { SKILL: "skill", HEADLESS: "headless" },
  detectRuntimeMode: vi.fn(() => "skill"),
}));

import { StitchAdapter } from "../stitch-adapter";
import { detectRuntimeMode } from "../runtime-mode";

const mockDetect = vi.mocked(detectRuntimeMode);

function makeTask(overrides?: Partial<TaskNode>): TaskNode {
  return {
    id: "task-stitch-1" as EntityId,
    title: "Design a screen",
    description: "Create a login screen",
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

describe("StitchAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has correct provider identity", () => {
    const adapter = new StitchAdapter();
    expect(adapter.providerId).toBe("stitch");
    expect(adapter.displayName).toBe("Google Stitch");
  });

  it("has visual_design capability", () => {
    const adapter = new StitchAdapter();
    expect(adapter.capabilities()).toEqual(["visual_design"]);
  });

  it("returns skipped in SKILL mode", async () => {
    mockDetect.mockReturnValue("skill" as any);
    const adapter = new StitchAdapter();
    const result = await adapter.execute(makeTask(), makeContext());

    expect(result.status).toBe("skipped");
  });

  it("returns failed in HEADLESS mode", async () => {
    mockDetect.mockReturnValue("headless" as any);
    const adapter = new StitchAdapter();
    const result = await adapter.execute(makeTask(), makeContext());

    expect(result.status).toBe("failed");
    expect(result.error).toContain("SKILL mode");
  });

  it("estimateCost returns null (service provider)", () => {
    const adapter = new StitchAdapter();
    expect(adapter.estimateCost(makeTask())).toBeNull();
  });
});
