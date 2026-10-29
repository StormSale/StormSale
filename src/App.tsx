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
import { ZKProofVerifierModal } from "./components/affiliate/ZKProofVerifierModal";
import { parseProofFromUrl } from "./lib/zkProofEngine";
import { parseRecruiterInviteFromUrl } from "./lib/referralTree";
import type { ZKRevenueProof } from "./types/zkProof";
import { loadBrandConfig } from "./lib/branding";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { TooltipProvider } from "./components/ui/tooltip";
import { Header } from "./components/shared/Header";
import { ShortLinkRedirect } from "./components/affiliate/ShortLinkRedirect";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { Button } from "./components/ui/button";
import { ArrowLeft, Zap } from "lucide-react";
import logo from "./assets/logo2.png";

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
export const AffiliateLeaderboard = lazy(() =>
  import("./components/affiliate/AffiliateLeaderboard").then((m) => ({
    default: m.AffiliateLeaderboard,
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

const VALID_PAGES = [
  "dashboard",
  "advertiser",
  "affiliate",
  "leaderboard",
  "milestones",
  "auditor",
] as const;

type Page = (typeof VALID_PAGES)[number];

function Router() {
  const { isConnected, openWalletModal } = useWeb3();
  const [tmaMode, setTmaMode] = useState(() => isTelegramMiniApp());

  const [currentPage, setCurrentPage] = usePreference<Page>(
    "stormsale.app.currentPage",
    isTelegramMiniApp() ? "affiliate" : "dashboard",
    (value) => VALID_PAGES.includes(value as Page),
  );

  const [isPublicLeaderboardOpen, setIsPublicLeaderboardOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("view") === "leaderboard" || params.get("tab") === "leaderboard";
  });

  const prevConnectedRef = useRef(isConnected);

  useEffect(() => {
    // Only reset to "dashboard" after isConnected transitions from true to false,
    // preserving saved page state on initial load / reload.
    if (prevConnectedRef.current && !isConnected) {
      setCurrentPage("dashboard");
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, setCurrentPage]);
  // Handle incoming recruiter invites (e.g. ?recruiter=G...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const invite = parseRecruiterInviteFromUrl(window.location.href);
    if (invite.recruiterAddress) {
      setCurrentPage("affiliate");
    }
  }, [setCurrentPage]);
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  const [proofToVerify, setProofToVerify] = useState<ZKRevenueProof | null>(() => {
    if (typeof window === "undefined") return null;
    return parseProofFromUrl(window.location.href);
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

  if (isPublicLeaderboardOpen) {
    return (
      <>
        <ConnectWalletModal />
        <div className="min-h-screen bg-slate-50 dark:bg-[#09090b] font-sans selection:bg-indigo-500/30">
          <header className="border-b border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-xl sticky top-0 z-50">
            <div className="container mx-auto px-4 py-3 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPublicLeaderboardOpen(false)}
                  className="rounded-xl font-bold text-xs"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to StormSale
                </Button>
                <div className="hidden sm:flex items-center space-x-2 border-l border-slate-200 dark:border-zinc-800 pl-3">
                  <img src={logo} alt="StormSale Icon" className="h-7 w-auto object-contain" />
                  <span className="font-black text-sm tracking-tight text-zinc-900 dark:text-white">
                    StormSale
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <ThemeToggle />
                {!isConnected ? (
                  <Button
                    onClick={openWalletModal}
                    className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-bold text-xs h-9 px-4 shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Connect Wallet
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setIsPublicLeaderboardOpen(false);
                      setCurrentPage("affiliate");
                    }}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-9 px-4 shadow-sm"
                  >
                    Affiliate Dashboard
                  </Button>
                )}
              </div>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8 max-w-6xl">
            <AffiliateLeaderboard
              onSelectMilestones={() => {
                if (!isConnected) {
                  openWalletModal();
                } else {
                  setIsPublicLeaderboardOpen(false);
                  setCurrentPage("affiliate");
                }
              }}
            />
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <ConnectWalletModal />
      <MultiSigApprovalModal />
      <RpcStatusModal />
      <ZKProofVerifierModal
        isOpen={Boolean(proofToVerify)}
        onClose={() => {
          setProofToVerify(null);
          if (typeof window !== "undefined") {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("verify_proof");
            cleanUrl.searchParams.delete("proof");
            cleanUrl.searchParams.delete("zk");
            window.history.pushState({}, "", cleanUrl.toString());
          }
        }}
        proof={proofToVerify}
      />
      <Suspense fallback={<PageLoader />}>
        {!isConnected && !tmaMode ? (
          <Landing onViewLeaderboard={() => setIsPublicLeaderboardOpen(true)} />
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
              {(currentPage === "leaderboard" || currentPage === "milestones") && (
                <Suspense fallback={<div className="p-8 text-center">Loading Affiliate...</div>}>
                  <Affiliate
                    onBack={() => handleNavigate("dashboard")}
                    initialTab={currentPage === "milestones" ? "milestones" : "leaderboard"}
                  />
                </Suspense>
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