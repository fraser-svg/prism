import { createContext, useContext } from "react";
import type { PrismStore } from "./store";
import type { StoreApi, UseBoundStore } from "zustand";

type UseStore = UseBoundStore<StoreApi<PrismStore>>;

export const PrismStoreContext = createContext<UseStore | null>(null);

export function usePrismStore(): PrismStore {
  const useStore = useContext(PrismStoreContext);
  if (!useStore) {
    throw new Error("usePrismStore must be used within a PrismStoreProvider");
  }
  return useStore();
}
