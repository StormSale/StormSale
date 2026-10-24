import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import { initErrorTracking } from "./lib/errorTracking";
import "./index.css";
import { queryClient } from "./lib/queryClient";

// Error tracking has to be initialised before the tree is rendered so the
// React error boundary can report uncaught exceptions. Without a DSN this is a
// no-op and nothing is ever sent.
initErrorTracking();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
