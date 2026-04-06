import React from "react";

interface ExecutionProgressProps {
  tasksTotal: number;
  tasksCompleted: number;
  currentTask: string | null;
  elapsedMs?: number;
  tasks?: Array<{
    name: string;
    status: "pending" | "running" | "completed" | "failed";
    outputPreview?: string | null;
  }>;
}

function StatusIndicator({
  status,
}: {
  status: "pending" | "running" | "completed" | "failed";
}) {
  switch (status) {
    case "pending":
      return <div className="h-3 w-3 shrink-0 rounded-full bg-stone-300" />;
    case "running":
      return (
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
      );
    case "completed":
      return (
        <span
          className="material-symbols-outlined shrink-0 text-emerald-500"
          style={{ fontSize: 18 }}
        >
          check_circle
        </span>
      );
    case "failed":
      return (
        <span
          className="material-symbols-outlined shrink-0 text-red-500"
          style={{ fontSize: 18 }}
        >
          cancel
        </span>
      );
  }
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function ExecutionProgress({
  tasksTotal,
  tasksCompleted,
  currentTask,
  elapsedMs,
  tasks,
}: ExecutionProgressProps) {
  const progressPercent =
    tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Progress header */}
      <div className="flex items-center justify-between">
        <span
          className="font-medium text-stone-800"
          style={{ fontSize: 15 }}
        >
          Execution Progress
        </span>
        <div className="flex items-center gap-3">
          {elapsedMs != null && (
            <span className="font-mono text-stone-500" style={{ fontSize: 13 }}>
              {formatElapsed(elapsedMs)}
            </span>
          )}
          <span className="text-stone-700" style={{ fontSize: 13 }}>
            {tasksCompleted} / {tasksTotal} tasks
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Execution progress: ${tasksCompleted} of ${tasksTotal} tasks completed`}
      >
        <div
          className="h-full rounded-full bg-stone-800 transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Current task callout */}
      {currentTask && (
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
          <span className="text-stone-800" style={{ fontSize: 13 }}>
            {currentTask}
          </span>
        </div>
      )}

      {/* Task list */}
      {tasks && tasks.length > 0 && (
        <ul className="flex flex-col gap-1" role="list">
          {tasks.map((task) => {
            const isRunning = task.status === "running";
            const isFailed = task.status === "failed";

            const textClass = isRunning
              ? "font-medium text-stone-800"
              : isFailed
                ? "text-red-600"
                : task.status === "completed"
                  ? "text-stone-700"
                  : "text-stone-500";

            return (
              <li
                key={task.name}
                className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 ${
                  isRunning ? "bg-stone-100" : ""
                }`}
              >
                <div className="mt-0.5">
                  <StatusIndicator status={task.status} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className={textClass} style={{ fontSize: 13 }}>
                    {task.name}
                  </span>
                  {task.outputPreview && (
                    <span className="text-stone-500" style={{ fontSize: 13 }}>
                      {task.outputPreview}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
