import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputField } from "../../components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { CONTRACT_ADDRESSES } from "../../config/contracts";
import { formatStellarAddress } from "../../lib/stellar";
import {
  Zap,
  Target,
  Clock,
  DollarSign,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Lock,
  Sparkles,
} from "lucide-react";

export type FlowStep =
  | "idle"
  | "checking"
  | "approving"
  | "approved"
  | "creating"
  | "success"
  | "error";

export const CreateCampaignForm = () => {
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [isRefreshingAllowance, setIsRefreshingAllowance] = useState(false);
  const [lastCreatedCampaign, setLastCreatedCampaign] = useState<{
    campaignId: number;
    txHash?: string;
  } | null>(null);

  const {
    createCampaignOnChain,
    isConnected,
    userAddress,
    tokenAllowance,
    refreshTokenAllowance,
    approveTokenAllowance,
  } = useWeb3();

  const { showNotification } = useNotification();

  // Numeric calculations
  const budgetNum = parseFloat(budget) || 0;
  const commissionRateNum = parseFloat(commissionRate) || 10;
  const clearingPeriodNum = parseInt(clearingPeriod) || 604800;
  const isAllowanceSufficient = isConnected && budgetNum > 0 && tokenAllowance >= budgetNum;
  const allowanceDeficit = Math.max(0, budgetNum - tokenAllowance);

  // Poll or refresh allowance on address change or mount
  useEffect(() => {
    if (isConnected && userAddress) {
      refreshTokenAllowance();
    }
  }, [isConnected, userAddress, refreshTokenAllowance]);

  const handleManualRefreshAllowance = async () => {
    setIsRefreshingAllowance(true);
    try {
      await refreshTokenAllowance();
      showNotification({
        type: "info",
        title: "Allowance Refreshed",
        message: `Current token allowance: ${tokenAllowance} XLM`,
      });
    } finally {
      setIsRefreshingAllowance(false);
    }
  };

  // Step 1: Approve Token Allowance Only
  const handleApproveAllowanceOnly = async () => {
    if (!isConnected) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Please connect your Freighter wallet first",
      });
      return;
    }

    if (budgetNum <= 0) {
      showNotification({
        type: "error",
        title: "Invalid Budget",
        message: "Please enter a valid campaign budget to approve allowance",
      });
      return;
    }

    setFlowStep("approving");
    try {
      showNotification({
        type: "info",
        title: "Step 1: Approving Token Allowance",
        message: `Approving ${budgetNum} XLM for the Escrow Contract...`,
      });

      const res = await approveTokenAllowance(budgetNum);

      showNotification({
        type: "success",
        title: "Allowance Approved!",
        message: `Approved ${budgetNum} XLM allowance. Tx: ${
          res.txHash ? res.txHash.slice(0, 10) + "..." : "Confirmed"
        }`,
      });
      setFlowStep("approved");
    } catch (error: any) {
      console.error("Error approving allowance:", error);
      showNotification({
        type: "error",
        title: "Approval Failed",
        message: error.message || "Failed to approve token allowance",
      });
      setFlowStep("error");
    }
  };


  // Sequential Two-Step Execution: "Step 1: Approve" -> "Step 2: Create Escrow"
  const handleSequentialApproveAndCreate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!isConnected) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Please connect your Freighter wallet first",
      });
      return;
    }

    if (!campaignName.trim()) {
      showNotification({
        type: "error",
        title: "Missing Name",
        message: "Please enter a campaign name",
      });
      return;
    }

    if (budgetNum <= 0) {
      showNotification({
        type: "error",
        title: "Invalid Budget",
        message: "Please enter a campaign budget greater than 0",
      });
      return;
    }

    // Step 1: If allowance is insufficient, execute approval first
    if (!isAllowanceSufficient) {
      setFlowStep("approving");
      try {
        showNotification({
          type: "info",
          title: "Step 1/2: Approving Token Allowance",
          message: `Approving ${budgetNum} XLM for the Escrow Contract...`,
        });

        await approveTokenAllowance(budgetNum);

        showNotification({
          type: "success",
          title: "Step 1/2 Complete: Allowance Approved",
          message: "Token allowance granted. Automatically proceeding to create campaign escrow...",
        });
        setFlowStep("approved");
      } catch (error: any) {
        console.error("Error during sequential approval step:", error);
        showNotification({
          type: "error",
          title: "Step 1 Failed (Approval)",
          message: error.message || "Failed to approve token allowance. Sequence aborted.",
        });
        setFlowStep("error");
        return;
      }
    }

    // Step 2: Create Escrow and Deposit Budget
    setFlowStep("creating");
    try {
      showNotification({
        type: "info",
        title: "Step 2/2: Deploying Soroban Escrow",
        message: `Locking ${budgetNum} XLM budget and creating campaign on Stellar...`,
      });

      const result = await createCampaignOnChain(
        campaignName,
        budgetNum,
        commissionRateNum,
        clearingPeriodNum,
      );

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
        message: `Campaign #${result.campaignId} successfully deployed. Tx: ${
          result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"
        }`,
      });

      setLastCreatedCampaign({
        campaignId: result.campaignId,
        txHash: result.txHash,
      });

      setFlowStep("success");
      setCommissionRate("");
      setClearingPeriod("");
      setCampaignName("");
      setBudget("");
    } catch (error: any) {
      console.error("Error during sequential escrow creation:", error);
      showNotification({
        type: "error",
        title: "Step 2 Failed (Escrow Creation)",
        message: error.message || "Failed to create campaign escrow on Stellar.",
      });
      setFlowStep("error");
    }
  };

  const presetPeriods = [
    { label: "7 Days", value: "604800" },
    { label: "14 Days", value: "1209600" },
    { label: "30 Days", value: "2592000" },
  ];

  const isExecuting = flowStep === "approving" || flowStep === "creating";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Create New Campaign
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Set up a new affiliate campaign with real-time token approval and escrow funding
        </p>
      </div>

      {/* Success Notification Banner */}
      {lastCreatedCampaign && (
        <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                Campaign #{lastCreatedCampaign.campaignId} Live on Soroban Escrow!
              </h4>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                Token approval and budget deposit sequence completed successfully. Tx Hash:{" "}
                <span className="font-mono font-semibold">
                  {lastCreatedCampaign.txHash
                    ? lastCreatedCampaign.txHash.slice(0, 16) + "..."
                    : "Confirmed"}
                </span>
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLastCreatedCampaign(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-6 pt-8 px-8">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Campaign Details & Escrow Funding
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Configure affiliate rates, budget allowance, and on-chain escrow
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleSequentialApproveAndCreate}>
            <div className="space-y-8">
              <InputField
                label="Campaign Name"
                description="Give your campaign a recognizable name"
                required
              >
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g., Summer Sale 2024"
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                  required
                />
              </InputField>

              <div className="grid md:grid-cols-2 gap-6">
                <InputField
                  label="Commission Rate"
                  description="Percentage commission for affiliates"
                  required
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                      placeholder="e.g., 15 for 15%"
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                      required
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      %
                    </div>
                  </div>
                </InputField>

                <InputField
                  label="Campaign Budget"
                  description="Total budget allocated for commissions and escrow deposit"
                  required
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      value={budget}
                      onChange={(e) => {
                        setBudget(e.target.value);
                        if (flowStep === "success" || flowStep === "error") {
                          setFlowStep("idle");
                        }
                      }}
                      placeholder="e.g., 1000"
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                      required
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      XLM
                    </div>
                  </div>
                </InputField>
              </div>

              <InputField
                label="Payout Clearing Period"
                description="Time before affiliates can claim commissions"
                required
              >
                <div className="space-y-4">
                  <div className="flex gap-3">
                    {presetPeriods.map((period) => (
                      <Button
                        key={period.value}
                        type="button"
                        variant={clearingPeriod === period.value ? "default" : "outline"}
                        className={`flex-1 h-12 rounded-xl transition-all font-semibold ${
                          clearingPeriod === period.value
                            ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-md border-0"
                            : "border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                        onClick={() => setClearingPeriod(period.value)}
                      >
                        {period.label}
                      </Button>
                    ))}
                  </div>

                  <div className="relative">
                    <Input
                      type="number"
                      value={clearingPeriod}
                      onChange={(e) => setClearingPeriod(e.target.value)}
                      placeholder="Or enter custom period in seconds"
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      seconds
                    </div>
                  </div>
                </div>
              </InputField>

              {/* REAL-TIME TOKEN ALLOWANCE & ESCROW FLOW PANEL */}
              <div className="bg-slate-50 dark:bg-zinc-950/70 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <h4 className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-xs">
                      Soroban Escrow & Allowance Gate
                    </h4>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                      SEP-41 / SAC Standard
                    </span>
                    <button
                      type="button"
                      onClick={handleManualRefreshAllowance}
                      disabled={isRefreshingAllowance}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1"
                      title="Refresh token allowance"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${isRefreshingAllowance ? "animate-spin" : ""}`}
                      />
                    </button>
                  </div>
                </div>

                {/* Allowance Status Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 space-y-1">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center justify-between">
                      <span>Current Allowance</span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {formatStellarAddress(CONTRACT_ADDRESSES.CAMPAIGN_ESCROW)}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-white font-mono">
                      {tokenAllowance.toLocaleString()} <span className="text-xs font-sans text-zinc-400 font-normal">XLM</span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 space-y-1">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      Required Deposit
                    </div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-white font-mono">
                      {budgetNum.toLocaleString()} <span className="text-xs font-sans text-zinc-400 font-normal">XLM</span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 space-y-1">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      Allowance Status
                    </div>
                    <div className="flex items-center space-x-1.5 pt-0.5">
                      {budgetNum <= 0 ? (
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                          Awaiting budget input
                        </span>
                      ) : isAllowanceSufficient ? (
                        <div className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Allowance Sufficient</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                          <AlertCircle className="w-4 h-4" />
                          <span>Approval Needed (-{allowanceDeficit.toLocaleString()} XLM)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sequential Two-Step Visual Progress Tracker */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/90 border border-slate-200/80 dark:border-zinc-800/80">
                  <div className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-3">
                    Transaction Pipeline
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                    {/* Step 1 Box */}
                    <div
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        flowStep === "approving"
                          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20"
                          : isAllowanceSufficient || flowStep === "approved" || flowStep === "success"
                          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300"
                          : "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            flowStep === "approving"
                              ? "bg-indigo-600 text-white animate-pulse"
                              : isAllowanceSufficient || flowStep === "approved" || flowStep === "success"
                              ? "bg-emerald-500 text-white"
                              : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          {isAllowanceSufficient || flowStep === "approved" || flowStep === "success" ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            "1"
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-zinc-900 dark:text-white">
                            Token Approval
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {flowStep === "approving"
                              ? "Signing approval..."
                              : isAllowanceSufficient || flowStep === "approved" || flowStep === "success"
                              ? "Allowance Granted"
                              : `Authorize ${budgetNum ? budgetNum + " XLM" : "Escrow"}`}
                          </div>
                        </div>
                      </div>
                      {flowStep === "approving" && (
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    {/* Step 2 Box */}
                    <div
                      className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                        flowStep === "creating"
                          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20"
                          : flowStep === "success"
                          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300"
                          : "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            flowStep === "creating"
                              ? "bg-indigo-600 text-white animate-pulse"
                              : flowStep === "success"
                              ? "bg-emerald-500 text-white"
                              : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          {flowStep === "success" ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            "2"
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-zinc-900 dark:text-white">
                            Create Escrow
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {flowStep === "creating"
                              ? "Deploying contract..."
                              : flowStep === "success"
                              ? "Escrow Live"
                              : "Lock budget on Stellar"}
                          </div>
                        </div>
                      </div>
                      {flowStep === "creating" && (
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Card */}
              <div className="bg-slate-50 dark:bg-zinc-950/50 p-6 rounded-2xl border border-slate-100 dark:border-zinc-800/50">
                <h4 className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-xs mb-4">
                  Campaign Summary
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <Target className="w-4 h-4 mr-2" />
                      Commission Rate
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {commissionRate || "0"}%
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <Clock className="w-4 h-4 mr-2" />
                      Clearing Period
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {clearingPeriod ? Math.round(parseInt(clearingPeriod) / 86400) : "0"} days
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Initial Escrow Deposit
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {budget || "0"} XLM
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS: Sequential 1-Click vs Step-by-Step */}
              <div className="space-y-3 pt-2">
                {!isAllowanceSufficient && budgetNum > 0 ? (
                  <div className="space-y-3">
                    <Button
                      type="submit"
                      disabled={isExecuting}
                      className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white text-base md:text-lg font-bold shadow-lg shadow-indigo-600/20 rounded-xl transition-all"
                    >
                      {flowStep === "approving" ? (
                        <div className="flex items-center space-x-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Step 1/2: Approving Token Allowance...</span>
                        </div>
                      ) : flowStep === "creating" ? (
                        <div className="flex items-center space-x-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Step 2/2: Deploying Campaign Escrow...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
                          <Zap className="w-5 h-5" />
                          <span>Approve & Launch Campaign (2-Step Flow)</span>
                          <ArrowRight className="w-4 h-4 ml-1 opacity-80" />
                        </div>
                      )}
                    </Button>

                    <div className="flex items-center justify-center gap-2 pt-1">
                      <span className="text-xs text-zinc-400 font-medium">Or perform steps manually:</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isExecuting}
                        onClick={handleApproveAllowanceOnly}
                        className="text-xs h-8 rounded-lg border-zinc-300 dark:border-zinc-700 font-semibold"
                      >
                        <Lock className="w-3.5 h-3.5 mr-1" />
                        Approve Allowance Only
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="submit"
                    disabled={isExecuting}
                    className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all"
                  >
                    {flowStep === "creating" ? (
                      <div className="flex items-center space-x-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Creating Campaign Escrow...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Zap className="w-5 h-5" />
                        <span>Launch Campaign (Escrow Ready)</span>
                      </div>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
