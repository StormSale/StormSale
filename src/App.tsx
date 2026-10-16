import React from "react";
import { Web3Provider } from "./context/Web3Context";
import {
  NotificationProvider,
  NotificationWrapper,
  useNotification,
} from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";
import { useIdleDisconnect } from "./hooks/useIdleDisconnect";
import { SessionTimeoutModal } from "./components/shared/SessionTimeoutModal";

import { useState } from "react";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { BrandedCampaignView } from "./components/shared/BrandedCampaignView";
import { loadBrandConfig } from "./lib/branding";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // You can log error to an external service here
    console.error("Unhandled error caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-lg text-center">
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. Please refresh the page or try again later.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  const { isConnected, disconnectWallet } = useWeb3();
  const { showNotification } = useNotification();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  const { isWarningOpen, remainingSeconds, extendSession, handleManualDisconnect } =
    useIdleDisconnect({
      isConnected,
      onDisconnect: () => {
        disconnectWallet();
        showNotification({
          type: "warning",
          title: "Session Expired",
          message:
            "Your wallet was automatically disconnected after 30 minutes of inactivity for your security.",
          duration: 8000,
        });
      },
      onExtend: () => {
        showNotification({
          type: "info",
          title: "Session Extended",
          message: "Your active session has been extended.",
          duration: 3000,
        });
      },
      onManualDisconnect: () => {
        disconnectWallet();
        showNotification({
          type: "info",
          title: "Wallet Disconnected",
          message: "You have disconnected your wallet.",
          duration: 3000,
        });
      },
    });

  const isPreviewQuery =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("timeout_preview") === "1";

  if (activeBrandSubdomain) {
    return (
      <>
        <SessionTimeoutModal
          isOpen={isWarningOpen || isPreviewQuery}
          remainingSeconds={isWarningOpen ? remainingSeconds : 115}
          onExtend={extendSession}
          onDisconnect={handleManualDisconnect}
        />
        <BrandedCampaignView
          brandConfig={loadBrandConfig(activeBrandSubdomain)}
          onClose={() => {
            setActiveBrandSubdomain(null);
            window.history.pushState({}, "", window.location.pathname);
          }}
          isStandalone
        />
      </>
    );
  }

  return (
    <>
      <ConnectWalletModal />
      <SessionTimeoutModal
        isOpen={isWarningOpen || isPreviewQuery}
        remainingSeconds={isWarningOpen ? remainingSeconds : 115}
        onExtend={extendSession}
        onDisconnect={handleManualDisconnect}
      />
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
