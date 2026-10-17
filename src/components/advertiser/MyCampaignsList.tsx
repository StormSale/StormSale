import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Plus,
  Users,
  BarChart3,
  TrendingUp,
  Eye,
  Pause,
  Play,
  Settings,
  Search,
  Shield,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Coins,
  Wallet,
} from "lucide-react";
import { Input } from "../../components/ui/input";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { formatStellarAddress } from "../../lib/stellar";
import { ConcludeRefundModal } from "./ConcludeRefundModal";
import { canConcludeAndRefundEscrow, applyRefundConcludedState } from "../../lib/escrowRefund";

export type CampaignStatus = "Active" | "Paused" | "Completed" | "CONCLUDED";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  commissionRate: number;
  clearingPeriod: string;
  clearingPeriodSecs?: number;
  clearingExpiresAt?: number;
  pendingClaims?: number;
  outstandingLiabilities?: number;
  totalSales: number;
  totalRevenue: string;
  totalCommissions: string;
  affiliates: number;
  createdAt: string;
  contractAddress: string;
  escrowInitial: number; // Initial escrow budget (XLM)
  escrowBalance: number; // Current remaining escrow balance (XLM)
  balance?: number; // Normalized balance alias
  isRefunded?: boolean;
}

export const initialMockCampaigns: Campaign[] = [
  {
    id: "1",
    name: "Tech Gadgets Pro",
    status: "Active",
    commissionRate: 10,
    clearingPeriod: "14 Days",
    clearingPeriodSecs: 14 * 86400,
    clearingExpiresAt: Date.now() + 14 * 86400 * 1000,
    pendingClaims: 3,
    outstandingLiabilities: 450,
    totalSales: 124,
    totalRevenue: "$24,800",
    totalCommissions: "$2,480",
    affiliates: 12,
    createdAt: "2026-04-01",
    contractAddress: "CA7Q...1234",
    escrowInitial: 5000,
    escrowBalance: 3250, // 65.0% - Healthy
    balance: 3250,
  },
  {
    id: "2",
    name: "Web3 Masterclass",
    status: "Active",
    commissionRate: 15,
    clearingPeriod: "7 Days",
    clearingPeriodSecs: 7 * 86400,
    clearingExpiresAt: Date.now() + 7 * 86400 * 1000,
    pendingClaims: 2,
    outstandingLiabilities: 300,
    totalSales: 89,
    totalRevenue: "$44,500",
    totalCommissions: "$6,675",
    affiliates: 8,
    createdAt: "2026-04-15",
    contractAddress: "CB9E...5678",
    escrowInitial: 10000,
    escrowBalance: 750, // 7.5% - LOW ESCROW ALERT (< 10%)
    balance: 750,
  },
  {
    id: "3",
    name: "Crypto Tools Suite",
    status: "Paused",
    commissionRate: 12,
    clearingPeriod: "30 Days",
    clearingPeriodSecs: 30 * 86400,
    clearingExpiresAt: Date.now() + 30 * 86400 * 1000,
    pendingClaims: 1,
    outstandingLiabilities: 150,
    totalSales: 67,
    totalRevenue: "$33,500",
    totalCommissions: "$4,020",
    affiliates: 6,
    createdAt: "2026-03-20",
    contractAddress: "CC2K...9012",
    escrowInitial: 8000,
    escrowBalance: 680, // 8.5% - LOW ESCROW ALERT (< 10%)
    balance: 680,
  },
  {
    id: "4",
    name: "DeFi Starter Pack",
    status: "Completed",
    commissionRate: 8,
    clearingPeriod: "14 Days",
    clearingPeriodSecs: 14 * 86400,
    clearingExpiresAt: Date.now() - 3600000, // Expired 1 hour ago
    pendingClaims: 0,
    outstandingLiabilities: 0,
    totalSales: 45,
    totalRevenue: "$22,500",
    totalCommissions: "$1,800",
    affiliates: 5,
    createdAt: "2026-02-10",
    contractAddress: "CD4M...3456",
    escrowInitial: 3000,
    escrowBalance: 1200, // Ended campaign with 1,200 XLM unused escrow - REFUNDABLE
    balance: 1200,
    isRefunded: false,
  },
  {
    id: "5",
    name: "Stellar MicroPay Launch",
    status: "Completed",
    commissionRate: 5,
    clearingPeriod: "7 Days",
    clearingPeriodSecs: 7 * 86400,
    clearingExpiresAt: Date.now() - 86400000,
    pendingClaims: 0,
    outstandingLiabilities: 0,
    totalSales: 110,
    totalRevenue: "$55,000",
    totalCommissions: "$2,750",
    affiliates: 15,
    createdAt: "2026-01-05",
    contractAddress: "CE1P...7890",
    escrowInitial: 4000,
    escrowBalance: 0,
    balance: 0,
    isRefunded: true, // Already refunded
  },
  {
    id: "6",
    name: "NFT Ticket Clearing Pending",
    status: "Completed",
    commissionRate: 10,
    clearingPeriod: "3 Days",
    clearingPeriodSecs: 3 * 86400,
    clearingExpiresAt: Date.now() + 86400000, // Active clearing period (in the future)
    pendingClaims: 2,
    outstandingLiabilities: 200,
    totalSales: 30,
    totalRevenue: "$15,000",
    totalCommissions: "$1,500",
    affiliates: 4,
    createdAt: "2026-03-01",
    contractAddress: "CF5R...4321",
    escrowInitial: 2500,
    escrowBalance: 800,
    balance: 800,
    isRefunded: false,
  },
];

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
  CONCLUDED: {
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    dot: "bg-purple-500",
  },
};


