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
import { BrandedCampaignView } from "./components/shared/BrandedCampaignView";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { loadBrandConfig } from "./lib/branding";

function Router() {
  const { isConnected } = useWeb3();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  if (activeBrandSubdomain) {
    return (
      <ErrorBoundary>
        <BrandedCampaignView
          brandConfig={loadBrandConfig(activeBrandSubdomain)}
          onClose={() => {
            setActiveBrandSubdomain(null);
            window.history.pushState({}, "", window.location.pathname);
          }}
          isStandalone
        />
      </ErrorBoundary>
    );
  }

  return (
    <>
      <ConnectWalletModal />
      {!isConnected ? (
        <ErrorBoundary>
          <Landing />
        </ErrorBoundary>
      ) : (
        <div className="min-h-screen bg-background">
          <main>
            <ErrorBoundary key={currentPage}>
              {currentPage === "dashboard" && <Dashboard onNavigate={setCurrentPage} />}
              {currentPage === "advertiser" && (
                <Advertiser onBack={() => setCurrentPage("dashboard")} />
              )}
              {currentPage === "affiliate" && (
                <Affiliate onBack={() => setCurrentPage("dashboard")} />
              )}
              {currentPage === "auditor" && <Auditor onBack={() => setCurrentPage("dashboard")} />}
            </ErrorBoundary>
          </main>
        </div>
      )}
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <NotificationWrapper>
        <ErrorBoundary>
          <Web3Provider>
            <ErrorBoundary>
              <NotificationProvider>
                <Router />
              </NotificationProvider>
            </ErrorBoundary>
          </Web3Provider>
        </ErrorBoundary>
      </NotificationWrapper>
    </ErrorBoundary>
  );
}

export default App;
