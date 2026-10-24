import { Suspense, useState, useEffect, useRef, lazy } from "react";
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
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <ShortLinkRedirect />
      </Sentry.ErrorBoundary>
    );
  }

  return (
    <NotificationWrapper>
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <Web3Provider>
          <WalletConnectProvider>
            <NotificationProvider>
              <TooltipProvider delayDuration={300}>
                <Router />
              </TooltipProvider>
            </NotificationProvider>
          </WalletConnectProvider>
        </Web3Provider>
      </Sentry.ErrorBoundary>
    </NotificationWrapper>
  );
}

export default App;
