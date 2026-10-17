import React, { useState, useMemo, useEffect, useCallback, useContext } from "react";
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
import { decryptPayload } from "../../lib/crypto";
import { getStellarExplorerLink, verifyHorizonConnectivity } from "../../utils/network";
import { STELLAR_CONFIG } from "../../config/stellar";
import { Web3Context } from "../../context/Web3Context";
import {
  Shield,
  Lock,
  CheckCircle2,
  Clock,
  Search,
  ExternalLink,
  Receipt,
  Download,
  Copy,
  Check,
  RefreshCw,
  TrendingUp,
  ArrowUpDown,
  AlertCircle,
  XCircle,
} from "lucide-react";

export interface SaleRecord {
  id: number;
  campaignId?: number;
  campaignName?: string;
  campaignAddress?: string;
  affiliate: string;
  saleAmount: string;
  commissionAmount: string;
  timestamp: number;
  status?: "claimed" | "pending" | "processing";
  txHash?: string;
  ledgerSequence?: number;
  memo?: string;
  feeXlm?: string;
  clearingPeriod?: number;
  claimed?: boolean;
}

export type Sale = SaleRecord;

export interface SalesListProps {
  sales?: Sale[];
}

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

  let countdownText = "";
  if (days > 0) {
    countdownText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  } else if (hours > 0) {
    countdownText = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    countdownText = `${minutes}m ${seconds}s`;
  } else {
    countdownText = `${seconds}s`;
  }

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

export type SortOption = "newest" | "oldest" | "highest_commission" | "highest_amount";

export const escapeCsvField = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  let str = String(value);

  // Neutralize spreadsheet formula injection characters (=, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If contains double quotes, commas, or newlines, escape quotes by doubling and wrap in quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

export function filterAndSortSales(
  sales: SaleRecord[],
  options: {
    searchQuery?: string;
    statusFilter?: "all" | "claimed" | "pending" | "processing";
    sortBy?: SortOption;
  },
): SaleRecord[] {
  const { searchQuery = "", statusFilter = "all", sortBy = "newest" } = options;

  return sales
    .filter((sale) => {
      const currentStatus = sale.status || (sale.claimed ? "claimed" : "pending");
      // Status filter
      if (statusFilter !== "all" && currentStatus !== statusFilter) {
        return false;
      }

      // Search Query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchId = sale.id.toString().includes(query) || `#${sale.id}`.includes(query);
        const matchCampaign = sale.campaignName
          ? sale.campaignName.toLowerCase().includes(query)
          : false;
        const matchAddress = sale.campaignAddress
          ? sale.campaignAddress.toLowerCase().includes(query)
          : false;
        const matchAffiliate = sale.affiliate
          ? sale.affiliate.toLowerCase().includes(query)
          : false;
        const matchTx = sale.txHash ? sale.txHash.toLowerCase().includes(query) : false;
        return matchId || matchCampaign || matchAddress || matchAffiliate || matchTx;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === "newest") return b.timestamp - a.timestamp;
      if (sortBy === "oldest") return a.timestamp - b.timestamp;
      if (sortBy === "highest_commission") {
        return parseFloat(b.commissionAmount) - parseFloat(a.commissionAmount);
      }
      if (sortBy === "highest_amount") {
        return parseFloat(b.saleAmount) - parseFloat(a.saleAmount);
      }
      return 0;
    });
}

