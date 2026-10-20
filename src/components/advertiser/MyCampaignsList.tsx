import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Plus,
  Users,
  BarChart3,
  TrendingUp,
  Eye,
  Search,
  Shield,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Coins,
  Wallet,
  Clock,
  Sparkles,
  AlertCircle,
  Sliders,
} from "lucide-react";
import { Input } from "../../components/ui/input";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { formatStellarAddress } from "../../lib/stellar";
import { EscrowReserveIndicator } from "./EscrowReserveIndicator";
import { AutoRefillConfigModal } from "./AutoRefillConfigModal";
import {
  calculateEscrowReserveStatus,
  depositEscrowRefillContractCall,
} from "../../lib/escrowAutoRefill";
import type { MultiSigRefundProposal } from "../../lib/multiSigSafe";
import {
  isLargeRefund,
  getLatestProposalForCampaign,
  initiateMultiSigRefund,
} from "../../lib/multiSigSafe";
import { MultiSigRefundModal } from "./MultiSigRefundModal";
import { ContractTTLBadge } from "./ContractTTLBadge";
import {
  calculateTTLHealth,
  formatLedgerDuration,
  extendContractInstanceTTL,
} from "../../lib/contractTTL";

export type CampaignStatus = "Active" | "Paused" | "Completed";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  commissionRate: number;
  clearingPeriod: string;
  totalSales: number;
  totalRevenue: string;
  totalCommissions: string;
  affiliates: number;
  createdAt: string;
  contractAddress: string;
  escrowInitial: number; // Initial escrow budget (XLM)
  escrowBalance: number; // Current remaining escrow balance (XLM)
  isRefunded?: boolean;
  currentBalanceXlm?: number;
  initialBudgetXlm?: number;
  refillThresholdPercent?: number;
  ttlRemainingLedgers?: number;
}

export const initialMockCampaigns: Campaign[] = [
  {
    id: "1",
    name: "Tech Gadgets Pro",
    status: "Active",
    commissionRate: 10,
    clearingPeriod: "14 Days",
    totalSales: 124,
    totalRevenue: "$24,800",
    totalCommissions: "$2,480",
    affiliates: 12,
    createdAt: "2026-04-01",
    contractAddress: "CA7Q...1234",
    escrowInitial: 5000,
    escrowBalance: 3250, // 65.0% - Healthy
    initialBudgetXlm: 5000,
    currentBalanceXlm: 3250,
    refillThresholdPercent: 15,
    isRefunded: false,
    ttlRemainingLedgers: 7850, // Low TTL (< 10k ledgers) - requires restoration!
  },
  {
    id: "2",
    name: "Web3 Masterclass",
    status: "Active",
    commissionRate: 15,
    clearingPeriod: "7 Days",
    totalSales: 89,
    totalRevenue: "$44,500",
    totalCommissions: "$6,675",
    affiliates: 8,
    createdAt: "2026-04-15",
    contractAddress: "CB9E...5678",
    escrowInitial: 10000,
    escrowBalance: 750, // 7.5% - LOW ESCROW ALERT (< 10%)
    initialBudgetXlm: 10000,
    currentBalanceXlm: 750,
    refillThresholdPercent: 15,
    isRefunded: false,
    ttlRemainingLedgers: 420000, // Healthy
  },
  {
    id: "3",
    name: "Crypto Tools Suite",
    status: "Paused",
    commissionRate: 12,
    clearingPeriod: "30 Days",
    totalSales: 67,
    totalRevenue: "$33,500",
    totalCommissions: "$4,020",
    affiliates: 6,
    createdAt: "2026-03-20",
    contractAddress: "CC2K...9012",
    escrowInitial: 8000,
    escrowBalance: 680, // 8.5% - LOW ESCROW ALERT (< 10%)
    initialBudgetXlm: 8000,
    currentBalanceXlm: 680,
    refillThresholdPercent: 20,
    isRefunded: false,
    ttlRemainingLedgers: 38000, // Warning
  },
  {
    id: "4",
    name: "DeFi Starter Pack",
    status: "Completed",
    commissionRate: 8,
    clearingPeriod: "14 Days",
    totalSales: 45,
    totalRevenue: "$22,500",
    totalCommissions: "$1,800",
    affiliates: 5,
    createdAt: "2026-02-10",
    contractAddress: "CD4M...3456",
    escrowInitial: 3000,
    escrowBalance: 1200, // Ended campaign with 1,200 XLM unused escrow - REFUNDABLE
    initialBudgetXlm: 3000,
    currentBalanceXlm: 1200,
    refillThresholdPercent: 10,
    isRefunded: false,
    ttlRemainingLedgers: 12000,
  },
  {
    id: "5",
    name: "Stellar MicroPay Launch",
    status: "Completed",
    commissionRate: 5,
    clearingPeriod: "7 Days",
    totalSales: 110,
    totalRevenue: "$55,000",
    totalCommissions: "$2,750",
    affiliates: 15,
    createdAt: "2026-01-05",
    contractAddress: "CE1P...7890",
    escrowInitial: 4000,
    escrowBalance: 0,
    initialBudgetXlm: 4000,
    currentBalanceXlm: 0,
    refillThresholdPercent: 15,
    isRefunded: true, // Already refunded
    ttlRemainingLedgers: 0, // Archived
  },
  {
    id: "6",
    name: "Enterprise Soroban Summit",
    status: "Completed",
    commissionRate: 10,
    clearingPeriod: "14 Days",
    totalSales: 320,
    totalRevenue: "$160,000",
    totalCommissions: "$16,000",
    affiliates: 24,
    createdAt: "2026-01-15",
    contractAddress: "CF8R...4321",
    escrowInitial: 30000,
    escrowBalance: 18500, // Ended campaign with 18,500 XLM unused escrow (> $10k Threshold)
    initialBudgetXlm: 30000,
    currentBalanceXlm: 18500,
    refillThresholdPercent: 15,
    isRefunded: false,
    ttlRemainingLedgers: 420000,
  },
];

