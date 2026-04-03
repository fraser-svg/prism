import { useState } from "react";
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
  useOverlayState,
  TextField,
  Label,
  Input,
  Button,
  Tabs,
  TabList,
  Tab,
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopover,
  ListBox,
  ListBoxItem,
} from "@heroui/react";
import { usePrismStore } from "../context";

interface CreateProjectModalProps {
  onClose: () => void;
  defaultClientId?: string;
  onBrowse?: () => Promise<string | null>;
  initialRootPath?: string;
}

export function CreateProjectModal({
  onClose,
  defaultClientId,
  onBrowse,
  initialRootPath = "",
}: CreateProjectModalProps) {
  const initialName = initialRootPath.split(/[/\\]/).filter(Boolean).pop() || "";
  const [name, setName] = useState(initialName);
  const [clientId, setClientId] = useState(defaultClientId || "");
  const [mode, setMode] = useState<"link" | "create">("link");
  const [rootPath, setRootPath] = useState(initialRootPath);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { clients, createProject, linkProject } = usePrismStore();

  const state = useOverlayState({
    isOpen: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const handleBrowse = async () => {
    if (!onBrowse) return;
    const selected = await onBrowse();
    if (selected) {
      setRootPath(selected);
      if (!name) {
        const parts = selected.split("/");
        setName(parts[parts.length - 1] || "");
      }
    }
  };

  const handleSubmit = async () => {
    if (!rootPath) return;

    setSaving(true);
    setError(null);
    try {
      if (mode === "link") {
        await linkProject(rootPath, clientId || undefined);
      } else {
        await createProject(
          name.trim() || rootPath.split("/").pop() || "project",
          rootPath,
          clientId || undefined,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal state={state}>
      <ModalBackdrop>
        <ModalContainer>
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>Add Project</ModalHeading>
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <Tabs
                selectedKey={mode}
                onSelectionChange={(key) => setMode(key as "link" | "create")}
              >
                <TabList>
                  <Tab id="link">Link Existing</Tab>
                  <Tab id="create">Create New</Tab>
                </TabList>
              </Tabs>

              <div className="flex gap-2">
                <TextField className="flex-1">
                  <Label>Project path</Label>
                  <Input
                    value={rootPath}
                    readOnly={!!onBrowse}
                    onChange={onBrowse ? undefined : (e) => setRootPath(e.target.value)}
                    className="font-mono text-sm"
                  />
                </TextField>
                {onBrowse && (
                  <Button
                    variant="outline"
                    onPress={handleBrowse}
                    className="mt-auto"
                  >
                    Browse
                  </Button>
                )}
              </div>

              {mode === "create" && (
                <TextField>
                  <Label>Project name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </TextField>
              )}

              {clients.length > 0 && (
                <Select
                  selectedKey={clientId || null}
                  onSelectionChange={(key) => setClientId(key ? String(key) : "")}
                >
                  <Label>Client</Label>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopover>
                    <ListBox>
                      {clients.map((c) => (
                        <ListBoxItem key={c.id} id={c.id}>
                          {c.name}
                        </ListBoxItem>
                      ))}
                    </ListBox>
                  </SelectPopover>
                </Select>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button variant="outline" onPress={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={!rootPath || saving}
                onPress={handleSubmit}
              >
                {saving
                  ? "Adding..."
                  : mode === "link"
                    ? "Link Project"
                    : "Create Project"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
