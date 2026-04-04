import { useEffect, useState, useCallback } from "react";
import { usePrismStore } from "../context";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  connected: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Healthy" },
  degraded: { bg: "bg-amber-50", text: "text-amber-600", label: "Degraded" },
  needs_reauth: { bg: "bg-orange-50", text: "text-orange-600", label: "Needs Re-auth" },
  unavailable: { bg: "bg-red-50", text: "text-red-500", label: "Unavailable" },
  unknown: { bg: "bg-[#91A6FF]/20", text: "text-[#4A5A99]", label: "Unknown" },
};

export function Providers() {
  const { providers, loadProviders } = usePrismStore();
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadProviders();
    } finally {
      setLoading(false);
    }
  }, [loadProviders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const healthy = providers.filter((p) => p.status === "connected").length;
  const degraded = providers.filter((p) => p.status === "degraded").length;
  const needsReauth = providers.filter((p) => p.status === "needs_reauth").length;
  const unavailable = providers.filter((p) => p.status === "unavailable").length;

  return (
    <div className="h-full overflow-auto px-8 py-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[17px] font-medium text-black">
            Providers
          </h1>
          <p className="text-[15px] text-stone-900">
            Manage LLM infrastructure and service status
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-[15px] text-stone-800 transition-colors hover:bg-stone-50 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined ${loading ? "animate-spin" : ""}`} style={{ fontSize: 14 }}>
            refresh
          </span>
          Refresh
        </button>
      </header>

      {/* Table */}
      <div className="rounded-lg border border-stone-200 bg-[var(--bg-surface)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-100">
              <th className="px-5 py-3 text-left text-[13px] font-medium uppercase tracking-widest text-stone-700">
                Provider
              </th>
              <th className="px-5 py-3 text-left text-[13px] font-medium uppercase tracking-widest text-stone-700">
                Status
              </th>
              <th className="px-5 py-3 text-right text-[13px] font-medium uppercase tracking-widest text-stone-700">
                Tasks
              </th>
              <th className="px-5 py-3 text-right text-[13px] font-medium uppercase tracking-widest text-stone-700">
                Last Check
              </th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => {
              const style = STATUS_STYLES[provider.status] || STATUS_STYLES.unknown;
              return (
                <tr key={provider.providerId} className="border-b border-stone-50 last:border-0">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-stone-700" style={{ fontSize: 18 }}>smart_toy</span>
                      <span className="text-[15px] font-medium text-black">{provider.displayName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[13px] font-medium ${style.bg} ${style.text}`}>
                      {style.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-[15px] text-stone-900">
                    {provider.taskCount ?? 0}
                  </td>
                  <td className="px-5 py-3.5 text-right text-[15px] text-stone-700">
                    {provider.lastHealthCheck
                      ? new Date(provider.lastHealthCheck).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <p className="mt-3 text-[14px] text-stone-700">
        {providers.length} providers configured &middot; {healthy} healthy
        {degraded > 0 && ` \u00b7 ${degraded} degraded`}
        {needsReauth > 0 && ` \u00b7 ${needsReauth} needs re-auth`}
        {unavailable > 0 && ` \u00b7 ${unavailable} unavailable`}
      </p>
    </div>
  );
}
