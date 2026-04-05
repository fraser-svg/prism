import React from "react";

interface GateStatusProps {
  blockers: Array<{ description: string; met: boolean }>;
  onAdvance: () => void;
  canAdvance: boolean;
}

export function GateStatus({ blockers, onAdvance, canAdvance }: GateStatusProps) {
  const metItems = blockers.filter((b) => b.met);
  const unmetItems = blockers.filter((b) => !b.met);

  return (
    <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-6">
      <div className="mb-5 flex items-center justify-between">
        <h4 className="text-[13px] font-medium uppercase tracking-widest text-stone-700">
          Gate Status
        </h4>
        <span className="text-[13px] text-stone-700">
          {metItems.length}/{blockers.length} passed
        </span>
      </div>

      {/* Unmet blockers */}
      {unmetItems.length > 0 && (
        <div className="mb-4 space-y-2.5">
          {unmetItems.map((blocker, i) => (
            <div
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3"
            >
              <span
                className="material-symbols-outlined text-red-500"
                style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}
              >
                warning
              </span>
              <span className="text-[15px] text-red-600">
                {blocker.description}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Met evidence */}
      {metItems.length > 0 && (
        <ul className="mb-5 space-y-3">
          {metItems.map((item, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[15px]">
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  color: "#10B981",
                  fontVariationSettings: "'FILL' 1",
                }}
              >
                check_circle
              </span>
              <span className="text-black">{item.description}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Advance button */}
      <button
        className={`flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-[15px] font-medium text-white transition-colors ${
          canAdvance
            ? "hover:bg-stone-700"
            : "cursor-not-allowed opacity-50"
        }`}
        disabled={!canAdvance}
        onClick={onAdvance}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          arrow_forward
        </span>
        Advance
      </button>
    </div>
  );
}
