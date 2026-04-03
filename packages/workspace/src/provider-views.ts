import type { IntegrationCabinet } from "./integration-cabinet";

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  google: "Google (Gemini)",
  stitch: "Google Stitch",
  openai: "OpenAI",
};

export interface ProviderViewData {
  providerId: string;
  displayName: string;
  status: string;
  taskCount: number;
  lastHealthCheck: string;
}

export async function buildProviderViews(
  cabinet: IntegrationCabinet,
): Promise<ProviderViewData[]> {
  const integrations = cabinet.list();
  const healthResults = await cabinet.checkAllHealth();

  return integrations.map((integration) => {
    const health = healthResults.find(
      (h) =>
        h.provider === integration.provider &&
        h.instanceLabel === integration.instanceLabel,
    );
    return {
      providerId: integration.provider,
      displayName:
        PROVIDER_DISPLAY_NAMES[integration.provider] || integration.provider,
      status: health?.result.status || integration.status,
      taskCount: 0, // TODO: read from telemetry
      lastHealthCheck: new Date().toISOString(),
    };
  });
}
