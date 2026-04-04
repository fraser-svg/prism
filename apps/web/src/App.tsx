import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom, ClientContextPage, ClientsPage, Providers } from "@prism/ui";
import { useStore } from "./store";
import { WebHeader } from "./WebHeader";
import { LoginPage } from "./LoginPage";
import { authClient } from "./auth-client";

async function handleBrowse(): Promise<string | null> {
  try {
    const res = await fetch("/api/dialog/select-directory", { method: "POST" });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.data) return String(body.data);
    return null;
  } catch {
    return null;
  }
}

export function App() {
  const { data: session, isPending } = authClient.useSession();

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
            <Route path="/" element={<Portfolio onBrowse={handleBrowse} />} />
            <Route path="/project/:id" element={<ControlRoom />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:clientId/context" element={<ClientContextPage />} />
            <Route path="/providers" element={<Providers />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PrismStoreContext.Provider>
  );
}
