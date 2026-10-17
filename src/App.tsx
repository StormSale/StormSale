import React, { Suspense, useState } from "react";
import { Web3Provider } from "./context/Web3Context";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { useWeb3 } from "./hooks/useWeb3";

import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { BrandedCampaignView } from "./components/shared/BrandedCampaignView";
import { loadBrandConfig } from "./lib/branding";

const Advertiser = React.lazy(() =>
  import("./pages/Advertiser").then((mod) => ({ default: mod.Advertiser })),
);
const Affiliate = React.lazy(() =>
  import("./pages/Affiliate").then((mod) => ({ default: mod.Affiliate })),
);
const Auditor = React.lazy(() =>
  import("./pages/Auditor").then((mod) => ({ default: mod.Auditor })),
);

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
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
  const { isConnected } = useWeb3();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  if (activeBrandSubdomain) {
    return (
      <BrandedCampaignView
        brandConfig={loadBrandConfig(activeBrandSubdomain)}
        onClose={() => {
          setActiveBrandSubdomain(null);
          window.history.pushState({}, "", window.location.pathname);
        }}
        isStandalone
      />
    );
  }

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
              <Suspense fallback={<div className="p-8 text-center">Loading Advertiser...</div>}>
                <Advertiser onBack={() => setCurrentPage("dashboard")} />
              </Suspense>
            )}
            {currentPage === "affiliate" && (
              <Suspense fallback={<div className="p-8 text-center">Loading Affiliate...</div>}>
                <Affiliate onBack={() => setCurrentPage("dashboard")} />
              </Suspense>
            )}
            {currentPage === "auditor" && (
              <Suspense fallback={<div className="p-8 text-center">Loading Auditor...</div>}>
                <Auditor onBack={() => setCurrentPage("dashboard")} />
              </Suspense>
            )}
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
