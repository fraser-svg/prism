import { createPrismStore, FetchTransport } from "@prism/ui";

export const transport = new FetchTransport();
export const useStore = createPrismStore(transport);
