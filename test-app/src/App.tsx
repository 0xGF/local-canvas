import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import Overview from "./pages/Overview";
import Install from "./pages/Install";
import CLI from "./pages/CLI";
import Features from "./pages/Features";
import Properties from "./pages/Properties";
import Shortcuts from "./pages/Shortcuts";
import API from "./pages/API";
import MCP from "./pages/MCP";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/install" element={<Install />} />
          <Route path="/cli" element={<CLI />} />
          <Route path="/features" element={<Features />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/shortcuts" element={<Shortcuts />} />
          <Route path="/api" element={<API />} />
          <Route path="/mcp" element={<MCP />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
