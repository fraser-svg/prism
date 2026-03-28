import { describe, it, expect } from "vitest";
import { checkExecutionIntent } from "./intent-policy";
import type { ExecutionIntent } from "@prism/core";
import type { WorkflowState } from "@prism/core";

function makeState(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    phase: "execute",
    projectId: "proj-1",
    activeSpecId: null,
    approvalsPending: [],
    blockers: [],
    transitionHistory: [],
    ...overrides,
  };
}

describe("checkExecutionIntent", () => {
  it("allows save with no pending approvals", () => {
    const intent: ExecutionIntent = { type: "save", target: "milestone-1", requiresApproval: false };
    const result = checkExecutionIntent(intent, makeState());
    expect(result.allowed).toBe(true);
  });

  it("allows save even with pending approvals (save is non-destructive)", () => {
    const intent: ExecutionIntent = { type: "save", target: "milestone-1", requiresApproval: false };
    const state = makeState({
      approvalsPending: [{ id: "a1", title: "deploy approval", mode: "approval_required", reason: "production" }],
    });
    const result = checkExecutionIntent(intent, state);
    expect(result.allowed).toBe(true);
  });

  it("blocks push when approvals are pending", () => {
    const intent: ExecutionIntent = { type: "push", target: "main", requiresApproval: false };
    const state = makeState({
      approvalsPending: [{ id: "a1", title: "push approval", mode: "approval_required", reason: "external" }],
    });
    const result = checkExecutionIntent(intent, state);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("pending");
  });

  it("allows push with no pending approvals", () => {
    const intent: ExecutionIntent = { type: "push", target: "main", requiresApproval: false };
    const result = checkExecutionIntent(intent, makeState());
    expect(result.allowed).toBe(true);
  });

  it("blocks deploy when approvals are pending", () => {
    const intent: ExecutionIntent = { type: "deploy", target: "production", requiresApproval: false };
    const state = makeState({
      approvalsPending: [{ id: "a1", title: "deploy", mode: "approval_required", reason: "prod" }],
    });
    const result = checkExecutionIntent(intent, state);
    expect(result.allowed).toBe(false);
  });

  it("blocks delete when approvals are pending", () => {
    const intent: ExecutionIntent = { type: "delete", target: "resource", requiresApproval: false };
    const state = makeState({
      approvalsPending: [{ id: "a1", title: "delete", mode: "approval_required", reason: "destructive" }],
    });
    const result = checkExecutionIntent(intent, state);
    expect(result.allowed).toBe(false);
  });

  it("blocks any intent with requiresApproval when approvals pending", () => {
    const intent: ExecutionIntent = { type: "save", target: "special", requiresApproval: true };
    const state = makeState({
      approvalsPending: [{ id: "a1", title: "special", mode: "approval_required", reason: "custom" }],
    });
    const result = checkExecutionIntent(intent, state);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("requires approval");
  });
});
