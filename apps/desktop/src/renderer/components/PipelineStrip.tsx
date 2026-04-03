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
    <div
      style={{
        display: "flex",
        gap: compact ? 3 : 6,
        alignItems: "center",
      }}
    >
      {stages.map((stage) => {
        const color = STAGE_COLORS[stage.status] || "var(--stage-upcoming)";
        const isCurrent = stage.status === "current";

        if (compact) {
          return (
            <div
              key={stage.id}
              className={isCurrent ? "stage-current" : undefined}
              style={{
                width: 16,
                height: 4,
                borderRadius: 2,
                background: color,
              }}
              title={`${stage.label}: ${stage.status}`}
            />
          );
        }

        return (
          <button
            key={stage.id}
            className={isCurrent ? "stage-current" : undefined}
            onClick={() => onStageClick?.(stage)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "8px 12px",
              background:
                isCurrent ? "var(--bg-active)" : "var(--bg-elevated)",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: onStageClick ? "pointer" : "default",
              minWidth: 80,
              transition: "background 0.15s",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: isCurrent ? 600 : 400,
                color: isCurrent
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
              }}
            >
              {stage.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
