import { create } from "zustand";
import type {
  ProjectView,
  ClientView,
  PortfolioGroup,
  PipelineView,
  TimelineEvent,
} from "./types";

interface PrismStore {
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
}

export const useStore = create<PrismStore>((set, get) => ({
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
  searchQuery: "",

  loadPortfolio: async () => {
    set({ portfolioLoading: true, portfolioError: null });
    try {
      const result = await window.prism.listPortfolio();
      if (result.error) throw new Error(result.error);
      const { projects, clients } = result.data as {
        projects: ProjectView[];
        clients: ClientView[];
      };
      const groups = buildPortfolioGroups(projects, clients);
      set({
        projects,
        clients,
        portfolioGroups: groups,
        portfolioLoading: false,
      });
    } catch (err) {
      set({
        portfolioError:
          err instanceof Error ? err.message : String(err),
        portfolioLoading: false,
      });
    }
  },

  scanAllPipelines: async () => {
    const { projects } = get();
    const cache = new Map<string, PipelineView>();

    // Scan all projects in parallel (< 20 projects in MVP)
    const results = await Promise.allSettled(
      projects.map(async (p) => {
        const result = await window.prism.getProjectPipeline(p.id);
        if (result.error) return null;
        return { id: p.id, pipeline: result.data as PipelineView };
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        cache.set(result.value.id, result.value.pipeline);
      }
    }

    set({ pipelineCache: cache });
  },

  loadPipeline: async (projectId: string) => {
    set({ pipelineLoading: true });
    try {
      const result = await window.prism.getProjectPipeline(projectId);
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
      const result = await window.prism.getProjectTimeline(projectId);
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
    const result = await window.prism.createClient(name, notes);
    if (result.error) throw new Error(result.error);
    await get().loadPortfolio();
  },

  createProject: async (name, rootPath, clientAccountId) => {
    const result = await window.prism.createProject(
      name,
      rootPath,
      clientAccountId,
    );
    if (result.error) throw new Error(result.error);
    await get().loadPortfolio();
  },

  linkProject: async (rootPath, clientAccountId) => {
    const result = await window.prism.linkProject(rootPath, clientAccountId);
    if (result.error) throw new Error(result.error);
    await get().loadPortfolio();
  },

  runAction: async (projectId, action) => {
    const result = await window.prism.runAction(projectId, action);
    if (result.error) throw new Error(result.error);
    // Refresh timeline after action
    await get().loadTimeline(projectId);
  },
}));

function buildPortfolioGroups(
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
