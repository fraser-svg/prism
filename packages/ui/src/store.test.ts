import { describe, it, expect } from "vitest";
import { buildPortfolioGroups } from "./store";
import type { ProjectView, ClientView } from "./types";

function makeClient(overrides: Partial<ClientView> = {}): ClientView {
  return {
    id: "c1",
    name: "Acme Corp",
    slug: "acme-corp",
    status: "active",
    notes: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function makeProject(overrides: Partial<ProjectView> = {}): ProjectView {
  return {
    id: "p1",
    name: "Website",
    slug: "website",
    rootPath: "/projects/website",
    status: "active",
    clientAccountId: null,
    primaryPlatform: null,
    productType: null,
    riskState: null,
    deployUrl: null,
    registeredAt: "2026-01-01",
    lastAccessedAt: null,
    ...overrides,
  };
}

describe("buildPortfolioGroups", () => {
  it("returns empty array for no projects", () => {
    expect(buildPortfolioGroups([], [])).toEqual([]);
  });

  it("groups ungrouped projects under null client", () => {
    const projects = [makeProject()];
    const groups = buildPortfolioGroups(projects, []);

    expect(groups).toHaveLength(1);
    expect(groups[0].client).toBeNull();
    expect(groups[0].projects).toHaveLength(1);
  });

  it("groups projects by client", () => {
    const client = makeClient({ id: "c1" });
    const projects = [
      makeProject({ id: "p1", clientAccountId: "c1" }),
      makeProject({ id: "p2", clientAccountId: "c1" }),
    ];
    const groups = buildPortfolioGroups(projects, [client]);

    expect(groups).toHaveLength(1);
    expect(groups[0].client?.id).toBe("c1");
    expect(groups[0].projects).toHaveLength(2);
  });

  it("puts client-grouped projects before ungrouped", () => {
    const client = makeClient({ id: "c1" });
    const projects = [
      makeProject({ id: "p1", clientAccountId: null }),
      makeProject({ id: "p2", clientAccountId: "c1" }),
    ];
    const groups = buildPortfolioGroups(projects, [client]);

    expect(groups).toHaveLength(2);
    expect(groups[0].client?.id).toBe("c1");
    expect(groups[1].client).toBeNull();
  });

  it("handles missing client gracefully", () => {
    const projects = [makeProject({ id: "p1", clientAccountId: "missing" })];
    const groups = buildPortfolioGroups(projects, []);

    expect(groups).toHaveLength(1);
    expect(groups[0].client).toBeNull(); // clientMap lookup returns undefined → null
  });
});
