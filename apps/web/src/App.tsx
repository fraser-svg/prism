import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom, ClientContextPage } from "@prism/ui";
import { useStore } from "./store";
import { WebHeader } from "./WebHeader";

export function App() {
  return (
    <PrismStoreContext.Provider value={useStore}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell header={<WebHeader />} />}>
            <Route path="/" element={<Portfolio />} />
            <Route path="/project/:id" element={<ControlRoom />} />
            <Route path="/clients/:clientId/context" element={<ClientContextPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PrismStoreContext.Provider>
  );
}
