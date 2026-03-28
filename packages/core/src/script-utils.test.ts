import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, chmod, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AbsolutePath } from "./common";
import { execScriptWithJsonInput } from "./script-utils";

let tmpDir: string;

async function createScript(name: string, content: string): Promise<AbsolutePath> {
  const path = join(tmpDir, name);
  await writeFile(path, content, "utf-8");
  await chmod(path, 0o755);
  return path as AbsolutePath;
}

describe("execScriptWithJsonInput timeout", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "prism-timeout-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("completes normally within timeout", async () => {
    const script = await createScript(
      "fast.sh",
      '#!/bin/bash\nread input\necho "OK: $input"',
    );
    const result = await execScriptWithJsonInput(script, [], { test: true }, 10_000);
    expect(result).toContain("OK:");
  });

  it("rejects with timeout error when script exceeds timeout", async () => {
    const script = await createScript(
      "slow.sh",
      "#!/bin/bash\nread input\nsleep 60\necho done",
    );

    await expect(
      execScriptWithJsonInput(script, [], { test: true }, 1_000),
    ).rejects.toThrow(/timed out after 1000ms/i);
  });

  it("includes script path in timeout error message", async () => {
    const script = await createScript(
      "hanging.sh",
      "#!/bin/bash\nread input\nsleep 60",
    );

    try {
      await execScriptWithJsonInput(script, [], {}, 1_000);
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("hanging.sh");
      expect((err as Error).message).toContain("timed out");
    }
  });

  it("uses default 30s timeout when not specified", async () => {
    // Just verify the function signature accepts no timeout param
    const script = await createScript(
      "echo.sh",
      '#!/bin/bash\nread input\necho "$input"',
    );
    // This should complete well within the default 30s
    const result = await execScriptWithJsonInput(script, [], { hello: "world" });
    expect(result).toBeTruthy();
  });
});
