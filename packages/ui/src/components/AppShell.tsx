import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { usePrismStore } from "../context";
import { SessionDrawer } from "./SessionDrawer";

interface AppShellProps {
  header: ReactNode;
}

export function AppShell({ header }: AppShellProps) {
  const { drawerOpen } = usePrismStore();

  return (
    <div className="flex h-screen flex-col">
      {header}
      <div className="relative flex-1 overflow-hidden">
        <Outlet />
        {drawerOpen && <SessionDrawer />}
      </div>
    </div>
  );
}
