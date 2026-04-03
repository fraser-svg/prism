import { useNavigate } from "react-router-dom";
import type { ProjectView, PipelineView } from "../types";
import { PipelineStrip } from "./PipelineStrip";

const RISK_COLORS: Record<string, string> = {
  healthy: "var(--accent-green)",
  at_risk: "var(--accent-amber)",
  blocked: "var(--accent-red)",
};

interface ProjectCardProps {
  project: ProjectView;
  pipeline?: PipelineView;
}

export function ProjectCard({ project, pipeline }: ProjectCardProps) {
  const navigate = useNavigate();

  const riskColor = project.riskState
    ? RISK_COLORS[project.riskState] || "var(--text-tertiary)"
    : "var(--text-tertiary)";

  const currentStage = pipeline?.stages.find((s) => s.status === "current");
  const nextAction = pipeline?.recommendations[0]?.text;

  return (
    <button
      onClick={() => navigate(`/project/${project.id}`)}
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        fontFamily: "var(--font-sans)",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--bg-elevated)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "var(--bg-surface)")
      }
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          {project.name}
        </span>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: riskColor,
          }}
          title={project.riskState || "unknown"}
        />
      </div>

      {/* Stage strip */}
      {pipeline && pipeline.stages.length > 0 && (
        <PipelineStrip stages={pipeline.stages} compact />
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
          }}
        >
          {currentStage ? currentStage.label : "No data"}
        </span>
        {project.deployUrl && (
          <span
            style={{
              fontSize: 10,
              color: "var(--accent-green)",
              fontFamily: "var(--font-mono)",
            }}
          >
            live
          </span>
        )}
      </div>

      {/* Next action */}
      {nextAction && (
        <span
          style={{
            fontSize: 11,
            color: "var(--text-tertiary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {nextAction}
        </span>
      )}
    </button>
  );
}
