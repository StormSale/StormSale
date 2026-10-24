import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { initErrorTracking } from "./lib/errorTracking";
import "./index.css";

// Error tracking has to be initialised before the tree is rendered so the
// React error boundary can report uncaught exceptions. Without a DSN this is a
// no-op and nothing is ever sent.
initErrorTracking();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
