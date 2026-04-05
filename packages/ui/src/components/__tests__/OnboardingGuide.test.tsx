// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingGuide } from "../OnboardingGuide";

afterEach(cleanup);

describe("OnboardingGuide", () => {
  const defaults = {
    hasGitHub: false,
    hasClients: false,
    hasProjects: false,
    onConnectGitHub: vi.fn(),
    onCreateClient: vi.fn(),
    onCreateProject: vi.fn(),
  };

  it("renders both steps active when no clients or projects", () => {
    render(<OnboardingGuide {...defaults} />);
    expect(screen.getByText("Add a Client")).toBeTruthy();
    expect(screen.getByText("Create a Project")).toBeTruthy();
    expect(screen.getByText("Add Client")).toBeTruthy();
    expect(screen.getByText("Create Project")).toBeTruthy();
  });

  it("shows step 2 checkmark when hasClients is true", () => {
    render(<OnboardingGuide {...defaults} hasClients={true} />);
    const circles = screen.getAllByLabelText(/Step \d of 3/);
    const step2 = circles.find((el) => el.getAttribute("aria-label") === "Step 2 of 3")!;
    expect(step2.textContent).toBe("\u2713");
    expect(screen.queryByText("Add Client")).toBeNull();
  });

  it("fires onCreateClient when CTA clicked", () => {
    const onCreateClient = vi.fn();
    render(<OnboardingGuide {...defaults} onCreateClient={onCreateClient} />);
    fireEvent.click(screen.getByText("Add Client"));
    expect(onCreateClient).toHaveBeenCalledOnce();
  });

  it("fires onCreateProject when CTA clicked", () => {
    const onCreateProject = vi.fn();
    render(<OnboardingGuide {...defaults} onCreateProject={onCreateProject} />);
    fireEvent.click(screen.getByText("Create Project"));
    expect(onCreateProject).toHaveBeenCalledOnce();
  });

  it("progress bar shows 0% with no completions", () => {
    render(<OnboardingGuide {...defaults} />);
    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
  });

  it("progress bar shows 33% with one step done", () => {
    render(<OnboardingGuide {...defaults} hasClients={true} />);
    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe("33.33333333333333");
  });

  it("ARIA labels present on step circles", () => {
    render(<OnboardingGuide {...defaults} />);
    expect(screen.getByLabelText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Step 2 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Step 3 of 3")).toBeTruthy();
  });

  it("step 2 is active even when hasClients is false (non-linear)", () => {
    render(<OnboardingGuide {...defaults} hasClients={false} />);
    expect(screen.getByText("Add Client")).toBeTruthy();
    expect(screen.getByText("Create Project")).toBeTruthy();
  });
});
