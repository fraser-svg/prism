type Badge = "healthy" | "stale" | "blocked" | "needs-review" | "unreachable" | "new";

const BADGE_COLORS: Record<Badge, string> = {
  healthy: "var(--success)",
  stale: "var(--warning)",
  blocked: "var(--error)",
  "needs-review": "var(--warning)",
  unreachable: "var(--neutral-400)",
  new: "var(--neutral-400)",
};

export function HealthBadge({ badge }: { badge: Badge }) {
  return (
    <span
      aria-label={`Status: ${badge}`}
      style={{
        width: 8,
        height: 8,
        borderRadius: "var(--radius-full)",
        backgroundColor: BADGE_COLORS[badge],
        flexShrink: 0,
      }}
    />
  );
}
