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

import { AffiliateLeaderboard } from "./components/affiliate/AffiliateLeaderboard";
import { ThemeToggle } from "./components/shared/ThemeToggle";
import { Button } from "./components/ui/button";
import { ArrowLeft, Zap } from "lucide-react";
import logo from "./assets/logo2.png";

function Router() {
  const { isConnected, openWalletModal } = useWeb3();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [isPublicLeaderboardOpen, setIsPublicLeaderboardOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("view") === "leaderboard" || params.get("tab") === "leaderboard";
  });
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
      {!isConnected ? (
        <Landing onViewLeaderboard={() => setIsPublicLeaderboardOpen(true)} />
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
            {currentPage === "leaderboard" && (
              <Affiliate onBack={() => setCurrentPage("dashboard")} initialTab="leaderboard" />
            )}
            {currentPage === "milestones" && (
              <Affiliate onBack={() => setCurrentPage("dashboard")} initialTab="milestones" />
            )}
            {currentPage === "auditor" && <Auditor onBack={() => setCurrentPage("dashboard")} />}
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
