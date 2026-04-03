import { useEffect, useState } from "react";
import { Button, Chip, Separator, Spinner } from "@heroui/react";
import { usePrismStore } from "../context";
import type { TimelineEvent } from "../types";

const ACTIONS = [
  { key: "resume", label: "Resume Project", description: "Continue from last checkpoint" },
  { key: "check_gate", label: "Check Next Gate", description: "Evaluate gate requirements" },
  { key: "verify", label: "Run Verification", description: "Verify current stage deliverables" },
  { key: "detect_deploy", label: "Detect Deploy", description: "Check for new deployments" },
  { key: "save_milestone", label: "Save Milestone", description: "Snapshot current progress" },
] as const;

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
        className="absolute inset-0 bg-[var(--backdrop)]"
        onClick={() => toggleDrawer()}
      />

      {/* Drawer panel */}
      <div className="slide-in-right relative flex h-full w-[380px] flex-col overflow-hidden border-l border-[var(--separator)] bg-[var(--surface-secondary)]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--separator)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Session</h2>
            {project && (
              <span className="font-mono text-[11px] text-[var(--field-placeholder)]">
                {project.name}
              </span>
            )}
          </div>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={() => toggleDrawer()}
            aria-label="Close drawer"
          >
            {"\u2715"}
          </Button>
        </div>

        {/* Actions */}
        <div className="shrink-0 border-b border-[var(--separator)] px-5 py-4">
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Actions
          </h3>
          <div className="flex flex-col gap-1.5">
            {ACTIONS.map((action) => (
              <Button
                key={action.key}
                variant="tertiary"
                className="h-auto justify-start px-3 py-2 text-left"
                isDisabled={!!runningAction && runningAction !== action.key}
                onPress={() => handleAction(action.key)}
              >
                <div className="flex w-full items-center justify-between">
                  <div>
                    <span className="block text-sm text-[var(--foreground)]">
                      {action.label}
                    </span>
                    <span className="text-[11px] text-[var(--field-placeholder)]">
                      {action.description}
                    </span>
                  </div>
                  {runningAction === action.key && <Spinner size="sm" />}
                </div>
              </Button>
            ))}
          </div>

          {actionError && (
            <div className="mt-2 rounded-md bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-2.5 py-1.5 text-xs text-danger">
              {actionError}
            </div>
          )}
        </div>

        {/* Event stream */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Event Stream
          </h3>

          {activeTimeline.length === 0 ? (
            <span className="text-xs text-[var(--field-placeholder)]">
              No events yet. Run an action to get started.
            </span>
          ) : (
            activeTimeline.map((event: TimelineEvent) => (
              <div key={event.id} className="mb-2.5 pb-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <Chip
                    size="sm"
                    color={eventTypeChipColor(event.eventType)}
                    variant="soft"
                  >
                    <span className="font-mono text-[10px]">{event.eventType}</span>
                  </Chip>
                  <span className="text-[10px] text-[var(--field-placeholder)]">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <span className="text-xs text-[var(--muted)]">{event.summary}</span>
                <Separator className="mt-2.5" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function eventTypeChipColor(
  type: string,
): "success" | "danger" | "accent" | "default" {
  if (type.includes("completed") || type.includes("session_end"))
    return "success";
  if (type.includes("failed") || type.includes("blocked")) return "danger";
  if (type.includes("started") || type.includes("pipeline")) return "accent";
  return "default";
}
