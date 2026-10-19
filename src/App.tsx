import React, { Suspense, useState, useEffect, useMemo, useCallback, lazy } from "react";
import { Web3Provider } from "./context/Web3Context";
import { WalletConnectProvider } from "./context/WalletConnectContext";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { useWeb3 } from "./hooks/useWeb3";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";
import { initTelegramWebApp, syncTelegramTheme, isTelegramMiniApp } from "./lib/telegram";
import { loadBrandConfig } from "./lib/branding";

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

type UserRole = "dashboard" | "advertiser" | "affiliate" | "auditor";

const ROLE_STORAGE_KEY = "app:userRole";

const VALID_ROLES: UserRole[] = ["dashboard", "advertiser", "affiliate", "auditor"];

function readPersistedRole(): UserRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (raw && (VALID_ROLES as string[]).includes(raw)) {
      return raw as UserRole;
    }
  } catch {
    // ignore storage access errors
  }
  return null;
}

function persistRole(role: UserRole) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROLE_STORAGE_KEY, role);
  } catch {
    // ignore storage access errors
  }
}

function resolveInitialRole(): UserRole {
  if (isTelegramMiniApp()) return "affiliate";
  return readPersistedRole() ?? "dashboard";
}

const ROLE_ACCESS: Record<UserRole, (ctx: { isConnected: boolean; tmaMode: boolean }) => boolean> = {
  dashboard: ({ isConnected, tmaMode }) => isConnected || tmaMode,
  advertiser: ({ isConnected, tmaMode }) => isConnected || tmaMode,
  affiliate: ({ isConnected, tmaMode }) => isConnected || tmaMode,
  auditor: ({ isConnected, tmaMode }) => isConnected || tmaMode,
};

function isUserRole(value: string | null): value is UserRole {
  return value !== null && (VALID_ROLES as string[]).includes(value);
}

function isRoleAccessible(role: UserRole, ctx: { isConnected: boolean; tmaMode: boolean }): boolean {
  const guard = ROLE_ACCESS[role];
  return guard ? guard(ctx) : false;
}

function Router() {
  const { isConnected } = useWeb3();
  const [tmaMode, setTmaMode] = useState(() => isTelegramMiniApp());
  const [currentPage, setCurrentPage] = useState(() =>
    resolveInitialRole(),
  );
  const [activeBrandSubdomain, setActiveBrandSubdomain] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("brand") || params.get("c") || null;
  });

  const navigate = useCallback((next: UserRole) => {
    setCurrentPage((prev) => {
      if (prev === next) return prev;
      persistRole(next);
      return next;
    });
  }, []);

  useEffect(() => {
    persistRole(currentPage);
  }, [currentPage]);

  useEffect(() => {
    if (!isUserRole(currentPage)) {
      setCurrentPage("dashboard");
    }
  }, [currentPage]);

  const canAccessCurrentPage = useMemo(() => {
    if (!isUserRole(currentPage)) return false;
    return isRoleAccessible(currentPage, { isConnected, tmaMode });
  }, [currentPage, isConnected, tmaMode]);

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
      <Suspense fallback={<PageLoader />}>
        {!canAccessCurrentPage ? (
          <Landing />
        ) : (
          <div className="min-h-screen bg-background">
            <main>
              {currentPage === "dashboard" && <Dashboard onNavigate={navigate} />}
              {currentPage === "advertiser" && (
                <Suspense fallback={<div className="p-8 text-center">Loading Advertiser...</div>}>
                  <Advertiser onBack={() => navigate("dashboard")} />
                </Suspense>
              )}
              {currentPage === "affiliate" && (
                <Suspense fallback={<div className="p-8 text-center">Loading Affiliate...</div>}>
                  <Affiliate
                    onBack={() => (isConnected ? navigate("dashboard") : setTmaMode(false))}
                  />
                </Suspense>
              )}
              {currentPage === "auditor" && (
                <Suspense fallback={<div className="p-8 text-center">Loading Auditor...</div>}>
                  <Auditor onBack={() => navigate("dashboard")} />
                </Suspense>
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

  return (
    <NotificationWrapper>
      <ErrorBoundary>
        <Web3Provider>
          <WalletConnectProvider>
            <NotificationProvider>
              <Router />
            </NotificationProvider>
          </WalletConnectProvider>
        </Web3Provider>
      </ErrorBoundary>
    </NotificationWrapper>
  );
}

export default App;
