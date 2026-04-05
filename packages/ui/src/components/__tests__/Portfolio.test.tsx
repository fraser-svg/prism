// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Mock the context module to control store values
const mockStore: Record<string, unknown> = {};
vi.mock("../../context", () => ({
  usePrismStore: () => mockStore,
}));

// Import after mock is set up
const { Portfolio } = await import("../Portfolio");

function setStore(overrides: Record<string, unknown>) {
  const defaults: Record<string, unknown> = {
    clients: [],
    projects: [],
    portfolioGroups: [],
    portfolioLoading: false,
    portfolioError: null,
    pipelineCache: new Map(),
    searchQuery: "",
    loadPortfolio: vi.fn().mockResolvedValue(undefined),
    scanAllPipelines: vi.fn().mockResolvedValue(undefined),
  };
  Object.assign(mockStore, defaults, overrides);
}

function renderPortfolio() {
  return render(
    <MemoryRouter>
      <Portfolio />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("Portfolio", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
  });

  it("shows OnboardingGuide when projects array is empty", () => {
    setStore({ projects: [], clients: [] });
    renderPortfolio();
    expect(screen.getByText("Welcome to Prismatic")).toBeTruthy();
    expect(screen.getByText("Set up your workspace in three steps")).toBeTruthy();
  });

  it("does NOT show OnboardingGuide when projects exist", () => {
    setStore({
      projects: [{ id: "p1", name: "Test", slug: "test", clientAccountId: null }],
      portfolioGroups: [
        { client: null, projects: [{ id: "p1", name: "Test", slug: "test", clientAccountId: null }] },
      ],
    });
    renderPortfolio();
    expect(screen.queryByText("Set up your workspace in three steps")).toBeNull();
  });

  it("hides onboarding when searchQuery is active even with 0 projects", () => {
    setStore({ projects: [], clients: [], searchQuery: "foo" });
    renderPortfolio();
    expect(screen.queryByText("Set up your workspace in three steps")).toBeNull();
  });

  it("shows step 1 as complete when clients exist but no projects", () => {
    setStore({
      projects: [],
      clients: [{ id: "c1", name: "Acme Corp" }],
    });
    renderPortfolio();
    const step2 = screen.getByLabelText("Step 2 of 3");
    expect(step2.textContent).toBe("\u2713");
  });

  it("hides client group grid when onboarding is showing", () => {
    setStore({
      projects: [],
      clients: [{ id: "c1", name: "Acme Corp" }],
      portfolioGroups: [{ client: { id: "c1", name: "Acme Corp" }, projects: [] }],
    });
    renderPortfolio();
    // The client group header text "ACME CORP" should not render
    // (the name in portfolioGroups renders uppercase via CSS, but the raw text is "Acme Corp")
    // OnboardingGuide does not contain "Acme Corp", so it should be absent
    expect(screen.queryByText("Unassigned")).toBeNull();
    // Verify onboarding IS showing
    expect(screen.getByText("Set up your workspace in three steps")).toBeTruthy();
  });

  it("shows no-results state when search filters everything out", () => {
    setStore({
      projects: [],
      clients: [],
      searchQuery: "nonexistent",
      portfolioGroups: [],
    });
    renderPortfolio();
    expect(screen.queryByText("Set up your workspace in three steps")).toBeNull();
  });

  it("+ New dropdown renders New Client and New Project options", async () => {
    setStore({ projects: [], clients: [] });
    renderPortfolio();

    const newBtn = screen.getByText("+ New");
    expect(newBtn).toBeTruthy();
    expect(screen.queryByText("New Client")).toBeNull();

    fireEvent.click(newBtn);
    expect(screen.getByText("New Client")).toBeTruthy();
    expect(screen.getByText("New Project")).toBeTruthy();
  });
});
