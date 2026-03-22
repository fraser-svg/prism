"use client";

import { useState } from "react";
import { useForgeStore } from "@/lib/store";

export function Settings() {
  const showSettings = useForgeStore((s) => s.showSettings);
  const setShowSettings = useForgeStore((s) => s.setShowSettings);
  const apiKey = useForgeStore((s) => s.apiKey);
  const setApiKey = useForgeStore((s) => s.setApiKey);
  const [draft, setDraft] = useState(apiKey);

  if (!showSettings) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.1)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowSettings(false);
      }}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-2xl p-7"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.08)",
        }}
      >
        <h2 className="text-[16px] font-semibold mb-5">Connect to Anthropic</h2>

        <p
          className="text-[13px] leading-[1.6] mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Prism uses your own Anthropic API key. Your key stays in your browser
          and is sent directly to Anthropic — we never store or see it.
        </p>

        <label
          className="block text-[12px] mb-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          API Key
        </label>
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-ant-..."
          className="w-full h-10 rounded-lg px-3 text-[13px] font-mono outline-none mb-5"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent-soft)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 rounded-lg text-[13px] transition-colors"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => setApiKey(draft)}
            className="px-4 py-2 rounded-lg text-[13px] transition-opacity hover:opacity-90"
            style={{
              background: "var(--text)",
              border: "1px solid var(--text)",
              color: "var(--bg)",
            }}
          >
            Save
          </button>
        </div>

        <p
          className="text-[11px] mt-4 leading-[1.5]"
          style={{ color: "var(--text-muted)", opacity: 0.6 }}
        >
          Get your API key at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
          >
            console.anthropic.com
          </a>
        </p>
      </div>
    </div>
  );
}
