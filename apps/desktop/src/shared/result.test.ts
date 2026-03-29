import { describe, it, expect } from "vitest";
import { ok, err, tryCatch } from "./result";
import type { Result, ResultOk, ResultErr } from "./result";

describe("Result", () => {
  describe("ok()", () => {
    it("creates a success result with data", () => {
      const result = ok("hello");
      expect(result.ok).toBe(true);
      expect(result.data).toBe("hello");
    });

    it("works with complex data", () => {
      const data = { id: "1", items: [1, 2, 3] };
      const result = ok(data);
      expect(result.ok).toBe(true);
      expect(result.data).toEqual(data);
    });

    it("works with null data", () => {
      const result = ok(null);
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
    });

    it("works with void/undefined", () => {
      const result = ok(undefined);
      expect(result.ok).toBe(true);
      expect(result.data).toBeUndefined();
    });
  });

  describe("err()", () => {
    it("creates an error result with code and message", () => {
      const result = err("NOT_FOUND", "Project not found");
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.message).toBe("Project not found");
    });

    it("preserves error code and message exactly", () => {
      const result = err("WORKSPACE_STATUS_ERROR", "Database is locked");
      expect(result.error.code).toBe("WORKSPACE_STATUS_ERROR");
      expect(result.error.message).toBe("Database is locked");
    });
  });

  describe("tryCatch()", () => {
    it("returns ok when async function succeeds", async () => {
      const result = await tryCatch(async () => 42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toBe(42);
      }
    });

    it("returns err when async function throws Error", async () => {
      const result = await tryCatch(
        async () => { throw new Error("something broke"); },
        "TEST_ERROR",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("TEST_ERROR");
        expect(result.error.message).toBe("something broke");
      }
    });

    it("returns err when async function throws string", async () => {
      const result = await tryCatch(
        async () => { throw "raw string error"; },
        "RAW_ERROR",
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("RAW_ERROR");
        expect(result.error.message).toBe("raw string error");
      }
    });

    it("uses UNKNOWN_ERROR as default error code", async () => {
      const result = await tryCatch(async () => { throw new Error("oops"); });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("UNKNOWN_ERROR");
      }
    });
  });

  describe("type narrowing", () => {
    it("narrows to ok branch correctly", () => {
      const result: Result<string> = ok("test");
      if (result.ok) {
        // TypeScript should know result.data is string here
        const data: string = result.data;
        expect(data).toBe("test");
      }
    });

    it("narrows to error branch correctly", () => {
      const result: Result<string> = err("ERR", "msg");
      if (!result.ok) {
        // TypeScript should know result.error exists here
        const code: string = result.error.code;
        expect(code).toBe("ERR");
      }
    });
  });
});
