import { useState, useEffect } from "react";
import type { ContextItem, ExtractedKnowledge, KnowledgeSummary } from "../types";
import {
  ContextDropZone,
  ContextNoteInput,
  ContextItemList,
  groupKnowledgeByCategory,
  CATEGORY_CONFIG,
  CATEGORIES,
  KnowledgeEntry,
} from "./ContextShared";

interface ContextTabProps {
  contextItems: ContextItem[];
  knowledge: ExtractedKnowledge[];
  summary: KnowledgeSummary | null;
  clientSummary?: KnowledgeSummary | null;
  contextHealth: { score: number; hasProfile: boolean; hasDocs: boolean; recent: boolean; hasCategories: boolean } | null;
  extractionQueue: { extracting: number; total: number };
  searchResults?: ExtractedKnowledge[];
  onDrop: (files: File[]) => void;
  onAddNote: (text: string) => void;
  onDeleteItem: (id: string) => void;
  onReExtract: (id: string) => void;
  onCopyKnowledge: (text: string) => void;
  onCopyAllKnowledge: () => void;
  onApplyToBrief: (knowledgeId: string) => void;
  onFlagWrong: (knowledgeId: string) => void;
  onSearch: (query: string) => void;
  onLinkPreviousAttempt: () => void;
  onPoll?: () => void;
}

