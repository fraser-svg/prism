import { HashRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Portfolio } from "./components/Portfolio";
import { ControlRoom } from "./components/ControlRoom";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Portfolio />} />
          <Route path="/project/:id" element={<ControlRoom />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
