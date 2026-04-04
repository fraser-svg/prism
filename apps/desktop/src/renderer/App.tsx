import { HashRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom, ClientContextPage, ClientsPage, Providers } from "@prism/ui";
import { useStore } from "./store";
import { DesktopHeader } from "./DesktopHeader";

async function handleBrowse(): Promise<string | null> {
  const result = await window.prism.selectDirectory();
  if (result?.data) return String(result.data);
  return null;
}

export function App() {
  return (
    <PrismStoreContext.Provider value={useStore}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell header={<DesktopHeader />} />}>
            <Route path="/" element={<Portfolio onBrowse={handleBrowse} />} />
            <Route path="/project/:id" element={<ControlRoom />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:clientId/context" element={<ClientContextPage />} />
            <Route path="/providers" element={<Providers />} />
          </Route>
        </Routes>
      </HashRouter>
    </PrismStoreContext.Provider>
  );
}
