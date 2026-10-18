import React, { Suspense, useState, lazy } from "react";
import { Web3Provider } from "./context/Web3Context";
import { WalletConnectProvider } from "./context/WalletConnectContext";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { useWeb3 } from "./hooks/useWeb3";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { loadBrandConfig } from "./lib/branding";

// Lazy-loaded routes and role-specific dashboards
export const Landing = lazy(() => import("./pages/Landing").then((m) => ({ default: m.Landing })));
export const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
export const Advertiser = lazy(() =>
  import("./pages/Advertiser").then((m) => ({ default: m.Advertiser })),
);
export const Affiliate = lazy(() =>
  import("./pages/Affiliate").then((m) => ({ default: m.Affiliate })),
);
export const Auditor = lazy(() => import("./pages/Auditor").then((m) => ({ default: m.Auditor })));
export const BrandedCampaignView = lazy(() =>
  import("./components/shared/BrandedCampaignView").then((m) => ({
    default: m.BrandedCampaignView,
  })),
);

export function PageLoader() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground"
    >
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
        <div className="absolute w-6 h-6 rounded-full bg-indigo-500/10 animate-pulse" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground animate-pulse">
        Loading view...
      </p>
    </div>
  );
}

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
        <Suspense fallback={<PageLoader />}>
          <BrandedCampaignView
            brandConfig={loadBrandConfig(activeBrandSubdomain)}
            onClose={() => {
              setActiveBrandSubdomain(null);
              window.history.pushState({}, "", window.location.pathname);
            }}
            isStandalone
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <>
      <ConnectWalletModal />
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </>
  );
}

function App() {
  return (
    <NotificationWrapper>
      <ErrorBoundary>
        <Web3Provider>
          <WalletConnectProvider>
            <NotificationProvider>
              <Router />
            </NotificationProvider>
          </WalletConnectProvider>
        </Web3Provider>
      </ErrorBoundary>
    </NotificationWrapper>
  );
}

export default App;