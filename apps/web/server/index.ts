import express from "express";
import cors from "cors";
import { z } from "zod";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { WorkspaceFacade, ClientRepository, buildProviderViews } from "@prism/workspace";
import type { EntityScope } from "@prism/workspace";
import {
  requireStripe,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
} from "./billing.js";
import { extractPipelineSnapshot } from "@prism/orchestrator/pipeline-snapshot";
import type { AbsolutePath, IntakeBrief } from "@prism/core";
import { createIntakeBriefRepository } from "@prism/memory";
import { ConversationEngine } from "./conversation-engine";
import { createPipelineRouter } from "./pipeline-routes";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { toNodeHandler } from "better-auth/node";
import { createAuth, type Auth } from "./auth";

// Hard guard: SKIP_AUTH is only honored in explicit development mode
if (process.env.SKIP_AUTH === "true" && process.env.NODE_ENV !== "development") {
  console.error("FATAL: SKIP_AUTH=true requires NODE_ENV=development");
  process.exit(1);
}

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
  rootPath: z.string().min(1).transform(sanitizePath).optional(),
  clientAccountId: z.string().optional(),
});

/** Base directory for auto-created projects */
function prismaticBase(): string {
  return resolve(join(homedir(), "Prismatic"));
}

/** Slugify a project name for use as a directory name */
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "project";
}

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

const EntityScopeSchema = z.object({
  entityType: z.enum(["project", "client"]),
  entityId: z.string().min(1),
});

const AddContextItemSchema = z.object({
  itemType: z.string().min(1),
  title: z.string().min(1).max(500),
  content: z.string().max(200_000).optional(),
  mimeType: z.string().max(200).optional(),
  fileSizeBytes: z.coerce.number().int().nonnegative().optional(),
});

const ApplyToBriefSchema = z.object({
  projectId: z.string().min(1),
});