export function ContextTab({
  contextItems,
  knowledge,
  summary,
  clientSummary,
  contextHealth,
  extractionQueue,
  searchResults,
  onDrop,
  onAddNote,
  onDeleteItem,
  onReExtract,
  onCopyKnowledge,
  onCopyAllKnowledge,
  onApplyToBrief,
  onFlagWrong,
  onSearch,
  onLinkPreviousAttempt,
  onPoll,
}: ContextTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const isEmpty = contextItems.length === 0;

  // E2: Smart polling — refresh context every 2s while extractions are in progress
  useEffect(() => {
    if (!onPoll || extractionQueue.total === 0) return;
    const interval = setInterval(onPoll, 2000);
    return () => clearInterval(interval);
  }, [onPoll, extractionQueue.total]);

  const healthColor = contextHealth
    ? contextHealth.score >= 76 ? "#10B981" : contextHealth.score >= 26 ? "#F59E0B" : "#EF4444"
    : "#d4d4d4";
  const healthRadius = 32;
  const healthCircumference = 2 * Math.PI * healthRadius;
  const healthOffset = contextHealth
    ? healthCircumference - (contextHealth.score / 100) * healthCircumference
    : healthCircumference;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Drop zone + items */}
      <div className="flex-1 overflow-auto p-5 pr-6">
        <div className="mb-4">
          <ContextDropZone onDrop={onDrop} compact={!isEmpty} />
        </div>

        <div className="mb-4">
          <ContextNoteInput onAddNote={onAddNote} />
        </div>

        {isEmpty && (
          <div className="text-[15px] leading-7 text-stone-900">
            <p className="mb-3 font-medium">Context is how Prism learns about your client. The more you share, the smarter every build gets.</p>
            <p>1. Drop a pitch deck or brief</p>
            <p>2. Paste call notes or meeting summaries</p>
            <p>3. Link a previous project folder</p>
          </div>
        )}

        <ContextItemList
          items={contextItems}
          extractionQueue={extractionQueue}
          onDeleteItem={onDeleteItem}
          onReExtract={onReExtract}
        />

        <button className="mt-4 flex items-center gap-1 text-[15px] text-black transition-colors hover:text-stone-900" onClick={onLinkPreviousAttempt}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          Link Previous Attempt
        </button>
      </div>

      {/* Right sidebar */}
      <div role="complementary" className="w-[280px] shrink-0 overflow-auto border-l border-stone-200 bg-[var(--bg-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[13px] font-medium uppercase tracking-widest text-stone-700">
            What Prism Knows
          </h2>
          {knowledge.length > 0 && (
            <button
              className="rounded px-2 py-0.5 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black"
              onClick={onCopyAllKnowledge}
              title="Copy all knowledge to clipboard"
            >
              Copy All
            </button>
          )}
        </div>

        {/* Search */}
        {knowledge.length > 0 && (
          <div className="mb-4">
            <input
              type="search"
              placeholder="Search knowledge..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); onSearch(e.target.value); }}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[15px] text-black placeholder:text-stone-700 transition-colors focus:border-stone-800 focus:outline-none"
            />
          </div>
        )}

        {/* Search results */}
        {searchQuery && searchResults && searchResults.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-widest text-stone-700">
              Search Results ({searchResults.length})
            </h3>
            <div className="border-l-2 border-l-stone-300 pl-3">
              {searchResults.map((entry) => (
                <KnowledgeEntry key={entry.id} entry={entry} onCopy={onCopyKnowledge} onApply={onApplyToBrief} onFlag={onFlagWrong} />
              ))}
            </div>
          </div>
        )}

        {/* Brand color swatches */}
        {summary?.brandColors && summary.brandColors.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-[13px] font-medium uppercase tracking-widest text-stone-700">Brand Colors</h3>
            <div className="flex flex-wrap gap-2">
              {summary.brandColors.map((color) => (
                <span
                  key={color}
                  className="inline-block h-7 w-7 rounded-md border border-stone-200"
                  style={{ backgroundColor: color }}
                  title={color}
                  aria-label={`Brand color ${color}`}
                />
              ))}
            </div>
          </div>
        )}

        {knowledge.length === 0 ? (
          !isEmpty ? (
            <div className="stage-current rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
              <span className="material-symbols-outlined mb-2 text-stone-700" style={{ fontSize: 24 }}>psychology</span>
              <p className="text-[15px] text-stone-900">Analyzing your files...</p>
              <p className="mt-1 text-[13px] text-stone-700">Extraction runs in the background</p>
            </div>
          ) : (
            <p className="text-[15px] leading-6 text-stone-900">
              Prism learns about your clients from the files and notes you share. The more context you provide, the smarter your builds get.
            </p>
          )
        ) : !searchQuery && (
          (() => {
            const knowledgeGroups = groupKnowledgeByCategory(knowledge);
            return CATEGORIES.map((category) => {
              const entries = knowledgeGroups[category];
              const cfg = CATEGORY_CONFIG[category];
              return (
                <div key={category} className="mb-5">
                  <h3 className={`mb-2 text-[13px] font-medium uppercase tracking-widest ${cfg.text}`}>{cfg.label}</h3>
                  <div className={`border-l-2 pl-3 ${cfg.border}`}>
                    {entries ? entries.map((entry) => (
                      <KnowledgeEntry key={entry.id} entry={entry} onCopy={onCopyKnowledge} onApply={onApplyToBrief} onFlag={onFlagWrong} />
                    )) : (
                      <span className="text-[15px] text-stone-700">No {category} info yet</span>
                    )}
                  </div>
                </div>
              );
            });
          })()
        )}

        {/* Client inheritance section (3C) */}
        {clientSummary && (
          <div className="mt-5 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="mb-2 text-[13px] font-medium uppercase tracking-widest text-stone-700">From Client</div>
            <p className="text-[13px] leading-relaxed text-stone-900 line-clamp-4">
              {clientSummary.content}
            </p>
          </div>
        )}

        {contextHealth && contextItems.length > 0 && (
          <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">Context Health</div>
            <div className="flex items-center gap-3">
              <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0">
                <circle cx="38" cy="38" r={healthRadius} fill="none" stroke="#e5e5e5" strokeWidth="5" />
                <circle cx="38" cy="38" r={healthRadius} fill="none" stroke={healthColor} strokeWidth="5" strokeLinecap="round" strokeDasharray={healthCircumference} strokeDashoffset={healthOffset} transform="rotate(-90 38 38)" className="transition-all duration-500" />
                <text x="38" y="35" textAnchor="middle" fill={healthColor} fontSize="16" fontWeight="600">{contextHealth.score}</text>
                <text x="38" y="47" textAnchor="middle" fill="#a3a3a3" fontSize="9">/100</text>
              </svg>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                {[
                  { ok: contextHealth.hasProfile, label: "Profile" },
                  { ok: contextHealth.hasDocs, label: "Docs" },
                  { ok: contextHealth.recent, label: "Recent" },
                  { ok: contextHealth.hasCategories, label: "Categories" },
                ].map((c) => (
                  <span key={c.label} className={c.ok ? "text-emerald-600" : "text-stone-700"}>
                    <span className="material-symbols-outlined align-middle" style={{ fontSize: 13 }}>
                      {c.ok ? "check_circle" : "radio_button_unchecked"}
                    </span>{" "}{c.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
