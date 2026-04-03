import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProgressBar } from "@heroui/react";
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
              {summary.brandColors.map((color) => (
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        Loading workspace...
      </div>
    );
  }

  if (portfolioError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 12,
        }}
      >
        <span style={{ color: "var(--accent-red)", fontSize: 14 }}>
          {portfolioError}
        </span>
        <button
          onClick={() => loadPortfolio()}
          style={{
            padding: "6px 16px",
            background: "var(--bg-elevated)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const isEmpty = filteredGroups.length === 0 && !searchQuery;

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: "24px 32px",
      }}
    >
      {/* Actions bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Portfolio
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowCreateClient(true)}
            style={{
              padding: "6px 14px",
              background: "var(--bg-elevated)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            + Client
          </button>
          <button
            onClick={() => setShowCreateProject(true)}
            style={{
              padding: "6px 14px",
              background: "var(--accent-blue)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            + Project
          </button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60%",
            gap: 16,
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            Welcome to Prism
          </span>
          <span
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              textAlign: "center",
              maxWidth: 400,
            }}
          >
            Create a client and link your first project to see its pipeline
            progress here.
          </span>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setShowCreateClient(true)}
              style={{
                padding: "8px 20px",
                background: "var(--bg-elevated)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Create Client
            </button>
            <button
              onClick={() => setShowCreateProject(true)}
              style={{
                padding: "8px 20px",
                background: "var(--accent-blue)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#fff",
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Link Project
            </button>
          </div>
        </div>
      )}

      {/* Client groups */}
      {filteredGroups.map((group, idx) => {
        const profile = group.client
          ? clientProfiles.get(group.client.id)
          : undefined;

        return (
        <div key={group.client?.id || `ungrouped-${idx}`} style={{ marginBottom: 28 }}>
          {/* Client header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {group.client?.name || "Unassigned"}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}
            >
              {group.projects.length} project
              {group.projects.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Client profile banner */}
          {group.client && profile && (profile.summary || profile.health) && (
            <ClientProfileBanner client={group.client} profile={profile} />
          )}

          {/* Project cards grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
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
