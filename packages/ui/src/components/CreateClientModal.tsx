import { useState } from "react";
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          width: 400,
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
          New Client
        </h2>

        <input
          autoFocus
          type="text"
          placeholder="Client name"
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

        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{
            padding: "8px 12px",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            outline: "none",
            resize: "vertical",
          }}
        />

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
            disabled={!name.trim() || saving}
            style={{
              padding: "6px 16px",
              background: "var(--accent-blue)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              color: "#fff",
              fontSize: 13,
              cursor: name.trim() && !saving ? "pointer" : "not-allowed",
              fontFamily: "var(--font-sans)",
              opacity: name.trim() && !saving ? 1 : 0.5,
            }}
          >
            {saving ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
