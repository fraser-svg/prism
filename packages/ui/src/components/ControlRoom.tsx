import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { usePrismStore } from "../context";
import { PipelineStrip } from "./PipelineStrip";
import type { StageView } from "../types";

export function ControlRoom() {
  const { id } = useParams<{ id: string }>();
  const {
    projects,
    portfolioLoading,
    activePipeline,
    pipelineLoading,
    activeTimeline,
    loadPipeline,
    loadTimeline,
    toggleDrawer,
  } = usePrismStore();

  const [selectedStage, setSelectedStage] = useState<StageView | null>(null);

  const project = projects.find((p) => p.id === id);

  useEffect(() => {
    if (id) {
      loadPipeline(id);
      loadTimeline(id);
    }
  }, [id, loadPipeline, loadTimeline]);

  useEffect(() => {
    if (activePipeline?.stages.length) {
      const current = activePipeline.stages.find(
        (s) => s.status === "current" || s.status === "blocked",
      );
      setSelectedStage(current || activePipeline.stages[0]);
    }
  }, [activePipeline]);

  // Portfolio may still be loading — don't flash "not found" prematurely
  if (!project && portfolioLoading) {
    return null;
  }

  if (!project) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-secondary)",
        }}
      >
        Project not found
      </div>
    );
  }

  if (pipelineLoading && !activePipeline) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
      >
        Loading pipeline...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {/* Project header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              {project.name}
            </h1>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {project.rootPath}
            </span>
          </div>
          <button
            onClick={() => toggleDrawer(id)}
            style={{
              padding: "8px 16px",
              background: "var(--accent-blue)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Open Session
          </button>
        </div>

        {/* Pipeline strip */}
        {activePipeline && activePipeline.stages.length > 0 && (
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              marginBottom: 20,
            }}
          >
            <PipelineStrip
              stages={activePipeline.stages}
              onStageClick={setSelectedStage}
            />
          </div>
        )}

        {/* Error state */}
        {activePipeline?.error && (
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              marginBottom: 20,
              borderLeft: "3px solid var(--accent-red)",
            }}
          >
            <span style={{ fontSize: 13, color: "var(--accent-red)" }}>
              Pipeline extraction failed: {activePipeline.error}
            </span>
            <button
              onClick={() => id && loadPipeline(id)}
              style={{
                marginLeft: 12,
                padding: "4px 10px",
                background: "var(--bg-elevated)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "var(--text-primary)",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Stage detail */}
        {selectedStage && (
          <div
            style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {selectedStage.label}
              </h2>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  background:
                    selectedStage.status === "completed"
                      ? "rgba(52,211,153,0.15)"
                      : selectedStage.status === "blocked"
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(77,142,255,0.15)",
                  color:
                    selectedStage.status === "completed"
                      ? "var(--accent-green)"
                      : selectedStage.status === "blocked"
                        ? "var(--accent-red)"
                        : "var(--accent-blue)",
                }}
              >
                {selectedStage.status}
              </span>
            </div>

            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginBottom: 16,
              }}
            >
              {selectedStage.description}
            </p>

            {/* Gate requirements */}
            {selectedStage.gateRequirements.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <h3
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Gate Requirements
                </h3>
                {selectedStage.gateRequirements.map((req, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: req.met
                          ? "var(--accent-green)"
                          : "var(--accent-red)",
                      }}
                    >
                      {req.met ? "\u2713" : "\u2717"}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {req.description}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Artifacts */}
            {selectedStage.artifacts.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Artifacts
                </h3>
                {selectedStage.artifacts.map((art, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        color: art.present
                          ? "var(--accent-green)"
                          : "var(--text-tertiary)",
                      }}
                    >
                      {art.present ? "\u25CF" : "\u25CB"}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {art.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Blockers */}
            {selectedStage.blockers.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <h3
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--accent-red)",
                    marginBottom: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Blockers
                </h3>
                {selectedStage.blockers.map((blocker, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 12,
                      color: "var(--accent-red)",
                      marginBottom: 4,
                    }}
                  >
                    {blocker}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        {activePipeline &&
          activePipeline.recommendations.length > 0 && (
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "var(--radius-lg)",
                padding: 20,
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  marginBottom: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Next Actions
              </h2>
              {activePipeline.recommendations.map((rec, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-elevated)",
                      color: "var(--text-tertiary)",
                      whiteSpace: "nowrap",
                      marginTop: 1,
                    }}
                  >
                    {rec.source}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                    }}
                  >
                    {rec.text}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Right rail: Timeline */}
      <div
        style={{
          width: 300,
          borderLeft: "1px solid var(--border-subtle)",
          overflow: "auto",
          padding: "20px 16px",
          flexShrink: 0,
        }}
      >
        <h2
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 16,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Timeline
        </h2>

        {activeTimeline.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            No events yet
          </span>
        ) : (
          activeTimeline.map((event) => (
            <div
              key={event.id}
              style={{
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--text-tertiary)",
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

        {/* Health score */}
        {activePipeline && activePipeline.healthScore !== null && (
          <div
            style={{
              marginTop: 20,
              padding: 12,
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Health Score
            </span>
            <span
              style={{
                fontSize: 24,
                fontWeight: 600,
                color:
                  activePipeline.healthScore >= 7
                    ? "var(--accent-green)"
                    : activePipeline.healthScore >= 4
                      ? "var(--accent-amber)"
                      : "var(--accent-red)",
              }}
            >
              {activePipeline.healthScore}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              /10 {activePipeline.healthTrend}
            </span>
          </div>
        )}

        {/* Deploy URL */}
        {project?.deployUrl && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Live URL
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--accent-green)",
                fontFamily: "var(--font-mono)",
                wordBreak: "break-all",
              }}
            >
              {project.deployUrl}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
