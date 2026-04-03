import { useEffect, useState } from "react";
import { useStore } from "../store";
import { ProjectCard } from "./ProjectCard";
import { CreateClientModal } from "./CreateClientModal";
import { CreateProjectModal } from "./CreateProjectModal";

export function Portfolio() {
  const {
    portfolioGroups,
    portfolioLoading,
    portfolioError,
    pipelineCache,
    searchQuery,
    loadPortfolio,
    scanAllPipelines,
  } = useStore();

  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

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
      {filteredGroups.map((group, idx) => (
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
      ))}

      {/* Modals */}
      {showCreateClient && (
        <CreateClientModal onClose={() => setShowCreateClient(false)} />
      )}
      {showCreateProject && (
        <CreateProjectModal onClose={() => setShowCreateProject(false)} />
      )}
    </div>
  );
}