function paramId(req: express.Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

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
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

export function createApp(facade: WorkspaceFacade, clients: ClientRepository) {
  const app = express();
  const DEV_ORIGIN = "http://localhost:5173";
  app.use(cors({ origin: process.env.NODE_ENV === "production" ? false : DEV_ORIGIN }));

  // --- Auth ---
  const auth = createAuth(facade.context.db.inner);

  // Stripe webhook MUST be before express.json() — needs raw body for signature verification
  app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    safeHandle(async (req, res) => {
      await handleWebhook(req, res, facade.usageGate);
    }),
  );

  // Mount Better Auth BEFORE express.json() — OAuth callbacks need raw body parsing
  const authHandler = toNodeHandler(auth);
  app.all("/api/auth/*splat", (req, res) => {
    authHandler(req, res);
  });

  // express.json() AFTER auth mount to avoid breaking OAuth callbacks
  app.use(express.json());

  // --- Auth middleware ---
  // TODO: Add user-scoping — currently all authenticated users share one workspace.
  // When multi-tenancy lands, filter data queries by session.user.id here.
  function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) {
    if (process.env.SKIP_AUTH === "true") {
      next();
      return;
    }
    auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) }).then((session) => {
      if (!session) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      next();
    }).catch(() => {
      res.status(401).json({ error: "Unauthorized" });
    });
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

  // --- Helper: extract user ID from session ---
  async function getUserId(req: express.Request): Promise<string | null> {
    if (process.env.SKIP_AUTH === "true") return "dev-user";
    const session = await auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) });
    return session?.user?.id ?? null;
  }

  // --- Routes ---

  // Portfolio
  app.get(
    "/api/portfolio",
    requireAuth,
    requireWorkspace,
    safeHandle((_req, res) => {
      const projects = facade.registry.list();
      const clientList = clients.list();
      res.json({ data: { projects, clients: clientList } });
    }),
  );

  // Clients
  app.post(
    "/api/clients",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const parsed = CreateClientSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { name, notes } = parsed.data;
      const client = clients.create(name, notes);
      res.json({ data: client });
    }),
  );

  app.patch(
    "/api/clients/:id",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const parsed = UpdateClientSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const client = clients.update(paramId(req), parsed.data);
      res.json({ data: client });
    }),
  );

  // Projects
  app.post(
    "/api/projects",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const parsed = CreateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { name, clientAccountId } = parsed.data;
      const base = prismaticBase();

      // Determine rootPath: use provided path or auto-generate under ~/Prismatic/
      let rootPath = parsed.data.rootPath;
      if (!rootPath) {
        let slug = nameToSlug(name);
        let candidate = resolve(join(base, slug));
        let suffix = 2;
        while (existsSync(candidate)) {
          candidate = resolve(join(base, `${slug}-${suffix}`));
          suffix++;
        }
        rootPath = candidate;
      }

      // Auto-create directories under ~/Prismatic/; require others to exist already
      if (!existsSync(rootPath)) {
        if (resolve(rootPath).startsWith(base + "/")) {
          try {
            mkdirSync(rootPath, { recursive: true });
          } catch (err) {
            res.status(400).json({
              error: `Failed to create directory: ${err instanceof Error ? err.message : String(err)}`,
            });
            return;
          }
        } else {
          res.status(400).json({ error: "Path not found: directory does not exist" });
          return;
        }
      }

      const project = facade.registry.register(rootPath, name);
      if (clientAccountId) {
        facade.registry.updateProject(project.id, { clientAccountId });
      }
      res.json({ data: facade.registry.get(project.id) });
    }),
  );

  app.post(
    "/api/projects/link",
    requireAuth,
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

      const project = facade.registry.register(rootPath);
      if (clientAccountId) {
        facade.registry.updateProject(project.id, { clientAccountId });
      }
      res.json({ data: facade.registry.get(project.id) });
    }),
  );

  app.patch(
    "/api/projects/:id",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const parsed = UpdateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const project = facade.registry.updateProject(paramId(req), parsed.data);
      res.json({ data: project });
    }),
  );

  // Pipeline
  app.get(
    "/api/projects/:id/pipeline",
    requireAuth,
    requireWorkspace,
    safeHandle(async (req, res) => {
      const project = facade.registry.get(paramId(req));
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
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const timeline = facade.eventLog.desktopTimeline(paramId(req), 50);
      res.json({ data: timeline });
    }),
  );

  // Session actions
  app.post(
    "/api/projects/:id/actions",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const parsed = RunActionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { action } = parsed.data;
      const projectId = paramId(req);
      const project = facade.registry.get(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      facade.eventLog.logSession({
        projectId,
        action: "desktop:action_started",
        summary: `Action started: ${action}`,
        metadata: { action, projectRoot: project.rootPath },
      });

      facade.eventLog.logSession({
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
    requireAuth,
    requireWorkspace,
    safeHandle(async (_req, res) => {
      res.json({ data: await buildProviderViews(facade.integrations) });
    }),
  );

  app.post(
    "/api/providers/check-health",
    requireAuth,
    requireWorkspace,
    safeHandle(async (_req, res) => {
      res.json({ data: await buildProviderViews(facade.integrations) });
    }),
  );

  // --- Context Dump routes ---
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  function parseScope(req: express.Request): EntityScope | null {
    const parsed = EntityScopeSchema.safeParse(req.params);
    return parsed.success ? parsed.data : null;
  }

  app.get(
    "/api/context/:entityType/:entityId/items",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const scope = parseScope(req);
      if (!scope) { res.status(400).json({ error: "Invalid entityType or entityId" }); return; }
      const items = facade.contextRepo.getItems(scope);
      res.json({ data: items });
    }),
  );

  app.post(
    "/api/context/:entityType/:entityId/items",
    requireAuth,
    requireWorkspace,
    upload.single("file"),
    safeHandle((req, res) => {
      const scope = parseScope(req);
      if (!scope) { res.status(400).json({ error: "Invalid entityType or entityId" }); return; }

      const parsed = AddContextItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0].message });
        return;
      }
      const { itemType, title } = parsed.data;
      let { content, mimeType, fileSizeBytes } = parsed.data;

      // File uploaded via multipart — extract text content from buffer
      if (req.file) {
        const allowedMime = /^(text\/|application\/json|application\/x-yaml)/;
        if (!allowedMime.test(req.file.mimetype)) {
          res.status(415).json({ error: `Unsupported file type: ${req.file.mimetype}. Only text files are accepted.` });
          return;
        }
        content = req.file.buffer.toString("utf-8");
        mimeType = mimeType || req.file.mimetype;
        fileSizeBytes = req.file.size;
      }

      const item = facade.contextRepo.addItem(scope, {
        itemType,
        title,
        content,
        mimeType,
        fileSizeBytes,
      });

      // Enqueue for extraction if content is available
      if (content) {
        facade.extractionPipeline.enqueue(item.id);
      }

      res.json({ data: item });
    }),
  );

  app.delete(
    "/api/context/items/:id",
    requireAuth,
    requireWorkspace,
    safeHandle(async (req, res) => {
      const item = facade.contextRepo.deleteItem(paramId(req));
      if (!item) { res.status(404).json({ error: "Context item not found" }); return; }

      const scope: EntityScope = item.clientAccountId
        ? { entityType: "client", entityId: item.clientAccountId }
        : { entityType: "project", entityId: item.projectId! };

      // Recompile summary after deleting item and its knowledge
      facade.extractionPipeline.recompileSummary(scope).catch(() => {});

      res.json({ data: { success: true } });
    }),
  );

  app.post(
    "/api/context/items/:id/re-extract",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const item = facade.contextRepo.getItem(paramId(req));
      if (!item) { res.status(404).json({ error: "Context item not found" }); return; }
      facade.contextRepo.updateExtractionStatus(item.id, "queued");
      facade.extractionPipeline.enqueue(item.id);
      res.json({ data: { success: true } });
    }),
  );

  app.get(
    "/api/context/:entityType/:entityId/knowledge",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const scope = parseScope(req);
      if (!scope) { res.status(400).json({ error: "Invalid entityType or entityId" }); return; }
      const knowledge = facade.contextRepo.getKnowledge(scope);
      res.json({ data: knowledge });
    }),
  );

  app.get(
    "/api/context/:entityType/:entityId/summary",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const scope = parseScope(req);
      if (!scope) { res.status(400).json({ error: "Invalid entityType or entityId" }); return; }
      const summary = facade.contextRepo.getSummary(scope);
      res.json({ data: summary });
    }),
  );

  app.get(
    "/api/context/:entityType/:entityId/search",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const scope = parseScope(req);
      if (!scope) { res.status(400).json({ error: "Invalid entityType or entityId" }); return; }
      const q = typeof req.query.q === "string" ? req.query.q : "";
      if (!q.trim()) { res.json({ data: [] }); return; }
      const results = facade.contextRepo.searchKnowledge(q, scope);
      res.json({ data: results });
    }),
  );

  app.post(
    "/api/context/knowledge/:id/flag",
    requireAuth,
    requireWorkspace,
    safeHandle(async (req, res) => {
      const knowledge = facade.contextRepo.getKnowledgeById(paramId(req));
      if (!knowledge) { res.status(404).json({ error: "Knowledge entry not found" }); return; }
      const flagged = facade.contextRepo.flagKnowledge(paramId(req));
      if (!flagged) { res.status(404).json({ error: "Knowledge entry not found" }); return; }

      // Recompile summary to exclude flagged fact
      const scope: EntityScope = knowledge.clientAccountId
        ? { entityType: "client", entityId: knowledge.clientAccountId }
        : { entityType: "project", entityId: knowledge.projectId! };
      facade.extractionPipeline.recompileSummary(scope).catch(() => {});

      res.json({ data: { success: true } });
    }),
  );

  app.post(
    "/api/context/knowledge/:id/apply",
    requireAuth,
    requireWorkspace,
    safeHandle(async (req, res) => {
      const parsed = ApplyToBriefSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "projectId is required" });
        return;
      }
      const { projectId } = parsed.data;

      const knowledge = facade.contextRepo.getKnowledgeById(paramId(req));
      if (!knowledge) { res.status(404).json({ error: "Knowledge entry not found" }); return; }

      const project = facade.registry.get(projectId);
      if (!project) { res.status(404).json({ error: "Project not found" }); return; }

      // Cross-package bridge: map knowledge into IntakeBrief via @prism/memory
      const briefRepo = createIntakeBriefRepository(project.rootPath as AbsolutePath);
      const existingIds = await briefRepo.list();
      const briefId = existingIds.length > 0 ? existingIds[0] : randomUUID();

      const existingBrief = existingIds.length > 0 ? await briefRepo.readMetadata(briefId) : null;
      let brief: IntakeBrief = existingBrief ?? {
            id: briefId,
            projectId,
            clientContext: "",
            workflowDescription: "",
            painPoints: [],
            assumptions: [],
            unresolvedQuestions: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

      // Map knowledge category → brief field
      const fact = knowledge.value;
      if (knowledge.key.includes("pain") || knowledge.key === "pain_points") {
        if (!brief.painPoints.includes(fact)) brief.painPoints.push(fact);
      } else if (knowledge.category === "technical") {
        brief.workflowDescription = brief.workflowDescription
          ? `${brief.workflowDescription}\n- ${fact}`
          : `- ${fact}`;
      } else {
        brief.clientContext = brief.clientContext
          ? `${brief.clientContext}\n- ${fact}`
          : `- ${fact}`;
      }
      brief.updatedAt = new Date().toISOString();

      await briefRepo.writeMetadata(briefId, brief);

      res.json({ data: { success: true, briefId } });
    }),
  );

  // --- Usage ---
  app.get(
    "/api/usage",
    requireAuth,
    requireWorkspace,
    safeHandle(async (req, res) => {
      const userId = await getUserId(req);
      if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
      const usage = facade.usageGate.getUsage(userId);
      res.json({ data: usage });
    }),
  );

  // --- Billing ---
  app.post(
    "/api/billing/checkout",
    requireAuth,
    requireWorkspace,
    requireStripe,
    safeHandle(async (req, res) => {
      await createCheckoutSession(req, res, facade.usageGate, getUserId);
    }),
  );

  app.post(
    "/api/billing/portal",
    requireAuth,
    requireWorkspace,
    requireStripe,
    safeHandle(async (req, res) => {
      await createPortalSession(req, res, facade.usageGate, getUserId);
    }),
  );

  // --- Vault: BYO API keys ---
  const ALLOWED_BYO_PROVIDERS = new Set(["anthropic", "openai"]);

  app.put(
    "/api/vault/providers/:provider",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const provider = req.params.provider;
      if (!ALLOWED_BYO_PROVIDERS.has(provider)) {
        res.status(400).json({ error: `Unknown provider: ${provider}` });
        return;
      }
      const { apiKey } = req.body as { apiKey?: string };
      if (!apiKey || typeof apiKey !== "string") {
        res.status(400).json({ error: "apiKey is required" });
        return;
      }
      // Trim whitespace and strip common env var prefixes
      const cleaned = apiKey.trim().replace(/^[A-Z_]+=/, "");
      if (!cleaned) {
        res.status(400).json({ error: "Invalid API key" });
        return;
      }
      // Remove existing, then register with new key
      facade.integrations.remove(provider, "byo");
      facade.integrations.register(provider, "byo", { apiKey: cleaned });
      res.json({ data: { success: true } });
    }),
  );

  app.delete(
    "/api/vault/providers/:provider",
    requireAuth,
    requireWorkspace,
    safeHandle((req, res) => {
      const provider = req.params.provider;
      if (!ALLOWED_BYO_PROVIDERS.has(provider)) {
        res.status(400).json({ error: `Unknown provider: ${provider}` });
        return;
      }
      facade.integrations.remove(provider, "byo");
      res.json({ data: { success: true } });
    }),
  );

  // --- Vault: GitHub connection status ---
  app.get(
    "/api/vault/github",
    requireAuth,
    requireWorkspace,
    safeHandle(async (req, res) => {
      const userId = await getUserId(req);
      if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
      // Check if user has a GitHub account linked via Better Auth
      const account = facade.context.db.inner
        .prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'github'")
        .get(userId) as { id: string } | undefined;
      res.json({ data: { connected: !!account } });
    }),
  );

  // --- Pipeline conversation engine ---
  const engine = new ConversationEngine(facade);
  app.use(
    "/api/projects/:id/pipeline",
    requireAuth,
    requireWorkspace,
    createPipelineRouter(facade, engine, getUserId),
  );

  // --- 404 for unknown API routes (before the SPA catch-all) ---
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // --- Serve static files in production ---
  if (process.env.NODE_ENV === "production") {
    const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../client");
    app.use(express.static(clientDist));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(join(clientDist, "index.html"));
    });
  }

  // Multer error handler (file size limit, etc.)
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "File exceeds 10 MB limit" });
      return;
    }
    next(err);
  });

  return { app, auth };
}

// --- Start server (only when run directly, not when imported for tests) ---
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url).includes(process.argv[1].replace(/\.[^.]+$/, ""));
if (isMainModule || process.env.PRISM_START_SERVER === "true") {
  let facade: WorkspaceFacade;
  let clients: ClientRepository;

  try {
    facade = new WorkspaceFacade();
    facade.context.db.inner.pragma("busy_timeout = 5000");
    clients = new ClientRepository(facade.context.db.inner);
    // Register Prism's own API keys as platform-level integrations
    if (process.env.ANTHROPIC_API_KEY) {
      facade.integrations.ensureRegistered("anthropic", "platform", {
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
    if (process.env.OPENAI_API_KEY) {
      facade.integrations.ensureRegistered("openai", "platform", {
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    console.log("Workspace initialized");
  } catch (err) {
    console.error("Failed to initialize workspace:", err);
    process.exit(1);
  }

  const { app } = createApp(facade, clients);
  const PORT = Number(process.env.PORT) || 3001;
  const HOST = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
  app.listen(PORT, HOST, () => {
    console.log(`Prism API server running at http://${HOST}:${PORT}`);
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
}
