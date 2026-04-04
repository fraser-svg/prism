import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom, ClientContextPage, Providers } from "@prism/ui";
import { useStore } from "./store";
import { WebHeader } from "./WebHeader";
import { LoginPage } from "./LoginPage";

const BYPASS_AUTH = true;

const MOCK_USER = { name: "Fraser", email: "fraser@prismatic.build", image: null };

export function App() {
  if (!BYPASS_AUTH) {
    // Auth flow would go here
  }

  return (
    <PrismStoreContext.Provider value={useStore}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell header={<WebHeader user={MOCK_USER} />} />}>
            <Route path="/" element={<Portfolio />} />
            <Route path="/project/:id" element={<ControlRoom />} />
            <Route path="/clients/:clientId/context" element={<ClientContextPage />} />
            <Route path="/providers" element={<Providers />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PrismStoreContext.Provider>
  );
}
