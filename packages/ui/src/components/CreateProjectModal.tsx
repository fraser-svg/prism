import { useState, useEffect, useRef } from "react";
import { usePrismStore } from "../context";

interface CreateProjectModalProps {
  onClose: () => void;
  defaultClientId?: string;
  onBrowse?: () => Promise<string | null>;
  initialRootPath?: string;
}

export function CreateProjectModal({
  onClose,
  defaultClientId,
  onBrowse,
  initialRootPath = "",
}: CreateProjectModalProps) {
  const initialName = initialRootPath.split(/[/\\]/).filter(Boolean).pop() || "";
  const [name, setName] = useState(initialName);
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [mode, setMode] = useState<"link" | "create">("link");
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { clients, createProject, linkProject } = usePrismStore();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleBrowse = async () => {
    if (!onBrowse) return;
    const selected = await onBrowse();
    if (selected) {
      setRootPath(selected);
      if (!name) {
        const parts = selected.split("/");
        setName(parts[parts.length - 1] || "");
      }
    }
  };

  const handleSubmit = async () => {
    if (!rootPath) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "link") {
        await linkProject(rootPath, clientId || undefined);
      } else {
        await createProject(name.trim() || rootPath.split("/").pop() || "project", rootPath, clientId || undefined);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={handleBackdropClick}>
      <div className="w-full max-w-lg rounded-xl border border-stone-200 bg-[var(--bg-surface)] p-6 shadow-lg">
        <h2 className="mb-5 text-[17px] font-semibold text-black">Add Project</h2>

        {/* Mode tabs */}
        <div className="mb-5 flex gap-0.5 rounded-lg bg-stone-100 p-0.5">
          <button
            className={`flex-1 rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors ${
              mode === "link" ? "bg-[var(--bg-surface)] text-black shadow-sm" : "text-stone-900 hover:text-black"
            }`}
            onClick={() => setMode("link")}
          >
            Link Existing
          </button>
          <button
            className={`flex-1 rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors ${
              mode === "create" ? "bg-[var(--bg-surface)] text-black shadow-sm" : "text-stone-900 hover:text-black"
            }`}
            onClick={() => setMode("create")}
          >
            Create New
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-widest text-stone-700">Project path</label>
            <div className="flex gap-2">
              <input
                value={rootPath}
                readOnly={!!onBrowse}
                onChange={onBrowse ? undefined : (e) => setRootPath(e.target.value)}
                className="flex-1 rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 py-2 font-mono text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
                placeholder="/path/to/project"
              />
              {onBrowse && (
                <button className="rounded-lg border border-stone-200 px-3 py-2 text-stone-700 transition-colors hover:bg-stone-50 hover:text-stone-800" onClick={handleBrowse}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>folder_open</span>
                </button>
              )}
            </div>
          </div>

          {mode === "create" && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-widest text-stone-700">Project name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 py-2 text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
                placeholder="My Project"
              />
            </div>
          )}

          {clients.length > 0 && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-widest text-stone-700">Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 py-2 text-[15px] text-black focus:border-stone-800 focus:outline-none"
              >
                <option value="">No client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {error && <p className="text-[15px] text-red-500">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-stone-200 px-4 py-2 text-[15px] text-stone-800 transition-colors hover:bg-stone-50" onClick={onClose}>Cancel</button>
          <button className="rounded-lg bg-stone-800 px-4 py-2 text-[15px] font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-40" disabled={!rootPath || saving} onClick={handleSubmit}>
            {saving ? "Adding..." : mode === "link" ? "Link Project" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
