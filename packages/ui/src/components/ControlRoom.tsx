import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Card, CardContent, Chip, Separator, Spinner, Tabs } from "@heroui/react";
import { usePrismStore } from "../context";
import { PipelineStrip } from "./PipelineStrip";
import { ContextTab } from "./ContextTab";
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
    contextItems,
    contextKnowledge,
    contextSummary,
    contextHealth,
    extractionQueue,
    loadContext,
    addContextFiles,
    addContextNote,
    deleteContextItem,
    reExtractItem,
    flagKnowledge,
    applyToBrief,
  } = usePrismStore();

  const [selectedStage, setSelectedStage] = useState<StageView | null>(null);
  const [activeTab, setActiveTab] = useState<string>("pipeline");

  const project = projects.find((p) => p.id === id);

  useEffect(() => {
    if (id) {
      loadPipeline(id);
      loadTimeline(id);
      loadContext("project", id);
    }
  }, [id, loadPipeline, loadTimeline, loadContext]);

  useEffect(() => {
    if (activePipeline?.stages.length) {
      const current = activePipeline.stages.find(
        (s) => s.status === "current" || s.status === "blocked",
      );
      setSelectedStage(current || activePipeline.stages[0]);
    }
  }, [activePipeline]);

  if (!project && portfolioLoading) return null;

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        Project not found
      </div>
    );
  }

  if (pipelineLoading && !activePipeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleContextDrop = (files: File[]) => {
    if (id) addContextFiles("project", id, files);
  };
  const handleAddNote = (text: string) => {
    if (id) addContextNote("project", id, text);
  };
  const handleDeleteItem = (itemId: string) => {
    if (id) deleteContextItem(itemId, "project", id);
  };
  const handleReExtract = (itemId: string) => {
    if (id) reExtractItem(itemId, "project", id);
  };
  const handleCopyKnowledge = (text: string) => {
    void navigator.clipboard.writeText(text).catch(() => {});
  };
  const handleApplyToBrief = (knowledgeId: string) => {
    if (id) applyToBrief(id, knowledgeId);
  };
  const handleFlagWrong = (knowledgeId: string) => {
    flagKnowledge(knowledgeId);
  };
  const handleLinkPreviousAttempt = () => {
    // Will be wired to directory picker + analysis flow
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {/* Project header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="mb-1 text-lg font-semibold text-[var(--foreground)]">
              {project.name}
            </h1>
            <span className="font-mono text-xs text-[var(--field-placeholder)]">
              {project.rootPath}
            </span>
          </div>
          <Button variant="primary" onPress={() => toggleDrawer(id)}>
            Open Session
          </Button>
        </div>

        {/* Tab switcher */}
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as string)}
          className="mb-5"
        >
          <Tabs.List>
            <Tabs.Tab id="pipeline">Pipeline</Tabs.Tab>
            <Tabs.Tab id="context">Context</Tabs.Tab>
            <Tabs.Indicator />
          </Tabs.List>
        </Tabs>

        {/* Pipeline tab content */}
        {activeTab === "pipeline" && (
          <>
            {/* Pipeline strip */}
            {activePipeline && activePipeline.stages.length > 0 && (
              <Card className="mb-5">
                <CardContent className="p-4">
                  <PipelineStrip
                    stages={activePipeline.stages}
                    onStageClick={setSelectedStage}
                  />
                </CardContent>
              </Card>
            )}

            {/* Error state */}
            {activePipeline?.error && (
              <Card className="mb-5 border-l-3 border-l-[var(--danger)]">
                <CardContent className="flex flex-row items-center gap-3 p-4">
                  <span className="text-sm text-danger">
                    Pipeline extraction failed: {activePipeline.error}
                  </span>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={() => id && loadPipeline(id)}
                  >
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Stage detail */}
            {selectedStage && (
              <Card className="mb-5">
                <CardContent className="flex flex-col gap-4 p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
                      {selectedStage.label}
                    </h2>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={
                        selectedStage.status === "completed"
                          ? "success"
                          : selectedStage.status === "blocked"
                            ? "danger"
                            : "accent"
                      }
                    >
                      {selectedStage.status}
                    </Chip>
                  </div>

                  <p className="text-sm text-[var(--muted)]">{selectedStage.description}</p>

                  {/* Gate requirements */}
                  {selectedStage.gateRequirements.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Gate Requirements
                      </h3>
                      {selectedStage.gateRequirements.map((req, i) => (
                        <div key={i} className="mb-1 flex items-center gap-2">
                          <span className={`text-xs ${req.met ? "text-success" : "text-danger"}`}>
                            {req.met ? "\u2713" : "\u2717"}
                          </span>
                          <span className="text-xs text-[var(--muted)]">
                            {req.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Artifacts */}
                  {selectedStage.artifacts.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                        Artifacts
                      </h3>
                      {selectedStage.artifacts.map((art, i) => (
                        <div key={i} className="mb-1 flex items-center gap-2">
                          <span className={`text-xs ${art.present ? "text-success" : "text-[var(--field-placeholder)]"}`}>
                            {art.present ? "\u25CF" : "\u25CB"}
                          </span>
                          <span className="text-xs text-[var(--muted)]">{art.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Blockers */}
                  {selectedStage.blockers.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-danger">
                        Blockers
                      </h3>
                      {selectedStage.blockers.map((blocker, i) => (
                        <div key={i} className="mb-1 text-xs text-danger">
                          {blocker}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {activePipeline && activePipeline.recommendations.length > 0 && (
              <Card className="mb-5">
                <CardContent className="flex flex-col gap-3 p-5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                    Next Actions
                  </h2>
                  {activePipeline.recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Chip size="sm" variant="soft">
                        <span className="text-[10px]">{rec.source}</span>
                      </Chip>
                      <span className="text-sm text-[var(--foreground)]">{rec.text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Context tab content */}
        {activeTab === "context" && (
          <ContextTab
            contextItems={contextItems}
            knowledge={contextKnowledge}
            summary={contextSummary}
            contextHealth={contextHealth}
            extractionQueue={extractionQueue}
            onDrop={handleContextDrop}
            onAddNote={handleAddNote}
            onDeleteItem={handleDeleteItem}
            onReExtract={handleReExtract}
            onCopyKnowledge={handleCopyKnowledge}
            onApplyToBrief={handleApplyToBrief}
            onFlagWrong={handleFlagWrong}
            onLinkPreviousAttempt={handleLinkPreviousAttempt}
          />
        )}
      </div>

      {/* Right rail: Timeline */}
      {activeTab === "pipeline" && (
        <div className="w-[300px] shrink-0 overflow-auto border-l border-[var(--separator)] px-4 py-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Timeline
          </h2>

          {activeTimeline.length === 0 ? (
            <span className="text-xs text-[var(--field-placeholder)]">
              No events yet
            </span>
          ) : (
            activeTimeline.map((event) => (
              <div key={event.id} className="mb-3 pb-3">
                <div className="mb-1 flex justify-between">
                  <span className="font-mono text-[10px] text-[var(--field-placeholder)]">
                    {event.eventType}
                  </span>
                  <span className="text-[10px] text-[var(--field-placeholder)]">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <span className="text-xs text-[var(--muted)]">{event.summary}</span>
                <Separator className="mt-3" />
              </div>
            ))
          )}

          {/* Health score */}
          {activePipeline && activePipeline.healthScore !== null && (
            <Card className="mt-5">
              <CardContent className="p-3">
                <span className="mb-1 block text-[11px] text-[var(--field-placeholder)]">
                  Health Score
                </span>
                <span
                  className={`text-2xl font-semibold ${
                    activePipeline.healthScore >= 7
                      ? "text-success"
                      : activePipeline.healthScore >= 4
                        ? "text-warning"
                        : "text-danger"
                  }`}
                >
                  {activePipeline.healthScore}
                </span>
                <span className="text-xs text-[var(--field-placeholder)]">
                  /10 {activePipeline.healthTrend}
                </span>
              </CardContent>
            </Card>
          )}

          {/* Deploy URL */}
          {project?.deployUrl && (
            <Card className="mt-3">
              <CardContent className="p-3">
                <span className="mb-1 block text-[11px] text-[var(--field-placeholder)]">
                  Live URL
                </span>
                <span className="break-all font-mono text-xs text-success">
                  {project.deployUrl}
                </span>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
