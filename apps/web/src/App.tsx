import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PrismStoreContext, AppShell, Portfolio, ControlRoom } from "@prism/ui";
import { Spinner } from "@heroui/react";
import { useStore } from "./store";
import { WebHeader } from "./WebHeader";
import { LoginPage } from "./LoginPage";
import { authClient } from "./auth-client";

export function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" color="accent" />
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
            <Route path="/" element={<Portfolio />} />
            <Route path="/project/:id" element={<ControlRoom />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </PrismStoreContext.Provider>
  );
}
