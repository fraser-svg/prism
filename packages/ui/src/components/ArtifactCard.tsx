import React, { useState } from "react";

interface ArtifactCardProps {
  type: "spec" | "plan" | "problem";
  title: string;
  content: string;
  rawJson?: Record<string, unknown>;
  onApprove?: () => void;
  onReject?: (reason: string) => void;
  approved?: boolean;
  rejected?: boolean;
}

const TYPE_ICON: Record<ArtifactCardProps["type"], string> = {
  spec: "description",
  plan: "route",
  problem: "report",
};

export function ArtifactCard({
  type,
  title,
  content,
  rawJson,
  onApprove,
  onReject,
  approved,
  rejected,
}: ArtifactCardProps) {
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [actionTaken, setActionTaken] = useState(false);

  const isResolved = approved || rejected;
  const buttonsDisabled = isResolved || actionTaken;

  function handleApprove() {
    if (buttonsDisabled) return;
    setActionTaken(true);
    onApprove?.();
  }

  function handleRejectConfirm() {
    if (buttonsDisabled) return;
    setActionTaken(true);
    onReject?.(rejectReason);
    setRejectMode(false);
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-3">
        <span className="material-symbols-outlined text-[20px] text-stone-500">
          {TYPE_ICON[type]}
        </span>
        <span className="text-[13px] font-semibold uppercase tracking-widest text-stone-500">
          {type}
        </span>
        <h4 className="ml-1 text-[15px] font-medium text-stone-800">
          {title}
        </h4>

        {/* Status badges */}
        {approved && (
          <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-emerald-600">
            Approved
          </span>
        )}
        {rejected && (
          <span className="ml-auto rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider text-red-500">
            Rejected
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-stone-800">
          {content}
        </div>
      </div>

      {/* Raw JSON toggle */}
      {rawJson && (
        <div className="border-t border-stone-200">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-5 py-2.5 text-[13px] text-stone-500 hover:text-stone-700 transition-colors"
            onClick={() => setJsonExpanded((v) => !v)}
          >
            <span className="material-symbols-outlined text-[16px]">
              {jsonExpanded ? "expand_less" : "expand_more"}
            </span>
            {jsonExpanded ? "Hide" : "View"} Raw JSON
          </button>

          {jsonExpanded && (
            <div className="max-h-64 overflow-auto border-t border-stone-100 bg-stone-50 px-5 py-3">
              <pre className="text-[13px] leading-relaxed text-stone-700">
                <code>{JSON.stringify(rawJson, null, 2)}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-stone-200 px-5 py-3">
        {rejectMode && !buttonsDisabled ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[15px] text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              className="rounded-lg bg-red-500 px-4 py-2 text-[15px] font-medium text-white hover:bg-red-600 transition-colors"
              onClick={handleRejectConfirm}
            >
              Confirm
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-[13px] text-stone-500 hover:text-stone-700 transition-colors"
              onClick={() => setRejectMode(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-[15px] font-medium text-white hover:bg-emerald-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              disabled={buttonsDisabled}
              onClick={handleApprove}
            >
              Approve
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-300 px-4 py-2 text-[15px] font-medium text-red-500 hover:bg-red-50 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              disabled={buttonsDisabled}
              onClick={() => setRejectMode(true)}
            >
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
