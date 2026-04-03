import { useNavigate, useLocation } from "react-router-dom";
import {
  Button,
  TextField,
  Input,
  Dropdown,
  Avatar,
  Label,
  Separator,
} from "@heroui/react";
import { usePrismStore } from "@prism/ui";
import { authClient } from "./auth-client";

interface WebHeaderProps {
  user: { name: string; email: string; image?: string | null };
}

export function WebHeader({ user }: WebHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { searchQuery, setSearchQuery } = usePrismStore();

  const isPortfolio = location.pathname === "/";

  const initials = user.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();

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

      <div className="ml-auto">
        <Dropdown>
          <Button variant="ghost" size="sm" className="gap-2 p-1" aria-label="User menu">
            <Avatar size="sm">
              {user.image && <Avatar.Image alt={user.name} src={user.image} />}
              <Avatar.Fallback>{initials}</Avatar.Fallback>
            </Avatar>
          </Button>
          <Dropdown.Popover className="min-w-[200px]">
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "sign-out") {
                  authClient.signOut();
                }
              }}
            >
              <Dropdown.Item id="user-info" textValue={user.name || user.email}>
                <div className="flex flex-col">
                  <Label className="text-sm font-medium">{user.name}</Label>
                  <span className="text-xs text-[var(--muted)]">{user.email}</span>
                </div>
              </Dropdown.Item>
              <Dropdown.Item id="separator" textValue="separator">
                <Separator />
              </Dropdown.Item>
              <Dropdown.Item id="sign-out" textValue="Sign out" variant="danger">
                <Label>Sign out</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>
    </div>
  );
}
