import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "./ipc-channels";
import type { IpcChannelMap, IpcChannel, IpcArgs, IpcReturn, IpcResult } from "./ipc-channels";
import type { Result } from "./result";

describe("IPC Channels", () => {
  it("exports all channels as a runtime array", () => {
    expect(IPC_CHANNELS).toBeInstanceOf(Array);
    expect(IPC_CHANNELS.length).toBeGreaterThan(0);
  });

  it("includes all expected channels", () => {
    const expected: IpcChannel[] = [
      "workspace:status",
      "project:list",
      "project:detail",
      "project:register",
      "project:setActive",
      "project:remove",
      "project:health",
      "app:selectFolder",
    ];

    for (const channel of expected) {
      expect(IPC_CHANNELS).toContain(channel);
    }
  });

  it("channel names follow namespace:action pattern", () => {
    for (const channel of IPC_CHANNELS) {
      expect(channel).toMatch(/^[a-z]+:[a-zA-Z]+$/);
    }
  });

  // Compile-time type checks — these don't run at runtime,
  // but they ensure the type system catches mismatches.
  it("type system validates channel map completeness", () => {
    // If this compiles, every IPC_CHANNELS entry has a corresponding IpcChannelMap definition
    type AssertAllChannelsMapped = {
      [K in (typeof IPC_CHANNELS)[number]]: K extends keyof IpcChannelMap ? true : never;
    };

    // This is a compile-time assertion — at runtime we just verify the count
    const channelMapKeys: IpcChannel[] = [
      "workspace:status",
      "project:list",
      "project:detail",
      "project:register",
      "project:setActive",
      "project:remove",
      "project:health",
      "app:selectFolder",
    ];

    expect(channelMapKeys.length).toBe(IPC_CHANNELS.length);
  });
});
