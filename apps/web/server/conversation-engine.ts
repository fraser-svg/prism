/**
 * Conversation Engine — Multi-turn AI session manager for the web pipeline.
 *
 * Wraps the Anthropic Messages API with:
 * - Phase-boundary reset (fresh conversation per phase)
 * - Per-call API key resolution (picks up key rotations immediately)
 * - Anthropic tool use for structured spec/plan generation
 * - Streaming via EventEmitter (consumed by SSE routes)
 * - Proactive context window management
 * - Smart discovery with pre-fill from extracted knowledge
 * - Cost tracking per session
 * - In-memory sessions + SQLite persistence
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type { WorkflowPhase, EntityId, SpecType } from "@prism/core";
import { PRICING } from "@prism/execution/pricing";
import type { WorkspaceFacade } from "@prism/workspace";
import type Database from "better-sqlite3";
import { PHASE_PROMPTS, PHASE_STATUS_MESSAGES } from "./phase-prompts";

// ─── Types ───

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolUse?: { name: string; input: Record<string, unknown> } | null;
}

export interface SessionCost {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface PipelineSession {
  id: string;
  projectId: string;
  userId: string;
  phase: WorkflowPhase;
  conversationHistory: ConversationMessage[];
  activeSpecId: string | null;
  activePlanId: string | null;
  autopilot: boolean;
  cost: SessionCost;
  status: "active" | "completed" | "abandoned";
  createdAt: string;
  updatedAt: string;
  streaming: boolean;
  executing: boolean;
  executeStartedAt?: number;
}

export interface SessionSnapshot {
  phase: WorkflowPhase;
  conversationHistory: ConversationMessage[];
  activeSpecId: string | null;
  autopilot: boolean;
  cost: SessionCost;
  status: string;
  executionProgress?: {
    tasksTotal: number;
    tasksCompleted: number;
    currentTask: string | null;
  };
}

export interface EngineEvent {
  type:
    | "message"
    | "message_delta"
    | "phase_changed"
    | "artifact_created"
    | "gate_evaluated"
    | "status_update"
    | "cost_update"
    | "execution_progress"
    | "release_summary"
    | "error"
    | "snapshot";
  data: Record<string, unknown>;
}

interface PreFilledField {
  key: string;
  value: string;
  confidence: number;
  source: string;
}

// ─── Tool Definitions ───

const SPEC_TOOL: Anthropic.Tool = {
  name: "create_spec",
  description:
    "Create a product specification with title, summary, scope, non-goals, and acceptance criteria.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Spec title" },
      type: {
        type: "string",
        enum: ["product", "change", "task"],
        description: "Spec type",
      },
      summary: { type: "string", description: "One-paragraph summary" },
      scope: {
        type: "array",
        items: { type: "string" },
        description: "What is in scope",
      },
      nonGoals: {
        type: "array",
        items: { type: "string" },
        description: "What is explicitly excluded",
      },
      acceptanceCriteria: {
        type: "array",
        items: { type: "string" },
        description: "Measurable acceptance criteria",
      },
    },
    required: ["title", "summary", "scope", "acceptanceCriteria"],
  },
};

const PLAN_TOOL: Anthropic.Tool = {
  name: "create_plan",
  description:
    "Create an implementation plan with phases, tasks, risks, and sequencing.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Plan title" },
      specId: { type: "string", description: "ID of the approved spec" },
      phases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            goal: { type: "string" },
          },
          required: ["title"],
        },
        description: "Ordered implementation phases",
      },
      risks: {
        type: "array",
        items: { type: "string" },
        description: "Known risks",
      },
      sequencingRationale: {
        type: "string",
        description: "Why this ordering",
      },
    },
    required: ["title", "specId", "phases"],
  },
};

const REVIEW_TOOL: Anthropic.Tool = {
  name: "record_review",
  description: "Record a review verdict with findings.",
  input_schema: {
    type: "object" as const,
    properties: {
      reviewType: {
        type: "string",
        enum: ["planning", "engineering", "qa", "design", "ship_readiness"],
        description: "Type of review",
      },
      verdict: {
        type: "string",
        enum: ["pass", "hold", "fail"],
        description: "Review verdict",
      },
      summary: { type: "string", description: "Review summary" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["p1", "p2"] },
            title: { type: "string" },
            details: { type: "string" },
          },
          required: ["severity", "title"],
        },
        description: "Specific findings",
      },
    },
    required: ["reviewType", "verdict", "summary"],
  },
};

const PROBLEM_TOOL: Anthropic.Tool = {
  name: "create_problem",
  description: "Record the identified problem statement.",
  input_schema: {
    type: "object" as const,
    properties: {
      originalRequest: {
        type: "string",
        description: "What the user originally asked for",
      },
      realProblem: {
        type: "string",
        description: "The actual underlying problem",
      },
      targetUser: { type: "string", description: "Who has this problem" },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Assumptions to validate",
      },
    },
    required: ["originalRequest", "realProblem", "targetUser"],
  },
};

// Model config
const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;
const MAX_CONTEXT_TOKENS = 180_000; // ~80% of 200k context window
const CONFIDENCE_THRESHOLD = 0.7;
const MAX_RETRY = 2;
const RETRY_BACKOFF_MS = [1000, 3000];

// ─── Conversation Engine ───

export class ConversationEngine {
  private sessions = new Map<string, PipelineSession>();
  private emitters = new Map<string, EventEmitter>();
  private facade: WorkspaceFacade;
  private db: Database.Database;

  constructor(facade: WorkspaceFacade) {
    this.facade = facade;
    this.db = facade.context.db.inner;
    this.reloadSessions();
  }

  // ─── Session Management ───

  private sessionKey(projectId: string, userId: string): string {
    return `${projectId}:${userId}`;
  }

  getSession(
    projectId: string,
    userId: string,
  ): PipelineSession | undefined {
    return this.sessions.get(this.sessionKey(projectId, userId));
  }

  getEmitter(projectId: string, userId: string): EventEmitter {
    const key = this.sessionKey(projectId, userId);
    let emitter = this.emitters.get(key);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(20);
      this.emitters.set(key, emitter);
    }
    return emitter;
  }

  getSnapshot(projectId: string, userId: string): SessionSnapshot | null {
    const session = this.getSession(projectId, userId);
    if (!session) return null;
    return {
      phase: session.phase,
      conversationHistory: session.conversationHistory,
      activeSpecId: session.activeSpecId,
      autopilot: session.autopilot,
      cost: { ...session.cost },
      status: session.status,
      ...(session.executing && session.executeStartedAt
        ? {
            executionProgress: {
              tasksTotal: 0,
              tasksCompleted: 0,
              currentTask: null,
            },
          }
        : {}),
    };
  }

  startSession(projectId: string, userId: string): PipelineSession {
    const key = this.sessionKey(projectId, userId);
    const existing = this.sessions.get(key);
    if (existing && existing.status === "active") {
      return existing;
    }

    const session: PipelineSession = {
      id: `ps-${randomUUID()}`,
      projectId,
      userId,
      phase: "understand",
      conversationHistory: [],
      activeSpecId: null,
      activePlanId: null,
      autopilot: false,
      cost: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      streaming: false,
      executing: false,
    };

    this.sessions.set(key, session);
    this.persistSession(session);
    return session;
  }

  setPhase(
    projectId: string,
    userId: string,
    phase: WorkflowPhase,
  ): void {
    const session = this.getSession(projectId, userId);
    if (!session) return;
    session.phase = phase;
    session.conversationHistory = []; // Phase-boundary reset
    session.updatedAt = new Date().toISOString();
    this.persistSession(session);
    this.emit(projectId, userId, {
      type: "phase_changed",
      data: { phase },
    });
  }

  setActiveSpecId(
    projectId: string,
    userId: string,
    specId: string,
  ): void {
    const session = this.getSession(projectId, userId);
    if (!session) return;
    session.activeSpecId = specId;
    this.persistSession(session);
  }

  setActivePlanId(
    projectId: string,
    userId: string,
    planId: string,
  ): void {
    const session = this.getSession(projectId, userId);
    if (!session) return;
    session.activePlanId = planId;
    this.persistSession(session);
  }

  setAutopilot(
    projectId: string,
    userId: string,
    enabled: boolean,
  ): void {
    const session = this.getSession(projectId, userId);
    if (!session) return;
    session.autopilot = enabled;
    this.persistSession(session);
  }

  completeSession(projectId: string, userId: string): void {
    const session = this.getSession(projectId, userId);
    if (!session) return;
    session.status = "completed";
    session.updatedAt = new Date().toISOString();
    this.persistSession(session);

    // Clean up emitter to prevent memory leak
    const key = this.sessionKey(projectId, userId);
    const emitter = this.emitters.get(key);
    if (emitter) {
      emitter.removeAllListeners();
      this.emitters.delete(key);
    }
  }

  // ─── Messaging ───

  async sendMessage(
    projectId: string,
    userId: string,
    userMessage: string,
  ): Promise<ConversationMessage> {
    const session = this.getSession(projectId, userId);
    if (!session) throw new Error("No active session");
    if (session.streaming)
      throw new Error("Already streaming — wait for current response");

    // Append user message (will be rolled back if API call fails)
    const userMsg: ConversationMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    session.conversationHistory.push(userMsg);

    // Emit status
    const statusMsg =
      PHASE_STATUS_MESSAGES[session.phase] ?? "Thinking...";
    this.emit(projectId, userId, {
      type: "status_update",
      data: { message: statusMsg },
    });

    // Build messages for Anthropic
    const systemPrompt = await this.buildSystemPrompt(session);
    const tools = this.getToolsForPhase(session.phase);
    const messages = this.toAnthropicMessages(session.conversationHistory);

    // Context window check
    const estimatedTokens = this.estimateTokens(systemPrompt, messages);
    if (estimatedTokens > MAX_CONTEXT_TOKENS) {
      await this.summarizeHistory(session);
    }

    // Call Anthropic with retry
    session.streaming = true;
    try {
      const response = await this.callAnthropicWithRetry(
        systemPrompt,
        messages,
        tools,
        projectId,
        userId,
      );

      // Process response
      const assistantMsg = this.processResponse(response, session);
      session.conversationHistory.push(assistantMsg);

      // Track cost
      if (response.usage) {
        session.cost.inputTokens += response.usage.input_tokens;
        session.cost.outputTokens += response.usage.output_tokens;
        session.cost.costUsd +=
          (response.usage.input_tokens / 1000) *
            PRICING.anthropic.inputPer1k +
          (response.usage.output_tokens / 1000) *
            PRICING.anthropic.outputPer1k;
        this.emit(projectId, userId, {
          type: "cost_update",
          data: { ...session.cost },
        });
      }

      session.updatedAt = new Date().toISOString();
      this.persistSession(session);

      // Emit the assistant message
      this.emit(projectId, userId, {
        type: "message",
        data: {
          role: "assistant",
          content: assistantMsg.content,
          toolUse: assistantMsg.toolUse ?? null,
        },
      });

      return assistantMsg;
    } catch (err) {
      // Roll back the user message so history doesn't have an orphaned user turn
      // (Anthropic API requires alternating roles)
      const lastMsg = session.conversationHistory[session.conversationHistory.length - 1];
      if (lastMsg === userMsg) {
        session.conversationHistory.pop();
      }
      throw err;
    } finally {
      session.streaming = false;
    }
  }

  // ─── Smart Discovery ───

  async getPreFilledFields(projectId: string): Promise<PreFilledField[]> {
    const knowledge = this.facade.contextRepo.getKnowledge({
      entityType: "project",
      entityId: projectId,
    });

    const preFilled: PreFilledField[] = [];

    for (const entry of knowledge) {
      if (entry.confidence >= CONFIDENCE_THRESHOLD && !entry.flagged) {
        preFilled.push({
          key: entry.key,
          value: entry.value,
          confidence: entry.confidence,
          source: entry.category,
        });
      }
    }

    return preFilled;
  }

  // ─── Session History ───

  getHistory(projectId: string): Array<{
    id: string;
    phase: string;
    status: string;
    costUsd: number;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, phase, status, total_cost_usd, created_at
         FROM pipeline_sessions
         WHERE project_id = ?
         ORDER BY created_at DESC`,
      )
      .all(projectId) as Array<{
      id: string;
      phase: string;
      status: string;
      total_cost_usd: number;
      created_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      phase: r.phase,
      status: r.status,
      costUsd: r.total_cost_usd,
      createdAt: r.created_at,
    }));
  }

  getConversationHistory(
    sessionId: string,
    userId?: string,
  ): ConversationMessage[] | null {
    const query = userId
      ? "SELECT conversation_history FROM pipeline_sessions WHERE id = ? AND user_id = ?"
      : "SELECT conversation_history FROM pipeline_sessions WHERE id = ?";
    const params = userId ? [sessionId, userId] : [sessionId];
    const row = this.db
      .prepare(query)
      .get(...params) as { conversation_history: string } | undefined;

    if (!row) return null;

    try {
      return JSON.parse(row.conversation_history) as ConversationMessage[];
    } catch {
      return [];
    }
  }

  // ─── Private: Anthropic API ───

  private resolveApiKey(): string {
    try {
      const integration =
        this.facade.integrations.getByProvider("anthropic");
      if (!integration || integration.status !== "connected") {
        throw new Error(
          "Anthropic API key not configured — add it in the Vault",
        );
      }
      const key = (integration.config?.apiKey as string) ?? null;
      if (!key) {
        throw new Error(
          "Anthropic API key is empty — update it in the Vault",
        );
      }
      return key;
    } catch (err) {
      if (err instanceof Error && err.message.includes("Vault"))
        throw err;
      throw new Error(
        "Failed to resolve Anthropic API key — check Vault settings",
      );
    }
  }

  private async callAnthropicWithRetry(
    system: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    projectId: string,
    userId: string,
  ): Promise<Anthropic.Message> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      try {
        const apiKey = this.resolveApiKey();
        const client = new Anthropic({ apiKey });

        const params: Anthropic.MessageCreateParams = {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages,
        };

        if (tools.length > 0) {
          params.tools = tools;
        }

        return await client.messages.create(params);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;

        // Don't retry auth failures
        if (
          msg.includes("401") ||
          msg.includes("auth") ||
          msg.includes("API key")
        ) {
          this.emit(projectId, userId, {
            type: "error",
            data: {
              message: "API key invalid — check Vault",
              recoverable: false,
            },
          });
          throw new Error("API key invalid — check Vault");
        }

        // Retry on timeout/rate limit
        if (attempt < MAX_RETRY) {
          const backoff = RETRY_BACKOFF_MS[attempt] ?? 3000;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    throw lastError ?? new Error("Anthropic API call failed");
  }

  private processResponse(
    response: Anthropic.Message,
    session: PipelineSession,
  ): ConversationMessage {
    let textContent = "";
    let toolUse: ConversationMessage["toolUse"] = null;

    for (const block of response.content) {
      if (block.type === "text") {
        textContent += block.text;
      } else if (block.type === "tool_use") {
        toolUse = {
          name: block.name,
          input: block.input as Record<string, unknown>,
        };
      }
    }

    if (toolUse) {
      this.emit(session.projectId, session.userId, {
        type: "artifact_created",
        data: { toolName: toolUse.name, input: toolUse.input },
      });
    }

    return {
      role: "assistant",
      content: textContent,
      timestamp: new Date().toISOString(),
      toolUse,
    };
  }

  // ─── Private: Prompt Building ───

  private async buildSystemPrompt(
    session: PipelineSession,
  ): Promise<string> {
    const parts: string[] = [];

    // Phase-specific instructions
    const phaseKey = session.phase as keyof typeof PHASE_PROMPTS;
    const phasePrompt =
      PHASE_PROMPTS[phaseKey] ?? PHASE_PROMPTS.understand;
    parts.push(phasePrompt);

    // Project context (knowledge summary)
    const summary = this.facade.contextRepo.getSummary(
      { entityType: "project", entityId: session.projectId },
      "project_brief",
    );
    if (summary?.content) {
      parts.push(
        `<client-provided-data>\n## Project Context\n${summary.content}\n</client-provided-data>`,
      );
    }

    // Previous phase artifacts
    if (session.activeSpecId && session.phase !== "understand" && session.phase !== "identify_problem") {
      parts.push(
        `## Active Spec ID\n${session.activeSpecId}\nUse this spec ID when creating plans or referencing the current spec.`,
      );
    }

    return parts.join("\n\n");
  }

  private getToolsForPhase(phase: WorkflowPhase): Anthropic.Tool[] {
    switch (phase) {
      case "identify_problem":
        return [PROBLEM_TOOL];
      case "spec":
        return [SPEC_TOOL];
      case "plan":
        return [PLAN_TOOL];
      case "verify":
        return [REVIEW_TOOL];
      default:
        return [];
    }
  }

  private toAnthropicMessages(
    history: ConversationMessage[],
  ): Anthropic.MessageParam[] {
    return history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  // ─── Private: Context Window Management ───

  private estimateTokens(
    system: string,
    messages: Anthropic.MessageParam[],
  ): number {
    // Rough estimate: 1 token per 4 chars
    let chars = system.length;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        chars += msg.content.length;
      }
    }
    return Math.ceil(chars / 4);
  }

  private async summarizeHistory(session: PipelineSession): Promise<void> {
    if (session.conversationHistory.length <= 4) return;

    // Keep last 4 messages, summarize the rest
    const toSummarize = session.conversationHistory.slice(0, -4);
    const toKeep = session.conversationHistory.slice(-4);

    const summaryText = toSummarize
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join("\n");

    // Choose role that won't create consecutive same-role entries with toKeep[0]
    const firstKeptRole = toKeep[0]?.role ?? "assistant";
    const summaryRole = firstKeptRole === "user" ? "assistant" : "user";

    const summaryMessage: ConversationMessage = {
      role: summaryRole,
      content: `[Previous conversation summary: ${summaryText}]`,
      timestamp: new Date().toISOString(),
    };

    session.conversationHistory = [summaryMessage, ...toKeep];
  }

  // ─── Private: Persistence ───

  private persistSession(session: PipelineSession): void {
    const historyJson = JSON.stringify(session.conversationHistory);

    this.db
      .prepare(
        `INSERT INTO pipeline_sessions
           (id, project_id, user_id, phase, conversation_history, active_spec_id,
            autopilot, total_input_tokens, total_output_tokens, total_cost_usd,
            status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           phase = excluded.phase,
           conversation_history = excluded.conversation_history,
           active_spec_id = excluded.active_spec_id,
           autopilot = excluded.autopilot,
           total_input_tokens = excluded.total_input_tokens,
           total_output_tokens = excluded.total_output_tokens,
           total_cost_usd = excluded.total_cost_usd,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(
        session.id,
        session.projectId,
        session.userId,
        session.phase,
        historyJson,
        session.activeSpecId,
        session.autopilot ? 1 : 0,
        session.cost.inputTokens,
        session.cost.outputTokens,
        session.cost.costUsd,
        session.status,
        session.createdAt,
        session.updatedAt,
      );
  }

  private reloadSessions(): void {
    try {
      const rows = this.db
        .prepare(
          "SELECT * FROM pipeline_sessions WHERE status = 'active'",
        )
        .all() as Array<Record<string, unknown>>;

      for (const row of rows) {
        let history: ConversationMessage[];
        try {
          history = JSON.parse(
            row.conversation_history as string,
          ) as ConversationMessage[];
        } catch {
          history = []; // Corrupt JSON fallback
        }

        const session: PipelineSession = {
          id: row.id as string,
          projectId: row.project_id as string,
          userId: row.user_id as string,
          phase: row.phase as WorkflowPhase,
          conversationHistory: history,
          activeSpecId: (row.active_spec_id as string) ?? null,
          activePlanId: null, // In-memory only, lost on restart
          autopilot: (row.autopilot as number) === 1,
          cost: {
            inputTokens: row.total_input_tokens as number,
            outputTokens: row.total_output_tokens as number,
            costUsd: row.total_cost_usd as number,
          },
          status: row.status as "active" | "completed" | "abandoned",
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
          streaming: false,
          executing: false,
        };

        this.sessions.set(
          this.sessionKey(session.projectId, session.userId),
          session,
        );
      }
    } catch (err) {
      // Table may not exist yet on first run before migration
      console.warn(
        "Pipeline session reload skipped:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ─── Private: Event Emission ───

  private emit(
    projectId: string,
    userId: string,
    event: EngineEvent,
  ): void {
    const emitter = this.emitters.get(
      this.sessionKey(projectId, userId),
    );
    if (emitter) {
      emitter.emit("event", event);
    }
  }
}
