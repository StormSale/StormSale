import { Suspense, useState, useEffect, useRef, lazy } from "react";
import * as Sentry from "@sentry/react";
import { Web3Provider } from "./context/Web3Context";
import { WalletConnectProvider } from "./context/WalletConnectContext";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { TransactionAnnouncementProvider } from "./context/TransactionAnnouncementContext";
import { SorobanEventsProvider } from "./context/SorobanEventsContext";
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
export const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
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

export function IndigoBootLoader({
  isExiting = false,
  onExited,
}: {
  isExiting?: boolean;
  onExited?: () => void;
}) {
  return (
    <div
      role="status"
      aria-label="Booting StormSale"
      onTransitionEnd={onExited}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-slate-50 transition-opacity duration-500 ease-in-out ${
        isExiting ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Background ambient indigo gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/50 via-slate-950/90 to-slate-950 -z-10 pointer-events-none" />
      <div className="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-indigo-600/15 blur-3xl animate-pulse-glow pointer-events-none" />

      {/* Centered branding container */}
      <div className="relative flex flex-col items-center text-center px-4 select-none animate-fade-in">
        {/* Animated Centered Branding Logo */}
        <div className="relative mb-6 flex items-center justify-center">
          {/* Animated radar/ping pulse aura */}
          <div className="absolute w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-indigo-500/20 animate-ping opacity-25" />
          <div className="absolute w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-indigo-400/30 animate-pulse" />
          <div className="absolute w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-indigo-600/30 via-indigo-500/20 to-purple-600/20 blur-md animate-pulse-glow" />

          {/* Logo container with indigo glow and border */}
          <div className="relative z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/90 border border-indigo-500/40 p-3 shadow-xl shadow-indigo-500/20 flex items-center justify-center backdrop-blur-md">
            <img
              src={logo}
              alt="StormSale Logo"
              className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(99,102,241,0.6)] animate-pulse"
            />
          </div>
        </div>

        {/* Brand Name */}
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
          StormSale
        </h1>

        {/* Subtitle */}
        <p className="mt-2 text-xs sm:text-sm font-medium text-indigo-300/80 tracking-wider uppercase">
          Decentralized Escrow & Affiliate Protocol
        </p>

        {/* Indigo Loading Bar */}
        <div className="mt-8 w-48 sm:w-56 h-1.5 bg-indigo-950/80 rounded-full overflow-hidden border border-indigo-800/40 relative shadow-inner">
          <div className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-500 rounded-full animate-indigo-bar" />
        </div>

        {/* Hydrating status text */}
        <span className="mt-3 text-[11px] text-slate-400 font-mono tracking-wider animate-pulse">
          Hydrating protocol...
        </span>
      </div>
    </div>
  );
}

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
  "admin",
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
              {currentPage === "admin" && (
                <ProtectedRoute requiredRole="ADMIN" onNavigate={handleNavigate}>
                  <Suspense fallback={<div className="p-8 text-center">Loading Admin...</div>}>
                    <Admin onBack={() => handleNavigate("dashboard")} />
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
  const [booting, setBooting] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    initTelegramWebApp();
    const cleanup = syncTelegramTheme();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    // Keep boot loader mounted if in preview mode for inspection
    if (typeof window !== "undefined" && window.location.search.includes("boot=preview")) {
      return;
    }

    // Initiate seamless fade out transition once hydration is complete
    const timer = setTimeout(() => {
      setIsExiting(true);
      const exitTimer = setTimeout(() => {
        setBooting(false);
      }, 500);
      return () => clearTimeout(exitTimer);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const handleExited = () => {
    setBooting(false);
  };

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
    <>
      {booting && <IndigoBootLoader isExiting={isExiting} onExited={handleExited} />}
      <NotificationWrapper>
        <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
          <TransactionAnnouncementProvider>
            <Web3Provider>
              <WalletConnectProvider>
                <NotificationProvider>
                  <SorobanEventsProvider>
                    <TooltipProvider delayDuration={300}>
                      <Router />
                    </TooltipProvider>
                  </SorobanEventsProvider>
                </NotificationProvider>
              </WalletConnectProvider>
            </Web3Provider>
          </TransactionAnnouncementProvider>
        </Sentry.ErrorBoundary>
      </NotificationWrapper>
    </>
  );
}

export default App;
