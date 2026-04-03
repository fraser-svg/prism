import { createPrismStore, IpcTransport } from "@prism/ui";

export const useStore = createPrismStore(new IpcTransport());
