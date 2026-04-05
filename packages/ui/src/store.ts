import { create } from "zustand";
import type {
  ProjectView,
  ClientView,
  PortfolioGroup,
  PipelineView,
  TimelineEvent,
  ProviderView,
  ContextItem,
  ExtractedKnowledge,
  KnowledgeSummary,
  ContextHealth,
  UsageStatus,
  ConversationMessage,
  PipelineSessionCost,
  PreFilledField,
  PipelineHistoryEntry,
} from "./types";
import type { PrismTransport } from "./transport";

export interface PrismStore {
  // Portfolio state
  clients: ClientView[];
  projects: ProjectView[];
  portfolioGroups: PortfolioGroup[];
  portfolioLoading: boolean;
  portfolioError: string | null;

  // Pipeline cache (scan-on-launch)
  pipelineCache: Map<string, PipelineView>;

  // Active project
  activeProjectId: string | null;
  activePipeline: PipelineView | null;
  pipelineLoading: boolean;
  activeTimeline: TimelineEvent[];

  // Session drawer
  drawerOpen: boolean;
  drawerProjectId: string | null;

  // Providers
  providers: ProviderView[];
  providersLoading: boolean;

  // Search
  searchQuery: string;

  // Usage & billing
  usage: UsageStatus | null;
  checkoutLoading: boolean;

  // Context dump
  contextItems: ContextItem[];
  contextKnowledge: ExtractedKnowledge[];
  contextSummary: KnowledgeSummary | null;
  contextHealth: ContextHealth | null;
  extractionQueue: { extracting: number; total: number };

