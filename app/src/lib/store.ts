import { create } from "zustand";

export interface VesselData {
  id: string;
  type: "seed" | "frame" | "mechanism" | "surface" | "actor" | "test";
  label: string;
  content: string;
  x: number;
  y: number;
  visible: boolean;
  active: boolean;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ForgeState {
  vessels: VesselData[];
  messages: Message[];
  stage: "visioning" | "creating" | "polishing" | "shipping" | "done";
  apiKey: string;
  hasServerKey: boolean;
  showSettings: boolean;

  addMessage: (msg: Message) => void;
  addVessel: (vessel: VesselData) => void;
  updateVessel: (id: string, updates: Partial<VesselData>) => void;
  processResponse: (vesselUpdates: VesselUpdate[]) => void;
  setApiKey: (key: string) => void;
  setShowSettings: (show: boolean) => void;
  checkServerKey: () => Promise<void>;
  isReady: () => boolean;
}

interface VesselUpdate {
  id: string;
  type: VesselData["type"];
  label: string;
  content: string;
}

// Layout: position vessels in a tree-like structure from center
function layoutPosition(index: number): { x: number; y: number } {
  const centerX = 600;
  const startY = 80;
  const gapY = 140;

  // First vessel (feeling) at top center
  if (index === 0) return { x: centerX, y: startY };
  // Second row: two vessels
  if (index === 1) return { x: centerX - 160, y: startY + gapY };
  if (index === 2) return { x: centerX + 160, y: startY + gapY };
  // Third row
  if (index === 3) return { x: centerX, y: startY + gapY * 2 };
  // Beyond: spread out
  const row = Math.floor((index - 4) / 3);
  const col = (index - 4) % 3;
  return {
    x: centerX - 200 + col * 200,
    y: startY + gapY * 3 + row * gapY,
  };
}

export const useForgeStore = create<ForgeState>((set, get) => ({
  vessels: [],
  messages: [],
  stage: "visioning",
  apiKey: typeof window !== "undefined" ? localStorage.getItem("prism-api-key") || "" : "",
  hasServerKey: false,
  showSettings: false,

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  addVessel: (vessel) =>
    set((s) => ({ vessels: [...s.vessels, vessel] })),

  updateVessel: (id, updates) =>
    set((s) => ({
      vessels: s.vessels.map((v) =>
        v.id === id ? { ...v, ...updates } : v
      ),
    })),

  setApiKey: (key) => {
    if (typeof window !== "undefined") localStorage.setItem("prism-api-key", key);
    set({ apiKey: key, showSettings: false });
  },

  setShowSettings: (show) => set({ showSettings: show }),

  checkServerKey: async () => {
    try {
      const res = await fetch("/api/auth");
      const data = await res.json();
      set({ hasServerKey: data.hasServerKey });
    } catch {
      // Ignore — no server key available
    }
  },

  isReady: () => {
    const s = get();
    return s.hasServerKey || !!s.apiKey;
  },

  processResponse: (vesselUpdates) => {
    const state = get();

    vesselUpdates.forEach((update, i) => {
      const existing = state.vessels.find((v) => v.id === update.id);

      if (existing) {
        // Update existing vessel
        set((s) => ({
          vessels: s.vessels.map((v) =>
            v.id === update.id
              ? { ...v, content: update.content, visible: true, active: true }
              : { ...v, active: false }
          ),
        }));
      } else {
        // Add new vessel with layout position
        const currentCount = get().vessels.length;
        const pos = layoutPosition(currentCount);

        // Stagger the appearance
        setTimeout(() => {
          set((s) => ({
            vessels: [
              ...s.vessels.map((v) => ({ ...v, active: false })),
              {
                id: update.id,
                type: update.type,
                label: update.label,
                content: update.content,
                x: pos.x,
                y: pos.y,
                visible: true,
                active: true,
              },
            ],
          }));
        }, i * 300);
      }
    });
  },
}));
