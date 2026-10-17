import React from "react";
import { Web3Provider } from "./context/Web3Context";
import { NotificationProvider, NotificationWrapper } from "./context/NotificationContext";
import { Landing } from "./pages/Landing";
import { Dashboard } from "./pages/Dashboard";
import { Advertiser } from "./pages/Advertiser";
import { Affiliate } from "./pages/Affiliate";
import { Auditor } from "./pages/Auditor";
import { useWeb3 } from "./hooks/useWeb3";
import { SorobanEventProvider, useSorobanEvents } from "./context/SorobanEventContext";
import { useNotifications } from "./hooks/useNotifications";

import { useState, useEffect } from "react";
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

const STATUS_STYLES: Record<string, { label: string; color: string; dot: string }> = {
  connected: { label: "Connected", color: "text-emerald-700", dot: "bg-emerald-500" },
  polling: { label: "Polling", color: "text-amber-700", dot: "bg-amber-500" },
  reconnecting: { label: "Reconnecting", color: "text-rose-700", dot: "bg-rose-500" },
  idle: { label: "Idle", color: "text-slate-600", dot: "bg-slate-400" },
};

function ConnectionStatusPill() {
  const { status, lastEventAt } = useSorobanEvents();
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.idle;
  return (
    <div
      className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-full border bg-white/90 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur"
      role="status"
      aria-live="polite"
      title={lastEventAt ? `Last event: ${new Date(lastEventAt).toLocaleTimeString()}` : "Awaiting for on-chain events"}
    >
      <span className={` inline-block h-2 w-2 rounded-full ${style.dot}`} />
      <span className={style.color}>{style.label}</span>
    </div>
  );
}

function EventToastBridge() {
  const { lastEvent } = useSorobanEvents();
  const { notify } = useNotifications();

  useEffect(() => {
    if (!lastEvent) return;
    const labels: Record<string, string> = {
      create_campaign: "New campaign created",
      log_sale: "Sale logged on-chain",
      claim_payout: "Payout claimed",
    };
    const message = labels[lastEvent.topic] ?? "On-chain event received";
    notify({
      title: message,
      message: lastEvent.contractId ? `Contract ${lastEvent.contractId}` : undefined,
      type: "success",
    });
  }, [lastEvent, notify]);

  return null;
}

function Router() {
  const { isConnected } = useWeb3();
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

  return (
    <>
      <ConnectWalletModal />
      {!isConnected ? (
        <Landing />
      ) : (
        <div className="min-h-screen bg-background">
          <ConnectionStatusPill />
          <EventToastBridge />
          <main>
            {currentPage === "dashboard" && <Dashboard onNavigate={setCurrentPage} />}
            {currentPage === "advertiser" && (
              <Advertiser onBack={() => setCurrentPage("dashboard")} />
            )}
            {currentPage === "affiliate" && (
              <Affiliate onBack={() => setCurrentPage("dashboard")} />
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
            <SorobanEventProvider>
              <Router />
            </SorobanEventProvider>
          </NotificationProvider>
        </Web3Provider>
      </ErrorBoundary>
    </NotificationWrapper>
  );
}

export default App;
