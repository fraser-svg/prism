import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Chip, ProgressBar, Tooltip, Button, ButtonGroup, TextArea } from "@heroui/react";
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
  file: "\u{1F4C4}",
  directory: "\u{1F4C1}",
  text_note: "\u{1F4DD}",
  url: "\u{1F517}",
};

const STATUS_CONFIG = {
  extracted: { label: "\u2713 Extracted", color: "success" as const },
  extracting: { label: "\u27F3 Extracting...", color: "warning" as const },
  queued: { label: "\u23F3 Queued", color: "default" as const },
  failed: { label: "\u2717 Failed", color: "danger" as const },
  stored: { label: "\u2014 Stored", color: "default" as const },
};

const CATEGORY_BORDERS: Record<string, string> = {
  business: "border-l-[var(--accent-blue)]",
  technical: "border-l-[var(--accent-green)]",
  design: "border-l-[var(--accent-purple)]",
  history: "border-l-[var(--accent-amber)]",
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
      className="group py-1.5 transition-all duration-150"
      style={{ opacity: lowConfidence ? 0.6 : 1 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onFocus={() => setShowActions(true)}
      onBlur={() => setShowActions(false)}
      tabIndex={0}
    >
      <Tooltip>
        <Tooltip.Trigger>
          <div className="text-sm leading-relaxed" style={{ color: "var(--text-primary)", fontSize: 14, lineHeight: 1.6 }}>
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{entry.key}:</span>{" "}
            {entry.value}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Content>
          {`Confidence: ${Math.round(entry.confidence * 100)}% | Source: ${entry.sourceItemId}`}
        </Tooltip.Content>
      </Tooltip>
      {showActions && (
        <div className="mt-1 flex gap-2 fade-in">
          <ButtonGroup size="sm" variant="ghost">
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onCopy(`${entry.key}: ${entry.value}`)}
              style={{ fontSize: 11, color: "var(--text-tertiary)" }}
            >
              Copy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onApply(entry.id)}
              style={{ fontSize: 11, color: "var(--text-tertiary)" }}
            >
              Apply to Brief
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => onFlag(entry.id)}
              style={{ fontSize: 11, color: "var(--text-tertiary)" }}
            >
              Flag Wrong
            </Button>
          </ButtonGroup>
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
  const isEmpty = contextItems.length === 0;

  const onDropAccepted = useCallback(
    (acceptedFiles: File[]) => {
      onDrop(acceptedFiles);
    },
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

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: Drop zone + items */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {/* Drop zone */}
        <div
          {...getRootProps()}
          role="region"
          aria-label="File drop zone"
          style={{
            height: isEmpty ? 160 : 100,
            border: isDragActive
              ? "2px solid var(--accent-blue)"
              : "2px dashed var(--border-default)",
            borderRadius: "var(--radius-md)",
            background: isDragActive ? "rgba(77,142,255,0.05)" : "transparent",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
            marginBottom: 16,
          }}
        >
          <input {...getInputProps()} />
          <span
            style={{
              fontSize: isDragActive ? 28 : 24,
              color: "var(--text-tertiary)",
              marginBottom: 8,
              transition: "font-size 0.15s ease",
            }}
          >
            {"\u2B06"}
          </span>
          <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
            {isDragActive
              ? "Release to add"
              : "Drop files, folders, or paste notes"}
          </span>
        </div>

        {/* Text note input */}
        <div style={{ marginBottom: 16 }}>
          <TextArea
            placeholder="Add a note about this client..."
            value={noteText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNoteText(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && e.metaKey) handleAddNote();
            }}
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontSize: 13,
            }}
          />
          {noteText.trim() && (
            <Button
              size="sm"
              variant="primary"
              onPress={handleAddNote}
              className="mt-2"
            >
              Add Note
            </Button>
          )}
        </div>

        {/* Empty state */}
        {isEmpty && (
          <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.8 }}>
            <p style={{ marginBottom: 4 }}>1. Drop a pitch deck or brief to teach Prism about this client</p>
            <p style={{ marginBottom: 4 }}>2. Paste call notes or meeting summaries</p>
            <p style={{ marginBottom: 16 }}>3. Link a previous project folder for tech stack analysis</p>
          </div>
        )}

        {/* Context items list */}
        {contextItems.length > 0 && (
          <div>
            <h3
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 12,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
              aria-label="Context items"
            >
              {extractionQueue.extracting > 0
                ? `Extracting ${extractionQueue.extracting} of ${extractionQueue.total}...`
                : `Context Items (${contextItems.length})`}
            </h3>
            <div role="list" aria-label="Context items">
            {contextItems.map((item) => {
              const status = item.extractionStatus || "stored";
              const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.stored;
              return (
                <div
                  key={item.id}
                  className="group flex items-center gap-3 py-2 px-2 rounded-md transition-colors duration-150"
                  style={{ borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <span style={{ fontSize: 16 }}>
                    {FILE_ICONS[item.itemType] || FILE_ICONS.file}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 8 }}>
                      {item.fileSizeBytes && (
                        <span>{(item.fileSizeBytes / 1024).toFixed(0)}KB</span>
                      )}
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Chip
                    size="sm"
                    color={config.color}
                    variant="soft"
                    className={status === "extracting" ? "stage-current" : ""}
                  >
                    {config.label}
                  </Chip>
                  {/* Hover actions */}
                  <div className="hidden group-hover:flex gap-1">
                    {(status === "failed" || status === "stored") && (
                      <Button size="sm" variant="ghost" onPress={() => onReExtract(item.id)}>
                        Re-extract
                      </Button>
                    )}
                    {deletingId === item.id ? (
                      <>
                        <Button size="sm" variant="danger-soft" onPress={() => { onDeleteItem(item.id); setDeletingId(null); }}>
                          Delete?
                        </Button>
                        <Button size="sm" variant="ghost" onPress={() => setDeletingId(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" onPress={() => setDeletingId(item.id)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Link previous attempt */}
        <Button
          variant="ghost"
          onPress={onLinkPreviousAttempt}
          className="mt-4"
          style={{ color: "var(--accent-blue)", fontSize: 13 }}
        >
          + Link Previous Attempt
        </Button>
      </div>

      {/* Right sidebar: What Prism Knows + Health */}
      <div
        role="complementary"
        aria-label="Extracted knowledge"
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
          What Prism Knows
        </h2>

        {knowledge.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {isEmpty
              ? "Prism learns about your clients from the files and notes you share. The more context you provide, the smarter your builds get."
              : "Prism hasn't extracted knowledge yet. Drop files or add notes to teach Prism about this client."}
          </p>
        ) : (
          categories.map((category) => {
            const entries = knowledgeGroups[category];
            const borderClass = CATEGORY_BORDERS[category] || "";
            return (
              <div key={category} style={{ marginBottom: 16 }}>
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
                  {category}
                </h3>
                <div className={`border-l-2 pl-3 ${borderClass}`}>
                  {entries ? (
                    entries.map((entry) => (
                      <KnowledgeEntry
                        key={entry.id}
                        entry={entry}
                        onCopy={onCopyKnowledge}
                        onApply={onApplyToBrief}
                        onFlag={onFlagWrong}
                      />
                    ))
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                      No {category} info extracted yet
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Context health */}
        {contextHealth && contextItems.length > 0 && (
          <div style={{ marginTop: 20, padding: 12, background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
            <Tooltip>
              <Tooltip.Trigger>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Context Health
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color:
                          contextHealth.score >= 76
                            ? "var(--accent-green)"
                            : contextHealth.score >= 26
                              ? "var(--accent-amber)"
                              : "var(--accent-red)",
                      }}
                    >
                      {contextHealth.score}/100
                    </span>
                  </div>
                  <ProgressBar
                    value={contextHealth.score}
                    color={
                      contextHealth.score >= 76
                        ? "success"
                        : contextHealth.score >= 26
                          ? "warning"
                          : "danger"
                    }
                    size="sm"
                  />
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content>
                <div style={{ padding: 8 }}>
                  <div>{contextHealth.hasProfile ? "\u2713" : "\u2717"} Client profile generated</div>
                  <div>{contextHealth.hasDocs ? "\u2713" : "\u2717"} At least 3 context items</div>
                  <div>{contextHealth.recent ? "\u2713" : "\u2717"} Updated within 30 days</div>
                  <div>{contextHealth.hasCategories ? "\u2713" : "\u2717"} 2+ knowledge categories</div>
                </div>
              </Tooltip.Content>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
