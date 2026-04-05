/**
 * Pipeline API Routes — Express Router for the web execution pipeline.
 *
 * Mounted at /api/projects/:id/pipeline
 *
 * All routes require auth. Long-running operations (execute, verify)
 * return 202 Accepted and stream progress via SSE.
 */

import { Router } from "express";
import type express from "express";
import { z } from "zod";
import type { AbsolutePath, WorkflowPhase, ReviewType, ReviewVerdict, SpecType } from "@prism/core";
import type { WorkspaceFacade } from "@prism/workspace";
import {
  resumeProject,
  createSpec,
  approveSpec,
  createPlan,
  runVerificationGate,
  recordReview,
} from "@prism/orchestrator";
import { evaluateTransition } from "@prism/orchestrator";
import { skillSpecToCore, skillPlanToCore, skillReviewToCore } from "@prism/orchestrator";
import { getRequiredReviewMatrix, checkRequiredReviews } from "@prism/guardian";
import { deriveReleaseState } from "@prism/guardian";
import type { ConversationEngine, EngineEvent } from "./conversation-engine";

// ─── Schemas ───

const MessageSchema = z.object({
  message: z.string().min(1).max(50_000),
});

const ApproveSpecSchema = z.object({
  specId: z.string().min(1),
});

const ReviewSchema = z.object({
  reviewType: z.enum([
    "planning",
    "engineering",
    "qa",
    "design",
    "ship_readiness",
  ]),
  verdict: z.enum(["pass", "hold", "fail"]),
  summary: z.string().min(1),
  findings: z
    .array(
      z.object({
        severity: z.enum(["p1", "p2"]),
        title: z.string(),
        details: z.string().optional(),
      }),
    )
    .optional(),
});

const AutopilotSchema = z.object({
  enabled: z.boolean(),
});

// ─── Route Factory ───

