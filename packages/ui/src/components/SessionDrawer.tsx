import { useEffect, useState } from "react";
import { usePrismStore } from "../context";
import type { TimelineEvent } from "../types";

const ACTIONS = [
  { key: "resume", label: "Resume Project", icon: "play_arrow", description: "Continue from last checkpoint" },
  { key: "check_gate", label: "Check Next Gate", icon: "fact_check", description: "Evaluate gate requirements" },
  { key: "verify", label: "Run Verification", icon: "verified", description: "Verify current stage deliverables" },
  { key: "detect_deploy", label: "Detect Deploy", icon: "rocket_launch", description: "Check for new deployments" },
  { key: "save_milestone", label: "Save Milestone", icon: "flag", description: "Snapshot current progress" },
] as const;

function getEventChipStyle(type: string): { bg: string; text: string } {
  if (type.includes("completed") || type.includes("session_end"))
    return { bg: "bg-emerald-50", text: "text-emerald-600" };
  if (type.includes("failed") || type.includes("blocked"))
    return { bg: "bg-red-50", text: "text-red-500" };
  if (type.includes("started") || type.includes("pipeline"))
    return { bg: "bg-[#91A6FF]/20", text: "text-[#4A5A99]" };
  return { bg: "bg-[#91A6FF]/10", text: "text-[#5B6BAA]" };
}

export function SessionDrawer() {
  const {
    drawerProjectId,
    projects,
    activeTimeline,
    toggleDrawer,
    runAction,
    loadTimeline,
  } = usePrismStore();

  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const project = projects.find((p) => p.id === drawerProjectId);

  useEffect(() => {
    if (drawerProjectId) {
      loadTimeline(drawerProjectId);
    }
  }, [drawerProjectId, loadTimeline]);

  const handleAction = async (action: string) => {
    if (!drawerProjectId || runningAction) return;
    setRunningAction(action);
    setActionError(null);
    try {
      await runAction(drawerProjectId, action);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningAction(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={() => toggleDrawer()}
      />

      {/* Drawer panel */}
      <div className="slide-in-right relative flex h-full w-[360px] flex-col overflow-hidden border-l border-stone-200 bg-[var(--bg-surface)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-black">Session</h2>
            {project && (
              <span className="font-mono text-[13px] text-stone-700">{project.name}</span>
            )}
          </div>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-stone-700 transition-colors hover:bg-stone-100 hover:text-black"
            onClick={() => toggleDrawer()}
            aria-label="Close drawer"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Actions */}
        <div className="shrink-0 border-b border-stone-100 px-5 py-4">
          <h3 className="mb-2 text-[13px] font-medium uppercase tracking-widest text-stone-700">
            Actions
          </h3>
          <div className="flex flex-col gap-0.5">
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                disabled={!!runningAction && runningAction !== action.key}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-stone-50 disabled:opacity-40"
                onClick={() => handleAction(action.key)}
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-stone-700" style={{ fontSize: 16 }}>
                    {action.icon}
                  </span>
                  <div>
                    <span className="block text-[15px] text-black">{action.label}</span>
                    <span className="text-[13px] text-stone-700">{action.description}</span>
                  </div>
                </div>
                {runningAction === action.key && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
                )}
              </button>
            ))}
          </div>

          {actionError && (
            <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-500">
              {actionError}
            </div>
          )}
        </div>

        {/* Event stream */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <h3 className="mb-2 text-[13px] font-medium uppercase tracking-widest text-stone-700">
            Event Stream
          </h3>

          {activeTimeline.length === 0 ? (
            <span className="text-[15px] text-stone-700">
              No events yet. Run an action to get started.
            </span>
          ) : (
            <div className="space-y-3">
              {activeTimeline.map((event: TimelineEvent) => {
                const chip = getEventChipStyle(event.eventType);
                return (
                  <div key={event.id} className="relative border-l border-stone-200 pl-4">
                    <div className="absolute -left-[3px] top-1 h-1.5 w-1.5 rounded-full bg-black" />
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold uppercase ${chip.bg} ${chip.text}`}>
                        {event.eventType}
                      </span>
                      <span className="text-[12px] text-stone-700">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <span className="text-[14px] text-stone-800">{event.summary}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
