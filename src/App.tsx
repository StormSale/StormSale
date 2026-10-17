
import React, { useEffect, useState } from "react";
import { Web3Provider } from "./context/Web3Context";
import {
  NotificationProvider,
  NotificationWrapper,
} from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";
import { usePreference } from "./hooks/usePreference";
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
    console.error("Unhandled error caught by ErrorBoundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-lg text-center">
            <h2 className="text-2xl font-bold mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. Please refresh the page or try
              again later.
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

const VALID_PAGES = [
  "dashboard",
  "advertiser",
  "affiliate",
  "auditor",
] as const;

type Page = (typeof VALID_PAGES)[number];

function Router() {
  const { isConnected } = useWeb3();

  const [currentPage, setCurrentPage] = usePreference<Page>(
    "stormsale.app.currentPage",
    "dashboard",
    (value) => VALID_PAGES.includes(value as Page),
  );

  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<
    string | null
  >(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  useEffect(() => {
    if (!isConnected) {
      setCurrentPage("dashboard");
    }
  }, [isConnected, setCurrentPage]);

  const handleNavigate = (page: string) => {
    if (VALID_PAGES.includes(page as Page)) {
      setCurrentPage(page as Page);
    }
  };

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
            {currentPage === "dashboard" && (
              <Dashboard onNavigate={handleNavigate} />
            )}

            {currentPage === "advertiser" && (
              <Advertiser
                onBack={() => handleNavigate("dashboard")}
              />
            )}

            {currentPage === "affiliate" && (
              <Affiliate
                onBack={() => handleNavigate("dashboard")}
              />
            )}

            {currentPage === "auditor" && (
              <Auditor
                onBack={() => handleNavigate("dashboard")}
              />
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
