import { useNavigate, useLocation } from "react-router-dom";
import { Button, TextField, Input } from "@heroui/react";
import { usePrismStore } from "@prism/ui";

export function WebHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePrismStore();

  const isPortfolio = location.pathname === "/";

  return (
    <div
      className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--separator)] bg-[var(--surface)] px-6"
    >
      <button
        className="cursor-pointer border-none bg-transparent text-[13px] font-semibold tracking-wide text-[var(--accent)]"
        onClick={() => navigate("/")}
      >
        PRISM
      </button>

      {isPortfolio ? (
        <TextField className="max-w-[360px] flex-1">
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
        >
          Portfolio
        </Button>
      )}
    </div>
  );
}
