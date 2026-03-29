import { useState } from "react";
import { usePrismQuery } from "../hooks/usePrism";
import type { ProjectDetail } from "../types";
import type { Result } from "../../shared/result";

interface ProjectViewProps {
  projectId: string;
  onGoHome: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

type ArtifactTab = "specs" | "plans" | "runs";

export function ProjectView({ projectId, onGoHome, sidebarOpen, onToggleSidebar }: ProjectViewProps) {
  const { data: detail, error } = usePrismQuery<ProjectDetail>(
    () => window.prism.project.detail(projectId) as Promise<Result<ProjectDetail>>,
    [projectId],
  );

  const [activeTab, setActiveTab] = useState<ArtifactTab>("specs");

  if (error) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--error)", fontFamily: "var(--font-body)", fontSize: "var(--text-sm)" }}>
          Couldn't load project.{" "}
          <button
            onClick={onGoHome}
            style={{ color: "var(--accent-fg)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit", fontSize: "inherit" }}
          >
            Go home
          </button>
        </p>
      </div>
    );
  }

  if (!detail) return null;

  const artifacts = activeTab === "specs"
    ? detail.specs
    : activeTab === "plans"
      ? detail.plans
      : detail.recentRuns;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Titlebar */}
      <div
        className="titlebar-drag"
        style={{
          height: 52,
          paddingLeft: sidebarOpen ? "var(--space-md)" : 68,
          paddingRight: "var(--space-md)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-sm)",
          flexShrink: 0,
          borderBottom: "1px solid var(--border-default)",
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
        <h2
          className="titlebar-no-drag"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-md)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {detail.project.name}
        </h2>
      </div>

      {/* Resume context */}
      {detail.resume?.lastCheckpointSummary && (
        <div
          style={{
            padding: "var(--space-md) var(--space-lg)",
            borderBottom: "1px solid var(--border-default)",
            flexShrink: 0,
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-xl)",
              fontWeight: 300,
              color: "var(--text-primary)",
              marginBottom: "var(--space-xs)",
            }}
          >
            Last session
          </h3>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            {detail.resume.lastCheckpointSummary}
          </p>
          {detail.resume.recommendedNextAction && (
            <button
              style={{
                marginTop: "var(--space-sm)",
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
              {detail.resume.recommendedNextAction}
            </button>
          )}
        </div>
      )}

      {/* Artifact tabs */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-xs)",
          padding: "var(--space-sm) var(--space-lg)",
          borderBottom: "1px solid var(--border-default)",
          flexShrink: 0,
        }}
      >
        {(["specs", "plans", "runs"] as ArtifactTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "var(--space-xs) var(--space-md)",
              background: activeTab === tab ? "var(--accent-subtle-bg)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: activeTab === tab ? "var(--accent-fg)" : "var(--text-secondary)",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-sm)",
              fontWeight: activeTab === tab ? 600 : 400,
              cursor: "pointer",
              textTransform: "capitalize" as const,
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Artifact content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "var(--space-lg)" }}>
        {artifacts.length === 0 ? (
          <div style={{ textAlign: "center", marginTop: "var(--space-3xl)" }}>
            <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", color: "var(--text-secondary)" }}>
              No {activeTab} yet for this project.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            {artifacts.map((artifact) => (
              <div
                key={artifact.entityId}
                style={{
                  padding: "var(--space-md) var(--space-lg)",
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-md)", fontWeight: 500, color: "var(--text-primary)" }}>
                    {artifact.title ?? artifact.entityId}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                    {new Date(artifact.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                {"contentPreview" in artifact && (artifact as { contentPreview?: string | null }).contentPreview && (
                  <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-xs)" }}>
                    {(artifact as { contentPreview: string }).contentPreview}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
