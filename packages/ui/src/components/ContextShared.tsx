import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import type { ContextItem, ExtractedKnowledge } from "../types";

// ── Constants ────────────────────────────────────────────

export const FILE_ICONS: Record<string, string> = {
  file: "description",
  directory: "folder",
  text_note: "edit_note",
  url: "link",
};

export const STATUS_CONFIG = {
  extracted: { label: "Extracted", bg: "bg-emerald-50", text: "text-emerald-600" },
  extracting: { label: "Extracting...", bg: "bg-[#91A6FF]/20", text: "text-[#4A5A99]" },
  queued: { label: "Queued", bg: "bg-amber-50", text: "text-amber-600" },
  failed: { label: "Failed", bg: "bg-red-50", text: "text-red-500" },
  stored: { label: "Stored", bg: "bg-[#91A6FF]/10", text: "text-[#5B6BAA]" },
};

export const CATEGORY_CONFIG: Record<string, { border: string; text: string; label: string }> = {
  business: { border: "border-l-stone-400", text: "text-black", label: "BUSINESS" },
  technical: { border: "border-l-emerald-400", text: "text-emerald-600", label: "TECHNICAL" },
  design: { border: "border-l-purple-400", text: "text-purple-600", label: "DESIGN" },
  history: { border: "border-l-amber-400", text: "text-amber-600", label: "HISTORY" },
};

export const CATEGORIES = ["business", "technical", "design", "history"] as const;

// ── Helpers ──────────────────────────────────────────────

export function groupKnowledgeByCategory(knowledge: ExtractedKnowledge[]) {
  const groups: Record<string, ExtractedKnowledge[]> = {};
  for (const k of knowledge) {
    if (k.confidence < 0.5) continue;
    if (!groups[k.category]) groups[k.category] = [];
    groups[k.category].push(k);
  }
  return groups;
}

// ── KnowledgeEntry ───────────────────────────────────────

