import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import type { ContextItem, ExtractedKnowledge, KnowledgeSummary } from "../types";

interface ContextTabProps {
  contextItems: ContextItem[];
  knowledge: ExtractedKnowledge[];
  summary: KnowledgeSummary | null;
  contextHealth: { score: number; hasProfile: boolean; hasDocs: boolean; recent: boolean; hasCategories: boolean } | null;
  extractionQueue: { extracting: number; total: number };
  onDrop: (files: File[]) => void;
  onAddNote: (text: string) => void;
  onDeleteItem: (id: string) => void;
  onReExtract: (id: string) => void;
  onCopyKnowledge: (text: string) => void;
  onApplyToBrief: (knowledgeId: string) => void;
  onFlagWrong: (knowledgeId: string) => void;
  onLinkPreviousAttempt: () => void;
}

const FILE_ICONS: Record<string, string> = {
  file: "description",
  directory: "folder",
  text_note: "edit_note",
  url: "link",
};

const STATUS_CONFIG = {
  extracted: { label: "Extracted", bg: "bg-emerald-50", text: "text-emerald-600" },
  extracting: { label: "Extracting...", bg: "bg-[#91A6FF]/20", text: "text-[#4A5A99]" },
  queued: { label: "Queued", bg: "bg-amber-50", text: "text-amber-600" },
  failed: { label: "Failed", bg: "bg-red-50", text: "text-red-500" },
  stored: { label: "Stored", bg: "bg-[#91A6FF]/10", text: "text-[#5B6BAA]" },
};

const CATEGORY_CONFIG: Record<string, { border: string; text: string; label: string }> = {
  business: { border: "border-l-stone-400", text: "text-black", label: "BUSINESS" },
  technical: { border: "border-l-emerald-400", text: "text-emerald-600", label: "TECHNICAL" },
  design: { border: "border-l-purple-400", text: "text-purple-600", label: "DESIGN" },
  history: { border: "border-l-amber-400", text: "text-amber-600", label: "HISTORY" },
};

function groupKnowledgeByCategory(knowledge: ExtractedKnowledge[]) {
  const groups: Record<string, ExtractedKnowledge[]> = {};
  for (const k of knowledge) {
    if (k.confidence < 0.3) continue;
    if (!groups[k.category]) groups[k.category] = [];
    groups[k.category].push(k);
  }
  return groups;
}

