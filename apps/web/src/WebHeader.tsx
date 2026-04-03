import { useNavigate, useLocation } from "react-router-dom";
import { usePrismStore } from "@prism/ui";

export function WebHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePrismStore();

  const isPortfolio = location.pathname === "/";

  return (
    <div
      style={{
        height: 48,
        background: "var(--bg-surface)",
        display: "flex",
        alignItems: "center",
        paddingLeft: 24,
        paddingRight: 24,
        gap: 12,
        flexShrink: 0,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--accent-blue)",
          cursor: "pointer",
          letterSpacing: "0.02em",
        }}
        onClick={() => navigate("/")}
      >
        PRISM
      </span>

      {isPortfolio && (
        <input
          type="text"
          placeholder="Search clients and projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            maxWidth: 360,
            height: 30,
            padding: "0 10px",
            background: "var(--bg-elevated)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            outline: "none",
          }}
        />
      )}

      {!isPortfolio && (
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Portfolio
        </button>
      )}
    </div>
  );
}
