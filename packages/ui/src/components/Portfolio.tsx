import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, ProgressBar, Spinner } from "@heroui/react";
import { usePrismStore } from "../context";
import { ProjectCard } from "./ProjectCard";
import { CreateClientModal } from "./CreateClientModal";
import { CreateProjectModal } from "./CreateProjectModal";
import type { ClientView, KnowledgeSummary, ContextHealth } from "../types";

interface ClientProfileData {
  summary: KnowledgeSummary | null;
  health: ContextHealth | null;
}

function ClientProfileBanner({
  client,
  profile,
}: {
  client: ClientView;
  profile: ClientProfileData;
}) {
  const navigate = useNavigate();
  const { summary, health } = profile;
  if (!summary && !health) return null;

  const healthColor =
    health && health.score >= 76
      ? "success"
      : health && health.score >= 26
        ? "warning"
        : "danger";

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {client.name}
          </span>
          {summary && (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginTop: 4,
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {summary.summaryText}
            </p>
          )}
          {summary?.brandColors && summary.brandColors.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {summary.brandColors
                .filter((c) => /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(c))
                .map((color) => (
                <div
                  key={color}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background: color,
                    border: "1px solid var(--border-default)",
                  }}
                  title={color}
                />
              ))}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
            marginLeft: 16,
            flexShrink: 0,
          }}
        >
          {health && (
            <div style={{ width: 120 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Context
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      health.score >= 76
                        ? "var(--accent-green)"
                        : health.score >= 26
                          ? "var(--accent-amber)"
                          : "var(--accent-red)",
                  }}
                >
                  {health.score}%
                </span>
              </div>
              <ProgressBar value={health.score} color={healthColor} size="sm" />
            </div>
          )}
          <button
            onClick={() => navigate(`/clients/${client.id}/context`)}
            style={{
              background: "none",
              border: "none",
              color: "var(--accent-blue)",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              padding: 0,
            }}
          >
            View Knowledge &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [clientProfiles, setClientProfiles] = useState<Map<string, ClientProfileData>>(new Map());

  useEffect(() => {
    loadPortfolio().then(() => scanAllPipelines());
  }, [loadPortfolio, scanAllPipelines]);

  // Fetch client profile data for banner display
  useEffect(() => {
    const clients = portfolioGroups
      .map((g) => g.client)
      .filter((c): c is ClientView => c !== null);
    if (clients.length === 0) return;

    // Build profiles from available data — backend will populate when context APIs are wired
    const profiles = new Map<string, ClientProfileData>();
    for (const client of clients) {
      profiles.set(client.id, { summary: null, health: null });
    }
    setClientProfiles(profiles);
  }, [portfolioGroups]);

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
        <Spinner size="lg" />
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
            onPress={() => setShowCreateProject(true)}
          >
            + Project
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
              onPress={() => setShowCreateProject(true)}
            >
              Link Project
            </Button>
          </div>
        </div>
      )}

      {/* Client groups */}
      {filteredGroups.map((group, idx) => {
        const profile = group.client
          ? clientProfiles.get(group.client.id)
          : undefined;

        return (
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

          {/* Client profile banner */}
          {group.client && profile && (profile.summary || profile.health) && (
            <ClientProfileBanner client={group.client} profile={profile} />
          )}

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
        );
      })}

      {/* Modals */}
      {showCreateClient && (
        <CreateClientModal onClose={() => setShowCreateClient(false)} />
      )}
      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onBrowse={onBrowse}
        />
      )}
    </div>
  );
}
