import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom, ClientContextPage, ClientsPage, Providers, Vault } from "@prism/ui";
import { useStore, transport } from "./store";
import { WebHeader } from "./WebHeader";
import { LoginPage } from "./LoginPage";
import { authClient } from "./auth-client";
import { useState, useEffect } from "react";

export function App() {
  const { data: session, isPending } = authClient.useSession();
  const [hasGitHub, setHasGitHub] = useState(false);

  useEffect(() => {
    if (session) {
      transport.getGitHubStatus().then((r) => {
        if (r.data && typeof r.data === "object" && "connected" in r.data) {
          setHasGitHub((r.data as { connected: boolean }).connected);
        }
      });
    }
  }, [session]);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f4edd9]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <PrismStoreContext.Provider value={useStore}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell header={<WebHeader user={session.user} />} />}>
            <Route path="/" element={<Portfolio hasGitHub={hasGitHub} />} />
            <Route path="/project/:id" element={<ControlRoom />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:clientId/context" element={<ClientContextPage />} />
            <Route path="/providers" element={<Providers />} />
            <Route path="/vault" element={<Vault transport={transport} />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PrismStoreContext.Provider>
  );
}
