import { useState, useRef, useEffect, useCallback } from "react";
import type { ConversationMessage, PipelineSessionCost, ExecutionTask, ReleaseSummary } from "../types";
import { CostPill } from "./CostPill";
import { ExecutionProgress } from "./ExecutionProgress";

interface PipelineChatProps {
  projectId: string;
  phase: string;
  messages: ConversationMessage[];
  cost: PipelineSessionCost;
  autopilot: boolean;
  statusMessage: string | null;
  error: string | null;
  executionProgress?: { tasksTotal: number; tasksCompleted: number; currentTask: string | null; elapsedMs: number; tasks: ExecutionTask[] };
  releaseSummary?: ReleaseSummary | null;
  canRollback?: boolean;
  onSendMessage: (message: string) => void;
  onToggleAutopilot: (enabled: boolean) => void;
  onCompleteSession?: () => void;
  onRollback?: () => void;
}

export function PipelineChat({
  projectId: _projectId,
  phase,
  messages,
  cost,
  autopilot,
  statusMessage,
  error,
  executionProgress,
  releaseSummary,
  canRollback,
  onSendMessage,
  onToggleAutopilot,
  onCompleteSession,
  onRollback,
}: PipelineChatProps) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = statusMessage !== null;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, statusMessage]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setDraft("");
  }, [draft, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <span
          className="font-semibold uppercase tracking-widest text-stone-800"
          style={{ fontSize: 13 }}
        >
          {phase}
        </span>

        <CostPill
          inputTokens={cost.inputTokens}
          outputTokens={cost.outputTokens}
          costUsd={cost.costUsd}
        />

        {/* Autopilot toggle */}
        <div
          className="inline-flex overflow-hidden rounded-lg border border-stone-200"
          role="radiogroup"
          aria-label="Execution mode"
        >
          <button
            role="radio"
            aria-checked={!autopilot}
            className={`px-3 py-1 transition-colors ${
              !autopilot
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
            style={{ fontSize: 13 }}
            onClick={() => onToggleAutopilot(false)}
          >
            Manual
          </button>
          <button
            role="radio"
            aria-checked={autopilot}
            className={`px-3 py-1 transition-colors ${
              autopilot
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-700 hover:bg-stone-200"
            }`}
            style={{ fontSize: 13 }}
            onClick={() => onToggleAutopilot(true)}
          >
            Autopilot
          </button>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-12 text-center text-stone-500" style={{ fontSize: 15 }}>
            Start the conversation to begin this phase.
          </p>
        )}

        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={`${msg.timestamp}-${i}`}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    isUser
                      ? "bg-stone-800 text-white"
                      : "bg-stone-50 text-stone-800 border border-stone-200"
                  }`}
                  style={{ fontSize: 15 }}
                >
                  <p style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>

                  {msg.toolUse && (
                    <span
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-stone-200/60 px-2 py-0.5 text-stone-600"
                      style={{ fontSize: 12 }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 14 }}
                      >
                        build
                      </span>
                      {msg.toolUse.name}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Execution progress panel */}
      {phase === "execute" && executionProgress && executionProgress.tasksTotal > 0 && (
        <div className="border-t border-stone-200 px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <ExecutionProgress
              tasksTotal={executionProgress.tasksTotal}
              tasksCompleted={executionProgress.tasksCompleted}
              currentTask={executionProgress.currentTask}
              elapsedMs={executionProgress.elapsedMs}
              tasks={executionProgress.tasks}
            />
          </div>
        </div>
      )}

      {/* Release summary card */}
      {phase === "release" && releaseSummary && (
        <div className="border-t border-stone-200 px-4 py-4">
          <div className="mx-auto max-w-2xl rounded-lg border border-stone-200 bg-stone-50 p-4">
            <h3 className="font-semibold text-stone-800" style={{ fontSize: 15 }}>
              {releaseSummary.specTitle}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-3" style={{ fontSize: 13 }}>
              <span className="text-stone-700">
                {releaseSummary.tasksCompleted} tasks completed
              </span>
              {releaseSummary.tasksFailed > 0 && (
                <span className="text-red-600">{releaseSummary.tasksFailed} failed</span>
              )}
              {releaseSummary.reviews.map((r) => (
                <span
                  key={r.type}
                  className={`rounded-full px-2 py-0.5 ${
                    r.verdict === "pass"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {r.type}: {r.verdict}
                </span>
              ))}
              <CostPill
                inputTokens={releaseSummary.totalCost.inputTokens}
                outputTokens={releaseSummary.totalCost.outputTokens}
                costUsd={releaseSummary.totalCost.costUsd}
              />
              <span className="font-mono text-stone-500">
                {Math.floor(releaseSummary.elapsedMs / 60000)}m {Math.floor((releaseSummary.elapsedMs % 60000) / 1000)}s
              </span>
            </div>
            {onCompleteSession && (
              <button
                className="mt-4 rounded-lg bg-stone-800 px-4 py-2 text-white transition-colors hover:bg-stone-700"
                style={{ fontSize: 14 }}
                onClick={onCompleteSession}
              >
                Complete Session
              </button>
            )}
          </div>
        </div>
      )}

      {/* Verify rollback button */}
      {phase === "verify" && canRollback && onRollback && (
        <div className="border-t border-stone-200 px-4 py-3">
          <div className="mx-auto max-w-2xl">
            <button
              className="rounded-lg border border-stone-300 px-4 py-2 text-stone-700 transition-colors hover:bg-stone-100"
              style={{ fontSize: 14 }}
              onClick={onRollback}
            >
              Revise in Execute
            </button>
          </div>
        </div>
      )}

      {/* Status bar */}
      {statusMessage && (
        <div className="border-t border-stone-200 px-4 py-2">
          <p
            className="flex items-center gap-2 text-stone-600 animate-pulse"
            style={{ fontSize: 13 }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16 }}
            >
              pending
            </span>
            {statusMessage}
          </p>
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2">
          <p
            className="flex items-center gap-2 text-red-600"
            style={{ fontSize: 13 }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16 }}
            >
              error
            </span>
            {error}
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-stone-200 px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none disabled:opacity-50"
            style={{ fontSize: 15, minHeight: 42, maxHeight: 160 }}
            placeholder="Type a message... (Cmd+Enter to send)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            rows={1}
            aria-label="Message input"
          />
          <button
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-stone-800 text-white transition-colors hover:bg-stone-700 disabled:opacity-40 disabled:hover:bg-stone-800"
            onClick={handleSend}
            disabled={isStreaming || !draft.trim()}
            aria-label="Send message"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              send
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
