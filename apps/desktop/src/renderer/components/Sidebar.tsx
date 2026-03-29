import { HealthBadge } from "./HealthBadge";
import { usePrismQuery } from "../hooks/usePrism";
import type { WorkspaceStatus } from "../types";
import type { Result } from "../../shared/result";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  onSelectProject: (id: string) => void;
  onGoHome: () => void;
  activeProjectId: string | null;
}

export function Sidebar({
  open,
  onToggle,
  onSelectProject,
  onGoHome,
  activeProjectId,
}: SidebarProps) {
  const { data: status } = usePrismQuery<WorkspaceStatus>(
    () => window.prism.workspace.status() as Promise<Result<WorkspaceStatus>>,
    [],
  );

  return (
    <>
      {/* Persistent back/home icon — always visible (44px touch target) */}
      {!open && (
        <button
          onClick={onGoHome}
          aria-label="Home"
          className="titlebar-no-drag"
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 100,
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            borderRadius: "var(--radius-md)",
            color: "var(--neutral-400)",
            cursor: "pointer",
            fontSize: "var(--text-lg)",
          }}
        >
          ◁
        </button>
      )}

      {/* Sidebar panel */}
      <nav
        role="navigation"
        aria-label="Project navigation"
        style={{
          width: open ? 280 : 0,
          minWidth: open ? 280 : 0,
          height: "100%",
          backgroundColor: "var(--bg-deep)",
          borderRight: open ? "1px solid var(--border-default)" : "none",
          overflow: "hidden",
          transition: `width var(--duration-medium) var(--ease-enter), min-width var(--duration-medium) var(--ease-enter)`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Titlebar drag region */}
        <div
          className="titlebar-drag"
          style={{
            height: 52,
            paddingLeft: 78,
            paddingRight: "var(--space-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-lg)",
              fontWeight: 300,
              color: "var(--text-primary)",
            }}
          >
            Prism
          </span>
          <button
            onClick={onToggle}
            className="titlebar-no-drag"
            aria-label="Close sidebar"
            style={{
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: "var(--text-sm)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Project list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "var(--space-sm)",
          }}
        >
          {status?.projects.map((project) => (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "var(--space-sm)",
                padding: "var(--space-sm) var(--space-md)",
                background:
                  project.id === activeProjectId
                    ? "var(--accent-subtle-bg)"
                    : "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: "var(--text-primary)",
                cursor: "pointer",
                textAlign: "left" as const,
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-md)",
              }}
            >
              <HealthBadge badge={project.badge} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {project.name}
              </span>
            </button>
          ))}
        </div>

        {/* Sidebar footer — theme toggle */}
        <div
          style={{
            padding: "var(--space-md)",
            borderTop: "1px solid var(--border-default)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              const html = document.documentElement;
              const current = html.getAttribute("data-theme");
              html.setAttribute("data-theme", current === "light" ? "dark" : "light");
            }}
            style={{
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-tertiary)",
              cursor: "pointer",
              fontSize: "var(--text-sm)",
            }}
            aria-label="Toggle light/dark mode"
          >
            ◐
          </button>
        </div>
      </nav>
    </>
  );
}
