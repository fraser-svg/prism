import { useEffect, useState } from "react";
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
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
        }}
        onClick={() => toggleDrawer()}
      />

      {/* Drawer panel */}
      <div
        className="slide-in-right"
        style={{
          position: "relative",
          width: 380,
          height: "100%",
          background: "var(--bg-elevated)",
          borderLeft: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 2,
              }}
            >
              Session
            </h2>
            {project && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {project.name}
              </span>
            )}
          </div>
          <button
            onClick={() => toggleDrawer()}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-tertiary)",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
              lineHeight: 1,
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
            flexShrink: 0,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Actions
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ACTIONS.map((action) => (
              <button
                key={action.key}
                onClick={() => handleAction(action.key)}
                disabled={!!runningAction}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background:
                    runningAction === action.key
                      ? "var(--bg-active)"
                      : "var(--bg-surface)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: runningAction ? "not-allowed" : "pointer",
                  opacity: runningAction && runningAction !== action.key ? 0.5 : 1,
                  textAlign: "left",
                  fontFamily: "var(--font-sans)",
                  transition: "background 0.15s",
                  width: "100%",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      display: "block",
                    }}
                  >
                    {action.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {action.description}
                  </span>
                </div>
                {runningAction === action.key && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--accent-blue)",
                    }}
                  >
                    Running...
                  </span>
                )}
              </button>
            ))}
          </div>

          {actionError && (
            <div
              style={{
                marginTop: 8,
                padding: "6px 10px",
                background: "rgba(239,68,68,0.1)",
                borderRadius: "var(--radius-sm)",
                fontSize: 12,
                color: "var(--accent-red)",
              }}
            >
              {actionError}
            </div>
          )}
        </div>

        {/* Event stream */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "16px 20px",
          }}
        >
          <h3
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Event Stream
          </h3>

          {activeTimeline.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              No events yet. Run an action to get started.
            </span>
          ) : (
            activeTimeline.map((event: TimelineEvent) => (
              <div
                key={event.id}
                style={{
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: eventTypeColor(event.eventType),
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {event.eventType}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                  }}
                >
                  {event.summary}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function eventTypeColor(type: string): string {
  if (type.includes("completed") || type.includes("session_end"))
    return "var(--accent-green)";
  if (type.includes("failed") || type.includes("blocked"))
    return "var(--accent-red)";
  if (type.includes("started") || type.includes("pipeline"))
    return "var(--accent-blue)";
  return "var(--text-tertiary)";
}
