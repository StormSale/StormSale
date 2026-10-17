import React, { useState, useEffect } from "react";
import { Web3Provider } from "./context/Web3Context";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";
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

// Role-based route protection map. Each route is only accessible to a
// specific set of roles. The dashboard is available to all authenticated
// users regardless of role.
const RESTRICTED_ROUTES: Record<string, ReadonlyArray<string>> = {
  advertiser: ["advertiser"],
  affiliate: ["affiliate"],
  auditor: ["auditor"],
};

function isRouteAllowed(page: string, role: string | null): boolean {
  const allowedRoles = RESTRICTED_ROUTES[page];
  if (!allowedRoles) return true;
  if (!role) return false;
  return allowedRoles.includes(role);
}

function Router() {
  const { isConnected, userRole, isRoleResolved } = useWeb3() as {
    isConnected: boolean;
    userRole: string | null;
    isRoleResolved: boolean;
  };
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  // Unified route guard: whenever the role changes or the current page
  // is no longer authorized, redirect to the dashboard (the safe default).
  useEffect(() => {
    if (!isConnected) return;
    if (!isRoleResolved) return;
    if (!isRouteAllowed(currentPage, userRole)) {
      setCurrentPage("dashboard");
    }
  }, [currentPage, userRole, isConnected, isRoleResolved]);

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

  // Avoid flicker: while the wallet is connected but the role has not yet
  // been resolved from the backend, render a neutral loading shell instead
  // of briefly showing the wrong page.
  const showLoadingShell = isConnected && isRoleResolved !== true;

  return (
    <>
      <ConnectWalletModal />
      {!showLoadingShell && !isConnected ? (
        <Landing />
      ) : showLoadingShell ? (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-muted-foreground">Syncing account...</p>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-background">
          <main>
            {currentPage === "dashboard" && <Dashboard onNavigate={setCurrentPage} />}
            {currentPage === "advertiser" && isRouteAllowed("advertiser", userRole) && (
              <Advertiser onBack={() => setCurrentPage("dashboard")} />
            )}
            {currentPage === "affiliate" && isRouteAllowed("affiliate", userRole) && (
              <Affiliate onBack={() => setCurrentPage("dashboard")} />
            )}
            {currentPage === "auditor" && isRouteAllowed("auditor", userRole) && (
              <Auditor onBack={() => setCurrentPage("dashboard")} />
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
