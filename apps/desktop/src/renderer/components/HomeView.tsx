import { useCallback } from "react";
import { usePrismQuery } from "../hooks/usePrism";
import { HealthBadge } from "./HealthBadge";
import type { WorkspaceStatus } from "../types";

interface HomeViewProps {
  onSelectProject: (id: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function HomeView({ onSelectProject, sidebarOpen, onToggleSidebar }: HomeViewProps) {
  const { data: status, loading, error } = usePrismQuery<WorkspaceStatus>(
    () => window.prism.workspace.status() as Promise<import("../../shared/result").Result<WorkspaceStatus>>,
    [],
  );

  const handleRegister = useCallback(async () => {
    const folderResult = await window.prism.app.selectFolder();
    if (!folderResult.ok || !folderResult.data) return;

    const registerResult = await window.prism.project.register(folderResult.data);
    if (registerResult.ok) {
      onSelectProject(registerResult.data.project.id);
    }
  }, [onSelectProject]);

  const projects = status?.projects ?? [];
  const isEmpty = projects.length === 0;

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Titlebar drag region */}
      <div
        className="titlebar-drag"
        style={{
          height: 52,
          paddingLeft: sidebarOpen ? "var(--space-md)" : 68,
          paddingRight: "var(--space-md)",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {!sidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="titlebar-no-drag"
            aria-label="Open sidebar"
            style={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: "var(--text-lg)",
            }}
          >
            ☰
          </button>
        )}
      </div>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: isEmpty ? "center" : "flex-start",
          padding: "var(--space-2xl)",
          overflowY: "auto",
        }}
      >
        {error && (
          <p style={{ color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
            Couldn't read workspace.{" "}
            <button
              onClick={() => window.location.reload()}
              style={{ color: "var(--accent-fg)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}
            >
              Try again
            </button>
          </p>
        )}

        {isEmpty && !loading && !error && (
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-xl)",
                fontWeight: 300,
                color: "var(--text-primary)",
                marginBottom: "var(--space-md)",
              }}
            >
              Nothing here yet.
            </h1>
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-sm)",
                color: "var(--text-secondary)",
                marginBottom: "var(--space-lg)",
              }}
            >
              Point Prism at a folder and describe what you want to build.
            </p>
            <button
              onClick={handleRegister}
              style={{
                padding: "var(--space-sm) var(--space-lg)",
                backgroundColor: "var(--accent-fill)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-md)",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Register a project
            </button>
          </div>
        )}

        {!isEmpty && (
          <div style={{ width: "100%", maxWidth: 720 }}>
            <div style={{ marginBottom: "var(--space-xl)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--text-2xl)",
                  fontWeight: 300,
                  color: "var(--text-primary)",
                }}
              >
                Workspace
              </h1>
              <button
                onClick={handleRegister}
                style={{
                  padding: "var(--space-xs) var(--space-md)",
                  backgroundColor: "var(--accent-fill)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                + Register project
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xs)" }}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-sm)",
                    padding: "var(--space-sm) var(--space-lg)",
                    background: "transparent",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    textAlign: "left" as const,
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-md)",
                  }}
                >
                  <HealthBadge badge={project.badge} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                    {project.name}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                    {project.lastAccessedAt
                      ? new Date(project.lastAccessedAt).toLocaleDateString()
                      : "new"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
