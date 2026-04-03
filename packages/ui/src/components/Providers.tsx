import { useEffect, useState, useCallback } from "react";
import { usePrismStore } from "../context";

const STATUS_COLORS: Record<string, string> = {
  connected: "#22c55e",
  degraded: "#eab308",
  needs_reauth: "#f97316",
  unavailable: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  connected: "Healthy",
  degraded: "Degraded",
  needs_reauth: "Needs Auth",
  unavailable: "Unavailable",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.unavailable;
  const label = STATUS_LABELS[status] || status;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        color,
        background: `${color}18`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: color,
        }}
      />
      {label}
    </span>
  );
}

export function Providers() {
  const { providers, providersLoading: loading, loadProviders, refreshProviders } = usePrismStore();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshProviders();
    } finally {
      setRefreshing(false);
    }
  }, [refreshProviders]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  if (loading) {
    return null;
  }

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Providers</h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid var(--border-color, #333)",
            background: "var(--bg-secondary, #1a1a1a)",
            color: "var(--text-primary, #fff)",
            cursor: refreshing ? "wait" : "pointer",
            fontSize: 13,
          }}
        >
          {refreshing ? "Checking..." : "Refresh"}
        </button>
      </div>

      {providers.length === 0 ? (
        <div style={{ color: "var(--text-secondary, #888)", fontSize: 14 }}>
          No providers registered. Connect providers to enable multi-model routing.
        </div>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border-color, #333)",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "8px 12px", fontWeight: 500 }}>Provider</th>
              <th style={{ padding: "8px 12px", fontWeight: 500 }}>Status</th>
              <th style={{ padding: "8px 12px", fontWeight: 500 }}>Tasks</th>
              <th style={{ padding: "8px 12px", fontWeight: 500 }}>Last Check</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr
                key={p.providerId}
                style={{
                  borderBottom: "1px solid var(--border-color, #222)",
                }}
              >
                <td style={{ padding: "10px 12px" }}>{p.displayName}</td>
                <td style={{ padding: "10px 12px" }}>
                  <StatusBadge status={p.status} />
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary, #888)" }}>
                  {p.taskCount}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--text-secondary, #888)" }}>
                  {p.lastHealthCheck
                    ? new Date(p.lastHealthCheck).toLocaleTimeString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
