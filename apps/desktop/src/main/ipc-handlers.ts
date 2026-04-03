import { ipcMain, dialog } from "electron";
import type { WorkspaceFacade } from "@prism/workspace";
import { ClientRepository } from "@prism/workspace";
import { extractPipelineSnapshot } from "@prism/orchestrator/pipeline-snapshot";
import type { AbsolutePath } from "@prism/core";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function registerIpcHandlers(facade: WorkspaceFacade): void {
  const clients = new ClientRepository(facade.context.db.inner);

  // Wrap every handler in try/catch — critical gap #1 from eng review.
  // Without this, unhandled main process throws leave the renderer hanging.
  function safeHandle(
    channel: string,
    handler: (...args: unknown[]) => Promise<unknown> | unknown,
  ) {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { data: await handler(...args) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`IPC ${channel} failed:`, message);
        return { error: message };
      }
    });
  }

  // Portfolio: list all clients and projects
  safeHandle("portfolio:list", () => {
    const projects = facade.registry.list();
    const clientList = clients.list();
    return { projects, clients: clientList };
  });

  // Clients
  safeHandle("clients:create", (name: unknown, notes: unknown) => {
    return clients.create(
      String(name),
      notes ? String(notes) : undefined,
    );
  });

  safeHandle("clients:update", (id: unknown, fields: unknown) => {
    const f = fields as Record<string, unknown>;
    return clients.update(String(id), {
      name: f.name != null ? String(f.name) : undefined,
      notes: f.notes != null ? String(f.notes) : undefined,
    });
  });

  // Projects
  safeHandle(
    "projects:create",
    (name: unknown, rootPath: unknown, clientAccountId: unknown) => {
      const path = String(rootPath);
      if (!existsSync(path)) {
        throw new Error("Path not found: directory does not exist");
      }
      const project = facade.registry.register(path, String(name));
      if (clientAccountId) {
        facade.registry.updateProject(project.id, {
          clientAccountId: String(clientAccountId),
        });
      }
      return facade.registry.get(project.id);
    },
  );

  safeHandle("projects:link", (rootPath: unknown, clientAccountId: unknown) => {
    const path = String(rootPath);

    // Validate path exists and is readable before checking for .prism/
    if (!existsSync(path)) {
      throw new Error("Path not found: directory does not exist");
    }

    // Validate .prism/ exists before linking
    const prismDir = join(path, ".prism");
    if (!existsSync(prismDir)) {
      throw new Error(
        "Not a Prism project: no .prism/ directory found at this path",
      );
    }

    const project = facade.registry.register(path);
    if (clientAccountId) {
      facade.registry.updateProject(project.id, {
        clientAccountId: String(clientAccountId),
      });
    }
    return facade.registry.get(project.id);
  });

  safeHandle("projects:update", (id: unknown, fields: unknown) => {
    const f = fields as Record<string, unknown>;
    const coerce = (v: unknown): string | null =>
      v === null ? null : String(v);
    return facade.registry.updateProject(String(id), {
      clientAccountId:
        f.clientAccountId !== undefined ? coerce(f.clientAccountId) : undefined,
      owner: f.owner !== undefined ? coerce(f.owner) : undefined,
      priority: f.priority !== undefined ? coerce(f.priority) : undefined,
      riskState: f.riskState !== undefined ? coerce(f.riskState) : undefined,
      deployUrl: f.deployUrl !== undefined ? coerce(f.deployUrl) : undefined,
    });
  });

  // Pipeline
  safeHandle("projects:getPipeline", async (projectId: unknown) => {
    const project = facade.registry.get(String(projectId));
    if (!project) throw new Error("Project not found");

    try {
      const snapshot = await extractPipelineSnapshot(
        project.rootPath as AbsolutePath,
      );
      return snapshot;
    } catch (err) {
      // Pipeline extraction can fail for corrupt/missing artifacts.
      // Return a minimal error state instead of crashing.
      return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        projectRoot: project.rootPath,
        activeSpecId: null,
        currentPhase: "understand",
        resumeSource: "error",
        stages: [],
        recommendations: [],
        weaknesses: [],
        healthScore: null,
        healthTrend: "stable",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  // Timeline
  safeHandle("projects:getTimeline", (projectId: unknown) => {
    return facade.eventLog.desktopTimeline(String(projectId), 50);
  });

  // Session actions
  safeHandle(
    "sessions:runAction",
    async (projectId: unknown, action: unknown) => {
      const pid = String(projectId);
      const act = String(action);
      const project = facade.registry.get(pid);
      if (!project) throw new Error("Project not found");

      facade.eventLog.logSession({
        projectId: pid,
        action: "desktop:action_started",
        summary: `Action started: ${act}`,
        metadata: { action: act, projectRoot: project.rootPath },
      });

      // Action execution will be wired to orchestrator commands.
      // For MVP, log the action and return status.
      facade.eventLog.logSession({
        projectId: pid,
        action: "desktop:action_completed",
        summary: `Action completed: ${act}`,
        metadata: { action: act },
      });

      return { status: "completed", action: act };
    },
  );

  // Directory picker
  safeHandle("dialog:selectDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Select Project Directory",
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
