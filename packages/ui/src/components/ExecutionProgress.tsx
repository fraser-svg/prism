import React from "react";

interface ExecutionProgressProps {
  tasksTotal: number;
  tasksCompleted: number;
  currentTask: string | null;
  tasks?: Array<{
    name: string;
    status: "pending" | "running" | "completed" | "failed";
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

export function ExecutionProgress({
  tasksTotal,
  tasksCompleted,
  currentTask,
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
        <span className="text-stone-700" style={{ fontSize: 13 }}>
          {tasksCompleted} / {tasksTotal} tasks
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200">
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
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 ${
                  isRunning ? "bg-stone-100" : ""
                }`}
              >
                <StatusIndicator status={task.status} />
                <span className={textClass} style={{ fontSize: 13 }}>
                  {task.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
