import { useNavigate, useLocation } from "react-router-dom";
import { Button, TextField, Input } from "@heroui/react";
import { usePrismStore } from "@prism/ui";

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
        className="titlebar-no-drag cursor-pointer border-none bg-transparent text-[13px] font-semibold tracking-wide text-[var(--accent)]"
        onClick={() => navigate("/")}
      >
        PRISM
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
    </div>
  );
}
