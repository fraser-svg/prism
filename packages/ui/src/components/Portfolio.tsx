import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePrismStore } from "../context";
import { ProjectCard } from "./ProjectCard";
import { CreateClientModal } from "./CreateClientModal";
import { CreateProjectModal } from "./CreateProjectModal";
import { OnboardingGuide } from "./OnboardingGuide";

interface PortfolioProps {
  onBrowse?: () => Promise<string | null>;
  hasGitHub?: boolean;
}

export function Portfolio({ onBrowse, hasGitHub = false }: PortfolioProps) {
  const {
    clients,
    projects,
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPortfolio().then(() => scanAllPipelines());
  }, [loadPortfolio, scanAllPipelines]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

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
      <div className="h-full overflow-auto px-8 py-10">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <div className="h-5 w-20 animate-pulse rounded bg-stone-200" />
            <div className="mt-2 h-4 w-36 animate-pulse rounded bg-stone-100" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-lg bg-stone-200" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-stone-200 bg-[var(--bg-surface)] p-5"
            >
              <div className="mb-3 h-4 w-32 animate-pulse rounded bg-stone-200" />
              <div className="mb-2 h-3 w-48 animate-pulse rounded bg-stone-100" />
              <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-stone-100" />
            </div>
          ))}
        </div>
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

  const showOnboarding = projects.length === 0 && !searchQuery;

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
        <div className="relative" ref={dropdownRef}>
          <button
            className="rounded-lg bg-stone-800 px-3 py-1.5 text-[15px] font-medium text-white transition-colors hover:bg-stone-700"
            onClick={() => setDropdownOpen((v) => !v)}
          >
            + New
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] py-1 shadow-lg">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[15px] text-black transition-colors hover:bg-stone-50"
                onClick={() => { setDropdownOpen(false); setShowCreateClient(true); }}
              >
                <span className="material-symbols-outlined text-stone-700" style={{ fontSize: 16 }}>person_add</span>
                New Client
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[15px] text-black transition-colors hover:bg-stone-50"
                onClick={() => { setDropdownOpen(false); setShowCreateProject(true); }}
              >
                <span className="material-symbols-outlined text-stone-700" style={{ fontSize: 16 }}>add_circle</span>
                New Project
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Onboarding guide for new users */}
      {showOnboarding && (
        <OnboardingGuide
          hasGitHub={hasGitHub}
          hasClients={clients.length > 0}
          hasProjects={projects.length > 0}
          onConnectGitHub={() => {
            window.location.href = "/api/auth/sign-in/social?provider=github&callbackURL=/";
          }}
          onCreateClient={() => setShowCreateClient(true)}
          onCreateProject={() => setShowCreateProject(true)}
        />
      )}

      {/* Client groups */}
      {!showOnboarding && filteredGroups.map((group, idx) => (
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
                className="flex items-center gap-1 text-[15px] text-stone-900 transition-colors hover:text-black"
                onClick={() => navigate(`/clients/${group.client!.id}/context`)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>psychology</span>
                Knowledge
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
          onClose={() => setShowCreateProject(false)}
          onBrowse={onBrowse}
          defaultClientId={clients.length === 1 ? clients[0].id : undefined}
        />
      )}
    </div>
  );
}
