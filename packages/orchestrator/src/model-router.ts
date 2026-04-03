import type { TaskNode, ProviderCapability, ProviderId, RouteHint } from "@prism/core";
import type {
  ProviderAdapter,
  TaskResult,
  ExecutionContext,
} from "@prism/execution";
import type { IntegrationCabinet, HealthResult } from "@prism/workspace";
import { RuntimeMode, detectRuntimeMode } from "@prism/execution";

// ---------------------------------------------------------------------------
// Routing table — static config, capability → primary + fallback
// ---------------------------------------------------------------------------

interface RouteEntry {
  primary: ProviderId;
  fallback: ProviderId | null;
}

const ROUTING_TABLE: Record<ProviderCapability, RouteEntry> = {
  reasoning: { primary: "anthropic", fallback: "google" },
  code_generation: { primary: "anthropic", fallback: "google" },
  visual_design: { primary: "stitch", fallback: "google" },
  verification: { primary: "anthropic", fallback: "google" },
  tool_use: { primary: "anthropic", fallback: null },
};

// ---------------------------------------------------------------------------
// routeHint → capabilities mapping (eng review correction #3)
// ---------------------------------------------------------------------------

const ROUTE_HINT_MAP: Record<RouteHint, ProviderCapability[]> = {
  visual: ["visual_design"],
  screen: ["visual_design"],
  backend: ["code_generation"],
  any: ["code_generation"],
};

function resolveCapabilities(task: TaskNode): ProviderCapability[] {
  if (task.capabilities && task.capabilities.length > 0) {
    return task.capabilities;
  }
  if (task.routeHint) {
    return ROUTE_HINT_MAP[task.routeHint] || ["code_generation"];
  }
  return ["code_generation"];
}

// ---------------------------------------------------------------------------
// Health cache — 30s TTL (eng review correction #9)
// ---------------------------------------------------------------------------

const HEALTH_CACHE_TTL_MS = 30_000;
const HEALTH_CHECK_TIMEOUT_MS = 2_000;

interface CachedHealth {
  result: HealthResult;
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

export interface RouteResult extends TaskResult {
  /** Which provider actually executed (null if skipped/failed before execution) */
  routedTo: ProviderId | null;
  /** Whether a fallback was used instead of the primary */
  usedFallback: boolean;
  /** Estimated cost in USD (null if adapter doesn't support cost estimation) */
  estimatedCostUsd: number | null;
}

export class ModelRouter {
  private adapters = new Map<ProviderId, ProviderAdapter>();
  private healthCache = new Map<ProviderId, CachedHealth>();

  constructor(
    private cabinet: IntegrationCabinet,
    private runtimeMode?: RuntimeMode,
  ) {}

  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter);

    // Lazy registration: ensure integration row exists (outside voice correction #11)
    this.cabinet.ensureRegistered(adapter.providerId, "default");
  }

  async route(task: TaskNode, context: ExecutionContext): Promise<RouteResult> {
    const mode = this.runtimeMode ?? detectRuntimeMode();
    const capabilities = resolveCapabilities(task);

    // Use first capability for routing (tasks typically have one primary capability)
    const capability = capabilities[0];
    const entry = ROUTING_TABLE[capability];

    if (!entry) {
      return {
        status: "failed",
        fileManifest: [],
        output: "",
        error: `Unknown capability: ${capability}`,
        routedTo: null,
        usedFallback: false,
        estimatedCostUsd: null,
      };
    }

    // SKILL mode: anthropic tasks bypass adapter layer
    if (mode === RuntimeMode.SKILL && entry.primary === "anthropic") {
      return {
        status: "skipped",
        fileManifest: [],
        output: "",
        routedTo: null,
        usedFallback: false,
        estimatedCostUsd: null,
      };
    }

    // Try primary
    const primaryAdapter = this.adapters.get(entry.primary);
    if (primaryAdapter) {
      const healthy = await this.isHealthy(entry.primary);
      if (healthy) {
        try {
          const result = await primaryAdapter.execute(task, context);
          if (result.status !== "failed") {
            const cost = primaryAdapter.estimateCost?.(task) ?? null;
            return {
              ...result,
              routedTo: entry.primary,
              usedFallback: false,
              estimatedCostUsd: cost ? cost.estimatedCostUsd : null,
            };
          }
          // Primary returned failed, fall through to fallback
        } catch {
          // Primary threw, fall through to fallback
        }
      }
    }

    // Try fallback
    if (entry.fallback) {
      const fallbackAdapter = this.adapters.get(entry.fallback);
      if (fallbackAdapter) {
        const healthy = await this.isHealthy(entry.fallback);
        if (healthy) {
          try {
            const result = await fallbackAdapter.execute(task, context);
            const cost = fallbackAdapter.estimateCost?.(task) ?? null;
            return {
              ...result,
              routedTo: entry.fallback,
              usedFallback: true,
              estimatedCostUsd: cost ? cost.estimatedCostUsd : null,
            };
          } catch {
            // Fallback also failed, fall through to "no provider" error
          }
        }
      }
    }

    return {
      status: "failed",
      fileManifest: [],
      output: "",
      error: `No healthy provider available for capability: ${capability}`,
      routedTo: null,
      usedFallback: false,
      estimatedCostUsd: null,
    };
  }

  private async isHealthy(providerId: ProviderId): Promise<boolean> {
    const cached = this.healthCache.get(providerId);
    if (cached && Date.now() - cached.checkedAt < HEALTH_CACHE_TTL_MS) {
      return cached.result.status === "connected" || cached.result.status === "degraded";
    }

    try {
      const result = await Promise.race([
        this.cabinet.checkHealth(providerId, "default"),
        new Promise<HealthResult>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), HEALTH_CHECK_TIMEOUT_MS),
        ),
      ]);

      this.healthCache.set(providerId, { result, checkedAt: Date.now() });
      return result.status === "connected" || result.status === "degraded";
    } catch {
      const unavailable: HealthResult = { status: "unavailable", message: "Health check timeout" };
      this.healthCache.set(providerId, { result: unavailable, checkedAt: Date.now() });
      return false;
    }
  }

  clearHealthCache(): void {
    this.healthCache.clear();
  }
}

export { resolveCapabilities, ROUTING_TABLE, ROUTE_HINT_MAP };