  // Actions
  loadPortfolio: () => Promise<void>;
  scanAllPipelines: () => Promise<void>;
  loadPipeline: (projectId: string) => Promise<void>;
  loadTimeline: (projectId: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  toggleDrawer: (projectId?: string) => void;
  setSearchQuery: (query: string) => void;
  createClient: (name: string, notes?: string) => Promise<ClientView>;
  createProject: (
    name: string,
    rootPath?: string,
    clientAccountId?: string,
  ) => Promise<void>;
  linkProject: (rootPath: string, clientAccountId?: string) => Promise<void>;
  runAction: (projectId: string, action: string) => Promise<void>;

  // Provider actions
  loadProviders: () => Promise<void>;
  refreshProviders: () => Promise<void>;

  // Usage & billing actions
  loadUsage: () => Promise<void>;
  createCheckout: () => Promise<void>;

  // Context actions
  loadContext: (entityType: "project" | "client", entityId: string) => Promise<void>;
  addContextFiles: (entityType: "project" | "client", entityId: string, files: File[]) => Promise<void>;
  addContextNote: (entityType: "project" | "client", entityId: string, text: string) => Promise<void>;
  deleteContextItem: (id: string, entityType: "project" | "client", entityId: string) => Promise<void>;
  reExtractItem: (id: string, entityType: "project" | "client", entityId: string) => Promise<void>;
  flagKnowledge: (knowledgeId: string, entityType: "project" | "client", entityId: string) => Promise<void>;
  applyToBrief: (projectId: string, knowledgeId: string) => Promise<void>;
  searchKnowledge: (entityType: "project" | "client", entityId: string, query: string) => Promise<void>;
  contextSearchResults: ExtractedKnowledge[];
  clientSummary: KnowledgeSummary | null;

  // Pipeline conversation state
  pipelineSessionActive: boolean;
  pipelinePhase: string | null;
  conversationHistory: ConversationMessage[];
  streamingMessage: string | null;
  statusMessage: string | null;
  autopilotEnabled: boolean;
  executionProgress: { tasksTotal: number; tasksCompleted: number; currentTask: string | null };
  sessionCost: PipelineSessionCost;
  preFilledFields: PreFilledField[];
  pipelineHistory: PipelineHistoryEntry[];
  pipelineError: string | null;

  // Pipeline actions
  startPipelineSession: (projectId: string) => Promise<void>;
  sendPipelineMessage: (projectId: string, message: string) => Promise<void>;
  approvePipelineSpec: (projectId: string, specId: string) => Promise<void>;
  advancePipeline: (projectId: string) => Promise<void>;
  toggleAutopilot: (projectId: string, enabled: boolean) => Promise<void>;
  loadPipelineHistory: (projectId: string) => Promise<void>;
  loadPreFilledFields: (projectId: string) => Promise<void>;
  connectPipelineStream: (projectId: string) => () => void;
  disconnectPipelineStream: () => void;

  resetStore: () => void;
}

// Safe transport wrapper — catches transport-level errors
async function safeInvoke<T>(
  fn: () => Promise<{ data?: T; error?: string }>,
): Promise<{ data?: T; error?: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function computeHealthScore(
  items: ContextItem[],
  knowledge: ExtractedKnowledge[],
  summary: KnowledgeSummary | null,
): number {
  let score = 0;
  if (summary) score += 25;
  if (items.length >= 3) score += 25;
  if (items.some((i) => Date.now() - new Date(i.createdAt).getTime() < 30 * 86400000)) score += 25;
  if (new Set(knowledge.map((k) => k.category)).size >= 2) score += 25;
  return score;
}

export function createPrismStore(transport: PrismTransport) {
  return create<PrismStore>((set, get) => ({
    clients: [],
    projects: [],
    portfolioGroups: [],
    portfolioLoading: false,
    portfolioError: null,
    pipelineCache: new Map(),
    activeProjectId: null,
    activePipeline: null,
    pipelineLoading: false,
    activeTimeline: [],
    drawerOpen: false,
    drawerProjectId: null,
    providers: [],
    providersLoading: false,
    searchQuery: "",
    usage: null,
    checkoutLoading: false,
    contextItems: [],
    contextKnowledge: [],
    contextSummary: null,
    contextHealth: null,
    extractionQueue: { extracting: 0, total: 0 },
    contextSearchResults: [],
    clientSummary: null,

    // Pipeline conversation initial state
    pipelineSessionActive: false,
    pipelinePhase: null,
    conversationHistory: [],
    streamingMessage: null,
    statusMessage: null,
    autopilotEnabled: false,
    executionProgress: { tasksTotal: 0, tasksCompleted: 0, currentTask: null },
    sessionCost: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    preFilledFields: [],
    pipelineHistory: [],
    pipelineError: null,

    loadPortfolio: async () => {
      set({ portfolioLoading: true, portfolioError: null });
      try {
        const result = await safeInvoke(() => transport.listPortfolio());
        if (result.error) throw new Error(result.error);
        const { projects, clients } = result.data as {
          projects: ProjectView[];
          clients: ClientView[];
        };
        const groups = buildPortfolioGroups(projects, clients);
        set({ projects, clients, portfolioGroups: groups });
      } catch (err) {
        set({ portfolioError: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ portfolioLoading: false });
      }
    },

    scanAllPipelines: async () => {
      const { projects } = get();
      const cache = new Map<string, PipelineView>();

      // Process in chunks of 5 to avoid overwhelming the API
      const CHUNK_SIZE = 5;
      for (let i = 0; i < projects.length; i += CHUNK_SIZE) {
        const chunk = projects.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map(async (p) => {
            const result = await safeInvoke(() => transport.getProjectPipeline(p.id));
            if (result.error) return null;
            return { id: p.id, pipeline: result.data as PipelineView };
          }),
        );
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            cache.set(result.value.id, result.value.pipeline);
          }
        }
      }

      set({ pipelineCache: cache });
    },

    loadPipeline: async (projectId: string) => {
      set({ pipelineLoading: true });
      try {
        const result = await safeInvoke(() => transport.getProjectPipeline(projectId));
        if (result.error) throw new Error(result.error);
        const pipeline = result.data as PipelineView;
        const cache = new Map(get().pipelineCache);
        cache.set(projectId, pipeline);
        set({ activePipeline: pipeline, pipelineCache: cache, pipelineLoading: false });
      } catch {
        set({ activePipeline: null, pipelineLoading: false });
      }
    },

    loadTimeline: async (projectId: string) => {
      try {
        const result = await safeInvoke(() => transport.getProjectTimeline(projectId));
        if (result.error) throw new Error(result.error);
        set({ activeTimeline: (result.data as TimelineEvent[]) || [] });
      } catch {
        set({ activeTimeline: [] });
      }
    },

    setActiveProject: (id) => set({ activeProjectId: id }),

    toggleDrawer: (projectId?: string) => {
      const { drawerOpen, drawerProjectId } = get();
      if (projectId && projectId !== drawerProjectId) {
        set({ drawerOpen: true, drawerProjectId: projectId });
      } else {
        set({
          drawerOpen: !drawerOpen,
          drawerProjectId: projectId || drawerProjectId,
        });
      }
    },

    setSearchQuery: (query) => set({ searchQuery: query }),

    createClient: async (name, notes) => {
      const result = await safeInvoke(() => transport.createClient(name, notes));
      if (result.error) throw new Error(result.error);
      const client = result.data as ClientView;
      get().loadPortfolio(); // fire-and-forget -- don't block wizard Step 2
      return client;
    },

    createProject: async (name, rootPath, clientAccountId) => {
      const result = await safeInvoke(() => transport.createProject(
        name,
        rootPath,
        clientAccountId,
      ));
      if (result.error) throw new Error(result.error);
      await get().loadPortfolio();
    },

    linkProject: async (rootPath, clientAccountId) => {
      const result = await safeInvoke(() => transport.linkProject(rootPath, clientAccountId));
      if (result.error) throw new Error(result.error);
      await get().loadPortfolio();
    },

    runAction: async (projectId, action) => {
      const result = await safeInvoke(() => transport.runAction(projectId, action));
      if (result.error) throw new Error(result.error);
      await get().loadTimeline(projectId);
    },

    loadProviders: async () => {
      set({ providersLoading: true });
      try {
        const result = await safeInvoke(() => transport.listProviders());
        if (result.error) throw new Error(result.error);
        set({ providers: (result.data as ProviderView[]) || [] });
      } catch {
        set({ providers: [] });
      } finally {
        set({ providersLoading: false });
      }
    },

    refreshProviders: async () => {
      try {
        const result = await safeInvoke(() => transport.checkProviderHealth());
        if (result.error) throw new Error(result.error);
        set({ providers: (result.data as ProviderView[]) || [] });
      } catch {
        // Keep existing providers on refresh failure
      }
    },

    loadUsage: async () => {
      try {
        const result = await safeInvoke(() => transport.getUsage());
        if (result.error) throw new Error(result.error);
        set({ usage: result.data as UsageStatus });
      } catch {
        // Keep existing usage on failure
      }
    },

    createCheckout: async () => {
      set({ checkoutLoading: true });
      try {
        const result = await safeInvoke(() => transport.createCheckout());
        if (result.error) throw new Error(result.error);
        const { url } = result.data as { url: string };
        if (url) window.location.href = url;
      } catch {
        // Checkout failed — button re-enables
      } finally {
        set({ checkoutLoading: false });
      }
    },

    loadContext: async (entityType, entityId) => {
      try {
        const [itemsResult, knowledgeResult, summaryResult] = await Promise.all([
          safeInvoke(() => transport.getContextItems(entityType, entityId)),
          safeInvoke(() => transport.getKnowledge(entityType, entityId)),
          safeInvoke(() => transport.getSummary(entityType, entityId)),
        ]);

        const items = (itemsResult.data as ContextItem[] | undefined) || [];
        const knowledge = (knowledgeResult.data as ExtractedKnowledge[] | undefined) || [];
        const summary = (summaryResult.data as KnowledgeSummary | undefined) || null;

        const extracting = items.filter((i) => i.extractionStatus === "extracting").length;
        const queued = items.filter((i) => i.extractionStatus === "queued").length;
        const categories = new Set(knowledge.map((k) => k.category));

        const health: ContextHealth = {
          score: computeHealthScore(items, knowledge, summary),
          hasProfile: summary !== null,
          hasDocs: items.length >= 3,
          recent: items.some((i) => Date.now() - new Date(i.createdAt).getTime() < 30 * 86400000),
          hasCategories: categories.size >= 2,
        };

        // 3C: If loading project context, also fetch parent client summary
        let parentClientSummary: KnowledgeSummary | null = null;
        if (entityType === "project") {
          const { projects } = get();
          const project = projects.find((p) => p.id === entityId);
          if (project?.clientAccountId) {
            const clientResult = await safeInvoke(() => transport.getSummary("client", project.clientAccountId!));
            parentClientSummary = (clientResult.data as KnowledgeSummary | undefined) || null;
          }
        }

        set({
          contextItems: items,
          contextKnowledge: knowledge,
          contextSummary: summary,
          contextHealth: health,
          extractionQueue: { extracting, total: extracting + queued },
          clientSummary: parentClientSummary,
        });
      } catch {
        set({ contextItems: [], contextKnowledge: [], contextSummary: null, contextHealth: null, clientSummary: null });
      }
    },

    addContextFiles: async (entityType, entityId, files) => {
      const failed: string[] = [];
      for (const file of files) {
        const result = await safeInvoke(() =>
          transport.addContextItem({
            entityType,
            entityId,
            itemType: "file",
            title: file.name,
            fileSizeBytes: file.size,
            mimeType: file.type || undefined,
            file,
          }),
        );
        if (result.error) failed.push(file.name);
      }
      await get().loadContext(entityType, entityId);
      if (failed.length > 0) throw new Error(`Failed to upload: ${failed.join(", ")}`);
    },

    addContextNote: async (entityType, entityId, text) => {
      await safeInvoke(() =>
        transport.addContextItem({
          entityType,
          entityId,
          itemType: "text_note",
          title: text.slice(0, 60) + (text.length > 60 ? "..." : ""),
          content: text,
        }),
      );
      await get().loadContext(entityType, entityId);
    },

    deleteContextItem: async (id, entityType, entityId) => {
      await safeInvoke(() => transport.deleteContextItem(id));
      await get().loadContext(entityType, entityId);
    },

    reExtractItem: async (id, entityType, entityId) => {
      await safeInvoke(() => transport.reExtractItem(id));
      await get().loadContext(entityType, entityId);
    },

    flagKnowledge: async (knowledgeId, entityType, entityId) => {
      await safeInvoke(() => transport.flagKnowledge(knowledgeId));
      await get().loadContext(entityType, entityId);
    },

    applyToBrief: async (projectId, knowledgeId) => {
      await safeInvoke(() => transport.applyToBrief(projectId, knowledgeId));
    },

    searchKnowledge: async (entityType, entityId, query) => {
      if (!query.trim()) {
        set({ contextSearchResults: [] });
        return;
      }
      const result = await safeInvoke(() => transport.searchKnowledge(entityType, entityId, query));
      set({ contextSearchResults: (result.data as ExtractedKnowledge[] | undefined) || [] });
    },

    // --- Pipeline actions ---
    startPipelineSession: async (projectId) => {
      set({ pipelineError: null, statusMessage: "Resuming pipeline..." });
      const result = await safeInvoke(() => transport.resumePipeline(projectId));
      if (result.error) {
        set({ pipelineError: result.error, statusMessage: null });
        return;
      }
      const data = result.data as { session: { id: string; phase: string; cost: PipelineSessionCost; autopilot: boolean; activeSpecId: string | null } };
      const s = data.session;
      set({
        pipelineSessionActive: true,
        pipelinePhase: s.phase,
        conversationHistory: [],
        sessionCost: s.cost || { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        autopilotEnabled: s.autopilot || false,
        statusMessage: null,
      });
    },

    sendPipelineMessage: async (projectId, message) => {
      // Optimistically add user message
      const userMsg: ConversationMessage = { role: "user", content: message, timestamp: new Date().toISOString() };
      set((s) => ({ conversationHistory: [...s.conversationHistory, userMsg], pipelineError: null }));
      const result = await safeInvoke(() => transport.sendPipelineMessage(projectId, message));
      if (result.error) {
        // Roll back the optimistic user message on failure
        set((s) => ({
          pipelineError: result.error!,
          conversationHistory: s.conversationHistory.filter((m) => m !== userMsg),
        }));
        return;
      }
      const data = result.data as { message: ConversationMessage; phase: string; cost: PipelineSessionCost };
      set((s) => ({
        conversationHistory: [...s.conversationHistory, data.message],
        pipelinePhase: data.phase,
        sessionCost: data.cost,
      }));
    },

    approvePipelineSpec: async (projectId, specId) => {
      const result = await safeInvoke(() => transport.approvePipelineSpec(projectId, specId));
      if (result.error) {
        set({ pipelineError: result.error });
        return;
      }
    },

    advancePipeline: async (projectId) => {
      const result = await safeInvoke(() => transport.advancePipeline(projectId));
      if (result.error) {
        set({ pipelineError: result.error });
        return;
      }
      const data = result.data as { phase: string; advanced: boolean };
      if (data.advanced) {
        set({ pipelinePhase: data.phase, conversationHistory: [] });
      }
    },

    toggleAutopilot: async (projectId, enabled) => {
      const result = await safeInvoke(() => transport.togglePipelineAutopilot(projectId, enabled));
      if (result.error) {
        set({ pipelineError: result.error });
        return;
      }
      set({ autopilotEnabled: enabled });
    },

    loadPipelineHistory: async (projectId) => {
      const result = await safeInvoke(() => transport.getPipelineHistory(projectId));
      if (result.error) return;
      set({ pipelineHistory: (result.data as PipelineHistoryEntry[]) || [] });
    },

    loadPreFilledFields: async (projectId) => {
      const result = await safeInvoke(() => transport.getPipelinePreFilled(projectId));
      if (result.error) return;
      set({ preFilledFields: (result.data as PreFilledField[]) || [] });
    },

    connectPipelineStream: (projectId) => {
      const es = transport.getPipelineStream(projectId);
      if (!es) return () => {};

      es.addEventListener("message", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "message" && data.data?.role === "assistant") {
            // Only add SSE-delivered messages if they aren't duplicates
            // (sendPipelineMessage already appends the response from POST /message)
            set((s) => {
              const last = s.conversationHistory[s.conversationHistory.length - 1];
              if (last?.role === "assistant" && last?.content === data.data.content) {
                return {}; // Skip duplicate
              }
              return { conversationHistory: [...s.conversationHistory, { role: data.data.role, content: data.data.content, timestamp: new Date().toISOString() }] };
            });
          } else if (data.type === "phase_changed") {
            set({ pipelinePhase: data.data?.phase, conversationHistory: [] });
          } else if (data.type === "cost_update") {
            set({ sessionCost: data.data });
          } else if (data.type === "status_update") {
            set({ statusMessage: data.data?.message });
          } else if (data.type === "execution_progress") {
            set({ executionProgress: data.data?.progress });
          } else if (data.type === "error") {
            set({ pipelineError: data.data?.message });
          } else if (data.type === "snapshot") {
            // Full state snapshot on reconnect
            const snap = data.data;
            if (snap) {
              set({
                pipelinePhase: snap.phase,
                conversationHistory: snap.conversationHistory || [],
                sessionCost: snap.cost || { inputTokens: 0, outputTokens: 0, costUsd: 0 },
                autopilotEnabled: snap.autopilot || false,
                pipelineSessionActive: true,
              });
            }
          }
        } catch {
          // Ignore malformed SSE data
        }
      });

      es.onerror = () => {
        set({ statusMessage: "Connection lost. Reconnecting..." });
      };

      // Store cleanup reference
      const cleanup = () => { es.close(); };
      return cleanup;
    },