export const SALES_LEDGER: SaleRecord[] = [
  {
    id: 101,
    campaignId: 1,
    campaignName: "Tech Gadgets Pro",
    campaignAddress: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    affiliate: "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6",
    saleAmount: "100.0",
    commissionAmount: "10.0",
    timestamp: Math.floor(Date.now() / 1000 - 86400 * 2), // 2 days ago
    status: "claimed",
    claimed: true,
    clearingPeriod: 604800,
    txHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    ledgerSequence: 5184920,
    memo: "StormSale-Commission-#101",
    feeXlm: "0.00001",
  },
  {
    id: 102,
    campaignId: 2,
    campaignName: "Web3 Masterclass 2026",
    campaignAddress: "CABAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAFNSZ",
    affiliate: "GADNSF7745EV3D5IRWBRN6OYXMR2YYAEGLDMULGTGDKKSBVXWMMVNPW6",
    saleAmount: "250.0",
    commissionAmount: "25.0",
    timestamp: Math.floor(Date.now() / 1000 - 86400 * 5), // 5 days ago
    status: "claimed",
    claimed: true,
    clearingPeriod: 604800,
    txHash: "8a6b12f45c9284d72856a9082cb348d2b295e4d94b08faec2389dc42a8b92d6e",
    ledgerSequence: 5182104,
    memo: "StormSale-Commission-#102",
    feeXlm: "0.00001",
  },
  {
    id: 103,
    campaignId: 3,
    campaignName: "Crypto Security Hardware",
    campaignAddress: "CABQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGAYDAMBQGCK3",
    affiliate: "GDXYHWE3GQR7TMMHV77NLWHSTSQ5JNUIUBN2LK2O2NXFFEKJLVYPAUCJ",
    saleAmount: "450.0",
    commissionAmount: "45.0",
    timestamp: Math.floor(Date.now() / 1000 - 86400 * 9), // 9 days ago
    status: "claimed",
    claimed: true,
    clearingPeriod: 604800,
    txHash: "3f9821a9c372e90b8417c469b4e1837920ab4d9528d84172f8a846102f9e54a1",
    ledgerSequence: 5179044,
    memo: "StormSale-Commission-#103",
    feeXlm: "0.00001",
  },
  {
    id: 104,
    campaignId: 4,
    campaignName: "DeFi Yield Aggregator",
    campaignAddress: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    affiliate: "GDXYHWE3GQR7TMMHV77NLWHSTSQ5JNUIUBN2LK2O2NXFFEKJLVYPAUCJ",
    saleAmount: "800.0",
    commissionAmount: "80.0",
    timestamp: Math.floor(Date.now() / 1000 - 86400 * 1), // 1 day ago
    status: "pending",
    claimed: false,
    clearingPeriod: 604800,
  },
  {
    id: 105,
    campaignId: 1,
    campaignName: "Tech Gadgets Pro",
    campaignAddress: "CAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQC526",
    affiliate: "GDLQ3L2EV3JLBDOQCLL2TBF35TOHAZRTWM7QMP7XYQJOF4YBTJXMGQ7X",
    saleAmount: "150.0",
    commissionAmount: "15.0",
    timestamp: Math.floor(Date.now() / 1000 - 3600 * 3), // 3 hours ago
    status: "processing",
    claimed: false,
    clearingPeriod: 604800,
    txHash: "f145c229987a02b489d8134bb8839217cae981274092b34914a821eef01492b4",
    ledgerSequence: 5188402,
    memo: "StormSale-Commission-#105",
    feeXlm: "0.00001",
  },
];

export const isValidStellarAddress = (addr?: string): boolean => {
  if (!addr) return false;
  return /^[GC][A-Z2-7]{55}$/.test(addr);
};

export const isValidTxHash = (hash?: string): boolean => {
  if (!hash) return false;
  return /^[a-fA-F0-9]{64}$/.test(hash);
};

