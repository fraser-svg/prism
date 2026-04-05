import { useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrismStore } from "../context";
import { ContextTab } from "./ContextTab";

export function ClientContextPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const {
    clients,
    contextItems,
    contextKnowledge,
    contextSummary,
    contextHealth,
    extractionQueue,
    contextSearchResults,
    loadContext,
    addContextFiles,
    addContextNote,
    deleteContextItem,
    reExtractItem,
    flagKnowledge,
    searchKnowledge,
    applyToBrief,
  } = usePrismStore();

  const client = clients.find((c) => c.id === clientId);

  const handlePoll = useCallback(() => {
    if (clientId) loadContext("client", clientId);
  }, [clientId, loadContext]);

  useEffect(() => {
    if (clientId) {
      loadContext("client", clientId);
    }
  }, [clientId, loadContext]);

  if (!client) {
    return (
      <div style={{ padding: 32, color: "var(--text-secondary)", fontSize: 14 }}>
        Client not found.
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-tertiary)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            padding: 0,
          }}
        >
          &larr; Portfolio
        </button>
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>/</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
          {client.name} — Knowledge
        </span>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ContextTab
          contextItems={contextItems}
          knowledge={contextKnowledge}
          summary={contextSummary}
          contextHealth={contextHealth}
          extractionQueue={extractionQueue}
          searchResults={contextSearchResults}
          onDrop={(files) => clientId && addContextFiles("client", clientId, files)}
          onAddNote={(text) => clientId && addContextNote("client", clientId, text)}
          onDeleteItem={(id) => clientId && deleteContextItem(id, "client", clientId)}
          onReExtract={(id) => clientId && reExtractItem(id, "client", clientId)}
          onCopyKnowledge={(text) => void navigator.clipboard.writeText(text).catch(() => {})}
          onCopyAllKnowledge={() => contextSummary && void navigator.clipboard.writeText(contextSummary.content).catch(() => {})}
          onApplyToBrief={() => {}}
          onFlagWrong={(knowledgeId) => clientId && flagKnowledge(knowledgeId, "client", clientId)}
          onSearch={(query) => clientId && searchKnowledge("client", clientId, query)}
          onLinkPreviousAttempt={() => {}}
          onPoll={handlePoll}
        />
      </div>
    </div>
  );
}
