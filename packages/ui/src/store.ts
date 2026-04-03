import { create } from "zustand";
import type {
  ProjectView,
  ClientView,
  PortfolioGroup,
  PipelineView,
  TimelineEvent,
  ProviderView,
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

  // Actions
  loadPortfolio: () => Promise<void>;
  scanAllPipelines: () => Promise<void>;
  loadPipeline: (projectId: string) => Promise<void>;
  loadTimeline: (projectId: string) => Promise<void>;
  setActiveProject: (id: string | null) => void;
  toggleDrawer: (projectId?: string) => void;
  setSearchQuery: (query: string) => void;
  createClient: (name: string, notes?: string) => Promise<void>;
  createProject: (
    name: string,
    rootPath: string,
    clientAccountId?: string,
  ) => Promise<void>;
  linkProject: (rootPath: string, clientAccountId?: string) => Promise<void>;
  runAction: (projectId: string, action: string) => Promise<void>;
  loadProviders: () => Promise<void>;
  refreshProviders: () => Promise<void>;
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
      await get().loadPortfolio();
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