export const mockCampaigns = initialMockCampaigns;

const statusConfig: Record<CampaignStatus, { badge: string; dot: string }> = {
  Active: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  Paused: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Completed: {
    badge: "bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400",
    dot: "bg-slate-400 dark:bg-zinc-500",
  },
};

export const MyCampaignsList = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialMockCampaigns);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "All" | "LowEscrow">("All");
  const [refundingCampaignId, setRefundingCampaignId] = useState<string | null>(null);
  const [activeMultiSigProposal, setActiveMultiSigProposal] =
    useState<MultiSigRefundProposal | null>(null);
  const [isMultiSigModalOpen, setIsMultiSigModalOpen] = useState(false);
  const [, setMultiSigVersion] = useState(0);

  const { refundCampaignEscrow, isConnected, userAddress, connectorType } = useWeb3();
  const { showNotification } = useNotification();

  // Low balance threshold: < 10%
  const isCampaignLowEscrow = (c: Campaign) => {
    if (c.status === "Completed" || c.escrowInitial <= 0) return false;
    return c.escrowBalance / c.escrowInitial < 0.1 && c.escrowBalance > 0;
  };

  const [extendingId, setExtendingId] = useState<string | null>(null);

  const lowTTLCount = campaigns.filter(
    (c) => c.status === "Active" && (c.ttlRemainingLedgers ?? 0) < 10000,
  ).length;

  const handleExtendCampaignTTL = async (campaignId: string, contractAddress: string) => {
    try {
      setExtendingId(campaignId);
      showNotification({
        type: "info",
        title: "Submitting State Rent Extension",
        message: `Extending contract ${contractAddress} by 500,000 ledgers...`,
      });

      const res = await extendContractInstanceTTL({
        contractId: contractAddress,
        callerAddress: userAddress || "GDX7...MOCK",
        extendToLedgers: 500000,
        walletType: (connectorType as any) || "freighter",
      });

      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campaignId
              ? {
                  ...c,
                  ttlRemainingLedgers: (c.ttlRemainingLedgers ?? 0) + 500000,
                }
              : c,
          ),
        );

        showNotification({
          type: "success",
          title: "State Rent Extended",
          message: `Successfully extended ${contractAddress} by 500,000 ledgers.`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Extension Failed",
          message: res.message || "Failed to extend contract state rent",
        });
      }
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Extension Error",
        message: err.message || "An unexpected error occurred",
      });
    } finally {
      setExtendingId(null);
    }
  };

  const [selectedCampaignForConfig, setSelectedCampaignForConfig] = useState<Campaign | null>(null);
  const [refillingId, setRefillingId] = useState<string | null>(null);

  const lowReserveCampaigns = campaigns.filter(
    (c) =>
      c.status === "Active" &&
      calculateEscrowReserveStatus(
        c.currentBalanceXlm ?? c.escrowBalance,
        c.initialBudgetXlm ?? c.escrowInitial,
        c.refillThresholdPercent ?? 15,
        c.id,
      ).isLowReserve,
  );

  const handleQuickRefill = async (campaign: Campaign, amountXlm: number = 500) => {
    setRefillingId(campaign.id);
    try {
      showNotification({
        type: "info",
        title: "Submitting Escrow Refill",
        message: `Depositing ${amountXlm.toLocaleString()} XLM to campaign escrow...`,
      });

      const result = await depositEscrowRefillContractCall({
        campaignId: campaign.id,
        amountXlm,
        callerAddress: userAddress || "GDX7...MOCK",
        walletType: (connectorType as any) || "freighter",
      });

      if (result.success) {
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campaign.id
              ? {
                  ...c,
                  currentBalanceXlm: result.newBalanceXlm,
                  escrowBalance: result.newBalanceXlm,
                }
              : c,
          ),
        );

        showNotification({
          type: "success",
          title: "Escrow Refilled",
          message: `Deposited ${amountXlm.toLocaleString()} XLM. New Balance: ${result.newBalanceXlm.toLocaleString()} XLM`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Refill Failed",
          message: result.message || "Failed to submit on-chain deposit",
        });
      }
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Refill Error",
        message: err.message || "An unexpected error occurred",
      });
    } finally {
      setRefillingId(null);
    }
  };

  const handleRefund = async (campaign: Campaign) => {
    if (!isConnected) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Please connect your Freighter wallet to execute escrow refund",
      });
      return;
    }

    if (campaign.status !== "Completed") {
      showNotification({
        type: "error",
        title: "Campaign Still Active",
        message: "Escrow refunds are only permitted for ended or completed campaigns",
      });
      return;
    }

    if (campaign.isRefunded || campaign.escrowBalance <= 0) {
      showNotification({
        type: "info",
        title: "Already Refunded",
        message: "There is no remaining escrow balance to refund",
      });
      return;
    }

    // Issue #104: Escrow reclamations >= $10,000 require Gnosis Safe / Stellar secondary signature
    if (isLargeRefund(campaign.escrowBalance)) {
      let proposal = getLatestProposalForCampaign(campaign.id);
      if (!proposal) {
        proposal = initiateMultiSigRefund(
          {
            id: campaign.id,
            name: campaign.name,
            escrowBalance: campaign.escrowBalance,
            contractAddress: campaign.contractAddress,
          },
          userAddress || "G_PRIMARY_ADVERTISER_WAL_99XX",
        );
        setMultiSigVersion((v) => v + 1);
      }
      setActiveMultiSigProposal(proposal);
      setIsMultiSigModalOpen(true);
      showNotification({
        type: "info",
        title: "Multi-Sig Authorization Required",
        message: `Escrow refund exceeds $10,000 policy threshold (${campaign.escrowBalance.toLocaleString()} XLM). Secondary Safe approval required.`,
      });
      return;
    }

    setRefundingCampaignId(campaign.id);
    const refundAmount = campaign.escrowBalance;

    try {
      showNotification({
        type: "info",
        title: "Processing Escrow Refund",
        message: `Withdrawing ${refundAmount.toLocaleString()} XLM unused escrow on Soroban...`,
      });

      const result = await refundCampaignEscrow(parseInt(campaign.id) || 1);

      // Update local campaign state to refunded
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, escrowBalance: 0, isRefunded: true } : c)),
      );

      showNotification({
        type: "success",
        title: "Escrow Refund Confirmed!",
        message: `Successfully refunded ${refundAmount.toLocaleString()} XLM to ${
          userAddress ? formatStellarAddress(userAddress) : "your wallet"
        }. Tx: ${result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });
    } catch (error: unknown) {
      console.error("Error refunding escrow:", error);
      const message = error instanceof Error ? error.message : "Failed to refund campaign escrow";
      showNotification({
        type: "error",
        title: "Refund Failed",
        message,
      });
    } finally {
      setRefundingCampaignId(null);
    }
  };

  const filtered = campaigns.filter((c) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    if (statusFilter === "All") return matchSearch;
    if (statusFilter === "LowEscrow") return matchSearch && isCampaignLowEscrow(c);
    return matchSearch && c.status === statusFilter;
  });

  const lowEscrowCount = campaigns.filter(isCampaignLowEscrow).length;
  const totalEscrowLocked = campaigns.reduce((acc, c) => acc + c.escrowBalance, 0);

  const totalRevenue = campaigns.reduce(
    (acc, c) => acc + parseInt(c.totalRevenue.replace(/\D/g, "")),
    0,
  );

  return (
    <div className="space-y-8">
      {/* Automatic Warning Banner when any campaign has low TTL (< 10,000 ledgers) */}
      {lowTTLCount > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="relative overflow-hidden bg-rose-500/10 border border-rose-500/30 rounded-3xl p-6 text-rose-700 dark:text-rose-300 backdrop-blur-md shadow-lg shadow-rose-500/5"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-500/20 text-rose-600 dark:text-rose-400 mt-0.5">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span>
                    Critical State Rent Alert: {lowTTLCount} Campaign(s) Nearing Archival
                  </span>
                </h3>
                <p className="text-sm text-rose-600/90 dark:text-rose-300/90 mt-1 max-w-2xl">
                  One or more active campaigns have dropped below the safe persistent instance TTL
                  threshold (&lt; 10,000 ledgers). Extend their contract rent to prevent smart
                  contract archival and maintain active tracking.
                </p>
              </div>
            </div>

            <Button
              onClick={() => {
                const urgentCampaign = campaigns.find(
                  (c) => c.status === "Active" && (c.ttlRemainingLedgers ?? 0) < 10000,
                );
                if (urgentCampaign) {
                  handleExtendCampaignTTL(urgentCampaign.id, urgentCampaign.contractAddress);
                }
              }}
              disabled={extendingId !== null}
              className="w-full md:w-auto bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-2xl px-6 py-3 shadow-md shadow-rose-600/20 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Restore Urgent Contract (+500k)</span>
            </Button>
          </div>
        </div>
      )}

      {/* Low-Reserve Warning Alert Banner */}
      {lowReserveCampaigns.length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="relative overflow-hidden bg-amber-500/10 border border-amber-500/30 rounded-3xl p-6 text-amber-700 dark:text-amber-300 backdrop-blur-md shadow-lg shadow-amber-500/5"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 mt-0.5">
                <AlertCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <span>
                    Escrow Low-Balance Alert: {lowReserveCampaigns.length} Campaign(s) Below
                    Threshold
                  </span>
                </h3>
                <p className="text-sm text-amber-600/90 dark:text-amber-300/90 mt-1 max-w-2xl">
                  One or more active campaigns have fallen below their configured escrow reserve
                  threshold. Top up now to guarantee uninterrupted affiliate commission payouts.
                </p>
              </div>
            </div>

            <Button
              onClick={() => {
                if (lowReserveCampaigns[0]) {
                  handleQuickRefill(lowReserveCampaigns[0], 500);
                }
              }}
              disabled={refillingId !== null}
              className="w-full md:w-auto bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-2xl px-6 py-3 shadow-md shadow-amber-600/20 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>1-Click Refill (+500 XLM)</span>
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            My Campaigns & Escrow Monitor
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Monitor real-time Soroban contract balances, low-escrow alerts, and claim refunds for
            ended campaigns.
          </p>
        </div>
        <Button className="mt-6 lg:mt-0 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-12 font-semibold shadow-md transition-all">
          <Plus className="w-5 h-5 mr-2" />
          Create Campaign
        </Button>
      </div>

      {/* Global Low Balance Alert Banner if any campaign has <10% balance */}
      {lowEscrowCount > 0 && (
        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 flex items-start justify-between shadow-sm">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-amber-900 dark:text-amber-200 text-base flex items-center gap-2">
                <span>
                  Low Escrow Balance Detected ({lowEscrowCount} campaign
                  {lowEscrowCount > 1 ? "s" : ""})
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-extrabold">
                  &lt; 10% Remaining
                </span>
              </h4>
              <p className="text-sm text-amber-800/90 dark:text-amber-300/90 mt-1">
                One or more campaigns have dropped below 10% of their initial escrow deposit.
                Affiliate commission payouts may pause if escrow is exhausted.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setStatusFilter("LowEscrow")}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl h-9 px-4 shadow-sm"
          >
            Filter Low Escrow
          </Button>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Campaigns", value: String(campaigns.length), icon: Shield },
          {
            label: "Low Escrow Alerts",
            value: String(lowEscrowCount),
            icon: AlertTriangle,
            alert: lowEscrowCount > 0,
          },
          {
            label: "Active Escrow Locked",
            value: `${totalEscrowLocked.toLocaleString()} XLM`,
            icon: Coins,
          },
          {
            label: "Total Revenue",
            value: `$${totalRevenue.toLocaleString()}`,
            icon: TrendingUp,
          },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Card
              key={i}
              className={`bg-white dark:bg-zinc-900/80 border rounded-2xl shadow-sm ${
                s.alert
                  ? "border-amber-300 dark:border-amber-800/70 ring-1 ring-amber-400/20"
                  : "border-slate-200 dark:border-zinc-800"
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {s.label}
                    </p>
                    <p
                      className={`text-xl font-extrabold mt-1 ${
                        s.alert
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-zinc-900 dark:text-white"
                      }`}
                    >
                      {s.value}
                    </p>
                  </div>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                      s.alert
                        ? "bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400"
                        : "bg-slate-100 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-indigo-400"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns by name..."
            className="h-12 pl-10 rounded-xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["All", "Active", "Paused", "Completed"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className={`h-12 rounded-xl px-4 font-semibold transition-all ${
                statusFilter === s
                  ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-md"
                  : "bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
              }`}
            >
              {s}
            </Button>
          ))}
          <Button
            size="sm"
            onClick={() => setStatusFilter(statusFilter === "LowEscrow" ? "All" : "LowEscrow")}
            className={`h-12 rounded-xl px-4 font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === "LowEscrow"
                ? "bg-amber-600 text-white shadow-md"
                : "bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Low Escrow ({lowEscrowCount})</span>
          </Button>
        </div>
      </div>

      {/* Campaign cards */}
      {filtered.length === 0 ? (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardContent className="py-20 text-center">
            <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-zinc-400 dark:text-zinc-500" />
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
              No campaigns found
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8">
              Try adjusting your search query or filter settings.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((campaign) => {
            const cfg = statusConfig[campaign.status];
            const isLowBalance = isCampaignLowEscrow(campaign);
            const balancePercentage =
              campaign.escrowInitial > 0
                ? Math.min(
                    100,
                    Math.max(0, (campaign.escrowBalance / campaign.escrowInitial) * 100),
                  )
                : 0;
            const isRefundingThis = refundingCampaignId === campaign.id;

            return (
              <Card
                key={campaign.id}
                className={`group border shadow-sm bg-white dark:bg-zinc-900/80 rounded-3xl transition-all ${
                  isLowBalance
                    ? "border-amber-400/80 dark:border-amber-500/50 ring-2 ring-amber-400/10 hover:shadow-amber-500/5"
                    : "border-slate-200 dark:border-zinc-800 hover:shadow-md"
                }`}
              >
                <CardHeader className="pt-6 px-6 pb-4 border-b border-slate-100 dark:border-zinc-800/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform ${
                          isLowBalance
                            ? "bg-amber-600 text-white"
                            : "bg-zinc-900 dark:bg-indigo-600 text-white"
                        }`}
                      >
                        {isLowBalance ? (
                          <AlertTriangle className="w-6 h-6" />
                        ) : (
                          <Shield className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white leading-tight flex items-center gap-2">
                          <span>{campaign.name}</span>
                        </CardTitle>
                        <div className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                          {campaign.contractAddress}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-3 py-1.5 rounded-full shrink-0 ${cfg.badge}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {campaign.status}
                      </span>

                      {/* Visual Alert Badge at < 10% balance */}
                      {isLowBalance && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800 animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          Low Escrow (&lt; 10%)
                        </span>
                      )}

                      {/* Issue #104: Multi-Sig Escrow Policy Badge */}
                      {campaign.status === "Completed" &&
                        isLargeRefund(campaign.escrowBalance) &&
                        !campaign.isRefunded && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
                            <Shield className="w-3 h-3" />
                            Multi-Sig Required (&gt;$10k)
                          </span>
                        )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-6 pt-5 pb-6 space-y-5">
                  {/* REAL-TIME ESCROW MONITOR & PROGRESS BAR */}
                  <div
                    className={`p-4 rounded-2xl border transition-all ${
                      isLowBalance
                        ? "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60"
                        : "bg-slate-50 dark:bg-zinc-950/50 border-slate-100 dark:border-zinc-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center space-x-1.5 font-bold text-zinc-700 dark:text-zinc-300">
                        <Wallet className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Escrow Balance</span>
                      </div>
                      <div className="font-mono font-bold text-zinc-900 dark:text-white">
                        <span>{campaign.escrowBalance.toLocaleString()}</span>
                        <span className="text-zinc-400 font-normal">
                          {" "}
                          / {campaign.escrowInitial.toLocaleString()} XLM
                        </span>
                        <span
                          className={`ml-2 text-xs font-bold ${
                            isLowBalance
                              ? "text-rose-600 dark:text-rose-400 font-black"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          ({balancePercentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          isLowBalance
                            ? "bg-rose-500 animate-pulse"
                            : balancePercentage > 30
                              ? "bg-emerald-500"
                              : "bg-amber-500"
                        }`}
                        style={{ width: `${balancePercentage}%` }}
                      />
                    </div>

                    {/* Low Balance Warning Text inside card */}
                    {isLowBalance && (
                      <div className="mt-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>
                          Critical: Less than 10% escrow remaining. Top up to prevent payout
                          disruption.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Soroban Contract TTL Health Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        State Rent:
                      </span>
                      <ContractTTLBadge
                        status={calculateTTLHealth(campaign.ttlRemainingLedgers ?? 500000)}
                        remainingLedgers={campaign.ttlRemainingLedgers ?? 500000}
                        durationText={formatLedgerDuration(campaign.ttlRemainingLedgers ?? 500000)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={(campaign.ttlRemainingLedgers ?? 500000) < 10000 ? "default" : "outline"}
                      disabled={extendingId === campaign.id}
                      onClick={() => handleExtendCampaignTTL(campaign.id, campaign.contractAddress)}
                      className={`h-7 text-xs rounded-xl font-bold px-3 py-1 flex items-center gap-1 ${
                        (campaign.ttlRemainingLedgers ?? 500000) < 10000
                          ? "bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/30 animate-pulse"
                          : "border-indigo-500/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>
                        {(campaign.ttlRemainingLedgers ?? 500000) < 10000 ? "Restore (+500k)" : "Extend"}
                      </span>
                    </Button>
                  </div>

                  {/* Escrow Reserve Level & Threshold Indicator for Auto-Refill */}
                  {campaign.status !== "Completed" && (
                    <EscrowReserveIndicator
                      status={calculateEscrowReserveStatus(
                        campaign.currentBalanceXlm ?? campaign.escrowBalance,
                        campaign.initialBudgetXlm ?? campaign.escrowInitial,
                        campaign.refillThresholdPercent ?? 15,
                        campaign.id,
                      )}
                      onOpenSettings={() => setSelectedCampaignForConfig(campaign)}
                      onQuickRefill={() => handleQuickRefill(campaign, 500)}
                      isRefilling={refillingId === campaign.id}
                      className="mb-3"
                    />
                  )}

                  {/* Metrics grid */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Sales", value: campaign.totalSales, icon: BarChart3 },
                      { label: "Revenue", value: campaign.totalRevenue, icon: TrendingUp },
                      { label: "Affiliates", value: campaign.affiliates, icon: Users },
                    ].map((m, i) => {
                      const Icon = m.icon;
                      return (
                        <div
                          key={i}
                          className="bg-slate-50 dark:bg-zinc-950/50 rounded-xl p-3 text-center border border-slate-100 dark:border-zinc-800/50"
                        >
                          <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mx-auto mb-1" />
                          <div className="font-extrabold text-sm text-zinc-900 dark:text-white">
                            {m.value}
                          </div>
                          <div className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {m.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Details row */}
                  <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-2">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {campaign.commissionRate}% commission
                    </span>
                    <span>·</span>
                    <span>{campaign.clearingPeriod} clearing</span>
                    <span>·</span>
                    <span>Since {campaign.createdAt}</span>
                  </div>

                  {/* ACTIONS */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/50">
                    {campaign.status === "Completed" ? (
                      /* Ended / Completed Campaign: Refund Action Area */
                      <div className="space-y-2">
                        {campaign.isRefunded ? (
                          <div className="w-full h-11 rounded-xl bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400 space-x-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>
                              Escrow Refunded ({campaign.escrowInitial.toLocaleString()} XLM
                              Settled)
                            </span>
                          </div>
                        ) : isLargeRefund(campaign.escrowBalance) ? (
                          (() => {
                            const proposal = getLatestProposalForCampaign(campaign.id);
                            if (proposal && proposal.status === "approved") {
                              return (
                                <Button
                                  type="button"
                                  onClick={() => {
                                    setActiveMultiSigProposal(proposal);
                                    setIsMultiSigModalOpen(true);
                                  }}
                                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Release Multi-Sig Escrow (Approved · 2/2)</span>
                                </Button>
                              );
                            }
                            if (proposal && proposal.status === "pending_secondary") {
                              return (
                                <Button
                                  type="button"
                                  onClick={() => {
                                    setActiveMultiSigProposal(proposal);
                                    setIsMultiSigModalOpen(true);
                                  }}
                                  className="w-full h-11 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                                >
                                  <Shield className="w-4 h-4" />
                                  <span>
                                    Track Multi-Sig Approval (
                                    {campaign.escrowBalance.toLocaleString()} XLM · 1/2)
                                  </span>
                                </Button>
                              );
                            }
                            return (
                              <Button
                                type="button"
                                onClick={() => handleRefund(campaign)}
                                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                              >
                                <Shield className="w-4 h-4" />
                                <span>Refund Unused Escrow (&gt; $10k Multi-Sig)</span>
                              </Button>
                            );
                          })()
                        ) : (
                          <Button
                            type="button"
                            disabled={isRefundingThis}
                            onClick={() => handleRefund(campaign)}
                            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                          >
                            {isRefundingThis ? (
                              <div className="flex items-center space-x-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span>Refunding Unused Escrow...</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <RotateCcw className="w-4 h-4" />
                                <span>
                                  Refund Unused Escrow ({campaign.escrowBalance.toLocaleString()}{" "}
                                  XLM)
                                </span>
                              </div>
                            )}
                          </Button>
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1.5" />
                            View Summary
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold"
                          >
                            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                            Audit Trail
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Active / Paused Campaigns: Standard Operational Actions + Auto-Refill Settings */
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedCampaignForConfig(campaign)}
                          className="h-10 w-10 rounded-xl border border-slate-200 dark:border-zinc-800 p-0 hover:bg-slate-50 dark:hover:bg-zinc-800"
                          title="Configure Auto-Refill Trigger"
                        >
                          <Sliders className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold shadow-sm"
                        >
                          <BarChart3 className="w-4 h-4 mr-2" />
                          Analytics
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Issue #139: Auto-Refill Configuration Modal */}
      {selectedCampaignForConfig && (
        <AutoRefillConfigModal
          isOpen={selectedCampaignForConfig !== null}
          onClose={() => setSelectedCampaignForConfig(null)}
          campaignId={selectedCampaignForConfig.id}
          campaignName={selectedCampaignForConfig.name}
          currentBalanceXlm={
            selectedCampaignForConfig.currentBalanceXlm ?? selectedCampaignForConfig.escrowBalance
          }
          initialBudgetXlm={
            selectedCampaignForConfig.initialBudgetXlm ?? selectedCampaignForConfig.escrowInitial
          }
          onRefillComplete={(newBalanceXlm: number) => {
            setCampaigns((prev) =>
              prev.map((c) =>
                c.id === selectedCampaignForConfig.id
                  ? { ...c, currentBalanceXlm: newBalanceXlm, escrowBalance: newBalanceXlm }
                  : c,
              ),
            );
          }}
        />
      )}

      {/* Issue #104: Multi-Sig Refund Modal */}
      <MultiSigRefundModal
        isOpen={isMultiSigModalOpen}
        onClose={() => setIsMultiSigModalOpen(false)}
        proposal={activeMultiSigProposal}
        onProposalUpdated={(updated: MultiSigRefundProposal) => {
          setActiveMultiSigProposal(updated);
          setMultiSigVersion((v) => v + 1);
        }}
        onRefundExecuted={(campaignId: string) => {
          setCampaigns((prev) =>
            prev.map((c) =>
              c.id === campaignId ? { ...c, escrowBalance: 0, isRefunded: true } : c,
            ),
          );
          setMultiSigVersion((v) => v + 1);
        }}
      />
    </div>
  );
};
