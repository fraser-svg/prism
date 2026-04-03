import { createPrismStore, FetchTransport } from "@prism/ui";

export const useStore = createPrismStore(new FetchTransport());
