import { useNavigate } from "react-router-dom";
import type { ProjectView, PipelineView } from "../types";
import { PipelineStrip } from "./PipelineStrip";

const RISK_DOT: Record<string, string> = {
  healthy: "bg-emerald-500",
  at_risk: "bg-amber-500",
  blocked: "bg-red-400",
};

interface ProjectCardProps {
  project: ProjectView;
  pipeline?: PipelineView;
}

export function ProjectCard({ project, pipeline }: ProjectCardProps) {
  const navigate = useNavigate();

  const riskDot = project.riskState ? RISK_DOT[project.riskState] : "bg-stone-300";
  const currentStage = pipeline?.stages.find((s) => s.status === "current");

  return (
    <div
      className="card-hover cursor-pointer rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      {/* Header */}
      <div className="mb-5 flex items-start justify-between">
        <h4 className="text-[17px] font-medium text-black">
          {project.name}
        </h4>
        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${riskDot}`} />
      </div>

      {/* Pipeline strip */}
      {pipeline && pipeline.stages.length > 0 && (
        <div className="mb-5">
          <PipelineStrip stages={pipeline.stages} compact />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-[15px] text-stone-900">
          {currentStage ? currentStage.label : "No data"}
        </span>
        {project.deployUrl && (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-emerald-600">
            Live
          </span>
        )}
      </div>
    </div>
  );
}