    disconnectPipelineStream: () => {
      // Caller manages cleanup via the return value of connectPipelineStream
      set({ pipelineSessionActive: false, streamingMessage: null, statusMessage: null });
    },

    resetStore: () => {
      set({
        clients: [],
        projects: [],
        portfolioGroups: [],
        portfolioLoading: false,
        portfolioError: null,
        pipelineCache: new Map(),
        activeProjectId: null,
        activePipeline: null,
        pipelineLoading: false,
        activeTimeline: [],
        drawerOpen: false,
        drawerProjectId: null,
        providers: [],
        providersLoading: false,
        searchQuery: "",
        usage: null,
        checkoutLoading: false,
        contextItems: [],
        contextKnowledge: [],
        contextSummary: null,
        contextHealth: null,
        extractionQueue: { extracting: 0, total: 0 },
        contextSearchResults: [],
        clientSummary: null,
        // Pipeline reset
        pipelineSessionActive: false,
        pipelinePhase: null,
        conversationHistory: [],
        streamingMessage: null,
        statusMessage: null,
        autopilotEnabled: false,
        executionProgress: { tasksTotal: 0, tasksCompleted: 0, currentTask: null },
        sessionCost: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
        preFilledFields: [],
        pipelineHistory: [],
        pipelineError: null,
      });
    },
  }));
}

export function buildPortfolioGroups(
  projects: ProjectView[],
  clients: ClientView[],
): PortfolioGroup[] {
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const grouped = new Map<string | null, ProjectView[]>();

  for (const project of projects) {
    const key = project.clientAccountId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(project);
  }

  const groups: PortfolioGroup[] = [];

  // Client-grouped projects first
  for (const [clientId, clientProjects] of grouped) {
    if (clientId) {
      groups.push({
        client: clientMap.get(clientId) || null,
        projects: clientProjects,
      });
    }
  }

  // Ungrouped projects last
  const ungrouped = grouped.get(null);
  if (ungrouped?.length) {
    groups.push({ client: null, projects: ungrouped });
  }

  return groups;
}
