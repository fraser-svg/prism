// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockStore: Record<string, unknown> = {};
vi.mock("../../context", () => ({
  usePrismStore: () => mockStore,
}));

const { CreateClientModal } = await import("../CreateClientModal");

function setStore(overrides: Record<string, unknown>) {
  const defaults: Record<string, unknown> = {
    createClient: vi.fn().mockResolvedValue({ id: "c1", name: "Acme Corp" }),
    addContextFiles: vi.fn().mockResolvedValue(undefined),
    addContextNote: vi.fn().mockResolvedValue(undefined),
    loadContext: vi.fn().mockResolvedValue(undefined),
    contextItems: [],
    contextKnowledge: [],
    extractionQueue: { extracting: 0, total: 0 },
  };
  Object.assign(mockStore, defaults, overrides);
}

function renderModal(onClose = vi.fn()) {
  return {
    onClose,
    ...render(
      <MemoryRouter>
        <CreateClientModal onClose={onClose} />
      </MemoryRouter>,
    ),
  };
}

afterEach(() => {
  cleanup();
  mockNavigate.mockClear();
});

beforeEach(() => {
  for (const key of Object.keys(mockStore)) delete mockStore[key];
});

describe("CreateClientModal", () => {
  it("Step 1 renders name input and Create & Add Context advances to Step 2", async () => {
    setStore({});
    renderModal();

    expect(screen.getByText("New Client")).toBeTruthy();
    expect(screen.getByText("Step 1/2")).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Acme Corp")).toBeTruthy();

    const input = screen.getByPlaceholderText("e.g. Acme Corp");
    fireEvent.change(input, { target: { value: "Acme Corp" } });

    const advanceBtn = screen.getByText(/Create & Add Context/);
    fireEvent.click(advanceBtn);

    await waitFor(() => {
      expect(mockStore.createClient).toHaveBeenCalledWith("Acme Corp");
    });

    await waitFor(() => {
      expect(screen.getByText("Step 2/2")).toBeTruthy();
      expect(screen.getByText(/Teach Prism about Acme Corp/)).toBeTruthy();
    });
  });

  it("Create without context creates client and calls onClose", async () => {
    setStore({});
    const { onClose } = renderModal();

    const input = screen.getByPlaceholderText("e.g. Acme Corp");
    fireEvent.change(input, { target: { value: "Test Client" } });

    const skipBtn = screen.getByText("Create without context");
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(mockStore.createClient).toHaveBeenCalledWith("Test Client");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("Step 2 renders dropzone and knowledge panel after advancing", async () => {
    setStore({});
    renderModal();

    const input = screen.getByPlaceholderText("e.g. Acme Corp");
    fireEvent.change(input, { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByText(/Create & Add Context/));

    await waitFor(() => {
      expect(screen.getByText("Step 2/2")).toBeTruthy();
    });

    expect(screen.getByRole("region", { name: "File upload area" })).toBeTruthy();
    expect(screen.getByText("What Prism Knows")).toBeTruthy();
    expect(screen.getByText(/^Done/)).toBeTruthy();
    expect(screen.getByText("Skip for now")).toBeTruthy();
  });

  it("Done navigates to client context page", async () => {
    setStore({});
    renderModal();

    const input = screen.getByPlaceholderText("e.g. Acme Corp");
    fireEvent.change(input, { target: { value: "Acme Corp" } });
    fireEvent.click(screen.getByText(/Create & Add Context/));

    await waitFor(() => {
      expect(screen.getByText("Step 2/2")).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/^Done/));
    expect(mockNavigate).toHaveBeenCalledWith("/clients/c1/context");
  });
});
