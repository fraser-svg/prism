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
  TextArea,
  Button,
} from "@heroui/react";
import { usePrismStore } from "../context";

interface CreateClientModalProps {
  onClose: () => void;
}

export function CreateClientModal({ onClose }: CreateClientModalProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { createClient } = usePrismStore();

  const state = useOverlayState({
    isOpen: true,
    onOpenChange: (open) => {
      if (!open) onClose();
    },
  });

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await createClient(name.trim(), notes.trim() || undefined);
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
              <ModalHeading>New Client</ModalHeading>
            </ModalHeader>
            <ModalBody className="flex flex-col gap-4">
              <TextField autoFocus>
                <Label>Client name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </TextField>
              <TextField>
                <Label>Notes (optional)</Label>
                <TextArea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </TextField>
              {error && <p className="text-sm text-danger">{error}</p>}
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button variant="outline" onPress={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={!name.trim() || saving}
                onPress={handleSubmit}
              >
                {saving ? "Creating..." : "Create"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