export const formatUtcTimestamp = (timestamp: number) =>
  new Date(timestamp * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export const formatTimestamp = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const SalesList: React.FC<SalesListProps> = ({ sales: initialSales }) => {
  const web3 = useContext(Web3Context);
  const userAddress = web3?.userAddress;

  const [decryptedData, setDecryptedData] = useState<object | null>(null);
  const [isDecryptDialogOpen, setIsDecryptDialogOpen] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(() => Math.floor(Date.now() / 1000));

  // Receipt Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<SaleRecord | null>(null);
  const [copiedTxHash, setCopiedTxHash] = useState(false);
  const [receiptTxDetails, setReceiptTxDetails] = useState<{
    successful?: boolean;
    ledger?: number;
    feeXlm?: string;
    loading?: boolean;
  }>({});

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "claimed" | "pending" | "processing">(
    "all",
  );
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [salesLedger, setSalesLedger] = useState<SaleRecord[]>(() => initialSales || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horizonStatus, setHorizonStatus] = useState<"checking" | "synchronized" | "offline">(
    "checking",
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    verifyHorizonConnectivity().then((isOnline) => {
      setHorizonStatus(isOnline ? "synchronized" : "offline");
    });
  }, []);

  const loadLedger = useCallback(async () => {
    if (initialSales) {
      setSalesLedger(initialSales);
      return;
    }

    if (!userAddress) {
      setSalesLedger([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${STELLAR_CONFIG.horizonUrl}/accounts/${userAddress}/payments?order=desc&limit=20`,
      );
      if (!res.ok) {
        throw new Error(`Horizon HTTP ${res.status}`);
      }
      const data = await res.json();
      const records: SaleRecord[] = (data._embedded?.records || [])
        .filter((rec: any) => {
          if (rec.from && !isValidStellarAddress(rec.from)) return false;
          if (rec.to && !isValidStellarAddress(rec.to)) return false;
          return true;
        })
        .map((rec: any, idx: number) => {
          const fromAddr = isValidStellarAddress(rec.from) ? rec.from : STELLAR_CONFIG.contractId;
          const toAddr = isValidStellarAddress(rec.to) ? rec.to : userAddress;
          const isRecipient = toAddr === userAddress;
          const commission = parseFloat(rec.amount || "0");
          const txHash = isValidTxHash(rec.transaction_hash) ? rec.transaction_hash : undefined;
          return {
            id: parseInt(rec.id?.slice(-5) || String(100 + idx), 10),
            campaignId: 1,
            campaignName: isRecipient ? "Affiliate Payout Settlement" : "Campaign Settlement",
            campaignAddress: fromAddr,
            affiliate: toAddr,
            saleAmount: (commission * 10).toFixed(1),
            commissionAmount: rec.amount || "0.0",
            timestamp: Math.floor(new Date(rec.created_at).getTime() / 1000),
            status: "claimed",
            claimed: true,
            clearingPeriod: DEFAULT_CLEARING_PERIOD,
            txHash,
            memo: `StormSale-Commission-#${rec.id?.slice(-4) || idx}`,
          };
        });
      setSalesLedger(records);
      setHorizonStatus("synchronized");
    } catch (err) {
      console.warn("Could not load Horizon settlement records:", err);
      setError("Failed to fetch on-chain settlement records from Horizon node.");
      setHorizonStatus("offline");
    } finally {
      setIsLoading(false);
    }
  }, [initialSales, userAddress]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Fetch real transaction details from Horizon for receipt modal
  useEffect(() => {
    if (!selectedReceipt || !selectedReceipt.txHash) {
      setReceiptTxDetails({});
      return;
    }

    let isMounted = true;
    setReceiptTxDetails({ loading: true });

    fetch(`${STELLAR_CONFIG.horizonUrl}/transactions/${selectedReceipt.txHash}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Horizon transaction query failed");
        const data = await res.json();
        if (isMounted) {
          const feeStroops = Number(data.fee_charged || 0);
          setReceiptTxDetails({
            successful: data.successful,
            ledger: data.ledger,
            feeXlm: (feeStroops / 10_000_000).toFixed(5),
            loading: false,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setReceiptTxDetails({
            loading: false,
            successful: undefined,
            ledger: undefined,
            feeXlm: undefined,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedReceipt]);

  // Filtering and Searching using pure function
  const filteredSales = useMemo(() => {
    return filterAndSortSales(salesLedger, { searchQuery, statusFilter, sortBy });
  }, [salesLedger, searchQuery, statusFilter, sortBy]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalVolume = salesLedger.reduce((acc, s) => acc + parseFloat(s.saleAmount), 0);
    const claimedCommission = salesLedger
      .filter((s) => s.status === "claimed" || s.claimed)
      .reduce((acc, s) => acc + parseFloat(s.commissionAmount), 0);
    const pendingCommission = salesLedger
      .filter((s) => !s.claimed && (s.status === "pending" || s.status === "processing"))
      .reduce((acc, s) => acc + parseFloat(s.commissionAmount), 0);
    const totalVerifiedClaims = salesLedger.filter(
      (s) => (s.status === "claimed" || s.claimed) && s.txHash,
    ).length;

    return {
      totalVolume: totalVolume.toFixed(2),
      claimedCommission: claimedCommission.toFixed(2),
      pendingCommission: pendingCommission.toFixed(2),
      totalVerifiedClaims,
    };
  }, [salesLedger]);

  const handleDecrypt = async (_saleId: number) => {
    setIsDecrypting(true);
    try {
      const decrypted = await decryptPayload("STUB_ENCRYPTED_PAYLOAD", {} as CryptoKey);
      setDecryptedData(decrypted);
      setIsDecryptDialogOpen(true);
    } catch (error) {
      console.error("Error decrypting data:", error);
    } finally {
      setIsDecrypting(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTxHash(true);
      setTimeout(() => setCopiedTxHash(false), 2000);
    } catch (err) {
      console.error("Failed to copy transaction hash:", err);
    }
  };

  const exportLedgerCSV = () => {
    const headers = [
      "Sale ID",
      "Campaign Name",
      "Campaign Address",
      "Sale Amount (XLM)",
      "Commission (XLM)",
      "Status",
      "Date",
      "Transaction Hash",
      "Ledger Sequence",
      "Block Explorer Link",
    ];

    const rows = filteredSales.map((s) => [
      escapeCsvField(s.id),
      escapeCsvField(s.campaignName || "StormSale Campaign"),
      escapeCsvField(s.campaignAddress || "N/A"),
      escapeCsvField(s.saleAmount),
      escapeCsvField(s.commissionAmount),
      escapeCsvField(s.status || (s.claimed ? "claimed" : "pending")),
      escapeCsvField(new Date(s.timestamp * 1000).toISOString()),
      escapeCsvField(s.txHash || "N/A"),
      escapeCsvField(s.ledgerSequence ?? "N/A"),
      escapeCsvField(s.txHash ? getStellarExplorerLink("tx", s.txHash) : "N/A"),
    ]);

    const csvContent = [
      headers.map(escapeCsvField).join(","),
      ...rows.map((e) => e.join(",")),
    ].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `StormSale_Affiliate_Ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Auditable Payout & History Ledger
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                Verified Ledger
              </span>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium text-xs sm:text-sm">
              Cryptographically verified history of all affiliate conversions, claims, and Stellar
              Explorer receipts
            </p>
          </div>
          <Button
            onClick={exportLedgerCSV}
            variant="outline"
            className="rounded-xl px-4 py-2 border-slate-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4 text-zinc-500" />
            Export CSV
          </Button>
        </div>

        {/* Ledger Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Total Sales Volume
                </p>
                <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                  {metrics.totalVolume} <span className="text-xs font-bold text-zinc-400">XLM</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                <TrendingUp className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Settled Commissions
                </p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {metrics.claimedCommission}{" "}
                  <span className="text-xs font-bold text-emerald-500">XLM</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Pending in Escrow
                </p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {metrics.pendingCommission}{" "}
                  <span className="text-xs font-bold text-amber-500">XLM</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Clock className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-zinc-900/70 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  On-Chain Verified
                </p>
                <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                  {metrics.totalVerifiedClaims}{" "}
                  <span className="text-xs font-bold text-zinc-400">Transactions</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Shield className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search, Filters, and Table Card */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
          <CardHeader className="pt-8 px-6 sm:px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white">
                  Commission Payout History
                </CardTitle>
                <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs sm:text-sm">
                  Searchable and auditable transactions synced with the Soroban smart contract
                  ledger
                </CardDescription>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl text-xs font-bold">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "all"
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  All ({salesLedger.length})
                </button>
                <button
                  onClick={() => setStatusFilter("claimed")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "claimed"
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Claimed ({salesLedger.filter((s) => s.status === "claimed" || s.claimed).length})
                </button>
                <button
                  onClick={() => setStatusFilter("pending")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "pending"
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Pending ({salesLedger.filter((s) => s.status === "pending" && !s.claimed).length})
                </button>
                <button
                  onClick={() => setStatusFilter("processing")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "processing"
                      ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  Processing ({salesLedger.filter((s) => s.status === "processing").length})
                </button>
              </div>
            </div>

            {/* Search Input & Sort Selector */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search by Sale ID, Campaign, Tx Hash, or Contract Address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950 text-xs font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <ArrowUpDown className="w-4 h-4 text-zinc-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950 text-xs font-semibold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-auto"
                >
                  <option value="newest">Sort: Newest First</option>
                  <option value="oldest">Sort: Oldest First</option>
                  <option value="highest_commission">Sort: Highest Commission</option>
                  <option value="highest_amount">Sort: Highest Sale Amount</option>
                </select>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-6 sm:px-8 pb-8 pt-6">
            <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-zinc-800/50">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-100 dark:border-zinc-800/50 bg-slate-50/80 dark:bg-zinc-950/70">
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pl-6">
                      Sale & Campaign
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                      Sale Amount
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
                      Explorer Link
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6 text-right">
                      Receipt & Audit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-zinc-400 text-xs">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                          <span>Synchronizing settlement ledger from Stellar Horizon...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-xs">
                        <div className="flex flex-col items-center justify-center gap-2 text-rose-500">
                          <AlertCircle className="w-5 h-5" />
                          <span>{error}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadLedger()}
                            className="mt-2 text-xs"
                          >
                            Retry Sync
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : !userAddress && !initialSales ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-zinc-400 text-xs">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Shield className="w-6 h-6 text-zinc-400" />
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            Connect Wallet to Inspect Ledger
                          </span>
                          <span className="text-zinc-400">
                            Connect your Stellar account to query on-chain settlement payouts
                            directly from Horizon.
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-zinc-400 text-xs">
                        No transactions found matching your criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSales.map((sale) => {
                      const clearing = calculateClearing(sale, currentTime);
                      const isClaimed = sale.claimed || sale.status === "claimed";

                      return (
                        <TableRow
                          key={sale.id}
                          className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                        >
                          {/* Sale & Campaign */}
                          <TableCell className="py-4 pl-6">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-xs text-zinc-900 dark:text-white">
                                  #{sale.id}
                                </span>
                                <span className="font-bold text-xs text-zinc-800 dark:text-zinc-200">
                                  {sale.campaignName || "StormSale Campaign"}
                                </span>
                              </div>
                              <span className="font-mono text-[11px] text-zinc-400 mt-0.5 truncate max-w-[180px]">
                                {sale.campaignAddress || sale.affiliate}
                              </span>
                            </div>
                          </TableCell>

                          {/* Amount */}
                          <TableCell className="font-semibold text-xs text-zinc-700 dark:text-zinc-300 py-4">
                            {sale.saleAmount} XLM
                          </TableCell>

                          {/* Commission */}
                          <TableCell className="font-extrabold text-xs text-indigo-600 dark:text-indigo-400 py-4">
                            +{sale.commissionAmount} XLM
                          </TableCell>

                          {/* Recorded Date (UTC) */}
                          <TableCell className="text-zinc-500 dark:text-zinc-400 text-xs font-mono py-4 whitespace-nowrap">
                            {formatUtcTimestamp(sale.timestamp)}
                          </TableCell>

                          {/* Clearing Countdown & Progress */}
                          <TableCell className="py-4 min-w-[240px]">
                            {isClaimed ? (
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

                          {/* Status */}
                          <TableCell className="py-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isClaimed
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                                  : sale.status === "processing"
                                    ? "bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300"
                                    : clearing.isUnlocked
                                      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                              }`}
                            >
                              {isClaimed ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              ) : sale.status === "processing" ? (
                                <RefreshCw className="w-3 h-3 text-purple-600 dark:text-purple-400 animate-spin" />
                              ) : clearing.isUnlocked ? (
                                <CheckCircle2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              ) : (
                                <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              )}
                              {isClaimed
                                ? "Claimed"
                                : sale.status === "processing"
                                  ? "Processing"
                                  : clearing.isUnlocked
                                    ? "Unlocked"
                                    : "In Clearing"}
                            </span>
                          </TableCell>

                          {/* Block Explorer Link (#51) */}
                          <TableCell className="py-4">
                            {sale.txHash ? (
                              <a
                                href={getStellarExplorerLink("tx", sale.txHash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors group"
                                title="View on Stellar Expert"
                              >
                                <span>
                                  {sale.txHash.slice(0, 6)}...{sale.txHash.slice(-4)}
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                              </a>
                            ) : (
                              <span className="text-zinc-400 text-xs italic">
                                In Clearing Escrow
                              </span>
                            )}
                          </TableCell>

                          {/* Actions: View Receipt (#51) & Decrypt */}
                          <TableCell className="py-4 pr-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              {isClaimed && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedReceipt(sale)}
                                  className="rounded-lg h-8 px-3 font-semibold text-xs border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all flex items-center gap-1"
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  View Receipt
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDecrypt(sale.id)}
                                disabled={isDecrypting}
                                className="rounded-lg h-8 px-3 font-semibold text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all flex items-center gap-1"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                {isDecrypting ? "Decrypting..." : "Decrypt"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between items-center text-xs text-zinc-400 mt-4 px-1">
              <span>
                Showing {filteredSales.length} of {salesLedger.length} ledger entries
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                {horizonStatus === "synchronized" ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Stellar Testnet Horizon Node: Synchronized
                  </span>
                ) : horizonStatus === "checking" ? (
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Connecting to Horizon Node...
                  </span>
                ) : (
                  <span className="text-amber-500 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Horizon Node: Offline
                  </span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* On-Chain Transaction Receipt Modal (#51) */}
      <Dialog
        open={selectedReceipt !== null}
        onOpenChange={(open) => !open && setSelectedReceipt(null)}
      >
        <DialogContent className="sm:max-w-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <DialogHeader className="pb-4 border-b border-slate-100 dark:border-zinc-800/60">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold text-zinc-900 dark:text-white">
                  Stellar Payout Receipt
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Cryptographically settled transaction on the Stellar distributed ledger
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedReceipt && (
            <div className="py-4 space-y-4">
              {/* Receipt Status Banner */}
              <div
                className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                  receiptTxDetails.successful === false
                    ? "bg-rose-50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20"
                    : receiptTxDetails.successful === true
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20"
                      : "bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  {receiptTxDetails.successful === false ? (
                    <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
                  ) : receiptTxDetails.successful === true ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  )}
                  <div>
                    <p
                      className={`text-xs font-black ${
                        receiptTxDetails.successful === false
                          ? "text-rose-900 dark:text-rose-300"
                          : receiptTxDetails.successful === true
                            ? "text-emerald-900 dark:text-emerald-300"
                            : "text-amber-900 dark:text-amber-300"
                      }`}
                    >
                      {receiptTxDetails.successful === false
                        ? "FAILED - TRANSACTION REVERTED"
                        : receiptTxDetails.successful === true
                          ? "SUCCESS - TRANSACTION COMMITTED"
                          : "PENDING - AWAITING CONFIRMATION"}
                    </p>
                    <p
                      className={`text-[11px] ${
                        receiptTxDetails.successful === false
                          ? "text-rose-700 dark:text-rose-400/80"
                          : receiptTxDetails.successful === true
                            ? "text-emerald-700 dark:text-emerald-400/80"
                            : "text-amber-700 dark:text-amber-400/80"
                      }`}
                    >
                      {receiptTxDetails.ledger
                        ? `Ledger Sequence #${receiptTxDetails.ledger}`
                        : selectedReceipt.ledgerSequence
                          ? `Ledger Sequence #${selectedReceipt.ledgerSequence}`
                          : "Ledger Sequence: Pending confirmation"}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-mono font-bold px-2 py-1 rounded-lg bg-white/80 dark:bg-zinc-900/80 ${
                    receiptTxDetails.successful === false
                      ? "text-rose-800 dark:text-rose-300"
                      : receiptTxDetails.successful === true
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-300"
                  }`}
                >
                  {receiptTxDetails.loading
                    ? "Verifying..."
                    : receiptTxDetails.successful === false
                      ? "Reverted"
                      : receiptTxDetails.successful === true
                        ? "On-Chain Verified"
                        : "Unverified"}
                </span>
              </div>

              {/* Settlement Breakdown */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Campaign
                  </span>
                  <p className="font-bold text-zinc-900 dark:text-white mt-0.5 truncate">
                    {selectedReceipt.campaignName || "StormSale Campaign"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Sale Reference
                  </span>
                  <p className="font-mono font-bold text-zinc-900 dark:text-white mt-0.5">
                    Sale #{selectedReceipt.id}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Gross Sale Value
                  </span>
                  <p className="font-semibold text-zinc-700 dark:text-zinc-300 mt-0.5">
                    {selectedReceipt.saleAmount} XLM
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Commission Paid
                  </span>
                  <p className="font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    +{selectedReceipt.commissionAmount} XLM
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Network Fee
                  </span>
                  <p className="font-mono text-zinc-500 mt-0.5">
                    {receiptTxDetails.feeXlm
                      ? `${receiptTxDetails.feeXlm} XLM`
                      : selectedReceipt.feeXlm
                        ? `${selectedReceipt.feeXlm} XLM`
                        : "Not available on-chain"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Settlement Time
                  </span>
                  <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                    {formatTimestamp(selectedReceipt.timestamp)}
                  </p>
                </div>
              </div>

              {/* Account Routing Details */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Campaign Source Contract
                  </span>
                  <p className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl border border-slate-100 dark:border-zinc-800 break-all">
                    {selectedReceipt.campaignAddress || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Recipient Affiliate Address
                  </span>
                  <p className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 p-2 rounded-xl border border-slate-100 dark:border-zinc-800 break-all">
                    {selectedReceipt.affiliate}
                  </p>
                </div>
              </div>

              {/* Transaction Hash with Copy & Explorer Link */}
              {selectedReceipt.txHash && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Transaction Hash (Stellar Tx ID)
                  </span>
                  <div className="p-3 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-indigo-950 dark:text-indigo-200 truncate">
                      {selectedReceipt.txHash}
                    </span>
                    <button
                      onClick={() => copyToClipboard(selectedReceipt.txHash!)}
                      className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors shrink-0"
                      title="Copy transaction hash"
                    >
                      {copiedTxHash ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Actions Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
                <Button
                  variant="outline"
                  onClick={() => setSelectedReceipt(null)}
                  className="rounded-xl px-5 text-xs font-semibold"
                >
                  Close Receipt
                </Button>
                {selectedReceipt.txHash && (
                  <a
                    href={getStellarExplorerLink("tx", selectedReceipt.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button className="rounded-xl px-5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md flex items-center gap-1.5">
                      <span>View on Stellar Expert</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Decrypt Dialog */}
      <Dialog open={isDecryptDialogOpen} onOpenChange={setIsDecryptDialogOpen}>
        <DialogContent className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Decrypted Sale Data
            </DialogTitle>
            <DialogDescription className="text-zinc-500 dark:text-zinc-400">
              This is the verified, decrypted sale information from your client key
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 mt-2">
            <pre className="text-sm font-mono text-zinc-800 dark:text-zinc-300 overflow-x-auto">
              {JSON.stringify(decryptedData, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