export function createPipelineRouter(
  facade: WorkspaceFacade,
  engine: ConversationEngine,
  getUserId: (req: express.Request) => Promise<string | null>,
): Router {
  const router = Router({ mergeParams: true });

  // Helper: resolve project root from registry
  function resolveProject(
    projectId: string,
  ): { rootPath: AbsolutePath } | null {
    try {
      const project = facade.registry.get(projectId);
      if (!project?.rootPath) return null;
      return { rootPath: project.rootPath as AbsolutePath };
    } catch {
      return null;
    }
  }

  // Helper: safe handler
  function safe(
    handler: (
      req: express.Request,
      res: express.Response,
    ) => Promise<void> | void,
  ) {
    return async (req: express.Request, res: express.Response) => {
      try {
        await handler(req, res);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        console.error(
          `Pipeline ${req.method} ${req.path} failed:`,
          message,
        );
        if (res.headersSent) return; // Fire-and-forget routes already sent 202
        if (message.includes("Vault") || message.includes("API key")) {
          res.status(400).json({ error: message });
        } else {
          res.status(500).json({ error: "Internal server error" });
        }
      }
    };
  }

  // ─── POST /resume ───
  router.post(
    "/resume",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      // Start or resume session
      const session = engine.startSession(projectId, userId);

      // Get orchestrator state
      const result = await resumeProject(
        project.rootPath,
        projectId,
      );

      res.json({
        session: {
          id: session.id,
          phase: session.phase,
          autopilot: session.autopilot,
          cost: session.cost,
          activeSpecId: session.activeSpecId,
        },
        orchestrator: result,
      });
    }),
  );

  // ─── POST /message ───
  router.post(
    "/message",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const session = engine.getSession(projectId, userId);
      if (!session)
        return void res.status(404).json({ error: "No active session — call /resume first" });

      if (session.streaming)
        return void res.status(409).json({ error: "Already streaming — wait for current response" });

      const body = MessageSchema.parse(req.body);
      const response = await engine.sendMessage(
        projectId,
        userId,
        body.message,
      );
      const updatedSession = engine.getSession(projectId, userId);
      res.json({
        message: response,
        phase: updatedSession?.phase,
        cost: updatedSession?.cost,
      });
    }),
  );

  // ─── POST /create-spec ───
  router.post(
    "/create-spec",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const session = engine.getSession(projectId, userId);
      if (!session)
        return void res.status(404).json({ error: "No active session" });

      // Precondition: must be in spec phase (or earlier phases that produce specs)
      if (
        session.phase !== "spec" &&
        session.phase !== "understand" &&
        session.phase !== "identify_problem"
      )
        return void res.status(400).json({
          error: "Cannot create spec in current phase",
        });

      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      // Ask engine to generate spec via conversation
      const response = await engine.sendMessage(
        projectId,
        userId,
        "Please generate the specification based on our discussion. Use the create_spec tool.",
      );

      // If tool use produced a spec, save it
      if (response.toolUse?.name === "create_spec") {
        const spec = await createSpec(
          project.rootPath,
          skillSpecToCore(response.toolUse.input),
        );
        engine.setActiveSpecId(projectId, userId, spec.id);
        res.json({ spec, message: response });
      } else {
        res.json({ spec: null, message: response });
      }
    }),
  );

  // ─── POST /approve-spec ───
  router.post(
    "/approve-spec",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const body = ApproveSpecSchema.parse(req.body);
      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      const spec = await approveSpec(project.rootPath, body.specId);
      engine.setActiveSpecId(projectId, userId, body.specId);
      engine.setPhase(projectId, userId, "plan");
      res.json({ spec });
    }),
  );

  // ─── POST /create-plan ───
  router.post(
    "/create-plan",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const session = engine.getSession(projectId, userId);
      if (!session)
        return void res.status(404).json({ error: "No active session" });

      // Precondition: must have an approved spec
      if (!session.activeSpecId)
        return void res.status(400).json({
          error: "Spec must be approved before creating a plan",
        });

      if (session.phase !== "plan")
        return void res.status(400).json({
          error: "Must be in plan phase to create a plan",
        });

      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      const response = await engine.sendMessage(
        projectId,
        userId,
        "Please generate the implementation plan. Use the create_plan tool.",
      );

      if (response.toolUse?.name === "create_plan") {
        const planInput = {
          ...response.toolUse.input,
          specId: session.activeSpecId,
        };
        const plan = await createPlan(
          project.rootPath,
          skillPlanToCore(planInput),
        );
        res.json({ plan, message: response });
      } else {
        res.json({ plan: null, message: response });
      }
    }),
  );

  // ─── POST /execute ───
  // Fire-and-forget: returns 202, streams progress via SSE
  router.post(
    "/execute",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const session = engine.getSession(projectId, userId);
      if (!session)
        return void res.status(404).json({ error: "No active session" });

      if (session.phase !== "execute")
        return void res.status(400).json({
          error: "Must be in execute phase",
        });

      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      // Return 202 immediately, run execution in background
      res.status(202).json({ status: "started" });

      // Background execution
      const emitter = engine.getEmitter(projectId, userId);
      try {
        emitter.emit("event", {
          type: "status_update",
          data: { message: "Starting task execution..." },
        } satisfies EngineEvent);

        // TODO: Wire up ModelRouter task execution here
        // For now, emit a placeholder completion
        emitter.emit("event", {
          type: "status_update",
          data: { message: "Execution complete" },
        } satisfies EngineEvent);

        engine.setPhase(projectId, userId, "verify");
      } catch (err) {
        emitter.emit("event", {
          type: "error",
          data: {
            message:
              err instanceof Error ? err.message : "Execution failed",
            recoverable: true,
          },
        } satisfies EngineEvent);
      }
    }),
  );

  // ─── POST /verify ───
  // Fire-and-forget: returns 202, streams results via SSE
  router.post(
    "/verify",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const session = engine.getSession(projectId, userId);
      if (!session)
        return void res.status(404).json({ error: "No active session" });

      if (session.phase !== "verify")
        return void res.status(400).json({
          error: "Must be in verify phase",
        });

      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      res.status(202).json({ status: "started" });

      const emitter = engine.getEmitter(projectId, userId);
      try {
        // Run verification
        emitter.emit("event", {
          type: "status_update",
          data: { message: "Running verification checks..." },
        } satisfies EngineEvent);

        const verifyResult = await runVerificationGate(project.rootPath);

        emitter.emit("event", {
          type: "gate_evaluated",
          data: { verification: verifyResult },
        } satisfies EngineEvent);

        // Generate reviews in parallel
        if (session.activeSpecId) {
          const specType: SpecType = "product"; // Default; could be derived from spec
          const requiredReviews = getRequiredReviewMatrix(specType);

          emitter.emit("event", {
            type: "status_update",
            data: {
              message: `Generating ${requiredReviews.length} reviews...`,
            },
          } satisfies EngineEvent);

          // Sequential AI review generation (sendMessage mutates shared session state)
          const completedReviews: unknown[] = [];
          for (const reviewType of requiredReviews) {
            try {
              const response = await engine.sendMessage(
                projectId,
                userId,
                `Generate a ${reviewType} review for the current implementation. Use the record_review tool with reviewType "${reviewType}".`,
              );

              if (response.toolUse?.name === "record_review") {
                const review = await recordReview(
                  project.rootPath,
                  skillReviewToCore({
                    ...response.toolUse.input,
                    reviewType: reviewType as string,
                  }),
                );
                completedReviews.push(review);
              }
            } catch {
              // Continue with remaining reviews if one fails
            }
          }

          // Check release readiness
          const releaseState = await deriveReleaseState(
            session.activeSpecId,
            specType,
            project.rootPath,
          );

          emitter.emit("event", {
            type: "gate_evaluated",
            data: {
              reviews: completedReviews,
              releaseState,
            },
          } satisfies EngineEvent);
        }
      } catch (err) {
        emitter.emit("event", {
          type: "error",
          data: {
            message:
              err instanceof Error ? err.message : "Verification failed",
            recoverable: true,
          },
        } satisfies EngineEvent);
      }
    }),
  );

  // ─── POST /record-review ───
  router.post(
    "/record-review",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const body = ReviewSchema.parse(req.body);
      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      const review = await recordReview(
        project.rootPath,
        skillReviewToCore({
          verdict: body.verdict as ReviewVerdict,
          summary: body.summary,
          findings: (body.findings ?? []).map((f) => ({
            severity: f.severity as "p1" | "p2",
            title: f.title,
            details: f.details ?? "",
            category: body.reviewType,
          })),
        }),
      );
      res.json({ review });
    }),
  );

  // ─── POST /advance ───
  router.post(
    "/advance",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const session = engine.getSession(projectId, userId);
      if (!session)
        return void res.status(404).json({ error: "No active session" });

      const project = resolveProject(projectId);
      if (!project)
        return void res.status(404).json({ error: "Project not found" });

      // Get next phase from workflow
      const phases: WorkflowPhase[] = [
        "understand",
        "identify_problem",
        "spec",
        "plan",
        "execute",
        "verify",
        "release",
      ];
      const currentIdx = phases.indexOf(session.phase);
      if (currentIdx === -1 || currentIdx >= phases.length - 1) {
        return void res.status(400).json({
          error: "Cannot advance past release phase",
        });
      }

      const nextPhase = phases[currentIdx + 1];

      // Evaluate gate
      const gateResult = await evaluateTransition(
        session.phase,
        nextPhase,
        project.rootPath,
        session.activeSpecId ?? undefined,
      );

      if (!gateResult.canAdvance) {
        return void res.json({
          advanced: false,
          blockers: gateResult.blockers,
          gateResult,
        });
      }

      engine.setPhase(projectId, userId, nextPhase);
      res.json({
        advanced: true,
        phase: nextPhase,
        gateResult,
      });
    }),
  );

  // ─── POST /autopilot ───
  router.post(
    "/autopilot",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const body = AutopilotSchema.parse(req.body);
      engine.setAutopilot(projectId, userId, body.enabled);
      res.json({ autopilot: body.enabled });
    }),
  );

  // ─── GET /stream (SSE) ───
  router.get("/stream", async (req, res) => {
    const projectId = req.params.id;
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const emitter = engine.getEmitter(projectId, userId);

    // Send initial state snapshot on connect
    const snapshot = engine.getSnapshot(projectId, userId);
    if (snapshot) {
      res.write(
        `data: ${JSON.stringify({ type: "snapshot", data: snapshot })}\n\n`,
      );
    }

    // Event listener
    const onEvent = (event: EngineEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    emitter.on("event", onEvent);

    // Keepalive every 15s
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15_000);

    // Cleanup on disconnect
    req.on("close", () => {
      emitter.off("event", onEvent);
      clearInterval(keepalive);
    });
  });

  // ─── GET /conversation ───
  router.get(
    "/conversation",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });

      const sessionId = req.query.sessionId as string | undefined;

      if (sessionId) {
        // Historical session — scoped to requesting user
        const history =
          engine.getConversationHistory(sessionId, userId);
        if (!history)
          return void res.status(404).json({ error: "Session not found" });
        res.json({ history });
      } else {
        // Current session
        const session = engine.getSession(projectId, userId);
        if (!session)
          return void res.status(404).json({ error: "No active session" });
        res.json({ history: session.conversationHistory });
      }
    }),
  );

  // ─── GET /history ───
  router.get(
    "/history",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });
      const sessions = engine.getHistory(projectId);
      res.json({ sessions });
    }),
  );

  // ─── GET /prefilled ───
  router.get(
    "/prefilled",
    safe(async (req, res) => {
      const projectId = req.params.id;
      const userId = await getUserId(req);
      if (!userId) return void res.status(401).json({ error: "Unauthorized" });
      const fields = await engine.getPreFilledFields(projectId);
      res.json({ fields });
    }),
  );

  return router;
}
