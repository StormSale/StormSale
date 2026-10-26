import { useState, useCallback, useRef, useEffect } from "react";
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
  Zap,
  SlidersHorizontal,
  RefreshCw,
  ShieldCheck,
  X,
  AlertCircle,
  Clock,
  Sparkles,
  Sliders,
  Settings,
  Pause,
  Play,
} from "lucide-react";
import { Input } from "../../components/ui/input";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { formatStellarAddress } from "../../lib/stellar";
import {
  type AutoTopUpConfig,
  getDefaultAutoTopUpConfig,
  getStoredAutoTopUpConfig,
  saveAutoTopUpConfig,
  evaluateAutoTopUpTrigger,
} from "../../lib/escrowTopUp";
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
  onChainId?: number;
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
    onChainId: 1,
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
    onChainId: 2,
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
    onChainId: 3,
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
    onChainId: 4,
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
    onChainId: 5,
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

/**
 * Advertiser campaign management list component.
 *
 * Provides campaign health overview, real-time Soroban escrow balance monitoring,
 * automated escrow top-up threshold configuration, pre-authorized allowance management,
 * and refundable balance claims.
 */
export const MyCampaignsList = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialMockCampaigns);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "All" | "LowEscrow">("All");
  const [refundingCampaignId, setRefundingCampaignId] = useState<string | null>(null);
  const [activeMultiSigProposal, setActiveMultiSigProposal] =
    useState<MultiSigRefundProposal | null>(null);
  const [isMultiSigModalOpen, setIsMultiSigModalOpen] = useState(false);
  const [, setMultiSigVersion] = useState(0);

  // Top-Up & Allowance States
  const [autoTopUpConfigs, setAutoTopUpConfigs] = useState<Record<string, AutoTopUpConfig>>(() => {
    const map: Record<string, AutoTopUpConfig> = {};
    initialMockCampaigns.forEach((c) => {
      map[c.id] = getStoredAutoTopUpConfig(c.id, c.escrowInitial);
    });
    return map;
  });

  const [topUpInProgressId, setTopUpInProgressId] = useState<string | null>(null);
  const [isApprovingAllowance, setIsApprovingAllowance] = useState(false);
  const [isAutoCheckRunning, setIsAutoCheckRunning] = useState(false);
  const isAutoCheckRunningRef = useRef(false);

  // Modal Dialog States
  const [configModalCampaign, setConfigModalCampaign] = useState<Campaign | null>(null);
  const [manualTopUpCampaign, setManualTopUpCampaign] = useState<Campaign | null>(null);
  const [manualTopUpAmount, setManualTopUpAmount] = useState<string>("1000");

  // Form states for Config Modal
  const [formConfig, setFormConfig] = useState<AutoTopUpConfig | null>(null);
  const [customAllowanceAmount, setCustomAllowanceAmount] = useState<string>("5000");

  const {
    refundCampaignEscrow,
    topUpCampaignEscrow,
    tokenAllowance,
    approveTokenAllowance,
    refreshTokenAllowance,
    isConnected,
    userAddress,
    connectorType,
  } = useWeb3();
  const { showNotification } = useNotification();

  /**
   * Determines whether a campaign's escrow balance has fallen below 10% of initial escrow.
   */
  const isCampaignLowEscrow = useCallback((c: Campaign) => {
    if (c.status === "Completed" || c.escrowInitial <= 0) return false;
    return c.escrowBalance / c.escrowInitial < 0.1 && c.escrowBalance > 0;
  }, []);

  /**
   * Opens the automated top-up configuration modal for a campaign.
   */
  const openConfigModal = (campaign: Campaign) => {
    const current =
      autoTopUpConfigs[campaign.id] ||
      getDefaultAutoTopUpConfig(campaign.id, campaign.escrowInitial);
    setFormConfig({ ...current });
    setConfigModalCampaign(campaign);
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

  /**
   * Persists the automated top-up configuration for the active modal campaign.
   */
  const handleSaveConfig = () => {
    if (!formConfig || !configModalCampaign) return;
    saveAutoTopUpConfig(formConfig);
    setAutoTopUpConfigs((prev) => ({
      ...prev,
      [configModalCampaign.id]: { ...formConfig },
    }));
    showNotification({
      type: "success",
      title: "Auto Top-Up Settings Saved",
      message: `Trigger threshold set to ${
        formConfig.thresholdType === "percentage"
          ? `${formConfig.thresholdValue}%`
          : `${formConfig.thresholdValue.toLocaleString()} XLM`
      } with ${formConfig.topUpAmount.toLocaleString()} XLM automatic refill.`,
    });
    setConfigModalCampaign(null);
  };

  /**
   * Submits a token allowance pre-authorization transaction on the Stellar Asset Contract.
   */
  const handleAuthorizeAllowance = useCallback(
    async (amountToApprove: number) => {
      if (!isConnected) {
        showNotification({
          type: "error",
          title: "Wallet Not Connected",
          message: "Please connect your wallet before pre-authorizing escrow allowance.",
        });
        return;
      }
      if (amountToApprove <= 0) return;

      setIsApprovingAllowance(true);
      try {
        showNotification({
          type: "info",
          title: "Pre-Authorizing Allowance",
          message: `Approving ${amountToApprove.toLocaleString()} XLM allowance on Stellar Asset Contract...`,
        });

        const res = await approveTokenAllowance(amountToApprove);
        await refreshTokenAllowance();

        showNotification({
          type: "success",
          title: "Allowance Pre-Authorized!",
          message: `Successfully authorized ${amountToApprove.toLocaleString()} XLM for escrow funding. Tx: ${
            res.txHash ? res.txHash.slice(0, 10) + "..." : "Confirmed"
          }`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to authorize token allowance";
        showNotification({
          type: "error",
          title: "Allowance Approval Failed",
          message: msg,
        });
      } finally {
        setIsApprovingAllowance(false);
      }
    },
    [isConnected, showNotification, approveTokenAllowance, refreshTokenAllowance],
  );

  /**
   * Executes an escrow top-up on-chain or mock sandbox, verifying pre-authorized allowances and updating campaign state.
   */
  const executeTopUp = useCallback(
    async (
      campaign: Campaign,
      amount: number,
      isAutomated = false,
      availableAllowance?: number,
    ) => {
      if (!isConnected) {
        showNotification({
          type: "error",
          title: "Wallet Not Connected",
          message: "Please connect your wallet to execute escrow top-up.",
        });
        return false;
      }

      if (amount <= 0) {
        showNotification({
          type: "error",
          title: "Invalid Amount",
          message: "Top-up amount must be greater than zero.",
        });
        return false;
      }

      const effectiveAllowance =
        typeof availableAllowance === "number" ? availableAllowance : tokenAllowance;

      // Check pre-authorized allowance
      if (effectiveAllowance < amount) {
        const deficit = amount - effectiveAllowance;
        showNotification({
          type: "warning",
          title: "Pre-Authorized Allowance Deficit",
          message: `Current allowance is ${effectiveAllowance.toLocaleString()} XLM. Refill requires ${amount.toLocaleString()} XLM (-${deficit.toLocaleString()} XLM deficit). Please pre-authorize allowance.`,
          actionLabel: "Authorize Allowance",
          onAction: () => handleAuthorizeAllowance(Math.max(5000, amount)),
        });
        return false;
      }

      const onChainId = campaign.onChainId ?? Number.parseInt(campaign.id, 10);
      if (!Number.isInteger(onChainId) || onChainId <= 0) {
        showNotification({
          type: "error",
          title: "Invalid Campaign",
          message: `Campaign ${campaign.name} has no valid on-chain ID.`,
        });
        return false;
      }

      setTopUpInProgressId(campaign.id);
      try {
        showNotification({
          type: "info",
          title: isAutomated ? "Executing Automated Top-Up" : "Processing Escrow Top-Up",
          message: `Transferring ${amount.toLocaleString()} XLM into ${campaign.name} escrow contract...`,
        });

        const res = await topUpCampaignEscrow(onChainId, amount);

        // Update campaign state
        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === campaign.id
              ? {
                  ...c,
                  escrowBalance: c.escrowBalance + amount,
                  escrowInitial: Math.max(c.escrowInitial, c.escrowBalance + amount),
                }
              : c,
          ),
        );

        // Update config tracking
        const currentCfg =
          autoTopUpConfigs[campaign.id] ||
          getDefaultAutoTopUpConfig(campaign.id, campaign.escrowInitial);
        const updatedCfg: AutoTopUpConfig = {
          ...currentCfg,
          topUpCountToday: currentCfg.topUpCountToday + 1,
          lastTopUpAt: new Date().toISOString(),
          lastTopUpTx: res.txHash,
        };
        saveAutoTopUpConfig(updatedCfg);
        setAutoTopUpConfigs((prev) => ({ ...prev, [campaign.id]: updatedCfg }));

        showNotification({
          type: "success",
          title: isAutomated ? "Automated Top-Up Confirmed!" : "Escrow Top-Up Successful!",
          message: `Added ${amount.toLocaleString()} XLM to ${campaign.name}. New Escrow Balance: ${(
            campaign.escrowBalance + amount
          ).toLocaleString()} XLM. Remaining Allowance: ${(effectiveAllowance - amount).toLocaleString()} XLM.`,
        });

        setManualTopUpCampaign(null);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to top up campaign escrow";
        showNotification({
          type: "error",
          title: "Top-Up Failed",
          message: msg,
        });
        return false;
      } finally {
        setTopUpInProgressId(null);
      }
    },
    [
      isConnected,
      tokenAllowance,
      showNotification,
      handleAuthorizeAllowance,
      topUpCampaignEscrow,
      autoTopUpConfigs,
    ],
  );

  /**
   * Audits active campaigns against their automated top-up thresholds, tracking remaining allowance.
   */
  const runAutoTopUpCheck = useCallback(
    async (isManualTrigger = false) => {
      if (!isConnected || isAutoCheckRunningRef.current) return;
      isAutoCheckRunningRef.current = true;
      setIsAutoCheckRunning(true);
      let triggeredCount = 0;
      let remainingAllowance = tokenAllowance;

      try {
        for (const campaign of campaigns) {
          if (campaign.status === "Completed") continue;
          const config =
            autoTopUpConfigs[campaign.id] ||
            getDefaultAutoTopUpConfig(campaign.id, campaign.escrowInitial);

          const evaluation = evaluateAutoTopUpTrigger(campaign, config, remainingAllowance);
          if (evaluation.shouldTrigger) {
            const success = await executeTopUp(
              campaign,
              config.topUpAmount,
              true,
              remainingAllowance,
            );
            if (success) {
              triggeredCount++;
              remainingAllowance = Math.max(0, remainingAllowance - config.topUpAmount);
            }
          }
        }

        if (triggeredCount === 0 && isManualTrigger) {
          showNotification({
            type: "info",
            title: "Auto Top-Up Audit Complete",
            message:
              "All monitored campaigns are currently above their configured threshold or within safe limits.",
          });
        }
      } finally {
        isAutoCheckRunningRef.current = false;
        setIsAutoCheckRunning(false);
      }
    },
    [isConnected, campaigns, autoTopUpConfigs, tokenAllowance, executeTopUp, showNotification],
  );

  // Invoke auto top-up check when wallet connects or token allowance updates
  useEffect(() => {
    if (isConnected) {
      runAutoTopUpCheck(false);
    }
  }, [isConnected, tokenAllowance, runAutoTopUpCheck]);

  // Simulate balance drop for demonstration & testing
  const simulateBalanceDrop = (campaignId: string) => {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id === campaignId) {
          const cfg =
            autoTopUpConfigs[c.id] || getDefaultAutoTopUpConfig(c.id, c.escrowInitial);
          // Drop to 50% of threshold to guarantee breach
          const targetBalance =
            cfg.thresholdType === "percentage"
              ? Math.round(((cfg.thresholdValue * 0.5) / 100) * c.escrowInitial)
              : Math.round(cfg.thresholdValue * 0.5);

          return {
            ...c,
            escrowBalance: Math.max(100, targetBalance),
          };
        }
        return c;
      }),
    );

    const targetCamp = campaigns.find((c) => c.id === campaignId);
    showNotification({
      type: "warning",
      title: "Simulated Balance Depletion",
      message: `Simulated sales on ${targetCamp?.name || "campaign"} dropped escrow balance below trigger threshold. Test automated top-up now!`,
    });
  };

  // Refund handler for completed campaigns
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

      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === campaign.id ? { ...c, escrowBalance: 0, isRefunded: true } : c,
        ),
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
  const activeAutoTopUpCount = campaigns.filter(
    (c) => c.status !== "Completed" && autoTopUpConfigs[c.id]?.enabled,
  ).length;

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
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
              My Campaigns & Escrow Monitor
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Zap className="w-3.5 h-3.5" />
              Automated Top-Up Enabled
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Monitor real-time Soroban contract balances, set automated escrow top-up thresholds, manage
            pre-authorized allowances, and claim refunds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6 lg:mt-0">
          <Button
            variant="outline"
            onClick={() => runAutoTopUpCheck(true)}
            disabled={isAutoCheckRunning}
            className="h-12 rounded-full px-5 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/50 shadow-sm"
          >
            <RefreshCw
              className={`w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400 ${
                isAutoCheckRunning ? "animate-spin" : ""
              }`}
            />
            {isAutoCheckRunning ? "Auditing Escrows..." : "Run Auto Top-Up Check"}
          </Button>

          <Button className="bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-12 font-semibold shadow-md transition-all">
            <Plus className="w-5 h-5 mr-2" />
            Create Campaign
          </Button>
        </div>
      </div>

      {/* Global Low Balance Alert Banner */}
      {lowEscrowCount > 0 && (
        <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 flex flex-col sm:flex-row items-start justify-between gap-4 shadow-sm">
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
                One or more campaigns have dropped below their escrow safety threshold. Automated top-up
                will replenish funding if pre-authorized allowance is available.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              size="sm"
              onClick={() => void runAutoTopUpCheck(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl h-9 px-4 shadow-sm flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Trigger Auto-Refill
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStatusFilter("LowEscrow")}
              className="border-amber-400 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-xl h-9 px-4 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              Filter Low Escrow
            </Button>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            label: "Pre-Authorized Allowance",
            value: `${tokenAllowance.toLocaleString()} XLM`,
            icon: ShieldCheck,
            highlight: true,
          },
          {
            label: "Auto-Refill Active",
            value: `${activeAutoTopUpCount} Campaigns`,
            icon: Zap,
          },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <Card
              key={i}
              className={`bg-white dark:bg-zinc-900/80 border rounded-2xl shadow-sm ${
                s.alert
                  ? "border-amber-300 dark:border-amber-800/70 ring-1 ring-amber-400/20"
                  : s.highlight
                  ? "border-indigo-300 dark:border-indigo-800/70 ring-1 ring-indigo-400/20"
                  : "border-slate-200 dark:border-zinc-800"
              }`}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {s.label}
                    </p>
                    <p
                      className={`text-lg sm:text-xl font-extrabold mt-1 ${
                        s.alert
                          ? "text-amber-600 dark:text-amber-400"
                          : s.highlight
                          ? "text-indigo-600 dark:text-indigo-400"
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
                        : s.highlight
                        ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400"
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
            const isTopUpThis = topUpInProgressId === campaign.id;

            // Auto top-up evaluation for this card
            const autoCfg =
              autoTopUpConfigs[campaign.id] ||
              getDefaultAutoTopUpConfig(campaign.id, campaign.escrowInitial);
            const autoEval = evaluateAutoTopUpTrigger(campaign, autoCfg, tokenAllowance);
            const hasAllowanceDeficit =
              campaign.status !== "Completed" &&
              autoCfg.enabled &&
              campaign.escrowBalance <= autoEval.thresholdAmount &&
              !autoEval.hasSufficientAllowance;

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

                  {/* AUTOMATED TOP-UP STATUS & CONTROLS (Issue #107) */}
                  {campaign.status !== "Completed" && (
                    <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 space-y-2.5 mb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <Zap className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                              <span>Automated Escrow Top-Up</span>
                              {autoCfg.enabled ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold">
                                  ACTIVE
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400 font-bold">
                                  DISABLED
                                </span>
                              )}
                            </span>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              Trigger: &lt;{" "}
                              {autoCfg.thresholdType === "percentage"
                                ? `${autoCfg.thresholdValue}% (${(
                                    (autoCfg.thresholdValue / 100) *
                                    campaign.escrowInitial
                                  ).toFixed(0)} XLM)`
                                : `${autoCfg.thresholdValue.toLocaleString()} XLM`}{" "}
                              · Refill: +{autoCfg.topUpAmount.toLocaleString()} XLM
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openConfigModal(campaign)}
                          className="h-8 px-2.5 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 text-xs font-semibold"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
                          Configure
                        </Button>
                      </div>

                      {/* Allowance Deficit Alert if balance is low but allowance is short */}
                      {hasAllowanceDeficit ? (
                        <div className="p-2.5 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-xs flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-medium">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              Allowance Deficit: -{autoEval.allowanceDeficit.toLocaleString()} XLM needed
                            </span>
                          </div>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleAuthorizeAllowance(Math.max(5000, autoCfg.topUpAmount))
                            }
                            disabled={isApprovingAllowance}
                            className="h-7 text-xs font-bold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                          >
                            Pre-Authorize
                          </Button>
                        </div>
                      ) : autoEval.shouldTrigger ? (
                        <div className="p-2.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200 font-medium">
                            <Zap className="w-4 h-4 text-emerald-600 shrink-0 animate-bounce" />
                            <span>
                              Trigger ready! Balance is low and allowance is pre-authorized.
                            </span>
                          </div>
                          <Button
                            size="sm"
                            disabled={isTopUpThis}
                            onClick={() => executeTopUp(campaign, autoCfg.topUpAmount, true)}
                            className="h-7 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                          >
                            {isTopUpThis ? "Refilling..." : "Refill Now"}
                          </Button>
                        </div>
                      ) : null}

                      {/* Simulation & Test button */}
                      <div className="flex items-center justify-between pt-1 border-t border-indigo-100/60 dark:border-indigo-900/30 text-[11px] text-zinc-500 dark:text-zinc-400">
                        <span>
                          Pre-Authorized Allowance:{" "}
                          <strong className="text-zinc-800 dark:text-zinc-200">
                            {tokenAllowance.toLocaleString()} XLM
                          </strong>
                        </span>
                        {import.meta.env.DEV && (
                          <button
                            type="button"
                            onClick={() => simulateBalanceDrop(campaign.id)}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                          >
                            Simulate Balance Drop
                          </button>
                        )}
                      </div>
                    </div>
                  )}

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

                  {/* ACTIONS: Standard Actions + "Refund" / "Top-Up" Action */}
                  <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/50">
                    {campaign.status === "Completed" ? (
                      /* Ended / Completed Campaign: Refund Action Area */
                      <div className="space-y-2">
                        {campaign.isRefunded ? (
                          <div className="w-full h-11 rounded-xl bg-slate-100 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/60 flex items-center justify-center text-xs font-bold text-zinc-500 dark:text-zinc-400 space-x-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>
                              Escrow Refunded ({campaign.escrowInitial.toLocaleString()} XLM Settled)
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
                            loading={isRefundingThis}
                            cooldown
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
                      /* Active / Paused Campaigns: Top-Up & Standard Operational Actions */
                      <div className="space-y-2.5">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              setManualTopUpCampaign(campaign);
                              setManualTopUpAmount(String(autoCfg.topUpAmount || 1000));
                            }}
                            className="flex-1 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm flex items-center justify-center gap-1.5"
                          >
                            <Coins className="w-4 h-4" />
                            <span>Top Up Escrow</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openConfigModal(campaign)}
                            title="Configure Automated Escrow Top-Up"
                            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                          >
                            <Settings className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                          </Button>
                        </div>

                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-9 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold hover:bg-slate-50 dark:hover:bg-zinc-800"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCampaignForConfig(campaign)}
                            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-zinc-800 p-0 hover:bg-slate-50 dark:hover:bg-zinc-800"
                            title="Configure Auto-Refill Trigger"
                          >
                            <Sliders className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-zinc-800 p-0 hover:bg-slate-50 dark:hover:bg-zinc-800"
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
                            className="flex-1 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-semibold shadow-sm"
                          >
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Analytics
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Automated Escrow Top-Up Settings Dialog */}
      {configModalCampaign && formConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Automated Escrow Top-Up Settings
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {configModalCampaign.name} ({configModalCampaign.contractAddress})
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setConfigModalCampaign(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Escrow Status preview */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Current Escrow Balance
                </span>
                <div className="text-xl font-extrabold text-zinc-900 dark:text-white mt-0.5">
                  {configModalCampaign.escrowBalance.toLocaleString()} XLM
                  <span className="text-xs font-normal text-zinc-500 ml-2">
                    (of {configModalCampaign.escrowInitial.toLocaleString()} XLM initial)
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Health
                </span>
                <div
                  className={`text-sm font-black mt-0.5 ${
                    isCampaignLowEscrow(configModalCampaign)
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {(
                    (configModalCampaign.escrowBalance / configModalCampaign.escrowInitial) *
                    100
                  ).toFixed(1)}
                  %
                </div>
              </div>
            </div>

            {/* Toggle Enable/Disable */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
              <div>
                <div className="font-bold text-sm text-zinc-900 dark:text-white">
                  Enable Automated Top-Up
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  Automatically refill escrow when balance drops below your defined threshold
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={formConfig.enabled}
                aria-label="Enable automated top-up"
                onClick={() =>
                  setFormConfig((prev) => (prev ? { ...prev, enabled: !prev.enabled } : null))
                }
                className={`w-12 h-7 rounded-full transition-colors relative p-1 ${
                  formConfig.enabled
                    ? "bg-indigo-600"
                    : "bg-slate-300 dark:bg-zinc-700"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    formConfig.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* User-Defined Trigger Threshold */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  1. Trigger Threshold
                </label>
                <div className="flex rounded-lg bg-slate-100 dark:bg-zinc-800 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) =>
                        prev
                          ? {
                              ...prev,
                              thresholdType: "percentage",
                              thresholdValue: 15,
                            }
                          : null,
                      )
                    }
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      formConfig.thresholdType === "percentage"
                        ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500"
                    }`}
                  >
                    Percentage (%)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) =>
                        prev
                          ? {
                              ...prev,
                              thresholdType: "fixed",
                              thresholdValue: 500,
                            }
                          : null,
                      )
                    }
                    className={`px-3 py-1 rounded-md font-bold transition-all ${
                      formConfig.thresholdType === "fixed"
                        ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500"
                    }`}
                  >
                    Fixed XLM
                  </button>
                </div>
              </div>

              {formConfig.thresholdType === "percentage" ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {[10, 15, 20, 25, 30].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() =>
                          setFormConfig((prev) =>
                            prev ? { ...prev, thresholdValue: pct } : null,
                          )
                        }
                        className={`flex-1 h-9 rounded-xl text-xs font-bold transition-all ${
                          formConfig.thresholdValue === pct
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Triggers when escrow drops below{" "}
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {(
                        (formConfig.thresholdValue / 100) *
                        configModalCampaign.escrowInitial
                      ).toFixed(0)}{" "}
                      XLM
                    </strong>{" "}
                    ({formConfig.thresholdValue}% of initial escrow).
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={formConfig.thresholdValue}
                    onChange={(e) =>
                      setFormConfig((prev) =>
                        prev
                          ? {
                              ...prev,
                              thresholdValue: Math.max(1, parseInt(e.target.value) || 0),
                            }
                          : null,
                      )
                    }
                    placeholder="e.g. 500"
                    className="h-11 rounded-xl"
                  />
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Triggers when escrow drops below{" "}
                    <strong className="text-indigo-600 dark:text-indigo-400">
                      {formConfig.thresholdValue.toLocaleString()} XLM
                    </strong>
                    .
                  </p>
                </div>
              )}
            </div>

            {/* Refill Amount */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                2. Refill Deposit Amount (XLM)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() =>
                      setFormConfig((prev) =>
                        prev ? { ...prev, topUpAmount: amt } : null,
                      )
                    }
                    className={`h-9 rounded-xl text-xs font-bold transition-all ${
                      formConfig.topUpAmount === amt
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    +{amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                value={formConfig.topUpAmount}
                onChange={(e) =>
                  setFormConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          topUpAmount: Math.max(10, parseInt(e.target.value) || 0),
                        }
                      : null,
                  )
                }
                placeholder="Custom refill amount"
                className="h-11 rounded-xl"
              />
            </div>

            {/* Pre-Authorized Allowance Handling Panel */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                    3. Pre-Authorized Allowance
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                  Available: {tokenAllowance.toLocaleString()} XLM
                </span>
              </div>

              {tokenAllowance >= formConfig.topUpAmount ? (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Allowance Ready:</span> Your pre-authorized allowance
                    ({tokenAllowance.toLocaleString()} XLM) covers the {formConfig.topUpAmount.toLocaleString()}{" "}
                    XLM refill amount. Automated funding will trigger smoothly without transaction halts.
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 space-y-2">
                  <div className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Allowance Deficit:</span> You have{" "}
                      {tokenAllowance.toLocaleString()} XLM pre-authorized, but the refill requires{" "}
                      {formConfig.topUpAmount.toLocaleString()} XLM (Deficit: -
                      {(formConfig.topUpAmount - tokenAllowance).toLocaleString()} XLM).
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      value={customAllowanceAmount}
                      onChange={(e) => setCustomAllowanceAmount(e.target.value)}
                      placeholder="Amount to approve"
                      className="h-9 text-xs rounded-xl flex-1 bg-white dark:bg-zinc-900"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleAuthorizeAllowance(parseFloat(customAllowanceAmount) || 5000)}
                      disabled={isApprovingAllowance}
                      className="h-9 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                    >
                      {isApprovingAllowance ? "Approving..." : "Pre-Authorize"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Safety Limit: Max Top-Ups per day */}
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Daily Top-Up Cap (Safeguard)</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                  {formConfig.topUpCountToday} / {formConfig.maxTopUpsPerDay} used today
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <Button
                variant="outline"
                type="button"
                onClick={() => setConfigModalCampaign(null)}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveConfig}
                className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Quick Manual Top-Up Dialog */}
      {manualTopUpCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Top Up Campaign Escrow
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {manualTopUpCampaign.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setManualTopUpCampaign(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Current Escrow Balance:</span>
                <span className="font-bold text-zinc-900 dark:text-white font-mono">
                  {manualTopUpCampaign.escrowBalance.toLocaleString()} XLM
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Pre-Authorized Allowance:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                  {tokenAllowance.toLocaleString()} XLM
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Deposit Amount (XLM)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 2500, 5000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setManualTopUpAmount(String(amt))}
                    className={`h-9 rounded-xl text-xs font-bold transition-all ${
                      manualTopUpAmount === String(amt)
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    +{amt.toLocaleString()}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                value={manualTopUpAmount}
                onChange={(e) => setManualTopUpAmount(e.target.value)}
                placeholder="Enter XLM amount"
                className="h-11 rounded-xl"
              />
            </div>

            {/* Allowance warning if required deposit > current allowance */}
            {parseFloat(manualTopUpAmount) > tokenAllowance && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                <p>
                  Deposit amount ({parseFloat(manualTopUpAmount).toLocaleString()} XLM) exceeds
                  pre-authorized allowance ({tokenAllowance.toLocaleString()} XLM).
                </p>
                <Button
                  size="sm"
                  onClick={() => handleAuthorizeAllowance(parseFloat(manualTopUpAmount) || 2000)}
                  disabled={isApprovingAllowance}
                  className="w-full h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                >
                  {isApprovingAllowance ? "Approving Allowance..." : "Approve Required Allowance"}
                </Button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <Button
                variant="outline"
                type="button"
                onClick={() => setManualTopUpCampaign(null)}
                className="flex-1 h-11 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={topUpInProgressId === manualTopUpCampaign.id}
                onClick={() =>
                  executeTopUp(manualTopUpCampaign, parseFloat(manualTopUpAmount) || 0, false)
                }
                className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md"
              >
                {topUpInProgressId === manualTopUpCampaign.id ? "Depositing..." : "Confirm Deposit"}
              </Button>
            </div>
          </div>
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
