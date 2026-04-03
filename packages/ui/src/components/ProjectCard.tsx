import { useNavigate } from "react-router-dom";
import { Card, CardContent, Chip } from "@heroui/react";
import type { ProjectView, PipelineView } from "../types";
import { PipelineStrip } from "./PipelineStrip";

const RISK_COLORS: Record<string, "success" | "warning" | "danger"> = {
  healthy: "success",
  at_risk: "warning",
  blocked: "danger",
};

interface ProjectCardProps {
  project: ProjectView;
  pipeline?: PipelineView;
}

export function ProjectCard({ project, pipeline }: ProjectCardProps) {
  const navigate = useNavigate();

  const riskColor = project.riskState
    ? RISK_COLORS[project.riskState]
    : undefined;

  const currentStage = pipeline?.stages.find((s) => s.status === "current");
  const nextAction = pipeline?.recommendations[0]?.text;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-[var(--surface-secondary)]"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      <CardContent className="flex flex-col gap-2.5 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--foreground)]">
            {project.name}
          </span>
          <div
            className="size-2 rounded-full"
            style={{
              background: riskColor
                ? `var(--${riskColor})`
                : "var(--muted)",
            }}
            title={project.riskState || "unknown"}
          />
        </div>

        {/* Stage strip */}
        {pipeline && pipeline.stages.length > 0 && (
          <PipelineStrip stages={pipeline.stages} compact />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--muted)]">
            {currentStage ? currentStage.label : "No data"}
          </span>
          {project.deployUrl && (
            <Chip size="sm" color="success" variant="soft">
              <span className="font-mono text-[10px]">live</span>
            </Chip>
          )}
        </div>

        {/* Next action */}
        {nextAction && (
          <span className="truncate text-xs text-[var(--field-placeholder)]">
            {nextAction}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
