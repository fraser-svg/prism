import { useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { HomeView } from "./components/HomeView";
import { ProjectView } from "./components/ProjectView";

export function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true); // First-run: expanded

  const handleSelectProject = useCallback((id: string) => {
    setActiveProjectId(id);
    setSidebarOpen(false);
    window.prism.project.setActive(id);
  }, []);

  const handleGoHome = useCallback(() => {
    setActiveProjectId(null);
    setSidebarOpen(true);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  // Keyboard shortcut: Cmd+\ to toggle sidebar
  // Cmd+1 focus chat, Cmd+2 focus workspace
  return (
    <div
      style={{
        display: "flex",
        height: "100%",
        position: "relative",
      }}
      onKeyDown={(e) => {
        if (e.metaKey && e.key === "\\") {
          e.preventDefault();
          toggleSidebar();
        }
      }}
      tabIndex={-1}
    >
      <Sidebar
        open={sidebarOpen}
        onToggle={toggleSidebar}
        onSelectProject={handleSelectProject}
        onGoHome={handleGoHome}
        activeProjectId={activeProjectId}
      />

      <main
        style={{
          flex: 1,
          minWidth: 0,
          height: "100%",
          overflow: "hidden",
        }}
        role="main"
      >
        {activeProjectId ? (
          <ProjectView
            projectId={activeProjectId}
            onGoHome={handleGoHome}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
          />
        ) : (
          <HomeView
            onSelectProject={handleSelectProject}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
          />
        )}
      </main>
    </div>
  );
}
