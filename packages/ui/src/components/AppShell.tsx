import { type ReactNode, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { usePrismStore } from "../context";
import { SessionDrawer } from "./SessionDrawer";

interface AppShellProps {
  header?: ReactNode;
  hideSidebar?: boolean;
}

const NAV_ITEMS = [
  { icon: "dashboard", label: "Dashboard", path: "/" },
  { icon: "group", label: "Clients", path: "/clients" },
] as const;

const BOTTOM_NAV = [
  { icon: "tune", label: "Providers", path: "/providers" },
  { icon: "lock", label: "Vault", path: "/vault" },
] as const;

export function AppShell({ header, hideSidebar }: AppShellProps) {
  const { drawerOpen, usage, loadUsage } = usePrismStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  if (hideSidebar) {
    return (
      <div className="flex h-screen flex-col">
        {header}
        <div className="relative flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    );
  }

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-stone-200 bg-[var(--bg-surface)] py-6">
        {/* Brand */}
        <div className="mb-8 px-5">
          <h1
            className="cursor-pointer text-[17px] font-semibold text-black"
            onClick={() => navigate("/")}
          >
            Prismatic
          </h1>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] transition-colors ${
                  active
                    ? "bg-[#ece5d1] font-medium text-black"
                    : "text-stone-900 hover:bg-[#91A6FF] hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Usage bar (free users only) */}
        {usage && !usage.isPaid && (
          <div className="mx-4 mb-3 mt-auto">
            <div className="flex items-center justify-between text-[12px] text-stone-500">
              <span>{usage.remaining} actions left</span>
              <span>{usage.used}/{usage.limit}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-[#91A6FF] transition-all"
                style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Bottom nav */}
        <div className={`${usage?.isPaid !== false ? "mt-auto" : ""} space-y-0.5 border-t border-stone-100 px-3 pt-4`}>
          {BOTTOM_NAV.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[15px] transition-colors ${
                  active
                    ? "bg-[#ece5d1] font-medium text-black"
                    : "text-stone-900 hover:bg-[#91A6FF] hover:text-white"
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main content area */}
      <main className="ml-60 flex flex-1 flex-col overflow-hidden">
        {header}
        <div className="relative flex-1 overflow-hidden">
          <Outlet />
          {drawerOpen && <SessionDrawer />}
        </div>
      </main>
    </div>
  );
}
