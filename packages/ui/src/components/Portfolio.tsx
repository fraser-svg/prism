import { useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { usePrismStore } from "../context";
import { ProjectCard } from "./ProjectCard";
import { CreateClientModal } from "./CreateClientModal";
import { CreateProjectModal } from "./CreateProjectModal";

interface PortfolioProps {
  onBrowse?: () => Promise<string | null>;
}

export function Portfolio({ onBrowse }: PortfolioProps) {
  const {
    portfolioGroups,
    portfolioLoading,
    portfolioError,
    pipelineCache,
    searchQuery,
    loadPortfolio,
    scanAllPipelines,
  } = usePrismStore();

  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [initialProjectPath, setInitialProjectPath] = useState("");
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    loadPortfolio().then(() => scanAllPipelines());
  }, [loadPortfolio, scanAllPipelines]);

  // Filter by search
  const filteredGroups = searchQuery
    ? portfolioGroups
        .map((group) => ({
          ...group,
          projects: group.projects.filter(
            (p) =>
              p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              p.slug.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        }))
        .filter(
          (group) =>
            group.projects.length > 0 ||
            group.client?.name
              .toLowerCase()
              .includes(searchQuery.toLowerCase()),
        )
    : portfolioGroups;

  if (portfolioLoading && portfolioGroups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Loading workspace..." />
      </div>
    );
  }

  if (portfolioError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-danger">{portfolioError}</span>
        <Button size="sm" variant="tertiary" onPress={() => loadPortfolio()}>
          Retry
        </Button>
      </div>
    );
  }

  const isEmpty = filteredGroups.length === 0 && !searchQuery;

  const openCreateProject = async () => {
    if (!onBrowse) {
      setInitialProjectPath("");
      setShowCreateProject(true);
      return;
    }

    if (browsing) return;
    setBrowsing(true);
    try {
      const selected = await onBrowse();
      if (!selected) return;
      setInitialProjectPath(selected);
      setShowCreateProject(true);
    } finally {
      setBrowsing(false);
    }
  };

  const closeCreateProject = () => {
    setShowCreateProject(false);
    setInitialProjectPath("");
  };

  return (
    <div className="h-full overflow-auto px-8 py-6">
      {/* Actions bar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Portfolio</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => setShowCreateClient(true)}
          >
            + Client
          </Button>
          <Button
            size="sm"
            variant="primary"
            isDisabled={browsing}
            onPress={openCreateProject}
          >
            {browsing ? "Opening..." : "+ Project"}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex h-[60%] flex-col items-center justify-center gap-4">
          <span className="text-lg font-medium text-[var(--foreground)]">
            Welcome to Prism
          </span>
          <span className="max-w-[400px] text-center text-sm text-[var(--muted)]">
            Create a client and link your first project to see its pipeline
            progress here.
          </span>
          <div className="mt-2 flex gap-2">
            <Button variant="tertiary" onPress={() => setShowCreateClient(true)}>
              Create Client
            </Button>
            <Button
              variant="primary"
              isDisabled={browsing}
              onPress={openCreateProject}
            >
              {browsing ? "Opening..." : "Link Project"}
            </Button>
          </div>
        </div>
      )}

      {/* Client groups */}
      {filteredGroups.map((group, idx) => (
        <div key={group.client?.id || `ungrouped-${idx}`} className="mb-7">
          {/* Client header */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {group.client?.name || "Unassigned"}
            </span>
            <span className="text-[11px] text-[var(--field-placeholder)]">
              {group.projects.length} project
              {group.projects.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Project cards grid */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
            {group.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                pipeline={pipelineCache.get(project.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Modals */}
      {showCreateClient && (
        <CreateClientModal onClose={() => setShowCreateClient(false)} />
      )}
      {showCreateProject && (
        <CreateProjectModal
          onClose={closeCreateProject}
          onBrowse={onBrowse}
          initialRootPath={initialProjectPath}
        />
      )}
    </div>
  );
}
