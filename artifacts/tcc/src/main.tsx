import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/tcc/ErrorBoundary";
import { AuthGate } from "@/components/tcc/AuthGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthGate>
      <App />
    </AuthGate>
  </ErrorBoundary>
);
