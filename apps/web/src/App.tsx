import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom } from "@prism/ui";
import { useStore } from "./store";
import { WebHeader } from "./WebHeader";

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
  return (
    <PrismStoreContext.Provider value={useStore}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell header={<WebHeader />} />}>
            <Route path="/" element={<Portfolio onBrowse={handleBrowse} />} />
            <Route path="/project/:id" element={<ControlRoom />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PrismStoreContext.Provider>
  );
}
