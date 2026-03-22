"use client";

import { useState, useRef, useEffect } from "react";
import { useForgeStore } from "@/lib/store";

export function Chat() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messages = useForgeStore((s) => s.messages);
  const addMessage = useForgeStore((s) => s.addMessage);
  const processResponse = useForgeStore((s) => s.processResponse);
  const setShowSettings = useForgeStore((s) => s.setShowSettings);
  const isReady = true; // CLI-based — always ready when running locally

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    if (!isReady) {
      setShowSettings(true);
      return;
    }

    setInput("");
    addMessage({ role: "user", content: text });
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: text }],
        }),
      });

      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      addMessage({ role: "assistant", content: data.reply });

      if (data.vessels) {
        processResponse(data.vessels);
      }
    } catch {
      addMessage({
        role: "assistant",
        content: "Something went wrong. Let me try again.",
      });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="absolute left-6 top-16 bottom-6 w-[340px] z-10 flex flex-col overflow-hidden"
      style={{
        background: "rgba(180, 156, 132, 0.35)",
        backdropFilter: "blur(28px)",
        WebkitBackdropFilter: "blur(28px)",
        borderRadius: "28px",
        border: "1px solid rgba(160, 140, 115, 0.12)",
        boxShadow:
          "0 16px 56px rgba(100, 80, 55, 0.14), 0 6px 20px rgba(100, 80, 55, 0.08), 0 2px 6px rgba(100, 80, 55, 0.04)",
      }}
      data-no-pan
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-2.5">
        <span
          className="text-[10px] font-medium uppercase tracking-[0.8px]"
          style={{ color: "rgba(80, 65, 50, 0.35)" }}
        >
          {isLoading ? "thinking..." : "forge"}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-1.5"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(80,65,50,0.15) transparent" }}
      >
        {messages.length === 0 && (
          <div
            className="text-center text-[13px] leading-[1.7] px-6 pt-10"
            style={{ color: "rgba(80, 65, 50, 0.4)" }}
          >
            {isReady ? (
              <>
                Tell Prism what you want to build.
                <br />
                Start with the feeling, not the feature.
              </>
            ) : (
              <>
                Connect your Anthropic account to start.
                <br />
                <button
                  onClick={() => setShowSettings(true)}
                  className="mt-3 px-4 py-2 rounded-lg text-[12px] transition-opacity hover:opacity-80"
                  style={{
                    background: "rgba(60, 48, 36, 0.4)",
                    color: "rgba(255, 252, 248, 0.8)",
                  }}
                >
                  Connect API Key
                </button>
              </>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[88%] px-3.5 py-2.5 rounded-[14px] text-[13.5px] leading-[1.55] break-words ${
              msg.role === "user"
                ? "self-end rounded-br-[4px]"
                : "self-start rounded-bl-[4px]"
            }`}
            style={
              msg.role === "user"
                ? {
                    background: "rgba(60, 48, 36, 0.5)",
                    color: "rgba(255, 252, 248, 0.9)",
                  }
                : {
                    background: "rgba(255, 255, 255, 0.3)",
                    color: "rgba(60, 48, 36, 0.75)",
                  }
            }
          >
            {msg.content}
          </div>
        ))}

        {isLoading && (
          <div
            className="self-start px-3.5 py-2.5 rounded-[14px] rounded-bl-[4px] text-[13.5px]"
            style={{
              background: "rgba(255, 255, 255, 0.3)",
              color: "rgba(60, 48, 36, 0.4)",
            }}
          >
            <span className="animate-pulse">...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-5 pt-1 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="What are you imagining?"
          className="flex-1 h-12 rounded-xl px-[18px] text-[14px] outline-none transition-colors"
          style={{
            background: "rgba(255, 255, 255, 0.35)",
            border: "1px solid rgba(160, 140, 115, 0.12)",
            color: "rgba(60, 48, 36, 0.8)",
          }}
          disabled={isLoading}
        />
        <button
          onClick={send}
          disabled={isLoading || !input.trim()}
          className="w-12 h-12 rounded-xl flex items-center justify-center transition-opacity"
          style={{
            background: "rgba(60, 48, 36, 0.45)",
            color: "rgba(255, 252, 248, 0.7)",
            opacity: isLoading || !input.trim() ? 0.3 : 1,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {/* Footer */}
      <div
        className="px-5 pb-4 flex items-center gap-2 text-[11px]"
        style={{ color: "rgba(80, 65, 50, 0.3)" }}
      >
        <div
          className="w-[5px] h-[5px] rounded-full"
          style={{ background: "var(--green)" }}
        />
        Prism is ready
      </div>
    </div>
  );
}
