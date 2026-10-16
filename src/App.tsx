import React from "react";
import { Web3Provider } from "./context/Web3Context";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";
import { useRole } from "./hooks/useRole";

import { useState, useEffect } from "react";
import { ConnectWalletModal } from "./components/shared/ConnectWalletModal";

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

// Role-based route guard: maps a role to the only page that role is allowed to view.
const ROLE_ROUTES: Record<string, string> = {
  ADVERTISER: "advertiser",
  AFFILIATE: "affiliate",
  AUDITOR: "auditor",
};

const DEFAULT_ROLE_ROUTE = "dashboard";

function Router() {
  const { isConnected } = useWeb3();
  const { userRole, isRoleLoading } = useRole();
  const [currentPage, setCurrentPage] = useState(DEFAULT_ROLE_ROUTE);

  // Keep the active route in sync with the authoritative role from the backend.
  // This runs as soon as the role is resolved (or changes), so the UI never renders
  // a page the current role is not allowed to see.
  useEffect(() => {
    if (!isConnected) {
      setCurrentPage(DEFAULT_ROLE_ROUTE);
      return;
    }
    if (isRoleLoading) return;
    const allowed = userRole ? ROLE_ROUTES[userRole.toUpperCase()] : undefined;
    if (allowed) {
      setCurrentPage(allowed);
    } else {
      setCurrentPage(DEFAULT_ROLE_ROUTE);
    }
  }, [isConnected, userRole, isRoleLoading]);

  // Guarded navigation: block any attempt to navigate to a route the role cannot access.
  const navigate = (page: string) => {
    if (page === DEFAULT_ROLE_ROUTE) {
      setCurrentPage(page);
      return;
    }
    const allowed = userRole ? ROLE_ROUTES[userRole.toUpperCase()] : undefined;
    if (allowed === page) {
      setCurrentPage(page);
    }
  };

  // Do not flash the landing/dashboard while the role is being resolved.
  // Render a stable neutral shell instead of any route content.
  if (isConnected && isRoleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-sm text-muted-foreground">
          Loading workspace…</div>
      </div>
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
            {currentPage === "advertiser" && (
              <Advertiser onBack={() => navigate("dashboard")} />
            )}
            {currentPage === "affiliate" && (
              <Affiliate onBack={() => navigate("dashboard")} />
            )}
            {currentPage === "auditor" && <Auditor onBack={() => navigate("dashboard")} />}
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
