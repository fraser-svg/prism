import { useNavigate, useLocation } from "react-router-dom";
import { Button, TextField, Input } from "@heroui/react";
import { PrismaticLogo, usePrismStore } from "@prism/ui";

export function DesktopHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePrismStore();

  const isPortfolio = location.pathname === "/";

  return (
    <div
      className="titlebar-drag flex h-[38px] shrink-0 items-center gap-3 bg-[var(--surface)] pl-[78px] pr-4"
    >
      <button
        className="titlebar-no-drag flex cursor-pointer items-center border-none bg-transparent p-0 text-[var(--foreground)]"
        onClick={() => navigate("/")}
        aria-label="Prismatic home"
      >
        <PrismaticLogo
          className="prismatic-lockup"
          markClassName="prismatic-lockup-mark"
          textClassName="prismatic-lockup-text"
          variant="lockup"
          theme="dark"
        />
      </button>

      {isPortfolio ? (
        <TextField className="titlebar-no-drag max-w-[360px] flex-1">
          <Input
            placeholder="Search clients and projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs"
          />
        </TextField>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onPress={() => navigate("/")}
          className="titlebar-no-drag"
        >
          Portfolio
        </Button>
      )}

      <div style={{ marginLeft: "auto" }}>
        <button
          className="titlebar-no-drag"
          onClick={() => navigate("/providers")}
          style={{
            background: "none",
            border: "none",
            color: location.pathname === "/providers"
              ? "var(--accent-blue)"
              : "var(--text-secondary)",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Providers
        </button>
      </div>
    </div>
  );
}
