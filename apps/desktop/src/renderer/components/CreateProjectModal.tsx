import { useState } from "react";
import { useStore } from "../store";

interface CreateProjectModalProps {
  onClose: () => void;
  defaultClientId?: string;
}

export function CreateProjectModal({
  onClose,
  defaultClientId,
}: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [mode, setMode] = useState<"create" | "link">("link");
  const [rootPath, setRootPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { clients, createProject, linkProject } = useStore();

  const handleBrowse = async () => {
    const result = await window.prism.selectDirectory();
    if (result?.data) {
      setRootPath(String(result.data));
      if (!name) {
        const parts = String(result.data).split("/");
        setName(parts[parts.length - 1] || "");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootPath) return;

    setSaving(true);
    setError(null);
    try {
      if (mode === "link") {
        await linkProject(rootPath, clientId || undefined);
      } else {
        await createProject(
          name.trim() || rootPath.split("/").pop() || "project",
          rootPath,
          clientId || undefined,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="fade-in"
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-lg)",
          padding: 24,
          width: 440,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Add Project
        </h2>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8 }}>
          {(["link", "create"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                padding: "4px 12px",
                background:
                  mode === m ? "var(--bg-active)" : "var(--bg-surface)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color:
                  mode === m
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              {m === "link" ? "Link Existing" : "Create New"}
            </button>
          ))}
        </div>

        {/* Directory picker */}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Project path"
            value={rootPath}
            readOnly
            style={{
              flex: 1,
              padding: "8px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleBrowse}
            style={{
              padding: "8px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              whiteSpace: "nowrap",
            }}
          >
            Browse
          </button>
        </div>

        {/* Name (for create mode) */}
        {mode === "create" && (
          <input
            type="text"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              padding: "8px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              outline: "none",
            }}
          />
        )}

        {/* Client selector */}
        {clients.length > 0 && (
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            style={{
              padding: "8px 12px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              outline: "none",
            }}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {error && (
          <span style={{ fontSize: 12, color: "var(--accent-red)" }}>
            {error}
          </span>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "6px 16px",
              background: "none",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!rootPath || saving}
            style={{
              padding: "6px 16px",
              background: "var(--accent-blue)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: 13,
              cursor: rootPath && !saving ? "pointer" : "not-allowed",
              fontFamily: "var(--font-sans)",
              opacity: rootPath && !saving ? 1 : 0.5,
            }}
          >
            {saving
              ? "Adding..."
              : mode === "link"
                ? "Link Project"
                : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
