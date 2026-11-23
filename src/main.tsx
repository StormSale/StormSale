import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { initErrorTracking } from "./lib/errorTracking";
import { initPwaServiceWorker } from "./lib/pwa";
import { initUIStateCache } from "./lib/uiStateCache";
import "./index.css";

// Error tracking has to be initialised before the tree is rendered so the
// React error boundary can report uncaught exceptions. Without a DSN this is a
// no-op and nothing is ever sent.
initErrorTracking();
initPwaServiceWorker();

// Drop malformed, outdated, or expired persisted filter state before the
// first render so the cache can never feed an off-schema value into the UI.
initUIStateCache();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
