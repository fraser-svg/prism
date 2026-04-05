import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePrismStore } from "../context";
import type { ClientView } from "../types";
import {
  ContextDropZone,
  ContextNoteInput,
  ContextItemList,
  KnowledgePanel,
} from "./ContextShared";

interface CreateClientModalProps {
  onClose: () => void;
}

export function CreateClientModal({ onClose }: CreateClientModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState<ClientView | null>(null);

  const {
    createClient,
    addContextFiles,
    addContextNote,
    loadContext,
    contextItems,
    contextKnowledge,
    extractionQueue,
  } = usePrismStore();

  const navigate = useNavigate();
  const backdropRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus management
  useEffect(() => {
    if (step === 1) nameInputRef.current?.focus();
  }, [step]);

  // Escape key closes modal in both steps
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Backdrop click: close in Step 1, ignore in Step 2 (prevent accidental dismissal)
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current && step === 1) onClose();
  };

  // Step 1: Create client and advance
  const handleCreateAndAdvance = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const newClient = await createClient(name.trim());
      setClient(newClient);
      await loadContext("client", newClient.id);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Step 1: Create client and close (skip context)
  const handleCreateWithoutContext = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createClient(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Step 2: File drop
  const handleDrop = async (files: File[]) => {
    if (!client) return;
    setUploadError(null);
    try {
      await addContextFiles("client", client.id, files);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
  };

  // Step 2: Note add
  const handleAddNote = async (text: string) => {
    if (!client) return;
    await addContextNote("client", client.id, text);
  };

  // Step 2: Done — navigate to context page
  const handleDone = () => {
    if (client) navigate(`/clients/${client.id}/context`);
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "var(--backdrop)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-client-title"
    >
      <div
        className="flex w-full flex-col rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg transition-[max-width] duration-200 ease-out"
        style={{ maxWidth: step === 1 ? "28rem" : "42rem", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-default)] px-6 py-4">
          <h2 id="create-client-title" className="text-[17px] font-semibold text-black">
            {step === 1 ? "New Client" : `Teach Prism about ${client?.name || ""}`}
          </h2>
          <span className="text-[13px] text-[var(--muted)]">Step {step}/2</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {step === 1 ? (
            <div className="fade-in space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-widest text-[var(--muted)]">
                  Client name
                </label>
                <input
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndAdvance(); }}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-[15px] text-black placeholder:text-[var(--muted)] focus:border-stone-800 focus:outline-none"
                  placeholder="e.g. Acme Corp"
                />
              </div>
              {error && <p className="text-[15px]" style={{ color: "var(--danger)" }}>{error}</p>}
            </div>
          ) : (
            <div className="fade-in">
              <p className="mb-5 text-[15px] leading-relaxed text-stone-900">
                The more Prism knows -- brand guides, pitch decks, meeting notes -- the better every build will be. You can always add more later.
              </p>

              <div className="flex flex-col gap-5 md:flex-row">
                {/* Left: Upload + items */}
                <div className="flex-1 space-y-4">
                  <ContextDropZone onDrop={handleDrop} compact={contextItems.length > 0} />

                  <ContextNoteInput onAddNote={handleAddNote} />

                  {uploadError && (
                    <p className="text-[14px]" style={{ color: "var(--danger)" }}>{uploadError}</p>
                  )}

                  <ContextItemList
                    items={contextItems}
                    extractionQueue={extractionQueue}
                  />
                </div>

                {/* Right: Knowledge panel */}
                <div className="w-full shrink-0 md:w-[220px]">
                  <KnowledgePanel
                    knowledge={contextKnowledge}
                    hasItems={contextItems.length > 0}
                    hideActions
                    onCopyKnowledge={() => {}}
                    onApplyToBrief={() => {}}
                    onFlagWrong={() => {}}
                  />
                </div>
              </div>

              <p className="mt-4 text-[13px] text-[var(--muted)]">
                Extraction runs in the background -- you'll see results on the next page.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-default)] px-6 py-4">
          {step === 1 ? (
            <>
              <button
                className="text-[15px] text-[var(--muted)] transition-colors hover:text-black"
                onClick={handleCreateWithoutContext}
                disabled={!name.trim() || saving}
              >
                Create without context
              </button>
              <div className="flex gap-2">
                <button
                  className="min-h-[44px] rounded-lg border border-[var(--border-default)] px-4 py-2 text-[15px] text-stone-800 transition-colors hover:bg-stone-50"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  className="min-h-[44px] rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] font-medium text-[var(--accent-foreground)] transition-colors hover:opacity-90 disabled:opacity-40"
                  disabled={!name.trim() || saving}
                  onClick={handleCreateAndAdvance}
                >
                  {saving ? "Creating..." : "Create & Add Context \u2192"}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="text-[15px] text-[var(--muted)] transition-colors hover:text-black"
                onClick={onClose}
              >
                Skip for now
              </button>
              <button
                className="min-h-[44px] rounded-lg bg-[var(--accent)] px-4 py-2 text-[15px] font-medium text-[var(--accent-foreground)] transition-colors hover:opacity-90"
                onClick={handleDone}
              >
                Done \u2192
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
