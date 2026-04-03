// Components
export { AppShell } from "./components/AppShell";
export { ControlRoom } from "./components/ControlRoom";
export { CreateClientModal } from "./components/CreateClientModal";
export { CreateProjectModal } from "./components/CreateProjectModal";
export { PipelineStrip } from "./components/PipelineStrip";
export { Portfolio } from "./components/Portfolio";
export { Providers } from "./components/Providers";
export { ProjectCard } from "./components/ProjectCard";
export { SessionDrawer } from "./components/SessionDrawer";
export { ClientContextPage } from "./components/ClientContextPage";
export { ContextTab } from "./components/ContextTab";

// Store
export { createPrismStore, buildPortfolioGroups } from "./store";
export type { PrismStore } from "./store";

// Transport
export { IpcTransport, FetchTransport } from "./transport";
export type { PrismTransport } from "./transport";

// Context
export { PrismStoreContext, usePrismStore } from "./context";

// Types
export type {
  PrismAPI,
  IpcResult,
  StageView,
  PipelineView,
  ProjectView,
  ClientView,
  PortfolioGroup,
  ProviderView,
  TimelineEvent,
  ContextItem,
  ExtractedKnowledge,
  KnowledgeSummary,
  ContextHealth,
} from "./types";
