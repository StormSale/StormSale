import React from "react";
import { Web3Provider } from "./context/Web3Context";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";

import { useState } from "react";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Global ErrorBoundary caught:", error, info);
  }

  handleReport = () => {
    const message = this.state.error?.message ?? "Unknown error";
    window.location.href = `mailto:support@example.com?subject=App%20Error%20Report&body=${encodeURIComponent(
      message
    )}`;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
          <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            An unexpected error occurred. You can report it below.
          </p>
          <button
            onClick={this.handleReport}
            className="px-4 py-2 rounded bg-primary text-primary-foreground"
          >
            Report
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  const { isConnected } = useWeb3();
  const [currentPage, setCurrentPage] = useState("dashboard");

  return (
    <>
      <ConnectWalletModal />
      {!isConnected ? (
        <Landing />
      ) : (
        <div className="min-h-screen bg-background">
          <main>
            {currentPage === "dashboard" && <Dashboard onNavigate={setCurrentPage} />}
            {currentPage === "advertiser" && (
              <Advertiser onBack={() => setCurrentPage("dashboard")} />
            )}
            {currentPage === "affiliate" && (
              <Affiliate onBack={() => setCurrentPage("dashboard")} />
            )}
            {currentPage === "auditor" && <Auditor onBack={() => setCurrentPage("dashboard")} />}
          </main>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <NotificationWrapper>
      <ErrorBoundary>
        <Web3Provider>
          <NotificationProvider>
            <Router />
          </NotificationProvider>
        </Web3Provider>
      </ErrorBoundary>
    </NotificationWrapper>
  );
}

export default App;
