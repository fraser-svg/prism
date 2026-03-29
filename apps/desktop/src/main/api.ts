/**
 * Typed API layer aggregating existing @prism/* package calls.
 * This is NOT a new package — it's a thin bridge from IPC handlers to existing code.
 * Resolves project IDs to rootPaths via the registry (core services take AbsolutePath, not IDs).
 */

import type { AbsolutePath } from "@prism/core";
import { WorkspaceFacade } from "@prism/workspace";
import type { ProjectBadge, WorkspaceStatus, ProjectResume } from "@prism/workspace";
import type { ProjectRow } from "@prism/workspace";
import type { ProjectDetail, RegisterProjectResult } from "../shared/ipc-channels";

export class DesktopApi {
  private facade: WorkspaceFacade;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private onExternalChange: (() => void) | null = null;

  constructor(homePath?: AbsolutePath) {
    this.facade = new WorkspaceFacade(homePath);
  }

  // ── Workspace ──────────────────────────────────────────────────

  workspaceStatus(): WorkspaceStatus {
    return this.facade.workspaceStatus();
  }

  // ── Projects ───────────────────────────────────────────────────

  listProjects(): ProjectRow[] {
    return this.facade.registry.list();
  }

  projectDetail(id: string): ProjectDetail {
    const project = this.facade.registry.get(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    const badge = this.facade.health.computeBadge(id);
    const resume = this.facade.resume.buildResume(id);

    const allSpecs = this.facade.allSpecs().filter((s) => s.projectId === id);
    const allPlans = this.facade.allPlans().filter((p) => p.projectId === id);
    const runs = this.facade.recentRuns(50).filter((r) => r.projectId === id);

    return {
      project,
      badge,
      resume,
      specs: allSpecs.map((s) => ({
        entityId: s.entityId,
        title: s.title,
        contentPreview: s.contentPreview,
        updatedAt: s.updatedAt,
      })),
      plans: allPlans.map((p) => ({
        entityId: p.entityId,
        title: p.title,
        contentPreview: p.contentPreview,
        updatedAt: p.updatedAt,
      })),
      recentRuns: runs.map((r) => ({
        entityId: r.entityId,
        title: r.title,
        updatedAt: r.updatedAt,
      })),
    };
  }

  registerProject(rootPath: string, name?: string): RegisterProjectResult {
    const project = this.facade.registry.register(rootPath, name);
    return { project };
  }

  setActiveProject(id: string): void {
    this.facade.registry.setActive(id);
  }

  removeProject(id: string): void {
    this.facade.registry.remove(id);
  }

  projectHealth(id: string): ProjectBadge {
    return this.facade.health.computeBadge(id);
  }

  // ── Resolve project ID → rootPath for orchestrator calls ───────

  resolveRootPath(projectId: string): AbsolutePath {
    const project = this.facade.registry.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project.rootPath as AbsolutePath;
  }

  // ── External change polling (5-second interval) ────────────────

  startPolling(onChange: () => void): void {
    this.onExternalChange = onChange;
    this.pollTimer = setInterval(() => {
      // Re-query workspace status to detect CLI writes
      // The onChange callback notifies the renderer to refresh
      onChange();
    }, 5000);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.onExternalChange = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  close(): void {
    this.stopPolling();
    this.facade.close();
  }
}
