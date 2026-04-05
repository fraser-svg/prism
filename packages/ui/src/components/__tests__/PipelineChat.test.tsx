// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// PipelineChat is prop-driven, no store mock needed
const { PipelineChat } = await import("../PipelineChat");

import type { ConversationMessage, PipelineSessionCost } from "../../types";

const defaultCost: PipelineSessionCost = {
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "proj-1",
    phase: "discovery",
    messages: [] as ConversationMessage[],
    cost: defaultCost,
    autopilot: false,
    statusMessage: null as string | null,
    error: null as string | null,
    onSendMessage: vi.fn(),
    onToggleAutopilot: vi.fn(),
    ...overrides,
  };
}

function renderChat(overrides: Record<string, unknown> = {}) {
  return render(<PipelineChat {...defaultProps(overrides)} />);
}

afterEach(cleanup);

describe("PipelineChat", () => {
  it("renders user and assistant messages in the list", () => {
    const messages: ConversationMessage[] = [
      { role: "user", content: "Hello from the user", timestamp: "2026-04-05T00:00:00Z" },
      { role: "assistant", content: "Hello from the assistant", timestamp: "2026-04-05T00:00:01Z" },
    ];
    renderChat({ messages });
    expect(screen.getByText("Hello from the user")).toBeTruthy();
    expect(screen.getByText("Hello from the assistant")).toBeTruthy();
  });

  it("disables textarea when statusMessage is non-null", () => {
    renderChat({ statusMessage: "Thinking..." });
    const textarea = screen.getByPlaceholderText("Type a message... (Cmd+Enter to send)");
    expect(textarea).toHaveProperty("disabled", true);
  });

  it("toggles between Manual and Autopilot", () => {
    const onToggleAutopilot = vi.fn();
    renderChat({ autopilot: false, onToggleAutopilot });

    // Manual should be checked, Autopilot unchecked
    const manualBtn = screen.getByText("Manual");
    const autopilotBtn = screen.getByText("Autopilot");
    expect(manualBtn.getAttribute("aria-checked")).toBe("true");
    expect(autopilotBtn.getAttribute("aria-checked")).toBe("false");

    // Click Autopilot
    fireEvent.click(autopilotBtn);
    expect(onToggleAutopilot).toHaveBeenCalledWith(true);

    // Click Manual
    fireEvent.click(manualBtn);
    expect(onToggleAutopilot).toHaveBeenCalledWith(false);
  });

  it("sends message on Cmd+Enter", () => {
    const onSendMessage = vi.fn();
    renderChat({ onSendMessage });

    const textarea = screen.getByPlaceholderText("Type a message... (Cmd+Enter to send)");
    fireEvent.change(textarea, { target: { value: "Test message" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onSendMessage).toHaveBeenCalledWith("Test message");
  });

  it("displays error message when error prop is set", () => {
    renderChat({ error: "Something went wrong" });
    expect(screen.getByText("Something went wrong")).toBeTruthy();
  });

  it("shows status message with pulse animation when statusMessage is set", () => {
    renderChat({ statusMessage: "Generating response..." });
    const statusEl = screen.getByText("Generating response...");
    expect(statusEl).toBeTruthy();
    // The parent <p> element should have the animate-pulse class
    const parentP = statusEl.closest("p");
    expect(parentP?.className).toContain("animate-pulse");
  });
});
