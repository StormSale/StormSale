import React, { Suspense, useState, useEffect, useRef, lazy } from "react";
import { Web3Provider } from "./context/Web3Context";
import { WalletConnectProvider } from "./context/WalletConnectContext";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { useWeb3 } from "./hooks/useWeb3";
import { usePreference } from "./hooks/usePreference";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { initTelegramWebApp, syncTelegramTheme, isTelegramMiniApp } from "./lib/telegram";
import { MultiSigApprovalModal } from "./components/shared/MultiSigApprovalModal";
import { RpcStatusModal } from "./components/shared/RpcStatusModal";
import { loadBrandConfig } from "./lib/branding";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { TooltipProvider } from "./components/ui/tooltip";
import { ShortLinkRedirect } from "./components/affiliate/ShortLinkRedirect";

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

const VALID_PAGES = ["dashboard", "advertiser", "affiliate", "auditor"] as const;

type Page = (typeof VALID_PAGES)[number];

function Router() {
  const { isConnected } = useWeb3();
  const [tmaMode, setTmaMode] = useState(() => isTelegramMiniApp());

  const [currentPage, setCurrentPage] = usePreference<Page>(
    "stormsale.app.currentPage",
    isTelegramMiniApp() ? "affiliate" : "dashboard",
    (value) => VALID_PAGES.includes(value as Page),
  );

  const prevConnectedRef = useRef(isConnected);

  useEffect(() => {
    // Only reset to "dashboard" after isConnected transitions from true to false,
    // preserving saved page state on initial load / reload.
    if (prevConnectedRef.current && !isConnected) {
      setCurrentPage("dashboard");
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, setCurrentPage]);

  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  const handleNavigate = (page: string) => {
    if (VALID_PAGES.includes(page as Page)) {
      setCurrentPage(page as Page);
    }
  };

  if (activeBrandSubdomain) {
    return (
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
    );
  }

  return (
    <>
      <ConnectWalletModal />
      <MultiSigApprovalModal />
      <RpcStatusModal />
      <Suspense fallback={<PageLoader />}>
        {!isConnected && !tmaMode ? (
          <Landing />
        ) : (
          <div className="min-h-screen bg-background">
            <main>
              {currentPage === "dashboard" && <Dashboard onNavigate={handleNavigate} />}
              {currentPage === "advertiser" && (
                <ProtectedRoute requiredRole="ADVERTISER" onNavigate={handleNavigate}>
                  <Suspense fallback={<div className="p-8 text-center">Loading Advertiser...</div>}>
                    <Advertiser onBack={() => handleNavigate("dashboard")} />
                  </Suspense>
                </ProtectedRoute>
              )}
              {currentPage === "affiliate" && (
                <ProtectedRoute requiredRole="AFFILIATE" onNavigate={handleNavigate}>
                  <Suspense fallback={<div className="p-8 text-center">Loading Affiliate...</div>}>
                    <Affiliate
                      onBack={() => (isConnected ? handleNavigate("dashboard") : setTmaMode(false))}
                    />
                  </Suspense>
                </ProtectedRoute>
              )}
              {currentPage === "auditor" && (
                <ProtectedRoute requiredRole="AUDITOR" onNavigate={handleNavigate}>
                  <Suspense fallback={<div className="p-8 text-center">Loading Auditor...</div>}>
                    <Auditor onBack={() => handleNavigate("dashboard")} />
                  </Suspense>
                </ProtectedRoute>
              )}
            </main>
          </div>
        )}
      </Suspense>
    </>
  );
}

function App() {
  useEffect(() => {
    initTelegramWebApp();
    const cleanup = syncTelegramTheme();
    return () => {
      cleanup();
    };
  }, []);

  const isShortLinkRoute =
    typeof window !== "undefined" && window.location.pathname.startsWith("/c/");

  if (isShortLinkRoute) {
    return (
      <ErrorBoundary>
        <ShortLinkRedirect />
      </ErrorBoundary>
    );
  }

  return (
    <NotificationWrapper>
      <ErrorBoundary>
        <Web3Provider>
          <WalletConnectProvider>
            <NotificationProvider>
              <TooltipProvider delayDuration={300}>
                <Router />
              </TooltipProvider>
            </NotificationProvider>
          </WalletConnectProvider>
        </Web3Provider>
      </ErrorBoundary>
    </NotificationWrapper>
  );
}

export default App;
