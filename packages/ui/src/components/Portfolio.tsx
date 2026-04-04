import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

  const navigate = useNavigate();
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [initialProjectPath, setInitialProjectPath] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const browsingRef = useRef(false);

  useEffect(() => {
    loadPortfolio().then(() => scanAllPipelines());
  }, [loadPortfolio, scanAllPipelines]);

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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
      </div>
    );
  }

  if (portfolioError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-sm text-red-500">{portfolioError}</span>
        <button
          className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-800 transition-colors hover:bg-stone-50"
          onClick={() => loadPortfolio()}
        >
          Retry
        </button>
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

    if (browsingRef.current) return;
    browsingRef.current = true;
    setBrowsing(true);
    try {
      const selected = await onBrowse();
      setInitialProjectPath(selected || "");
      setShowCreateProject(true);
    } finally {
      browsingRef.current = false;
      setBrowsing(false);
    }
  };

  const closeCreateProject = () => {
    setShowCreateProject(false);
    setInitialProjectPath("");
  };

  return (
    <div className="h-full overflow-auto px-8 py-10">
      {/* Header */}
      <header className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-[17px] font-medium text-black">
            Portfolio
          </h1>
          <p className="text-[15px] text-stone-900">
            Your active projects
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-[15px] text-stone-800 transition-colors hover:bg-stone-50"
            onClick={() => setShowCreateClient(true)}
          >
            + Client
          </button>
          <button
            className="rounded-lg bg-stone-800 px-3 py-1.5 text-[15px] font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
            disabled={browsing}
            onClick={openCreateProject}
          >
            {browsing ? "Opening..." : "+ Project"}
          </button>
        </div>
      </header>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex h-[60%] flex-col items-center justify-center gap-3">
          <span className="text-[17px] font-medium text-black">
            Welcome to Prismatic
          </span>
          <span className="max-w-[360px] text-center text-[15px] text-stone-900">
            Create a client and link your first project to see its pipeline progress here.
          </span>
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg border border-stone-200 px-4 py-2 text-[15px] text-stone-800 transition-colors hover:bg-stone-50"
              onClick={() => setShowCreateClient(true)}
            >
              Create Client
            </button>
            <button
              className="rounded-lg bg-stone-800 px-4 py-2 text-[15px] font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
              disabled={browsing}
              onClick={openCreateProject}
            >
              {browsing ? "Opening..." : "Link Project"}
            </button>
          </div>
        </div>
      )}

      {/* Client groups */}
      {filteredGroups.map((group, idx) => (
        <section key={group.client?.id || `ungrouped-${idx}`} className="mb-12">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h3 className="text-[17px] font-medium text-black">
                {group.client?.name || "Unassigned"}
              </h3>
              <span className="rounded-full bg-[#91A6FF]/20 px-2 py-0.5 text-[13px] font-medium text-[#4A5A99]">
                {group.projects.length}
              </span>
            </div>
            {group.client && (
              <button
                className="text-[15px] text-stone-900 transition-colors hover:text-black"
                onClick={() => navigate(`/clients/${group.client!.id}/context`)}
              >
                View All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                pipeline={pipelineCache.get(project.id)}
              />
            ))}
          </div>
        </section>
      ))}

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
