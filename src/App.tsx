import React, { useState } from "react";
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

/**
 * Role -> page mapping. This is the single source of truth for role-based
 * routing. All route guards derive from this map, so adding a new role
 * only requires updating one place.
 */
const ROLE_HOME: Record<string, string> = {
  advertiser: "advertiser",
  affiliate: "affiliate",
  auditor: "auditor",
};

const OPEN_ROLES = new Set(["advertiser", "affiliate", "auditor"]);

function normalizeRole(role: string | null | undefined): string | null {
  if (!role) return null;
  const normalized = role.toLowerCase();
  return OPEN_ROLES.has(normalized) ? normalized : null;
}

function Router() {
  const { isConnected, userRole, isRoleResolving } = useWeb3();
  const normalizedUserRole = normalizeRole(userRole);
  const roleHome = normalizedUserRole ? ROLE_HOME[normalizedUserRole] : null;
  const [currentPage, setCurrentPage] = useState("dashboard");
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

  // Not connected -> landing.
  if (!isConnected) {
    return (
      <>
        <ConnectWalletModal />
        <Landing />
      </>
    );
  }

  // Connected but role is still being resolved from DB. Render a neutral
  // shell instead of a role-guarded view to prevent flicker between
  // dashboard -> role page.
  if (isRoleResolving) {
    return (
      <>
        <ConnectWalletModal />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Syncing account…</div>
        </div>
      </>
    );
  }

  // Unified role-based route protection: the role determines the allowed
  // page. If the user has a role, they can only access that role's page
  // (plus the dashboard hub). Unroled users fall back to the dashboard.
  const allowedPage =
    currentPage === "dashboard" || currentPage === roleHome
      ? currentPage
      : roleHome ?? "dashboard";

  const navigate = (page: string) => {
    if (page === "dashboard" || page === roleHome) {
      setCurrentPage(page);
    }
  };

  return (
    <>
      <ConnectWalletModal />
      <div className="min-h-screen bg-background">
        <main>
          {allowedPage === "dashboard" && <Dashboard onNavigate={navigate} />}
          {allowedPage === "advertiser" && (
            <Advertiser onBack={() => setCurrentPage("dashboard")} />
          )}
          {allowedPage === "affiliate" && (
            <Affiliate onBack={() => setCurrentPage("dashboard")} />
          )}
          {allowedPage === "auditor" && <Auditor onBack={() => setCurrentPage("dashboard")} />}
        </main>
      </div>
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
