import type { StageView } from "../types";

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

  if (compact) {
    return (
      <div className="flex h-1.5 gap-1">
        {stages.map((stage) => {
          const colorClass =
            stage.status === "completed"
              ? "bg-emerald-500"
              : stage.status === "current"
                ? "bg-stone-800 active-glow"
                : stage.status === "blocked"
                  ? "bg-red-400"
                  : "bg-stone-200";

          return (
            <div
              key={stage.id}
              className={`flex-1 rounded-full ${colorClass} ${stage.status === "current" ? "stage-current" : ""}`}
              title={`${stage.label}: ${stage.status}`}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative flex items-center justify-between rounded-xl border border-stone-200 bg-[var(--bg-surface)] px-4 py-8">
      {/* Connecting line */}
      <div className="absolute left-10 right-10 top-1/2 h-px -translate-y-6 bg-stone-200" />

      {stages.map((stage) => {
        const isCurrent = stage.status === "current";
        const isCompleted = stage.status === "completed";
        const isBlocked = stage.status === "blocked";

        const dotClass = isCompleted
          ? "w-4 h-4 rounded-full bg-emerald-500"
          : isCurrent
            ? "w-5 h-5 rounded-full bg-stone-800 pulse-glow"
            : isBlocked
              ? "w-4 h-4 rounded-full bg-red-400"
              : "w-4 h-4 rounded-full bg-stone-200";

        const labelClass = isCurrent
          ? "text-[13px] uppercase tracking-widest text-black font-semibold"
          : isCompleted
            ? "text-[13px] uppercase tracking-widest text-stone-800"
            : "text-[13px] uppercase tracking-widest text-stone-700";

        return (
          <button
            key={stage.id}
            className={`relative z-10 flex w-[100px] flex-col items-center gap-3 ${
              onStageClick ? "cursor-pointer" : "cursor-default"
            }`}
            onClick={() => onStageClick?.(stage)}
          >
            <div className={dotClass} />
            <span className={labelClass}>{stage.label}</span>
          </button>
        );
      })}
    </div>
  );
}
