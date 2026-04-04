import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { platform } from "node:os";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:os", () => ({
  platform: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);
const mockedPlatform = vi.mocked(platform);

// Helper to simulate execFile behavior
function mockExecFileResult(stdout: string, code: number | null = 0) {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = callback as (err: Error | null, stdout: string) => void;
    if (code !== 0 && code !== null) {
      const err = Object.assign(new Error("exit"), { code });
      cb(err, stdout);
    } else {
      cb(null, stdout);
    }
    return {} as any;
  });
}

function mockExecFileError(message: string) {
  mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = callback as (err: Error | null, stdout: string) => void;
    cb(new Error(message), "");
    return {} as any;
  });
}

// Re-import selectDirectory fresh for each test group since the module caches platform
async function getSelectDirectory() {
  const mod = await import("../apps/web/server/native-dialog.js");
  return mod.selectDirectory;
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe("native-dialog: macOS", () => {
  beforeEach(() => {
    mockedPlatform.mockReturnValue("darwin");
  });

  it("returns selected path on success", async () => {
    mockExecFileResult("/Users/foxy/projects/my-app/");
    const selectDirectory = await getSelectDirectory();
    const result = await selectDirectory();
    expect(result).toBe("/Users/foxy/projects/my-app");
    expect(mockedExecFile).toHaveBeenCalledWith(
      "osascript",
      expect.any(Array),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns null when user cancels", async () => {
    mockExecFileResult("", 1);
    const selectDirectory = await getSelectDirectory();
    const result = await selectDirectory();
    expect(result).toBeNull();
  });

  it("throws on osascript failure", async () => {
    mockExecFileError("osascript not found");
    const selectDirectory = await getSelectDirectory();
    await expect(selectDirectory()).rejects.toThrow("osascript not found");
  });
});

describe("native-dialog: Linux", () => {
  beforeEach(() => {
    mockedPlatform.mockReturnValue("linux");
  });

  it("returns selected path on success", async () => {
    // First call: which zenity succeeds. Second call: zenity dialog.
    let callCount = 0;
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      callCount++;
      if (callCount === 1) {
        // which zenity
        cb(null, "/usr/bin/zenity");
      } else {
        // zenity dialog
        cb(null, "/home/user/projects/app");
      }
      return {} as any;
    });

    const selectDirectory = await getSelectDirectory();
    const result = await selectDirectory();
    expect(result).toBe("/home/user/projects/app");
  });

  it("returns null when user cancels zenity", async () => {
    let callCount = 0;
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      callCount++;
      if (callCount === 1) {
        cb(null, "/usr/bin/zenity");
      } else {
        const err = Object.assign(new Error("exit"), { code: 1 });
        cb(err, "");
      }
      return {} as any;
    });

    const selectDirectory = await getSelectDirectory();
    const result = await selectDirectory();
    expect(result).toBeNull();
  });

  it("throws when zenity is not installed", async () => {
    mockExecFileError("not found");
    const selectDirectory = await getSelectDirectory();
    await expect(selectDirectory()).rejects.toThrow("zenity is required");
  });
});

describe("native-dialog: Windows", () => {
  beforeEach(() => {
    mockedPlatform.mockReturnValue("win32");
  });

  it("returns selected path on success", async () => {
    mockExecFileResult("C:\\Users\\foxy\\projects\\app");
    const selectDirectory = await getSelectDirectory();
    const result = await selectDirectory();
    expect(result).toBe("C:\\Users\\foxy\\projects\\app");
    expect(mockedExecFile).toHaveBeenCalledWith(
      "powershell",
      expect.any(Array),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns null when user cancels", async () => {
    mockExecFileResult("");
    const selectDirectory = await getSelectDirectory();
    const result = await selectDirectory();
    expect(result).toBeNull();
  });

  it("throws on PowerShell failure with actionable message", async () => {
    mockExecFileError("execution policy violation");
    const selectDirectory = await getSelectDirectory();
    await expect(selectDirectory()).rejects.toThrow("PowerShell folder picker failed");
  });
});

describe("native-dialog: unsupported platform", () => {
  it("throws for unknown platform", async () => {
    mockedPlatform.mockReturnValue("freebsd" as any);
    const selectDirectory = await getSelectDirectory();
    await expect(selectDirectory()).rejects.toThrow("Unsupported platform: freebsd");
  });
});

describe("native-dialog: mutex", () => {
  it("rejects concurrent calls while dialog is open", async () => {
    mockedPlatform.mockReturnValue("darwin");

    // Make execFile hang until we resolve it
    let resolveDialog!: (stdout: string) => void;
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (err: Error | null, stdout: string) => void;
      new Promise<string>((resolve) => { resolveDialog = resolve; }).then((stdout) => {
        cb(null, stdout);
      });
      return {} as any;
    });

    const selectDirectory = await getSelectDirectory();
    const first = selectDirectory();
    await expect(selectDirectory()).rejects.toThrow("already open");

    // Resolve the first dialog so cleanup happens
    resolveDialog("/Users/foxy/projects/app/");
    const result = await first;
    expect(result).toBe("/Users/foxy/projects/app");
  });
});
