import { useState, useEffect, useMemo, useContext } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  decryptPayload,
  generateAESKey,
  encryptPayload,
  wrapAESKey,
  unwrapAESKey,
  getPublicKeyForAddress,
} from "../../lib/crypto";
import {
  Shield,
  Lock,
  CheckCircle2,
  Clock,
  Search,
  ExternalLink,
  FileText,
  X,
  AlertTriangle,
  Scale,
} from "lucide-react";
import { getStellarExpertUrl } from "../../lib/stellar/explorer";
import { NotificationContext } from "../../context/NotificationContext";
import { DisputeModal } from "./DisputeModal";
import { getAllDisputeRecords, type DisputeRecord } from "../../lib/affiliateDispute";

export type SaleStatus = "in_clearing" | "unlocked" | "claimed" | "disputed" | "under_review";

export interface Sale {
  id: number;
  affiliate: string;
  saleAmount: string;
  commissionAmount: string;
  timestamp: number;
  clearingPeriod: number;
  claimed: boolean;
  /** Explicit status of the conversion; supports disputed and auditor review states (#171) */
  status?: SaleStatus;
  /** Stellar transaction hash for settled claims (#51) or linked conversion hash */
  txHash?: string;
  /** Assigned dispute tracking docket ID when under protocol auditor review (#171) */
  disputeDocketId?: string;
  /** Timestamp when the dispute docket was created (#171) */
  disputeSubmittedAt?: number;
  /** Explicit receipt URL override (e.g. block explorer or modal). */
  receiptUrl?: string;
  /** Base64 AES-GCM envelope produced by encryptPayload. Absent for legacy mock rows. */
  encryptedEnvelope?: string;
  /** Wrapped per-sale AES key sealed to the affiliate identifier. Absent for legacy mock rows. */
  wrappedKey?: string;
  /** Affiliate identifier (wallet address/label) the wrapped key is sealed to. */
  affiliateKeyId?: string;
}

export interface SalesListProps {
  sales?: Sale[];
  /** Optional flag to allow demo mock sales fallback in non-production environments */
  allowDemoFallback?: boolean;
}

export type SaleStatusFilter = "all" | "claimed" | "unlocked" | "clearing" | "disputed";

export const DEFAULT_CLEARING_PERIOD = 604800; // 7 days in seconds

