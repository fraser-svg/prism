import { Tooltip, TooltipTrigger, TooltipContent } from "@heroui/react";
import type { StageView } from "../types";

const STAGE_COLORS: Record<string, string> = {
  completed: "var(--stage-completed)",
  current: "var(--stage-current)",
  blocked: "var(--stage-blocked)",
  upcoming: "var(--stage-upcoming)",
};

interface PipelineStripProps {
  stages: StageView[];
  compact?: boolean;
  onStageClick?: (stage: StageView) => void;
}

export function PipelineStrip({
  stages,
  compact = false,
  onStageClick,
}: PipelineStripProps) {
  if (stages.length === 0) return null;

  return (
    <div className={`flex items-center ${compact ? "gap-1" : "gap-1.5"}`}>
      {stages.map((stage) => {
        const color = STAGE_COLORS[stage.status] || "var(--stage-upcoming)";
        const isCurrent = stage.status === "current";

        if (compact) {
          return (
            <Tooltip key={stage.id}>
              <TooltipTrigger>
                <div
                  className={isCurrent ? "stage-current" : undefined}
                  style={{ width: 16, height: 4, borderRadius: 2, background: color }}
                />
              </TooltipTrigger>
              <TooltipContent>{`${stage.label}: ${stage.status}`}</TooltipContent>
            </Tooltip>
          );
        }

        return (
          <button
            key={stage.id}
            className={`flex flex-col items-center gap-1 rounded-lg border-none px-3 py-2 min-w-[80px] transition-colors ${
              isCurrent
                ? "bg-[var(--default)] stage-current"
                : "bg-[var(--surface-secondary)] hover:bg-[var(--default)]"
            } ${onStageClick ? "cursor-pointer" : "cursor-default"}`}
            onClick={() => onStageClick?.(stage)}
          >
            <div
              className="size-2 rounded-full"
              style={{ background: color }}
            />
            <span
              className={`text-xs whitespace-nowrap font-[var(--font-sans)] ${
                isCurrent ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              {stage.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
