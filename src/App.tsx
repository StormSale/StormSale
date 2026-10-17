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
import { AnimatePresence, motion } from "framer-motion";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { BrandedCampaignView } from "./components/shared/BrandedCampaignView";
import { IndigoBootLoader } from "./components/shared/IndigoBootLoader";
import { loadBrandConfig } from "./lib/branding";

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

export interface RouterProps {
  initialBooting?: boolean;
  fastBoot?: boolean;
  initialPage?: string;
}

export function Router({ initialBooting, fastBoot, initialPage = "dashboard" }: RouterProps = {}) {
  const { isConnected } = useWeb3();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [isBooting, setIsBooting] = useState(() => {
    if (typeof initialBooting === "boolean") return initialBooting;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("boot") === "false") return false;
      if (params.get("boot") === "true") return true;
    }
    return true;
  });
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  const shouldFastBoot =
    typeof fastBoot === "boolean"
      ? fastBoot
      : typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("fast") === "true";

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
    <AnimatePresence mode="wait">
      {isBooting ? (
        <IndigoBootLoader
          key="indigo-boot-loader"
          fast={shouldFastBoot}
          onComplete={() => setIsBooting(false)}
        />
      ) : (
        <motion.div
          key="app-main-content"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="min-h-screen"
        >
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
        </motion.div>
      )}
    </AnimatePresence>
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