function KnowledgeEntry({
  entry,
  onCopy,
  onApply,
  onFlag,
}: {
  entry: ExtractedKnowledge;
  onCopy: (text: string) => void;
  onApply: (id: string) => void;
  onFlag: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const lowConfidence = entry.confidence < 0.5;

  return (
    <div
      className="group py-1.5"
      style={{ opacity: lowConfidence ? 0.6 : 1 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] leading-relaxed text-black">
          <span className="text-[13px] text-stone-700">{entry.key}:</span>{" "}
          {entry.value}
        </p>
        <span className="shrink-0 text-[13px] font-medium text-stone-700">
          {Math.round(entry.confidence * 100)}%
        </span>
      </div>
      {showActions && (
        <div className="mt-1 flex gap-1">
          <button className="rounded px-2 py-0.5 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => onCopy(`${entry.key}: ${entry.value}`)}>Copy</button>
          <button className="rounded px-2 py-0.5 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => onApply(entry.id)}>Apply to Brief</button>
          <button className="rounded px-2 py-0.5 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => onFlag(entry.id)}>Flag Wrong</button>
        </div>
      )}
    </div>
  );
}

export function ContextTab({
  contextItems,
  knowledge,
  summary,
  contextHealth,
  extractionQueue,
  onDrop,
  onAddNote,
  onDeleteItem,
  onReExtract,
  onCopyKnowledge,
  onApplyToBrief,
  onFlagWrong,
  onLinkPreviousAttempt,
}: ContextTabProps) {
  const [noteText, setNoteText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = contextItems.length === 0;

  const onDropAccepted = useCallback(
    (acceptedFiles: File[]) => { onDrop(acceptedFiles); },
    [onDrop],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropAccepted,
    noClick: false,
    noKeyboard: false,
    maxSize: 10 * 1024 * 1024,
  });

  const handleAddNote = () => {
    if (noteText.trim()) {
      onAddNote(noteText.trim());
      setNoteText("");
    }
  };

  const knowledgeGroups = groupKnowledgeByCategory(knowledge);
  const categories = ["business", "technical", "design", "history"];

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
        <div
          {...getRootProps()}
          role="region"
          aria-label="File drop zone"
          className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all ${
            isDragActive ? "border-stone-400 bg-stone-100" : "border-stone-200 bg-[var(--bg-surface)] hover:border-stone-300"
          }`}
          style={{ height: isEmpty ? 140 : 90 }}
        >
          <input {...getInputProps()} />
          <span className="material-symbols-outlined mb-1.5 text-stone-700" style={{ fontSize: isDragActive ? 28 : 24 }}>
            {isDragActive ? "file_download" : "cloud_upload"}
          </span>
          <span className="text-[15px] text-stone-900">
            {isDragActive ? "Release to add" : "Drop files, folders, or paste notes"}
          </span>
        </div>

        {/* Note input */}
        <div className="mb-4">
          <textarea
            ref={textareaRef}
            placeholder="Add a note..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) handleAddNote(); }}
            rows={3}
            className="w-full resize-none rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-3 text-[15px] text-black placeholder:text-stone-700 transition-colors focus:border-stone-800 focus:outline-none"
          />
          {noteText.trim() && (
            <div className="mt-2 flex justify-end">
              <button className="rounded-lg bg-stone-800 px-3 py-1.5 text-[15px] font-medium text-white transition-colors hover:bg-stone-700" onClick={handleAddNote}>
                Save
              </button>
            </div>
          )}
        </div>

        {isEmpty && (
          <div className="text-[15px] leading-7 text-stone-900">
            <p>1. Drop a pitch deck or brief to teach Prism about this client</p>
            <p>2. Paste call notes or meeting summaries</p>
            <p>3. Link a previous project folder for tech stack analysis</p>
          </div>
        )}

        {contextItems.length > 0 && (
          <div>
            <h3 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
              {extractionQueue.extracting > 0
                ? `Extracting ${extractionQueue.extracting} of ${extractionQueue.total}...`
                : `Context Items \u00b7 ${contextItems.length}`}
            </h3>
            <div role="list" className="space-y-0.5">
              {contextItems.map((item) => {
                const status = item.extractionStatus || "stored";
                const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.stored;
                return (
                  <div key={item.id} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-stone-50">
                    <span className="material-symbols-outlined text-stone-700" style={{ fontSize: 18 }}>{FILE_ICONS[item.itemType] || FILE_ICONS.file}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium text-black">{item.title}</div>
                      <div className="flex gap-2 text-[13px] text-stone-700">
                        {item.fileSizeBytes && <span>{(item.fileSizeBytes / 1024).toFixed(0)} KB</span>}
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[13px] font-medium ${config.bg} ${config.text} ${status === "extracting" ? "stage-current" : ""}`}>
                      {config.label}
                    </span>
                    <div className="hidden gap-1 group-hover:flex">
                      {(status === "failed" || status === "stored") && (
                        <button className="rounded px-2 py-1 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => onReExtract(item.id)}>Re-extract</button>
                      )}
                      {deletingId === item.id ? (
                        <>
                          <button className="rounded bg-red-50 px-2 py-1 text-[13px] text-red-500 hover:bg-red-100" onClick={() => { onDeleteItem(item.id); setDeletingId(null); }}>Delete?</button>
                          <button className="rounded px-2 py-1 text-[13px] text-stone-700 hover:bg-stone-100" onClick={() => setDeletingId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="rounded px-2 py-1 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => setDeletingId(item.id)}>Delete</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button className="mt-4 flex items-center gap-1 text-[15px] text-black transition-colors hover:text-stone-900" onClick={onLinkPreviousAttempt}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
          Link Previous Attempt
        </button>
      </div>

      {/* Right sidebar */}
      <div role="complementary" className="w-[280px] shrink-0 overflow-auto border-l border-stone-200 bg-[var(--bg-surface)] p-5">
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-widest text-stone-700">
          What Prism Knows
        </h2>

        {knowledge.length === 0 ? (
          <p className="text-[15px] leading-6 text-stone-900">
            {isEmpty
              ? "Prism learns about your clients from the files and notes you share. The more context you provide, the smarter your builds get."
              : "Drop files or add notes to teach Prism about this client."}
          </p>
        ) : (
          categories.map((category) => {
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
          })
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
