import { useLocation } from "react-router-dom";
import { usePrismStore } from "@prism/ui";
import { authClient } from "./auth-client";

interface WebHeaderProps {
  user: { name: string; email: string; image?: string | null };
}

export function WebHeader({ user }: WebHeaderProps) {
  const location = useLocation();
  const { searchQuery, setSearchQuery, resetStore } = usePrismStore();

  const isPortfolio = location.pathname === "/";

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-[var(--bg-surface)] px-6">
      <div className="flex items-center gap-3">
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

      <div className="flex items-center gap-3">
        <div className="group relative">
          <button className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-stone-100">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-[13px] font-medium text-stone-800">
                {initials}
              </div>
            )}
          </button>

          {/* Dropdown on hover */}
          <div className="invisible absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-stone-200 bg-[var(--bg-surface)] p-1.5 opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
            <div className="px-2.5 py-2">
              <p className="text-[15px] font-medium text-black">{user.name}</p>
              <p className="text-[13px] text-stone-700">{user.email}</p>
            </div>
            <div className="my-1 h-px bg-stone-100" />
            <button
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[15px] text-red-500 transition-colors hover:bg-red-50"
              onClick={async () => {
                try {
                  await authClient.signOut();
                } finally {
                  resetStore();
                  window.location.href = "/";
                }
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
