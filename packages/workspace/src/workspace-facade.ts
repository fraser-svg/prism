import type { AbsolutePath } from "@prism/core";
import type { ArtifactWriteCallback, ArtifactWriteEvent } from "@prism/memory";
import { WorkspaceManager } from "./workspace-manager";
import type { WorkspaceContext } from "./workspace-manager";
import { ProjectRegistry } from "./project-registry";
import { EventLog } from "./event-log";
import { ArtifactSearch } from "./search";
import { ProjectHealth } from "./health";
import { ResumeBuilder } from "./resume";
import { IntegrationCabinet } from "./integration-cabinet";
import { ProjectTemplates } from "./templates";
import type { WorkspaceStatus, ProjectBadge } from "./types";

export class WorkspaceFacade {
  readonly context: WorkspaceContext;
  readonly registry: ProjectRegistry;
  readonly eventLog: EventLog;
  readonly search: ArtifactSearch;
  readonly health: ProjectHealth;
  readonly resume: ResumeBuilder;
  readonly integrations: IntegrationCabinet;
  readonly templates: ProjectTemplates;

  constructor(homePath?: AbsolutePath) {
    this.context = WorkspaceManager.initialize(homePath);
    const db = this.context.db.inner;

    this.registry = new ProjectRegistry(
      db,
      this.context.settingsPath,
      this.context.settings,
    );
    this.eventLog = new EventLog(db);
    this.search = new ArtifactSearch(db);
    this.health = new ProjectHealth(
      db,
      this.context.settings.stalenessThresholdDays,
    );
    this.resume = new ResumeBuilder(db);
    this.integrations = new IntegrationCabinet(db);
    this.templates = new ProjectTemplates(
      `${this.context.homePath}/templates`,
    );
  }

  createWriteCallback(projectId: string): ArtifactWriteCallback {
    return (event: Omit<ArtifactWriteEvent, "projectId"> & { projectId?: string }) => {
      const fullEvent = { ...event, projectId };
      if (fullEvent.action === "delete") {
        this.search.removeIndex(
          fullEvent.projectId,
          fullEvent.entityType,
          fullEvent.entityId,
        );
      } else {
        this.search.upsertIndex({
          projectId: fullEvent.projectId,
          entityType: fullEvent.entityType,
          entityId: fullEvent.entityId,
          contentPreview: fullEvent.contentPreview,
        });
      }
      this.eventLog.append({
        projectId: fullEvent.projectId,
        eventType:
          fullEvent.action === "write"
            ? "artifact:written"
            : "artifact:deleted",
        summary: `${fullEvent.action}: ${fullEvent.entityType}/${fullEvent.entityId}`,
        metadata: {
          entityType: fullEvent.entityType,
          entityId: fullEvent.entityId,
        },
      });
    };
  }

  workspaceStatus(): WorkspaceStatus {
    const projects = this.registry.list();
    const badges = this.health.computeAllBadges();
    const badgeMap = new Map(
      badges.map((b) => [b.projectId, b.badge]),
    );

    const activeProjectId = this.context.settings.defaultProjectId;
    const activeProjectResume = activeProjectId
      ? this.resume.buildResume(activeProjectId)
      : null;

    const recentEvents = this.eventLog.query({ limit: 10 });

    return {
      workspace: {
        id: this.context.settings.workspaceId,
        projectCount: projects.length,
        activeProjectId,
      },
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        rootPath: p.rootPath,
        badge: badgeMap.get(p.id) ?? ("new" as ProjectBadge),
        lastAccessedAt: p.lastAccessedAt,
      })),
      activeProjectResume,
      recentEvents: recentEvents.map((e) => ({
        eventType: e.eventType,
        summary: e.summary,
        projectId: e.projectId,
        timestamp: e.timestamp,
      })),
    };
  }

  allSpecs(): Array<{
    projectId: string;
    projectName: string;
    entityId: string;
    title: string | null;
    contentPreview: string | null;
    updatedAt: string;
  }> {
    return this.queryArtifactsByType("spec");
  }

  allPlans(): Array<{
    projectId: string;
    projectName: string;
    entityId: string;
    title: string | null;
    contentPreview: string | null;
    updatedAt: string;
  }> {
    return this.queryArtifactsByType("plan");
  }

  recentRuns(limit = 20): Array<{
    projectId: string;
    projectName: string;
    entityId: string;
    title: string | null;
    updatedAt: string;
  }> {
    const rows = this.context.db.inner
      .prepare(
        `SELECT ai.project_id, p.name as project_name, ai.entity_id, ai.title, ai.updated_at
         FROM artifact_index ai
         JOIN projects p ON p.id = ai.project_id
         WHERE ai.entity_type = 'run' AND p.status = 'active'
         ORDER BY ai.updated_at DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      project_id: string;
      project_name: string;
      entity_id: string;
      title: string | null;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      entityId: r.entity_id,
      title: r.title,
      updatedAt: r.updated_at,
    }));
  }

  close(): void {
    this.context.db.close();
  }

  private queryArtifactsByType(entityType: string): Array<{
    projectId: string;
    projectName: string;
    entityId: string;
    title: string | null;
    contentPreview: string | null;
    updatedAt: string;
  }> {
    const rows = this.context.db.inner
      .prepare(
        `SELECT ai.project_id, p.name as project_name, ai.entity_id, ai.title, ai.content_preview, ai.updated_at
         FROM artifact_index ai
         JOIN projects p ON p.id = ai.project_id
         WHERE ai.entity_type = ? AND p.status = 'active'
         ORDER BY ai.updated_at DESC`,
      )
      .all(entityType) as Array<{
      project_id: string;
      project_name: string;
      entity_id: string;
      title: string | null;
      content_preview: string | null;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name,
      entityId: r.entity_id,
      title: r.title,
      contentPreview: r.content_preview,
      updatedAt: r.updated_at,
    }));
  }
}
