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
    <div style={{ display: "flex", height: "100vh", flexDirection: "column" }}>
      {header}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <Outlet />
        {drawerOpen && <SessionDrawer />}
      </div>
    </div>
  );
}
