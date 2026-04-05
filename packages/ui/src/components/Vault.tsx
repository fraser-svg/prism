import { useEffect, useState } from "react";
import { Button, Card, CardContent, Input, Chip } from "@heroui/react";
import { usePrismStore } from "../context";
import type { PrismTransport } from "../transport";
import type { ProviderView } from "../types";

interface VaultProps {
  transport: PrismTransport;
}

const BYO_PROVIDERS = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
] as const;

export function Vault({ transport }: VaultProps) {
  const { usage, checkoutLoading, loadUsage, createCheckout, providers, loadProviders } = usePrismStore();
  const [gitHubConnected, setGitHubConnected] = useState(false);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadUsage();
    loadProviders();
    transport.getGitHubStatus().then((r) => {
      if (r.data && typeof r.data === "object" && "connected" in r.data) {
        setGitHubConnected((r.data as { connected: boolean }).connected);
      }
    });
  }, [loadUsage, loadProviders, transport]);

  const handleSaveKey = async (provider: string) => {
    const raw = keyInputs[provider];
    if (!raw?.trim()) return;
    setSaving((s) => ({ ...s, [provider]: true }));
    await transport.saveProviderKey(provider, raw);
    setKeyInputs((k) => ({ ...k, [provider]: "" }));
    setSaving((s) => ({ ...s, [provider]: false }));
    loadProviders();
  };

  const handleRemoveKey = async (provider: string) => {
    await transport.removeProviderKey(provider);
    loadProviders();
  };

  const handlePortal = async () => {
    const result = await transport.getBillingPortal();
    if (result.data && typeof result.data === "object" && "url" in result.data) {
      window.location.href = (result.data as { url: string }).url;
    }
  };

  const byoStatus = (providerId: string): ProviderView | undefined =>
    providers.find((p) => p.providerId === providerId);

  return (
    <div className="h-full overflow-auto px-8 py-10">
      <header className="mb-8">
        <h1 className="text-[17px] font-medium text-black">Vault</h1>
        <p className="text-[15px] text-stone-900">
          Subscription, connections, and API keys
        </p>
      </header>

      <div className="flex max-w-[720px] flex-col gap-6">
        {/* Section 1: Subscription & Usage */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-black">Subscription</h2>
              {usage?.isPaid && (
                <Chip color="success" size="sm" variant="flat">Pro</Chip>
              )}
              {usage && !usage.isPaid && (
                <Chip color="default" size="sm" variant="flat">Free</Chip>
              )}
            </div>
            {usage && !usage.isPaid && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">
                    {usage.used} / {usage.limit} actions used
                  </span>
                  <span className="text-stone-500">
                    {usage.remaining} remaining
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-[#91A6FF] transition-all"
                    style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                  />
                </div>
                <Button
                  color="primary"
                  size="sm"
                  onPress={createCheckout}
                  isLoading={checkoutLoading}
                  isDisabled={checkoutLoading}
                  className="mt-2"
                >
                  Upgrade to Pro &mdash; $49/mo
                </Button>
              </div>
            )}
            {usage?.isPaid && (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">
                  Unlimited AI actions. {usage.used} used today.
                </p>
                <Button size="sm" variant="flat" onPress={handlePortal}>
                  Manage Billing
                </Button>
              </div>
            )}
            {!usage && (
              <p className="text-sm text-stone-400">Loading usage...</p>
            )}
          </CardContent>
        </Card>

        {/* Section 2: GitHub Connection */}
        <Card>
          <CardContent className="space-y-3 p-6">
            <h2 className="text-[15px] font-semibold text-black">GitHub Connection</h2>
            {gitHubConnected ? (
              <div className="flex items-center gap-3">
                <Chip color="success" size="sm" variant="flat">Connected</Chip>
                <span className="text-sm text-stone-600">Your GitHub account is linked.</span>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-stone-600">
                  Connect your GitHub account to enable repository access.
                </p>
                <Button
                  size="sm"
                  color="primary"
                  variant="flat"
                  onPress={() => {
                    window.location.href = "/api/auth/sign-in/social?provider=github&callbackURL=/";
                  }}
                >
                  Connect GitHub
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: BYO API Keys */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-[15px] font-semibold text-black">API Keys (BYO)</h2>
            <p className="text-sm text-stone-600">
              Bring your own API keys for direct provider access. These override Prism's built-in keys.
            </p>
            {BYO_PROVIDERS.map(({ id, name, placeholder }) => {
              const status = byoStatus(id);
              const hasByo = status && status.taskCount > 0;
              return (
                <div key={id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-800">{name}</span>
                    {hasByo && (
                      <div className="flex items-center gap-2">
                        <Chip color="success" size="sm" variant="flat">Active</Chip>
                        <Button
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={() => handleRemoveKey(id)}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                  {!hasByo && (
                    <div className="flex gap-2">
                      <Input
                        size="sm"
                        type="password"
                        placeholder={placeholder}
                        value={keyInputs[id] || ""}
                        onValueChange={(v) => setKeyInputs((k) => ({ ...k, [id]: v }))}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        isLoading={saving[id]}
                        isDisabled={!keyInputs[id]?.trim() || saving[id]}
                        onPress={() => handleSaveKey(id)}
                      >
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
