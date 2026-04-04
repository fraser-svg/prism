import { useState, useEffect, useRef } from "react";
import { usePrismStore } from "../context";

interface CreateClientModalProps {
  onClose: () => void;
}

export function CreateClientModal({ onClose }: CreateClientModalProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { createClient } = usePrismStore();
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createClient(name.trim(), notes.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={handleBackdropClick}>
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-[var(--bg-surface)] p-6 shadow-lg">
        <h2 className="mb-5 text-[17px] font-semibold text-black">New Client</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-widest text-stone-700">Client name</label>
            <input
              ref={nameInputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              className="w-full rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 py-2 text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-widest text-stone-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-stone-200 bg-[var(--bg-surface)] px-3 py-2 text-[15px] text-black placeholder:text-stone-700 focus:border-stone-800 focus:outline-none"
              placeholder="Any context about this client..."
            />
          </div>
          {error && <p className="text-[15px] text-red-500">{error}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-stone-200 px-4 py-2 text-[15px] text-stone-800 transition-colors hover:bg-stone-50" onClick={onClose}>Cancel</button>
          <button className="rounded-lg bg-stone-800 px-4 py-2 text-[15px] font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-40" disabled={!name.trim() || saving} onClick={handleSubmit}>
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