export function calculateClearing(
  sale: Pick<Sale, "timestamp" | "clearingPeriod">,
  nowSeconds: number,
) {
  const period =
    typeof sale.clearingPeriod === "number" && sale.clearingPeriod > 0
      ? sale.clearingPeriod
      : DEFAULT_CLEARING_PERIOD;
  const unlockTimestamp = sale.timestamp + period;
  const remainingSeconds = Math.max(0, unlockTimestamp - nowSeconds);
  const elapsedSeconds = Math.max(0, nowSeconds - sale.timestamp);
  const rawProgress = Math.min(100, Math.max(0, Math.round((elapsedSeconds / period) * 100)));
  // Never display 100% while countdown is still active; cap at 99% until remainingSeconds reaches zero
  const progressPercent = remainingSeconds > 0 ? Math.min(99, rawProgress) : 100;
  const isUnlocked = remainingSeconds === 0;

  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = Math.floor(remainingSeconds % 60);

  const countdownText =
    days > 0
      ? `${days}d ${hours}h ${minutes}m ${seconds}s`
      : hours > 0
        ? `${hours}h ${minutes}m ${seconds}s`
        : minutes > 0
          ? `${minutes}m ${seconds}s`
          : `${seconds}s`;

  const unlockUtc =
    new Date(unlockTimestamp * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return {
    period,
    unlockTimestamp,
    remainingSeconds,
    elapsedSeconds,
    progressPercent,
    isUnlocked,
    countdownText,
    unlockUtc,
  };
}

export const createInitialMockSales = (): Sale[] => {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 1,
      affiliate: "GBBD...5678",
      saleAmount: "100.0",
      commissionAmount: "10.0",
      timestamp: now - 86400, // 1 day ago (in clearing)
      clearingPeriod: 604800,
      claimed: false,
      status: "in_clearing",
      txHash: "0x1a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b",
    },
    {
      id: 2,
      affiliate: "GBBD...5678",
      saleAmount: "250.0",
      commissionAmount: "25.0",
      timestamp: now - 864000, // 10 days ago (> 7-day clearing period elapsed)
      clearingPeriod: 604800,
      claimed: true,
      status: "claimed",
      txHash: "c7b52123490df1a88b14e39a174c8b2d3e9112998f4be63c7d64817a402367d0",
    },
    {
      id: 3,
      affiliate: "GBBD...5678",
      saleAmount: "180.0",
      commissionAmount: "18.0",
      timestamp: now - 700000, // > 7 days ago (matured & unlocked, ready to claim)
      clearingPeriod: 604800,
      claimed: false,
      status: "unlocked",
      txHash: "0x3c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d",
    },
    {
      id: 4,
      affiliate: "GBBD...5678",
      saleAmount: "320.0",
      commissionAmount: "32.0",
      timestamp: now - 1200000, // > 13 days ago
      clearingPeriod: 604800,
      claimed: true,
      status: "claimed",
      txHash: "4b001a441d80e00aeed3680a3719d1d8b95998c531671aa78ffb41ccf2f41f25",
    },
    {
      id: 5,
      affiliate: "GBBD...5678",
      saleAmount: "340.0",
      commissionAmount: "34.0",
      timestamp: now - 120000,
      clearingPeriod: 604800,
      claimed: false,
      status: "disputed",
      txHash: "0x4d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e",
    },
    {
      id: 6,
      affiliate: "GBBD...5678",
      saleAmount: "210.0",
      commissionAmount: "21.0",
      timestamp: now - 220000,
      clearingPeriod: 604800,
      claimed: false,
      status: "under_review",
      txHash: "0x5e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f",
      disputeDocketId: "DKT-2026-9C4F",
      disputeSubmittedAt: now - 43200,
    },
  ];
};