export const MyCampaignsList = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialMockCampaigns);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "All" | "LowEscrow">("All");
  const [refundingCampaignId, setRefundingCampaignId] = useState<string | null>(null);
  const [concludeModalCampaign, setConcludeModalCampaign] = useState<Campaign | null>(null);

  const { refundCampaignEscrow, isConnected, userAddress } = useWeb3();
  const { showNotification } = useNotification();

  // Low balance threshold: < 10%
  const isCampaignLowEscrow = (c: Campaign) => {
    if (c.status === "Completed" || c.status === "CONCLUDED" || c.escrowInitial <= 0) return false;
    return c.escrowBalance / c.escrowInitial < 0.10 && c.escrowBalance > 0;
  };

  const handleOpenConcludeModal = (campaign: Campaign) => {
    setConcludeModalCampaign(campaign);
  };

  const handleConfirmConcludeRefund = async (campaignToRefund: { id: string }) => {
    const campaign = campaigns.find((c) => c.id === campaignToRefund.id);
    if (!campaign) return;

    if (!isConnected) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Please connect your Freighter wallet to execute escrow refund",
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

      // Invoke contract refund_escrow method with advertiser signature
      const result = await refundCampaignEscrow(parseInt(campaign.id) || 1);

      // Update local campaign status to CONCLUDED and balance to 0.00
      setCampaigns((prev) =>
        prev.map((c) => {
          if (c.id === campaign.id) {
            const updated = applyRefundConcludedState(c);
            return {
              ...updated,
              balance: 0,
            };
          }
          return c;
        }),
      );

      setConcludeModalCampaign(null);

      showNotification({
        type: "success",
        title: "Escrow Refund Confirmed!",
        message: `Successfully refunded ${refundAmount.toLocaleString()} XLM to ${
          userAddress ? formatStellarAddress(userAddress) : "treasury wallet"
        }. Status updated to CONCLUDED. Tx: ${result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });
    } catch (error: any) {
      console.error("Error refunding escrow:", error);
      showNotification({
        type: "error",
        title: "Refund Failed",
        message: error.message || "Failed to refund campaign escrow",
      });
    } finally {
      setRefundingCampaignId(null);
    }
  };

  const handleRefund = async (campaign: Campaign) => {
    handleOpenConcludeModal(campaign);
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
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            My Campaigns & Escrow Monitor
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Monitor real-time Soroban contract balances, low-escrow alerts, and claim refunds for ended campaigns.
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
                <span>Low Escrow Balance Detected ({lowEscrowCount} campaign{lowEscrowCount > 1 ? "s" : ""})</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200 font-extrabold">
                  &lt; 10% Remaining
                </span>
              </h4>
              <p className="text-sm text-amber-800/90 dark:text-amber-300/90 mt-1">
                One or more campaigns have dropped below 10% of their initial escrow deposit. Affiliate commission payouts may pause if escrow is exhausted.
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
                        s.alert ? "text-amber-600 dark:text-amber-400" : "text-zinc-900 dark:text-white"
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
          {(["All", "Active", "Paused", "Completed", "CONCLUDED"] as const).map((s) => (
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
                ? Math.min(100, Math.max(0, (campaign.escrowBalance / campaign.escrowInitial) * 100))
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
                        <span className="text-zinc-400 font-normal"> / {campaign.escrowInitial.toLocaleString()} XLM</span>
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
                          Critical: Less than 10% escrow remaining. Top up to prevent payout disruption.
                        </span>
                      </div>
                    )}
                  </div>

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
                  <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {campaign.commissionRate}% commission
                    </span>
                    <span>·</span>
                    <span>{campaign.clearingPeriod} clearing</span>
                    <span>·</span>
                    <span>Since {campaign.createdAt}</span>
                  </div>

                  {/* ACTIONS: Standard Actions + "Refund" Action for Ended Campaigns */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/50">
                    {campaign.status === "Completed" || campaign.status === "CONCLUDED" ? (
                      /* Ended / Completed / Concluded Campaign: Refund & Clawback Action Area */
                      <div className="space-y-2">
                        {campaign.status === "CONCLUDED" || campaign.isRefunded ? (
                          <div className="w-full h-11 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 flex items-center justify-center text-xs font-bold text-purple-700 dark:text-purple-300 space-x-2">
                            <CheckCircle2 className="w-4 h-4 text-purple-500" />
                            <span>CONCLUDED · Escrow Refunded (Balance: 0.00 XLM)</span>
                          </div>
                        ) : (() => {
                          const validation = canConcludeAndRefundEscrow(campaign);
                          return (
                            <div className="space-y-1.5">
                              <Button
                                type="button"
                                disabled={!validation.canRefund || isRefundingThis}
                                onClick={() => handleRefund(campaign)}
                                className={`w-full h-11 font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 ${
                                  validation.canRefund
                                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                    : "bg-slate-200 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed shadow-none"
                                }`}
                              >
                                {isRefundingThis ? (
                                  <div className="flex items-center space-x-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Processing Refund...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-2">
                                    <RotateCcw className="w-4 h-4" />
                                    <span>
                                      Conclude & Refund Escrow ({campaign.escrowBalance.toLocaleString()} XLM)
                                    </span>
                                  </div>
                                )}
                              </Button>
                              {!validation.canRefund && validation.reason && (
                                <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center font-medium">
                                  {validation.reason}
                                </p>
                              )}
                            </div>
                          );
                        })()}
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
                      /* Active / Paused Campaigns: Standard Operational Actions */
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
                          className="h-10 w-10 rounded-xl border border-slate-200 dark:border-zinc-800 p-0 hover:bg-slate-50 dark:hover:bg-zinc-800"
                        >
                          {campaign.status === "Active" ? (
                            <Pause className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                          ) : campaign.status === "Paused" ? (
                            <Play className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                          ) : (
                            <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                          )}
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

      {/* Conclude & Refund Escrow Modal */}
      <ConcludeRefundModal
        isOpen={!!concludeModalCampaign}
        onClose={() => setConcludeModalCampaign(null)}
        campaign={concludeModalCampaign}
        treasuryAddress={userAddress}
        onConfirm={handleConfirmConcludeRefund}
        isSubmitting={!!refundingCampaignId}
      />
    </div>
  );
};
