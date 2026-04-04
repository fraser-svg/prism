import { useLocation } from "react-router-dom";
import { usePrismStore } from "@prism/ui";

export function DesktopHeader() {
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePrismStore();

  const isPortfolio = location.pathname === "/";

  return (
    <header className="titlebar-drag flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-[var(--bg-surface)] pl-[78px] pr-6">
      <div className="titlebar-no-drag flex items-center gap-3">
        {isPortfolio && (
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-700" style={{ fontSize: 16 }}>
              search
            </span>
            <input
              className="w-56 rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-3 text-[15px] text-black placeholder:text-stone-700 transition-colors focus:border-stone-600 focus:bg-[var(--bg-surface)] focus:outline-none"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="titlebar-no-drag flex items-center gap-2">
        <span
          className="material-symbols-outlined cursor-pointer rounded-md p-1.5 text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-800"
          title="Settings"
          style={{ fontSize: 18 }}
        >
          settings
        </span>
      </div>
    </header>
  );
}
