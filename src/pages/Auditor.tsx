import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { AuditorOverview } from "../components/auditor/AuditorOverview";
import { VerifyAccess } from "../components/auditor/VerifyAccess";
import { AuditHistory } from "../components/auditor/AuditHistory";
import { ComplianceReport } from "../components/auditor/ComplianceReport";
import { Sidebar } from "../components/shared/Sidebar";
import { NotificationProvider } from "../context/NotificationContext";
import { BarChart3, Eye, ClipboardList, FileCheck, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AuditorProps {
  onBack: () => void;
}

const AuditorContent: React.FC<AuditorProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [walletFilter, setWalletFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");

  // Debounce wallet filter for instant-feeling but performant filtering
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedFilter(walletFilter.trim().toLowerCase());
    }, 120);
    return () => window.clearTimeout(handle);
  }, [walletFilter]);

  const normalizedFilter = useMemo(() => debouncedFilter, [debouncedFilter]);

  // Virtualized scrolling state for large audit lists
  const ROW_HEIGHT = 56;
  const OVERSCAN = 8;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Synthetic platform-wide ledger dataset (memoized so virtualization stays cheap)
  const ledgerRows = useMemo(() => {
    const wallets = [
      "0xA1b2C3d4E5f60718293a4B5c6D7e8F9012345678",
      "0xB2c3D4e5F60718293A4b5C6d7E8f901234567890",
      "0xC3d4E5f6071829a4B5c6D7e8F90123456789012",
      "0xD4e5F60718293A4b5C6d7E8f9012345678901234",
      "0xE5f6071829a4B5c6D7e8F901234567890123456",
    ];
    const kinds = ["Transfer", "Mint", "Burn", "Swap", "Stake"];
    const rows = [] as {
      id: string;
      wallet: string;
      kind: string;
      amount: number;
      status: "confirmed" | "pending" | "failed";
      timestamp: number;
    }[];
    for (let i = 0; i < 5000; i++) {
      const wallet = wallets[i % wallets.length];
      rows.push({
        id: `tx-${i.toString().padStart(6, "0")}`,
        wallet,
        kind: kinds[i % kinds.length],
        amount: Math.round((Math.random() * 10000 + 1) * 100) / 100,
        status: (["confirmed", "pending", "failed"] as const)[i % 3],
        timestamp: Date.now() - i * 60_000,
      });
    }
    return rows;
  }, []);

  const filteredRows = useMemo(() => {
    if (!normalizedFilter) return ledgerRows;
    return ledgerRows.filter((row) =>
      row.wallet.toLowerCase().includes(normalizedFilter)
    );
  }, [ledgerRows, normalizedFilter]);

  const totalRows = filteredRows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalRows,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );
  const visibleRows = filteredRows.slice(startIndex, endIndex);
  const totalHeight = totalRows * ROW_HEIGHT;
  const offsetY = startIndex * ROW_HEIGHT;

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const formatAmount = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const tabs = [
    { id: "overview", label: "Dashboard Overview", icon: BarChart3 },
    { id: "verify", label: "Verify Access", icon: Eye },
    { id: "history", label: "Audit History", icon: ClipboardList },
    { id: "compliance", label: "Compliance Report", icon: FileCheck },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "verify":
        return <VerifyAccess />;
      case "history":
        return <AuditHistory />;
      case "compliance":
        return <ComplianceReport />;
      default:
        return <AuditorOverview onTabChange={setActiveTab} />;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 dark:bg-zinc-950 font-sans selection:bg-indigo-500/30">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={tabs}
        onBack={onBack}
        roleName="Auditor Enterprise"
      />

      {/* Main content */}
      <div className="flex-1 p-4 lg:p-8 lg:overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={walletFilter}
                onChange={(e) => setWalletFilter(e.target.value)}
                placeholder="Filter by wallet address…"
                aria-label="Filter by wallet address"
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              {walletFilter && (
                <button
                  type="button"
                  onClick={() => setWalletFilter("")}
                  aria-label="Clear wallet filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 whitespace-nowrap">
              {totalRows.toLocaleString()} of {ledgerRows.length.toLocaleString()} transactions
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
              <span>Wallet</span>
              <span>Type</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
              <span className="text-right">Time</span>
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="relative overflow-y-auto"
              style={{ height: 420 }}
              role="grid"
              aria-rowcount={totalRows}
            >
              <div style={{ height: totalHeight, position: "relative" }}>
                <div style={{ transform: `translateY(${offsetY}px)` }}>
                  {visibleRows.map((row) => (
                    <div
                      key={row.id}
                      role="row"
                      aria-rowindex={startIndex + visibleRows.indexOf(row) + 1}
                      className="grid grid-cols-[1.6fr_1fr_1fr_1fr_1.2fr] px-4 items-center text-sm border-b border-slate-100 dark:border-zinc-800/60 hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className="font-mono text-xs text-slate-700 dark:text-zinc-300 truncate">
                        {row.wallet}
                      </span>
                      <span className="text-slate-600 dark:text-zinc-400">{row.kind}</span>
                      <span className="text-right tabular-nums text-slate-800 dark:text-zinc-200">
                        {formatAmount(row.amount)}
                      </span>
                      <span
                        className={
                          "text-right text-xs font-medium " +
                          (row.status === "confirmed"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : row.status === "pending"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-rose-600 dark:text-rose-400")
                        }
                      >
                        {row.status}
                      </span>
                      <span className="text-right text-xs text-slate-500 dark:text-zinc-400">
                        {formatTime(row.timestamp)}
                      </span>
                    </div>
                  ))}
                  {totalRows === 0 && (
                    <div className="p-8 text-center text-sm text-slate-500 dark:text-zinc-400">
                      No transactions match the current wallet filter.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export const Auditor: React.FC<AuditorProps> = (props) => (
  <NotificationProvider>
    <AuditorContent {...props} />
  </NotificationProvider>
);
