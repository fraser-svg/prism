import { describe, it, expect, afterEach } from "vitest";
import { RuntimeMode, detectRuntimeMode } from "../runtime-mode";

describe("RuntimeMode", () => {
  const originalEnv = process.env.CLAUDE_SKILL_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_SKILL_DIR;
    } else {
      process.env.CLAUDE_SKILL_DIR = originalEnv;
    }
  });

  it("returns SKILL when CLAUDE_SKILL_DIR is set", () => {
    process.env.CLAUDE_SKILL_DIR = "/some/path";
    expect(detectRuntimeMode()).toBe(RuntimeMode.SKILL);
  });

  it("returns HEADLESS when CLAUDE_SKILL_DIR is unset", () => {
    delete process.env.CLAUDE_SKILL_DIR;
    expect(detectRuntimeMode()).toBe(RuntimeMode.HEADLESS);
  });

  it("returns HEADLESS when CLAUDE_SKILL_DIR is empty string", () => {
    process.env.CLAUDE_SKILL_DIR = "";
    expect(detectRuntimeMode()).toBe(RuntimeMode.HEADLESS);
  });
});
