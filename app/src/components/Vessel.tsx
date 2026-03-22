"use client";

import type { VesselData } from "@/lib/store";

const TYPE_COLORS: Record<string, string> = {
  seed: "var(--text-muted)",
  frame: "var(--accent)",
  mechanism: "var(--green)",
  surface: "#6b8cae",
  actor: "#9a7bc4",
  test: "var(--red)",
};

export function Vessel({ vessel }: { vessel: VesselData }) {
  const color = TYPE_COLORS[vessel.type] || "var(--accent-soft)";

  return (
    <div
      className="absolute transition-all duration-500 ease-out"
      style={{
        left: vessel.x,
        top: vessel.y,
        opacity: vessel.visible ? 1 : 0,
        transform: vessel.visible ? "scale(1)" : "scale(0.85)",
      }}
      data-no-pan
    >
      <div
        className="rounded-xl border-[1.5px] p-4 w-[220px] cursor-default select-none"
        style={{
          background: "var(--surface)",
          borderColor: vessel.active ? color : "var(--border)",
          boxShadow: vessel.active
            ? `0 0 0 3px ${color}15`
            : "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          className="text-[9px] font-semibold uppercase tracking-[1.5px] mb-1.5"
          style={{ color }}
        >
          {vessel.label || vessel.type}
        </div>
        <div
          className="text-[14px] leading-[1.4]"
          style={{
            color: vessel.content ? "var(--text)" : "var(--text-muted)",
            opacity: vessel.content ? 1 : 0.3,
            fontStyle: vessel.content ? "normal" : "italic",
            fontSize: vessel.type === "frame" && vessel.label === "The Feeling" ? "24px" : undefined,
            fontWeight: vessel.type === "frame" && vessel.label === "The Feeling" ? 300 : undefined,
            letterSpacing: vessel.type === "frame" && vessel.label === "The Feeling" ? "-0.5px" : undefined,
          }}
        >
          {vessel.content || "Listening..."}
        </div>
      </div>
    </div>
  );
}
