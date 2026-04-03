import express from "express";
import cors from "cors";
import { z } from "zod";
import { WorkspaceFacade, ClientRepository, buildProviderViews } from "@prism/workspace";
import { extractPipelineSnapshot } from "@prism/orchestrator/pipeline-snapshot";
import type { AbsolutePath } from "@prism/core";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const app = express();
const DEV_ORIGIN = "http://localhost:5173";
app.use(cors({ origin: process.env.NODE_ENV === "production" ? false : DEV_ORIGIN }));
app.use(express.json());

// --- Zod schemas ---
const CreateClientSchema = z.object({
  name: z.string().min(1).max(200),
  notes: z.string().max(2000).optional(),
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  notes: z.string().max(2000).optional(),
});

// Canonicalize and validate a path argument — rejects traversal attempts
function sanitizePath(raw: string): string {
  return resolve(raw);
}

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  rootPath: z.string().min(1).transform(sanitizePath),
  clientAccountId: z.string().optional(),
});

const LinkProjectSchema = z.object({
  rootPath: z.string().min(1).transform(sanitizePath),
  clientAccountId: z.string().optional(),
});

const UpdateProjectSchema = z.object({
  clientAccountId: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  riskState: z.string().nullable().optional(),
  deployUrl: z.string().nullable().optional(),
});

const RunActionSchema = z.object({
  action: z.string().min(1).max(100),
});

// --- Safe handler wrapper ---
function safeHandle(
  handler: (req: express.Request, res: express.Response) => Promise<void> | void,
) {
  return async (req: express.Request, res: express.Response) => {
    try {
      await handler(req, res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`API ${req.method} ${req.path} failed:`, message);
      res.status(500).json({ error: message });
    }
  };
}

// --- Initialize workspace ---
let facade: WorkspaceFacade | null = null;
let clients: ClientRepository | null = null;

try {
  facade = new WorkspaceFacade();
  facade.context.db.inner.pragma("busy_timeout = 5000");
  clients = new ClientRepository(facade.context.db.inner);
  console.log("Workspace initialized");
} catch (err) {
  console.error("Failed to initialize workspace:", err);
}

// --- Middleware: check workspace is available ---
function requireWorkspace(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!facade || !clients) {
    res.status(503).json({ error: "Workspace not available — database failed to initialize" });
    return;
  }
  next();
}

// --- Routes ---

// Portfolio
app.get(
  "/api/portfolio",
  requireWorkspace,
  safeHandle((_req, res) => {
    const projects = facade!.registry.list();
    const clientList = clients!.list();
    res.json({ data: { projects, clients: clientList } });
  }),
);

// Clients
app.post(
  "/api/clients",
  requireWorkspace,
  safeHandle((req, res) => {
    const parsed = CreateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name, notes } = parsed.data;
    const client = clients!.create(name, notes);
    res.json({ data: client });
  }),
);

app.patch(
  "/api/clients/:id",
  requireWorkspace,
  safeHandle((req, res) => {
    const parsed = UpdateClientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const client = clients!.update(req.params.id, parsed.data);
    res.json({ data: client });
  }),
);

// Projects
app.post(
  "/api/projects",
  requireWorkspace,
  safeHandle((req, res) => {
    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { name, rootPath, clientAccountId } = parsed.data;
    if (!existsSync(rootPath)) {
      res.status(400).json({ error: "Path not found: directory does not exist" });
      return;
    }
    const project = facade!.registry.register(rootPath, name);
    if (clientAccountId) {
      facade!.registry.updateProject(project.id, { clientAccountId });
    }
    res.json({ data: facade!.registry.get(project.id) });
  }),
);

app.post(
  "/api/projects/link",
  requireWorkspace,
  safeHandle((req, res) => {
    const parsed = LinkProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { rootPath, clientAccountId } = parsed.data;

    // Validate path exists
    if (!existsSync(rootPath)) {
      res.status(400).json({ error: "Path not found: directory does not exist" });
      return;
    }

    // Validate .prism/ exists
    const prismDir = join(rootPath, ".prism");
    if (!existsSync(prismDir)) {
      res.status(400).json({ error: "Not a Prism project: no .prism/ directory found at this path" });
      return;
    }

    const project = facade!.registry.register(rootPath);
    if (clientAccountId) {
      facade!.registry.updateProject(project.id, { clientAccountId });
    }
    res.json({ data: facade!.registry.get(project.id) });
  }),
);

app.patch(
  "/api/projects/:id",
  requireWorkspace,
  safeHandle((req, res) => {
    const parsed = UpdateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const project = facade!.registry.updateProject(req.params.id, parsed.data);
    res.json({ data: project });
  }),
);

// Pipeline
app.get(
  "/api/projects/:id/pipeline",
  requireWorkspace,
  safeHandle(async (req, res) => {
    const project = facade!.registry.get(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    try {
      const snapshot = await extractPipelineSnapshot(
        project.rootPath as AbsolutePath,
      );
      res.json({ data: snapshot });
    } catch (err) {
      res.json({
        data: {
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
        },
      });
    }
  }),
);

// Timeline
app.get(
  "/api/projects/:id/timeline",
  requireWorkspace,
  safeHandle((req, res) => {
    const timeline = facade!.eventLog.desktopTimeline(req.params.id, 50);
    res.json({ data: timeline });
  }),
);

// Session actions
app.post(
  "/api/projects/:id/actions",
  requireWorkspace,
  safeHandle((req, res) => {
    const parsed = RunActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { action } = parsed.data;
    const projectId = req.params.id;
    const project = facade!.registry.get(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    facade!.eventLog.logSession({
      projectId,
      action: "desktop:action_started",
      summary: `Action started: ${action}`,
      metadata: { action, projectRoot: project.rootPath },
    });

    facade!.eventLog.logSession({
      projectId,
      action: "desktop:action_completed",
      summary: `Action completed: ${action}`,
      metadata: { action },
    });

    res.json({ data: { status: "completed", action } });
  }),
);

// Providers
app.get(
  "/api/providers",
  requireWorkspace,
  safeHandle(async (_req, res) => {
    res.json({ data: await buildProviderViews(facade!.integrations) });
  }),
);

app.post(
  "/api/providers/check-health",
  requireWorkspace,
  safeHandle(async (_req, res) => {
    res.json({ data: await buildProviderViews(facade!.integrations) });
  }),
);

// --- 404 for unknown API routes (before the SPA catch-all) ---
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// --- Serve static files in production ---
if (process.env.NODE_ENV === "production") {
  const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../client");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

// --- Start server ---
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Prism API server running at http://127.0.0.1:${PORT}`);
});

// Cleanup on exit
process.on("SIGINT", () => {
  facade?.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  facade?.close();
  process.exit(0);
});
