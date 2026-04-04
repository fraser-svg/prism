import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrismStore } from "../context";
import { PipelineStrip } from "./PipelineStrip";
import { ContextTab } from "./ContextTab";
import type { StageView } from "../types";

const STATUS_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Completed" },
  current: { bg: "bg-[#91A6FF]/20", text: "text-[#4A5A99]", label: "In Progress" },
  blocked: { bg: "bg-red-50", text: "text-red-500", label: "Blocked" },
  upcoming: { bg: "bg-[#91A6FF]/10", text: "text-[#5B6BAA]", label: "Upcoming" },
};

const EVENT_CHIP: Record<string, { bg: string; text: string }> = {
  gate: { bg: "bg-emerald-50", text: "text-emerald-600" },
  action: { bg: "bg-[#91A6FF]/20", text: "text-[#4A5A99]" },
  decision: { bg: "bg-amber-50", text: "text-amber-600" },
};

export function ControlRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const [activeTab, setActiveTab] = useState<"pipeline" | "context">("pipeline");

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
      <div className="flex h-full items-center justify-center text-stone-900">
        Project not found
      </div>
    );
  }

  if (pipelineLoading && !activePipeline) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
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
  const handleLinkPreviousAttempt = () => {};

  const stageChip = selectedStage
    ? STATUS_CHIP[selectedStage.status] || STATUS_CHIP.upcoming
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-[var(--bg-surface)] px-6">
        <div className="flex items-center gap-1.5 text-[15px]">
          <button
            className="text-stone-900 transition-colors hover:text-black"
            onClick={() => navigate("/")}
          >
            Portfolio
          </button>
          <span className="text-stone-500">/</span>
          <span className="font-medium text-black">{project.name}</span>
        </div>
      </header>

      {/* Main scrollable content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Hero header */}
        <section className="mb-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold text-black">
                {project.name}
              </h2>
              {project.rootPath && (
                <code className="mt-1 block font-mono text-[15px] text-stone-700">
                  {project.rootPath}
                </code>
              )}
            </div>
            <button
              className="flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-[15px] font-medium text-white transition-colors hover:bg-stone-700"
              onClick={() => toggleDrawer(id)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
              Open Session
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-8 flex gap-6 border-b border-stone-200">
            <button
              className={`pb-3 text-[15px] font-medium transition-colors ${
                activeTab === "pipeline"
                  ? "border-b-2 border-stone-800 text-black"
                  : "text-stone-700 hover:text-stone-800"
              }`}
              onClick={() => setActiveTab("pipeline")}
            >
              Pipeline
            </button>
            <button
              className={`pb-3 text-[15px] font-medium transition-colors ${
                activeTab === "context"
                  ? "border-b-2 border-stone-800 text-black"
                  : "text-stone-700 hover:text-stone-800"
              }`}
              onClick={() => setActiveTab("context")}
            >
              Context
            </button>
          </div>
        </section>

        {/* Pipeline tab */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-10 gap-6">
            {/* Main flow (70%) */}
            <div className="col-span-7 space-y-6">
              {activePipeline && activePipeline.stages.length > 0 && (
                <PipelineStrip
                  stages={activePipeline.stages}
                  onStageClick={setSelectedStage}
                />
              )}

              {activePipeline?.error && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                  <span className="material-symbols-outlined text-red-500" style={{ fontSize: 18 }}>error</span>
                  <span className="text-sm text-red-600">
                    Pipeline extraction failed: {activePipeline.error}
                  </span>
                  <button
                    className="ml-auto rounded-lg border border-stone-200 px-3 py-1.5 text-sm text-stone-800 transition-colors hover:bg-stone-50"
                    onClick={() => id && loadPipeline(id)}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Stage detail card */}
              {selectedStage && stageChip && (
                <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-6">
                  <div className="mb-6 flex items-start justify-between">
                    <div>
                      <h3 className="mb-1.5 text-[17px] font-semibold text-black">
                        {selectedStage.label}
                      </h3>
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium ${stageChip.bg} ${stageChip.text}`}>
                        {stageChip.label}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      {selectedStage.gateRequirements.length > 0 && (
                        <>
                          <h4 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                            Gate Requirements
                          </h4>
                          <ul className="space-y-3">
                            {selectedStage.gateRequirements.map((req, i) => (
                              <li key={i} className="flex items-center gap-2.5 text-[15px]">
                                <span
                                  className="material-symbols-outlined"
                                  style={{
                                    fontSize: 18,
                                    color: req.met ? "#10B981" : "#d4d4d4",
                                    fontVariationSettings: req.met ? "'FILL' 1" : undefined,
                                  }}
                                >
                                  {req.met ? "check_circle" : "radio_button_unchecked"}
                                </span>
                                <span className={req.met ? "text-black" : "text-stone-700"}>
                                  {req.description}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}

                      {selectedStage.description && (
                        <p className="mt-4 text-[15px] text-stone-900">
                          {selectedStage.description}
                        </p>
                      )}
                    </div>

                    <div className="space-y-6">
                      {selectedStage.artifacts.length > 0 && (
                        <div>
                          <h4 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                            Artifacts
                          </h4>
                          <div className="flex gap-2">
                            {selectedStage.artifacts.map((art, i) => (
                              <div
                                key={i}
                                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                                  art.present
                                    ? "bg-stone-100 text-stone-800"
                                    : "border border-stone-200 text-stone-500"
                                }`}
                                title={art.name}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: art.present ? "'FILL' 1" : undefined }}>
                                  {art.present ? "description" : "add"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedStage.blockers.length > 0 && (
                        <div>
                          <h4 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                            Blockers
                          </h4>
                          {selectedStage.blockers.map((blocker, i) => (
                            <div key={i} className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
                              <span className="material-symbols-outlined text-red-400" style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}>warning</span>
                              <p className="text-[15px] text-red-600">{blocker}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activePipeline && activePipeline.recommendations.length > 0 && (
                <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
                  <h3 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                    Next Actions
                  </h3>
                  <div className="space-y-2.5">
                    {activePipeline.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <span className="rounded bg-[#91A6FF]/20 px-1.5 py-0.5 text-[12px] font-semibold uppercase text-[#4A5A99]">
                          {rec.source}
                        </span>
                        <span className="text-[15px] text-black">{rec.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right rail (30%) */}
            <div className="col-span-3 space-y-6">
              {/* Timeline */}
              <section className="flex h-[380px] flex-col rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
                <h3 className="mb-4 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                  Timeline
                </h3>
                <div className="flex-1 space-y-5 overflow-y-auto pr-2">
                  {activeTimeline.length === 0 ? (
                    <span className="text-[15px] text-stone-700">No events yet</span>
                  ) : (
                    activeTimeline.map((event) => {
                      const chip = EVENT_CHIP[event.eventType] || EVENT_CHIP.action;
                      return (
                        <div key={event.id} className="relative border-l border-stone-200 pl-4">
                          <div className={`absolute -left-[4px] top-0.5 h-2 w-2 rounded-full ${
                            event.eventType === "gate" ? "bg-emerald-500"
                            : event.eventType === "decision" ? "bg-amber-500"
                            : "bg-black"
                          }`} />
                          <div className="mb-1 flex items-center justify-between">
                            <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold uppercase ${chip.bg} ${chip.text}`}>
                              {event.eventType}
                            </span>
                            <span className="text-[12px] text-stone-700">
                              {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-[15px] text-black">{event.summary}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Health gauge */}
              {activePipeline && activePipeline.healthScore !== null && (
                <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
                  <h3 className="mb-4 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                    Health
                  </h3>
                  <div className="flex items-center gap-5">
                    <div className="relative h-20 w-20">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 88 88">
                        <circle cx="44" cy="44" r="36" fill="none" stroke="#e5e5e5" strokeWidth="6" />
                        <circle
                          cx="44" cy="44" r="36"
                          fill="none"
                          stroke={activePipeline.healthScore >= 7 ? "#10B981" : activePipeline.healthScore >= 4 ? "#F59E0B" : "#EF4444"}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 36}
                          strokeDashoffset={2 * Math.PI * 36 - (2 * Math.PI * 36 * activePipeline.healthScore * 10) / 100}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-lg font-semibold text-black">
                          {activePipeline.healthScore}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-black">
                        {activePipeline.healthScore >= 7 ? "Operational" : activePipeline.healthScore >= 4 ? "At Risk" : "Critical"}
                      </p>
                      <p className="mt-0.5 text-[13px] text-stone-700">{activePipeline.healthTrend}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Deploy */}
              {project?.deployUrl && (
                <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-5">
                  <h3 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
                    Deploy
                  </h3>
                  <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="material-symbols-outlined text-stone-800" style={{ fontSize: 16 }}>link</span>
                      <span className="truncate font-mono text-[14px] text-stone-900">{project.deployUrl}</span>
                    </div>
                    <a href={project.deployUrl} target="_blank" rel="noopener noreferrer">
                      <span className="material-symbols-outlined text-stone-700 transition-colors hover:text-black" style={{ fontSize: 16 }}>open_in_new</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
    </div>
  );
}