export function KnowledgeEntry({
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
        <p className="text-[15px] leading-relaxed text-black" title={entry.sourceQuote || undefined}>
          <span className="text-[13px] text-stone-700">{entry.key}:</span>{" "}
          {entry.value}
          {entry.sourceQuote && (
            <span className="ml-1 inline-block cursor-help text-[11px] text-stone-400" title={`Source: "${entry.sourceQuote}"`}>
              [src]
            </span>
          )}
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

// ── ContextDropZone ──────────────────────────────────────

interface ContextDropZoneProps {
  onDrop: (files: File[]) => void;
  compact?: boolean;
}

export function ContextDropZone({ onDrop, compact }: ContextDropZoneProps) {
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

  return (
    <div
      {...getRootProps()}
      role="region"
      aria-label="File upload area"
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all ${
        isDragActive ? "border-stone-400 bg-stone-100" : "border-stone-200 bg-[var(--bg-surface)] hover:border-stone-300"
      }`}
      style={{ height: compact ? 90 : 140 }}
    >
      <input {...getInputProps()} />
      <span className="material-symbols-outlined mb-1.5 text-stone-700" style={{ fontSize: isDragActive ? 28 : 24 }}>
        {isDragActive ? "file_download" : "cloud_upload"}
      </span>
      <span className="text-[15px] text-stone-900">
        {isDragActive ? "Release to add" : "Drop files, folders, or paste notes"}
      </span>
    </div>
  );
}

// ── ContextNoteInput ─────────────────────────────────────

interface ContextNoteInputProps {
  onAddNote: (text: string) => void;
}

export function ContextNoteInput({ onAddNote }: ContextNoteInputProps) {
  const [noteText, setNoteText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAddNote = () => {
    if (noteText.trim()) {
      onAddNote(noteText.trim());
      setNoteText("");
    }
  };

  return (
    <div>
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
  );
}

// ── ContextItemList ──────────────────────────────────────

interface ContextItemListProps {
  items: ContextItem[];
  extractionQueue: { extracting: number; total: number };
  onDeleteItem?: (id: string) => void;
  onReExtract?: (id: string) => void;
}

export function ContextItemList({ items, extractionQueue, onDeleteItem, onReExtract }: ContextItemListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-[13px] font-medium uppercase tracking-widest text-stone-700">
        {extractionQueue.extracting > 0
          ? `Extracting ${extractionQueue.extracting} of ${extractionQueue.total}...`
          : `Context Items \u00b7 ${items.length}`}
      </h3>
      <div role="list" className="space-y-0.5">
        {items.map((item) => {
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
              {(onDeleteItem || onReExtract) && (
                <div className="hidden gap-1 group-hover:flex">
                  {onReExtract && (status === "failed" || status === "stored") && (
                    <button className="rounded px-2 py-1 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => onReExtract(item.id)}>Re-extract</button>
                  )}
                  {onDeleteItem && (
                    deletingId === item.id ? (
                      <>
                        <button className="rounded bg-red-50 px-2 py-1 text-[13px] text-red-500 hover:bg-red-100" onClick={() => { onDeleteItem(item.id); setDeletingId(null); }}>Delete?</button>
                        <button className="rounded px-2 py-1 text-[13px] text-stone-700 hover:bg-stone-100" onClick={() => setDeletingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="rounded px-2 py-1 text-[13px] text-stone-700 transition-colors hover:bg-stone-100 hover:text-black" onClick={() => setDeletingId(item.id)}>Delete</button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KnowledgePanel ───────────────────────────────────────

interface KnowledgePanelProps {
  knowledge: ExtractedKnowledge[];
  hasItems: boolean;
  hideActions?: boolean;
  onCopyKnowledge: (text: string) => void;
  onApplyToBrief: (knowledgeId: string) => void;
  onFlagWrong: (knowledgeId: string) => void;
}

export function KnowledgePanel({ knowledge, hasItems, hideActions, onCopyKnowledge, onApplyToBrief, onFlagWrong }: KnowledgePanelProps) {
  const knowledgeGroups = groupKnowledgeByCategory(knowledge);

  if (knowledge.length === 0) {
    if (hasItems) {
      return (
        <div>
          <h2 className="mb-4 text-[13px] font-medium uppercase tracking-widest text-stone-700">
            What Prism Knows
          </h2>
          <div className="stage-current rounded-lg border border-stone-200 bg-stone-50 p-4 text-center">
            <span className="material-symbols-outlined mb-2 text-stone-700" style={{ fontSize: 24 }}>psychology</span>
            <p className="text-[15px] text-stone-900">Analyzing your files...</p>
            <p className="mt-1 text-[13px] text-stone-700">Extraction runs in the background</p>
          </div>
        </div>
      );
    }
    return (
      <div>
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-widest text-stone-700">
          What Prism Knows
        </h2>
        <p className="text-[15px] leading-6 text-stone-900">
          Prism learns about your clients from the files and notes you share. The more context you provide, the smarter your builds get.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-widest text-stone-700">
        What Prism Knows
      </h2>
      {CATEGORIES.map((category) => {
        const entries = knowledgeGroups[category];
        const cfg = CATEGORY_CONFIG[category];
        return (
          <div key={category} className="mb-5">
            <h3 className={`mb-2 text-[13px] font-medium uppercase tracking-widest ${cfg.text}`}>{cfg.label}</h3>
            <div className={`border-l-2 pl-3 ${cfg.border}`}>
              {entries ? entries.map((entry) => (
                hideActions
                  ? <div key={entry.id} className="py-1.5" style={{ opacity: entry.confidence < 0.5 ? 0.6 : 1 }}>
                      <p className="text-[15px] leading-relaxed text-black">
                        <span className="text-[13px] text-stone-700">{entry.key}:</span>{" "}{entry.value}
                      </p>
                    </div>
                  : <KnowledgeEntry key={entry.id} entry={entry} onCopy={onCopyKnowledge} onApply={onApplyToBrief} onFlag={onFlagWrong} />
              )) : (
                <span className="text-[15px] text-stone-700">No {category} info yet</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
