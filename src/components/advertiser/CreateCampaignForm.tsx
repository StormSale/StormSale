import { useState, useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputField } from "../../components/ui/input-group";
import { TerminologyTooltip } from "../../components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { getCreateCampaignSchema, getFieldErrors } from "../../lib/validation";
import { CONTRACT_ADDRESSES } from "../../config/contracts";
import { formatStellarAddress } from "../../lib/stellar";
import {
  Zap,
  Target,
  Clock,
  DollarSign,
  Coins,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Lock,
  Globe,
} from "lucide-react";
import { setCampaignVisibility } from "../../lib/campaignAccess";
import { SUPPORTED_ESCROW_ASSETS } from "../../config/stellar";
import type { SupportedEscrowAssetCode } from "../../config/stellar";

export type FlowStep =
  "idle" | "checking" | "approving" | "approved" | "creating" | "success" | "error";

export const CreateCampaignForm = () => {
  const [selectedAsset, setSelectedAsset] = useState<SupportedEscrowAssetCode>("XLM");
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [isRefreshingAllowance, setIsRefreshingAllowance] = useState(false);
  // Private campaigns require affiliates to apply and be approved before they
  // can generate tracking links or be credited with sales.
  const [isPrivate, setIsPrivate] = useState(false);
  const [lastCreatedCampaign, setLastCreatedCampaign] = useState<{
    campaignId: number;
    txHash?: string;
  } | null>(null);

  const [assetAllowances, setAssetAllowances] = useState<Record<SupportedEscrowAssetCode, number>>({
    XLM: 0,
    USDC: 0,
    EURC: 0,
  });

  const {
    createCampaignOnChain,
    isConnected,
    userAddress,
    tokenAllowance,
    refreshTokenAllowance,
    approveTokenAllowance,
    assetBalances,
    isMultiSigAccount,
    openMultiSigModal,
  } = useWeb3();
  const { showNotification } = useNotification();

  // Numeric calculations
  const parsedBudget = parseFloat(budget);
  const maxDecimals = SUPPORTED_ESCROW_ASSETS[selectedAsset]?.decimals ?? 7;
  const fracDigits = budget.includes(".") ? (budget.split(".")[1]?.length ?? 0) : 0;
  const isValidBudget = Boolean(
    budget &&
    !isNaN(parsedBudget) &&
    isFinite(parsedBudget) &&
    parsedBudget > 0 &&
    fracDigits <= maxDecimals,
  );
  const budgetNum = isValidBudget ? parsedBudget : 0;
  const currentAssetAllowance = assetAllowances[selectedAsset] ?? tokenAllowance;
  const isAllowanceSufficient = isConnected && isValidBudget && currentAssetAllowance >= budgetNum;
  const allowanceDeficit = Math.max(0, budgetNum - currentAssetAllowance);
  const isExecuting = flowStep === "approving" || flowStep === "creating";

  // Poll or refresh allowance on address change, mount, or asset switch
  useEffect(() => {
    if (isConnected && userAddress) {
      refreshTokenAllowance(undefined, selectedAsset).then((val) => {
        setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: val }));
      });
    }
  }, [isConnected, userAddress, selectedAsset, refreshTokenAllowance]);

  const handleManualRefreshAllowance = async () => {
    setIsRefreshingAllowance(true);
    try {
      const val = await refreshTokenAllowance(undefined, selectedAsset);
      setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: val }));
      showNotification({
        type: "info",
        title: "Allowance Refreshed",
        message: `Current token allowance: ${val} ${selectedAsset}`,
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

    if (!isValidBudget) {
      showNotification({
        type: "error",
        title: "Invalid Budget",
        message:
          fracDigits > maxDecimals
            ? `Budget for ${selectedAsset} supports at most ${maxDecimals} decimal places.`
            : "Please enter a valid positive budget amount.",
      });
      return;
    }

    setFlowStep("approving");
    try {
      showNotification({
        type: "info",
        title: "Step 1: Approving Token Allowance",
        message: `Approving ${budgetNum} ${selectedAsset} for the Escrow Contract...`,
      });

      const res = await approveTokenAllowance(budgetNum, undefined, selectedAsset);
      setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: budgetNum }));

      showNotification({
        type: "success",
        title: "Allowance Approved!",
        message: `Approved ${budgetNum} ${selectedAsset} allowance. Tx: ${
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
    setErrors({});

    const result = getCreateCampaignSchema(maxDecimals).safeParse({
      campaignName,
      commissionRate,
      budget,
      clearingPeriod,
    });

    if (!result.success) {
      const fieldErrors = getFieldErrors(result.error);
      setErrors(fieldErrors);
      showNotification({
        type: "error",
        title: "Validation Error",
        message: Object.values(fieldErrors)[0] || "Please check the form fields",
      });
      return;
    }

    if (!isConnected) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Please connect your Freighter wallet first",
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
          message: `Approving ${budgetNum} ${selectedAsset} for the Escrow Contract...`,
        });

        await approveTokenAllowance(budgetNum, undefined, selectedAsset);
        setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: budgetNum }));

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
        message: `Locking ${budgetNum} ${selectedAsset} budget and creating campaign on Stellar...`,
      });

      const campaignResult = await createCampaignOnChain(
        result.data.campaignName,
        budgetNum,
        Number(result.data.commissionRate),
        parseInt(result.data.clearingPeriod, 10),
        selectedAsset,
      );

      // Record the access policy. This runs after the budget is already locked
      // in escrow, so a failure here must not be reported as a failed
      // creation: the campaign exists, and retrying would lock a second escrow.
      let visibilitySaved = true;
      try {
        setCampaignVisibility(
          campaignResult.campaignId,
          userAddress ?? "",
          isPrivate ? "private" : "public",
        );
      } catch (visibilityError: any) {
        visibilitySaved = false;
        console.error("Campaign created, but its access setting was not saved:", visibilityError);
        showNotification({
          type: "warning",
          title: "Campaign Created — Access Setting Not Saved",
          message: `Campaign #${campaignResult.campaignId} is live on-chain, but its ${
            isPrivate ? "private" : "public"
          } setting could not be saved: ${visibilityError?.message ?? "unknown error"}. Do not create it again.`,
        });
      }

      showNotification({
        type: "success",
        title:
          isPrivate && visibilitySaved
            ? "Private Campaign Live on Stellar!"
            : "Campaign Escrow Live on Stellar!",
        message: `Campaign #${campaignResult.campaignId} deployed with ${selectedAsset} escrow. Tx: ${
          campaignResult.txHash ? campaignResult.txHash.slice(0, 10) + "..." : "Confirmed"
        }`,
      });

      setLastCreatedCampaign({
        campaignId: campaignResult.campaignId,
        txHash: campaignResult.txHash,
      });

      setFlowStep("success");
      setCommissionRate("");
      setClearingPeriod("");
      setCampaignName("");
      setBudget("");
      setErrors({});
      setIsPrivate(false);
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      showNotification({
        type: "error",
        title: "Failed to Create Campaign",
        message: error.message || "An error occurred while creating the campaign on Stellar",
      });
      setFlowStep("error");
    }
  };

  const presetPeriods = [
    { label: "1 Hour", value: "3600" },
    { label: "24 Hours", value: "86400" },
    { label: "7 Days", value: "604800" },
    { label: "30 Days", value: "2592000" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Success Notification Banner for Newly Created Campaign */}
      {lastCreatedCampaign && flowStep === "success" && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h5 className="font-bold text-sm text-emerald-950 dark:text-emerald-200">
                Campaign #{lastCreatedCampaign.campaignId} Successfully Initialized
              </h5>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                On-chain escrow is funded and ready to record affiliate conversions in{" "}
                {selectedAsset}.
              </p>
              {lastCreatedCampaign.txHash && (
                <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 block mt-1">
                  Tx Hash: {lastCreatedCampaign.txHash}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLastCreatedCampaign(null)}
            className="text-xs text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
          >
            Dismiss
          </Button>
        </div>
      )}

      <Card className="border-0 shadow-xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-3xl overflow-hidden">
        <CardHeader className="p-8 border-b border-slate-100 dark:border-zinc-800/80">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Create Campaign & Escrow Funding
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Configure affiliate rates, budget allowance, and on-chain escrow
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleSequentialApproveAndCreate} noValidate>
            <div className="space-y-8">
              <InputField
                label="Campaign Name"
                description="Give your campaign a recognizable name"
                error={errors.campaignName}
                required
              >
                <Input
                  value={campaignName}
                  onChange={(e) => {
                    setCampaignName(e.target.value);
                    if (errors.campaignName) setErrors((prev) => ({ ...prev, campaignName: "" }));
                  }}
                  placeholder="e.g., Summer Sale 2024"
                  variant={errors.campaignName ? "error" : "default"}
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                />
              </InputField>

              <InputField
                label="Escrow Settlement Currency"
                description="Select native XLM or Circle SAC stablecoin (USDC, EURC) for commission escrow"
                required
              >
                <div className="space-y-3">
                  <div className="relative">
                    <select
                      id="asset-selector"
                      aria-label="Escrow Settlement Currency"
                      value={selectedAsset}
                      onChange={(e) => setSelectedAsset(e.target.value as SupportedEscrowAssetCode)}
                      className="w-full h-12 pl-4 pr-10 appearance-none border border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 text-zinc-900 dark:text-white font-medium text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:focus:ring-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="XLM">
                        XLM — Stellar Lumens (Native) · Balance: {assetBalances?.XLM ?? "0.00"} XLM
                      </option>
                      <option value="USDC">
                        USDC — USD Coin (Circle SAC) · Balance: {assetBalances?.USDC ?? "0.00"} USDC
                      </option>
                      <option value="EURC">
                        EURC — Euro Coin (Circle SAC) · Balance: {assetBalances?.EURC ?? "0.00"}{" "}
                        EURC
                      </option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  {/* SAC Asset Specification Banner */}
                  <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-indigo-500" />
                        {SUPPORTED_ESCROW_ASSETS[selectedAsset].name}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
                        {selectedAsset === "XLM" ? "Native Asset" : "Circle SAC Token"}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-indigo-100/60 dark:border-indigo-900/30 text-zinc-600 dark:text-zinc-400">
                      <div>
                        <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                          SAC Contract:{" "}
                        </span>
                        <span
                          className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200"
                          title={SUPPORTED_ESCROW_ASSETS[selectedAsset].contractAddress}
                        >
                          {SUPPORTED_ESCROW_ASSETS[selectedAsset].contractAddress.slice(0, 8)}...
                          {SUPPORTED_ESCROW_ASSETS[selectedAsset].contractAddress.slice(-6)}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                          Wallet Balance:{" "}
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-white">
                          {assetBalances?.[selectedAsset] ?? "0.00"} {selectedAsset}
                        </span>
                      </div>
                    </div>

                    {selectedAsset !== "XLM" && (
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-1.5 pt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        SAC Allowance Workflow: Auto-authorizes token approval on Circle SAC before
                        escrow deployment.
                      </p>
                    )}
                  </div>
                </div>
              </InputField>

              <div className="grid md:grid-cols-2 gap-6">
                <InputField
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      Commission Rate
                      <TerminologyTooltip term="commission_rate" iconOnly />
                    </span>
                  }
                  description="Percentage commission for affiliates (1–50%)"
                  error={errors.commissionRate}
                  required
                >
                  <div className="relative">
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={commissionRate}
                      onChange={(e) => {
                        setCommissionRate(e.target.value);
                        if (errors.commissionRate)
                          setErrors((prev) => ({ ...prev, commissionRate: "" }));
                      }}
                      placeholder="e.g., 15 for 15%"
                      variant={errors.commissionRate ? "error" : "default"}
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      %
                    </div>
                  </div>
                </InputField>

                <InputField
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      Campaign Budget
                      <TerminologyTooltip term="escrow" iconOnly />
                    </span>
                  }
                  description="Total budget allocated for commissions and escrow deposit"
                  error={errors.budget}
                  required
                >
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Input
                        type="number"
                        min="1"
                        value={budget}
                        onChange={(e) => {
                          setBudget(e.target.value);
                          if (errors.budget) setErrors((prev) => ({ ...prev, budget: "" }));
                          if (flowStep === "success" || flowStep === "error") {
                            setFlowStep("idle");
                          }
                        }}
                        placeholder="e.g., 1000"
                        variant={errors.budget ? "error" : "default"}
                        className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                        required
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-bold uppercase text-xs">
                        {selectedAsset}
                      </div>
                    </div>
                    {budget &&
                      parseFloat(budget) > parseFloat(assetBalances?.[selectedAsset] || "0") && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Warning: Budget exceeds current {selectedAsset} balance (
                          {assetBalances?.[selectedAsset] ?? "0.00"}).
                        </p>
                      )}
                  </div>
                </InputField>
              </div>

              <InputField
                label={
                  <span className="inline-flex items-center gap-1.5">
                    Payout Clearing Period
                    <TerminologyTooltip term="clearing_period" iconOnly />
                  </span>
                }
                description="Time before affiliates can claim commissions (min 1 hour)"
                error={errors.clearingPeriod}
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
                        onClick={() => {
                          setClearingPeriod(period.value);
                          if (errors.clearingPeriod)
                            setErrors((prev) => ({ ...prev, clearingPeriod: "" }));
                        }}
                      >
                        {period.label}
                      </Button>
                    ))}
                  </div>

                  <div className="relative">
                    <Input
                      type="number"
                      value={clearingPeriod}
                      onChange={(e) => {
                        setClearingPeriod(e.target.value);
                        if (errors.clearingPeriod)
                          setErrors((prev) => ({ ...prev, clearingPeriod: "" }));
                      }}
                      placeholder="Or enter custom period in seconds"
                      variant={errors.clearingPeriod ? "error" : "default"}
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      seconds
                    </div>
                  </div>
                </div>
              </InputField>

              {/* Visibility: public, or private with manual approval */}
              <div className="flex items-start justify-between gap-4 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isPrivate
                        ? "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isPrivate ? <Lock className="w-5 h-5" aria-hidden="true" /> : <Globe className="w-5 h-5" aria-hidden="true" />}
                  </div>
                  <div>
                    <p
                      id="campaign-private-label"
                      className="font-bold text-zinc-900 dark:text-white"
                    >
                      Private / Application Required
                    </p>
                    <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      {isPrivate
                        ? "Affiliates must apply with their promotional channels. Only affiliates you approve can generate tracking links or be credited with sales. The approval list is saved in this browser for now, so manage applications from this device."
                        : "Any affiliate can generate a tracking link and promote this campaign."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPrivate}
                  aria-labelledby="campaign-private-label"
                  onClick={() => setIsPrivate((v) => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    isPrivate ? "bg-indigo-600" : "bg-slate-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      isPrivate ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

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
                      {currentAssetAllowance.toLocaleString()}{" "}
                      <span className="text-xs font-sans text-zinc-400 font-normal">
                        {selectedAsset}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-slate-200/80 dark:border-zinc-800/80 space-y-1">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      Required Deposit
                    </div>
                    <div className="text-xl font-bold text-zinc-900 dark:text-white font-mono">
                      {budgetNum.toLocaleString()}{" "}
                      <span className="text-xs font-sans text-zinc-400 font-normal">
                        {selectedAsset}
                      </span>
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
                          <span>
                            Approval Needed (-{allowanceDeficit.toLocaleString()} {selectedAsset})
                          </span>
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
                          : isAllowanceSufficient ||
                              flowStep === "approved" ||
                              flowStep === "success"
                            ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300"
                            : "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50"
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            flowStep === "approving"
                              ? "bg-indigo-600 text-white animate-pulse"
                              : isAllowanceSufficient ||
                                  flowStep === "approved" ||
                                  flowStep === "success"
                                ? "bg-emerald-500 text-white"
                                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                          }`}
                        >
                          {isAllowanceSufficient ||
                          flowStep === "approved" ||
                          flowStep === "success" ? (
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
                              : isAllowanceSufficient ||
                                  flowStep === "approved" ||
                                  flowStep === "success"
                                ? "Allowance Granted"
                                : `Authorize ${budgetNum ? budgetNum + " " + selectedAsset : "Escrow"}`}
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
                          {flowStep === "success" ? <CheckCircle2 className="w-4 h-4" /> : "2"}
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
                      {budget || "0"} {selectedAsset}
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION BUTTONS: Sequential 1-Click vs Step-by-Step */}
              <div className="space-y-3 pt-2">
                {isMultiSigAccount && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Multi-signature escrow approval active. Co-signer signatures can be
                        coordinated via SEP-0030.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openMultiSigModal()}
                      className="text-xs font-bold underline hover:text-amber-700 ml-2 shrink-0 cursor-pointer"
                    >
                      Multi-Sig Console
                    </button>
                  </div>
                )}
                {!isAllowanceSufficient && budgetNum > 0 ? (
                  <div className="space-y-3">
                    <Button
                      type="submit"
                      loading={isExecuting}
                      cooldown
                      className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white text-base md:text-lg font-bold shadow-lg shadow-indigo-600/20 rounded-xl transition-all"
                    >
                      {flowStep === "approving" ? (
                        <div className="flex items-center space-x-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Step 1/2: Approving {selectedAsset} Allowance...</span>
                        </div>
                      ) : flowStep === "creating" ? (
                        <div className="flex items-center space-x-3">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Step 2/2: Deploying {selectedAsset} Campaign Escrow...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-2">
                          <Zap className="w-5 h-5" />
                          <span>Approve & Launch {selectedAsset} Campaign</span>
                          <ArrowRight className="w-4 h-4 ml-1 opacity-80" />
                        </div>
                      )}
                    </Button>

                    <div className="flex items-center justify-center gap-2 pt-1">
                      <span className="text-xs text-zinc-400 font-medium">
                        Or perform steps manually:
                      </span>
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
                    loading={isExecuting}
                    cooldown
                    className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all"
                  >
                    {flowStep === "creating" ? (
                      <div className="flex items-center space-x-3">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Creating {selectedAsset} Campaign Escrow...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Zap className="w-5 h-5" />
                        <span>Launch {selectedAsset} Campaign (Escrow Ready)</span>
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
