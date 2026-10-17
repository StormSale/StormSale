import React from "react";
import { Web3Provider } from "./context/Web3Context";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";

import { usState, useEffect } from "react";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { BrandedCampaignView } from "./components/shared/BrandedCampaignView";
import { loadBrandConfig } from "./lib/branding";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
>
{
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

/**
 * Role-based route protection mapping.
 * Each page requires a specific role. Pages not listed here (e.g. dashboard)
 * are accessible to any authenticated role.
 */
const PAGE_ROLE_REQUIREMENTS: Record<string, string[]> = {
  advertiser: ["advertiser"],
  affiliate: ["affiliate"],
  auditor: ["auditor"],
};

const DEFAULT_PAGE = "dashboard";

function isRoleAllowed(page: string, role: string | null): boolean {
  const required = PAGE_ROLE_REQUIREMENTS[page];
  if (!required) return true;
  if (!role) return false;
  return required.includes(role);
}

function Router() {
  const { isConnected, userRole, isRoleResolved } = useWeb3();
  const [currentPage, setCurrentPage] = useState(DEFAULT_PAGE);
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  // Unified route protection: if the current page is not allowed for the
  // resolved role, redirect to the default page. This handles both direct
  // navigation and role changes (e.g. user switches role while on a page).
  useEffect(() => {
    if (!isConnected) {
      if (currentPage !== DEFAULT_PAGE) setCurrentPage(DEFAULT_PAGE);
      return;
    }
    if (!isRoleResolved) return;
    if (!isRoleAllowed(currentPage, userRole)) {
      setCurrentPage(DEFAULT_PAGE);
    }
  }, [currentPage, isConnected, isRoleResolved, userRole]);

  // Stable navigation handler that enforces role protection at the click site.
  const navigate = (page: string) => {
    if (!isRoleAllowed(page, userRole)) return;
    setCurrentPage(page);
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

  // Avoid flicker: while the wallet is connected but the role has not yet
  // been resolved from the backend, render a neutral skeleton instead of the
  // dashboard (or any role-specific view). This prevents the "dashboard flash
  // then role view" behavior on load.
  if (isConnected && !isRoleResolved) {
    return (
      <>
        <ConnectWalletModal />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">Syncing account…</p>
          </div>
        </div>
      </>
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
            {currentPage === "dashboard" && <Dashboard onNavigate={navigate} />}
            {currentPage === "advertiser" && isRoleAllowed("advertiser", userRole) && (
              <Advertiser onBack={() => navigate(DEFAULT_PAGE)} />
            )}
            {currentPage === "affiliate" && isRoleAllowed("affiliate", userRole) && (
              <Affiliate onBack={() => navigate(DEFAULT_PAGE)} />
            )}
            {currentPage === "auditor" && isRoleAllowed("auditor", userRole) && (
              <Auditor onBack={() => navigate(DEFAULT_PAGE)} />
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