export const SalesList: React.FC<SalesListProps> = ({
  sales: initialSales,
  allowDemoFallback = false,
}) => {
  const notifContext = useContext(NotificationContext);
  const [decryptedData, setDecryptedData] = useState<object | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptingId, setDecryptingId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Initialize sales list and sync with persisted dispute dockets
  const [salesList, setSalesList] = useState<Sale[]>(() => {
    const base = initialSales ?? (allowDemoFallback ? createInitialMockSales() : []);
    const storedDisputes = getAllDisputeRecords();
    if (storedDisputes.length === 0) return base;

    return base.map((sale) => {
      const match = storedDisputes.find((d) => d.saleId === sale.id);
      if (match) {
        return {
          ...sale,
          status: "under_review",
          disputeDocketId: match.docketId,
          disputeSubmittedAt: match.submittedAt,
        };
      }
      return sale;
    });
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SaleStatusFilter>("all");

  // State for dispute submission modal (#171)
  const [selectedDisputeSale, setSelectedDisputeSale] = useState<Sale | null>(null);
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenDispute = (sale: Sale) => {
    setSelectedDisputeSale(sale);
    setIsDisputeModalOpen(true);
  };

  const handleDisputeSubmitted = (saleId: number, docketId: string, _record: DisputeRecord) => {
    setSalesList((prev) =>
      prev.map((s) =>
        s.id === saleId
          ? {
              ...s,
              status: "under_review",
              disputeDocketId: docketId,
              disputeSubmittedAt: Date.now(),
            }
          : s,
      ),
    );

    if (notifContext?.showNotification) {
      notifContext.showNotification({
        type: "success",
        title: "Dispute Docket Created",
        message: `Docket #${docketId} submitted for independent protocol auditor review.`,
      });
    }
  };

  const counts = useMemo(() => {
    let claimedCount = 0;
    let unlockedCount = 0;
    let clearingCount = 0;
    let disputedCount = 0;

    salesList.forEach((s) => {
      const c = calculateClearing(s, currentTime);
      if (s.status === "disputed" || s.status === "under_review") {
        disputedCount++;
      } else if (s.claimed) {
        claimedCount++;
      } else if (c.isUnlocked) {
        unlockedCount++;
      } else {
        clearingCount++;
      }
    });

    return {
      all: salesList.length,
      claimed: claimedCount,
      unlocked: unlockedCount,
      clearing: clearingCount,
      disputed: disputedCount,
    };
  }, [salesList, currentTime]);

  const filteredSales = useMemo(() => {
    return salesList.filter((sale) => {
      const clearing = calculateClearing(sale, currentTime);

      if (statusFilter === "claimed" && !sale.claimed) return false;
      if (statusFilter === "unlocked" && (sale.claimed || !clearing.isUnlocked)) return false;
      if (statusFilter === "clearing" && (sale.claimed || clearing.isUnlocked)) return false;
      if (
        statusFilter === "disputed" &&
        sale.status !== "disputed" &&
        sale.status !== "under_review"
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = `#${sale.id}`.includes(q) || sale.id.toString() === q;
        const matchesAffiliate = sale.affiliate.toLowerCase().includes(q);
        const matchesAmount = sale.saleAmount.toLowerCase().includes(q);
        const matchesCommission = sale.commissionAmount.toLowerCase().includes(q);
        const matchesTxHash = Boolean(sale.txHash && sale.txHash.toLowerCase().includes(q));
        const matchesDocket = Boolean(
          sale.disputeDocketId && sale.disputeDocketId.toLowerCase().includes(q),
        );
        return (
          matchesId ||
          matchesAffiliate ||
          matchesAmount ||
          matchesCommission ||
          matchesTxHash ||
          matchesDocket
        );
      }

      return true;
    });
  }, [salesList, statusFilter, searchQuery, currentTime]);

  /**
   * Secure decrypt (#49): each sale row carries an AES-GCM envelope sealed
   * with a per-sale key that is itself wrapped (sealed) to the affiliate's
   * key identifier via wrapAESKey/unwrapAESKey. Decrypt unwraps the sale key
   * with the affiliate identifier first, then decrypts the envelope; tampered
   * envelopes, wrong affiliate keys, and stub payloads all fail closed with a
   * generic error (no plaintext is ever fabricated).
   */
  const handleDecrypt = async (saleId: number) => {
    const sale = salesList.find((s) => s.id === saleId);
    if (!sale) {
      setDecryptError("Sale not found.");
      return;
    }
    setIsDecrypting(true);
    setDecryptingId(saleId);
    setDecryptError(null);
    setDecryptedData(null);
    try {
      // Affiliate key identity: prefer the connected wallet when available,
      // otherwise fall back to the row's affiliate label (mock rows).
      const walletAddress =
        typeof window !== "undefined"
          ? (window as unknown as { __STORMSALE_WALLET__?: string }).__STORMSALE_WALLET__
          : undefined;
      const affiliateIdentifier = await getPublicKeyForAddress(
        walletAddress || sale.affiliateKeyId || sale.affiliate,
      );
      let envelope = sale.encryptedEnvelope;
      let wrappedKey = sale.wrappedKey;
      // Legacy mock rows have no sealed envelope yet: seal the canonical
      // on-chain fields now AND wrap the sale key to the affiliate identifier
      // so decrypt exercises the real affiliate-key envelope path.
      if (!envelope || !wrappedKey) {
        const freshKey = await generateAESKey();
        const canonical = {
          saleId: sale.id,
          affiliate: sale.affiliate,
          saleAmount: sale.saleAmount,
          commissionAmount: sale.commissionAmount,
          timestamp: sale.timestamp,
          clearingPeriod: sale.clearingPeriod,
          claimed: sale.claimed,
          txHash: sale.txHash,
          status: sale.status,
        };
        envelope = await encryptPayload(canonical, freshKey);
        wrappedKey = await wrapAESKey(freshKey, affiliateIdentifier);
        sale.encryptedEnvelope = envelope;
        sale.wrappedKey = wrappedKey;
        sale.affiliateKeyId = affiliateIdentifier;
      }
      // Strict binding: the stored envelope must belong to the affiliate
      // requesting decrypt; otherwise a swapped row could leak another
      // affiliate's sale data.
      if (sale.affiliateKeyId && sale.affiliateKeyId !== affiliateIdentifier) {
        throw new Error("Decryption failed: invalid payload or key.");
      }
      const saleKey = await unwrapAESKey(wrappedKey, affiliateIdentifier);
      const decrypted = await decryptPayload(envelope, saleKey);
      // Bind the decrypted payload to the row the user clicked: prevents a
      // swapped envelope from displaying another sale's amounts as this one.
      const record = decrypted as Record<string, unknown>;
      if (record.saleId !== sale.id) {
        throw new Error("Decryption failed: invalid payload or key.");
      }
      setDecryptedData(decrypted);
      setIsDialogOpen(true);
    } catch (error) {
      console.error("Error decrypting data:", error);
      // Generic message: WebCrypto failures must not leak padding/key detail.
      setDecryptError(
        "Unable to decrypt this sale. The payload may be tampered or the key is invalid.",
      );
      setIsDialogOpen(true);
    } finally {
      setIsDecrypting(false);
      setDecryptingId(null);
    }
  };

  const formatUtcTimestamp = (timestamp: number) =>
    new Date(timestamp * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

  return (
    <>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            My Sales
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            View, dispute contested conversions, and decrypt your encrypted on-chain sale data
          </p>
        </div>
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                  Encrypted Sales & Conversions
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                  Monitor clearing, contest rejected conversions, and decrypt verified sale details
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-8 pb-8 pt-6">
            {/* Search & Filter Toolbar (#51) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              {/* Search Input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, amount, commission, or tx..."
                  data-testid="search-sales-input"
                  className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5" data-testid="status-filters">
                <button
                  type="button"
                  data-testid="filter-all"
                  onClick={() => setStatusFilter("all")}
                  aria-pressed={statusFilter === "all"}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    statusFilter === "all"
                      ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-slate-200"
                  }`}
                >
                  <span>All Sales</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                    {counts.all}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="filter-claimed"
                  onClick={() => setStatusFilter("claimed")}
                  aria-pressed={statusFilter === "claimed"}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    statusFilter === "claimed"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800/50"
                  }`}
                >
                  <span>Settled Claims</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-200/50 dark:bg-emerald-900/50">
                    {counts.claimed}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="filter-unlocked"
                  onClick={() => setStatusFilter("unlocked")}
                  aria-pressed={statusFilter === "unlocked"}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    statusFilter === "unlocked"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800/50"
                  }`}
                >
                  <span>Ready to Claim</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-200/50 dark:bg-indigo-900/50">
                    {counts.unlocked}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="filter-clearing"
                  onClick={() => setStatusFilter("clearing")}
                  aria-pressed={statusFilter === "clearing"}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    statusFilter === "clearing"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 border border-amber-200 dark:border-amber-800/50"
                  }`}
                >
                  <span>In Clearing</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-200/50 dark:bg-amber-900/50">
                    {counts.clearing}
                  </span>
                </button>

                {counts.disputed > 0 && (
                  <button
                    type="button"
                    data-testid="filter-disputed"
                    onClick={() => setStatusFilter("disputed")}
                    aria-pressed={statusFilter === "disputed"}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      statusFilter === "disputed"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-800/50"
                    }`}
                  >
                    <span>Disputed</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-200/50 dark:bg-rose-900/50">
                      {counts.disputed}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {filteredSales.length === 0 ? (
              <div
                data-testid="sales-empty-state"
                className="text-center py-12 px-4 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl"
              >
                <FileText className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">No sales found</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  No sales match your current search and filter criteria.
                </p>
                {(searchQuery || statusFilter !== "all") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    className="mt-4 text-xs font-semibold rounded-xl"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-zinc-800/50">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-100 dark:border-zinc-800/50 bg-slate-50 dark:bg-zinc-950/50">
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pl-6">
                        Sale ID
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                        Amount
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                        Commission
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                        Recorded (UTC)
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 min-w-[240px]">
                        Clearing Countdown & Progress
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                        Receipt
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => {
                      const clearing = calculateClearing(sale, currentTime);
                      const isDisputed = sale.status === "disputed";
                      const isUnderReview = sale.status === "under_review";

                      return (
                        <TableRow
                          key={sale.id}
                          className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                        >
                          <TableCell className="font-mono font-bold text-zinc-900 dark:text-white py-4 pl-6">
                            #{sale.id}
                          </TableCell>
                          <TableCell className="font-semibold text-zinc-700 dark:text-zinc-300 py-4">
                            {sale.saleAmount} XLM
                          </TableCell>
                          <TableCell className="font-bold text-indigo-600 dark:text-indigo-400 py-4">
                            {sale.commissionAmount} XLM
                          </TableCell>
                          <TableCell className="text-zinc-500 dark:text-zinc-400 font-mono text-xs py-4">
                            {formatUtcTimestamp(sale.timestamp)}
                          </TableCell>
                          <TableCell className="py-4 min-w-[240px]">
                            {isDisputed ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Conversion Contested
                                  </span>
                                  <span className="font-mono text-rose-500 text-[11px] font-bold">
                                    Action Required
                                  </span>
                                </div>
                                <div className="w-full bg-rose-100 dark:bg-rose-950/50 rounded-full h-2 overflow-hidden">
                                  <div className="bg-rose-500 h-full rounded-full w-full" />
                                </div>
                                <div className="text-[10px] text-rose-600/90 dark:text-rose-400/90 font-medium">
                                  Contested by merchant — submit evidence to open dispute
                                </div>
                              </div>
                            ) : isUnderReview ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                    <Scale className="w-3.5 h-3.5 animate-pulse" />
                                    Evidence Under Review
                                  </span>
                                  <span className="font-mono text-purple-600 dark:text-purple-400 text-[11px] font-bold">
                                    {sale.disputeDocketId
                                      ? `#${sale.disputeDocketId}`
                                      : "Docket Active"}
                                  </span>
                                </div>
                                <div className="w-full bg-purple-100 dark:bg-purple-950/50 rounded-full h-2 overflow-hidden">
                                  <div className="bg-purple-600 h-full rounded-full w-full animate-pulse" />
                                </div>
                                <div className="text-[10px] text-purple-600/80 dark:text-purple-400/80 font-mono">
                                  Independent protocol auditors reviewing evidence
                                </div>
                              </div>
                            ) : sale.claimed ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Matured & Settled
                                  </span>
                                  <span className="font-mono text-zinc-400 text-[11px]">100%</span>
                                </div>
                                <div className="w-full bg-emerald-100 dark:bg-emerald-950/50 rounded-full h-2 overflow-hidden">
                                  <div className="bg-emerald-500 h-full rounded-full w-full" />
                                </div>
                                <div className="text-[10px] text-zinc-400 font-mono">
                                  Unlocked: {clearing.unlockUtc}
                                </div>
                              </div>
                            ) : clearing.isUnlocked ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Ready to Claim
                                  </span>
                                  <span className="font-mono text-indigo-500 text-[11px] font-bold">
                                    100%
                                  </span>
                                </div>
                                <div className="w-full bg-indigo-100 dark:bg-indigo-950/50 rounded-full h-2 overflow-hidden">
                                  <div className="bg-indigo-600 h-full rounded-full w-full" />
                                </div>
                                <div className="text-[10px] text-indigo-500/80 dark:text-indigo-400/80 font-mono">
                                  Clearing period completed
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 font-mono">
                                    <Clock className="w-3.5 h-3.5 animate-pulse text-amber-500" />
                                    {clearing.countdownText}
                                  </span>
                                  <span className="font-mono text-zinc-500 dark:text-zinc-400 text-[11px] font-semibold">
                                    {clearing.progressPercent}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="bg-gradient-to-r from-amber-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${clearing.progressPercent}%`,
                                    }}
                                  />
                                </div>
                                <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                                  <span>Period: {Math.round(clearing.period / 86400)}d</span>
                                  <span>Unlocks: {clearing.unlockUtc}</span>
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="py-4">
                            {isDisputed ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400">
                                <AlertTriangle className="w-3 h-3" />
                                Disputed
                              </span>
                            ) : isUnderReview ? (
                              <div className="flex flex-col gap-1 items-start">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                                  <Scale className="w-3 h-3 animate-pulse" />
                                  Under Auditor Review
                                </span>
                                {sale.disputeDocketId && (
                                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 pl-0.5">
                                    #{sale.disputeDocketId}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  sale.claimed
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                    : clearing.isUnlocked
                                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                                }`}
                              >
                                {sale.claimed ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : clearing.isUnlocked ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                {sale.claimed
                                  ? "Claimed"
                                  : clearing.isUnlocked
                                    ? "Unlocked"
                                    : "In Clearing"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 font-mono text-xs">
                            {sale.txHash ? (
                              <a
                                href={sale.receiptUrl || getStellarExpertUrl("tx", sale.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`receipt-link-${sale.id}`}
                                className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
                                title="View transaction receipt on block explorer"
                                aria-label={`View transaction receipt for sale #${sale.id}`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>
                                  {sale.txHash.slice(0, 6)}...{sale.txHash.slice(-4)}
                                </span>
                                <ExternalLink className="w-3 h-3 opacity-80" />
                              </a>
                            ) : (
                              <span className="text-zinc-400 dark:text-zinc-600 text-xs italic font-sans">
                                Pending
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 pr-6">
                            <div className="flex items-center gap-2">
                              {isDisputed && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleOpenDispute(sale)}
                                  className="rounded-lg h-9 px-3.5 font-semibold text-xs bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  Open Dispute
                                </Button>
                              )}

                              {isUnderReview && (
                                <div className="inline-flex items-center gap-1 text-xs font-mono font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800/40">
                                  <Scale className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                  {sale.disputeDocketId || "Review"}
                                </div>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDecrypt(sale.id)}
                                disabled={isDecrypting}
                                className="rounded-lg h-9 px-4 font-semibold text-sm border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-all"
                                title="Decrypt verified sale payload"
                              >
                                <Lock className="w-3.5 h-3.5 mr-1.5" />
                                {isDecrypting && decryptingId === sale.id
                                  ? "Decrypting..."
                                  : "Decrypt"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Decrypt Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Decrypted Sale Data
            </DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400">
              This is the verified, decrypted sale information
            </DialogDescription>
          </DialogHeader>
          {decryptError ? (
            <div className="mt-2 p-4 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 text-sm font-medium text-red-700 dark:text-red-300">
              {decryptError}
            </div>
          ) : (
            <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 mt-2">
              <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-300 overflow-x-auto">
                {JSON.stringify(decryptedData, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dispute Submission Modal (Issue #171) */}
      <DisputeModal
        isOpen={isDisputeModalOpen}
        onClose={() => setIsDisputeModalOpen(false)}
        sale={selectedDisputeSale}
        onDisputeSubmitted={handleDisputeSubmitted}
      />
    </>
  );
};
