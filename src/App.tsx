import React, { Suspense, useState, useEffect, useRef, lazy } from "react";
import * as Sentry from "@sentry/react";
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
import { Header } from "./components/shared/Header";
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

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Unhandled error caught by ErrorBoundary:", error, info);
  }

  handleReport = () => {
    const error = this.state.error;
    const payload = {
      message: error ? error.message : "Unknown error",
      stack: error ? error.stack : undefined,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    };
    const summary = `Runtime error report\n\n${JSON.stringify(payload, null, 2)}`;
    console.error("reported", payload);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(summary).catch(() => undefined);
      }
    } catch {
      // clipboard may be unavailable; still logged above
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground"
        >
          <div className="max-w-lg w-full text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <span aria-hidden="true" className="text-2xl font-bold text-red-500">
                !
              </span>
            </div>
            <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. You can report it to help us fix the issue,
              then reload or try again.
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-40 overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReport}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Report
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 border border-muted-foreground/30 rounded hover:bg-muted"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 border border-muted-foreground/30 rounded hover:bg-muted"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const ErrorFallback = () => (
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
            <Header onNavigate={handleNavigate} />
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