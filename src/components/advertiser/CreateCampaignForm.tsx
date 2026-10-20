import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { SUPPORTED_ESCROW_ASSETS } from "../../config/stellar";
import type { SupportedEscrowAssetCode } from "../../config/stellar";

export type FlowStep =
  | "idle"
  | "checking"
  | "approving"
  | "approved"
  | "creating"
  | "success"
  | "error";

export const CreateCampaignForm = () => {
  const [selectedAsset, setSelectedAsset] = useState<SupportedEscrowAssetCode>("XLM");
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [isRefreshingAllowance, setIsRefreshingAllowance] = useState(false);
  const [lastCreatedCampaign, setLastCreatedCampaign] = useState<{
    campaignId: number;
    txHash?: string;
  } | null>(null);

  // Optimistic UI: track pending optimistic state so it can be reverted on failure
  const [optimisticAllowance, setOptimisticAllowance] = useState<number | null>(null);
  const optimisticAllowanceRef = useRef<number | null>(null);

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
  const currentAssetAllowance =
    optimisticAllowance ?? assetAllowances[selectedAsset] ?? tokenAllowance;
  const isAllowanceSufficient = isConnected && isValidBudget && currentAssetAllowance >= budgetNum;
  const allowanceDeficit = Math.max(0, budgetNum - currentAssetAllowance);
  const isExecuting = flowStep === "approving" || flowStep === "creating";

  // Keep ref in sync so revert logic can read latest optimistic value without stale closures
  useEffect(() => {
    optimisticAllowanceRef.current = optimisticAllowance;
  }, [optimisticAllowance]);

  const applyOptimisticAllowance = (value: number) => {
    setOptimisticAllowance(value);
    optimisticAllowanceRef.current = value;
  };

  const revertOptimisticAllowance = () => {
    setOptimisticAllowance(null);
    optimisticAllowanceRef.current = null;
  };

  // Poll or refresh allowance on address change, mount, or asset switch
  useEffect(() => {
    if (isConnected && userAddress) {
      refreshTokenAllowance(undefined, selectedAsset).then((val) => {
        setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: val }));
      });
      revertOptimisticAllowance();
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
    applyOptimisticAllowance(budgetNum);
    try {
      showNotification({
        type: "info",
        title: "Step 1: Approving Token Allowance",
        message: `Approving ${budgetNum} ${selectedAsset} for the Escrow Contract...`,
      });

      const res = await approveTokenAllowance(budgetNum, undefined, selectedAsset);
      setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: budgetNum }));
      revertOptimisticAllowance();

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
      revertOptimisticAllowance();
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
      applyOptimisticAllowance(budgetNum);
      try {
        showNotification({
          type: "info",
          title: "Step 1/2: Approving Token Allowance",
          message: `Approving ${budgetNum} ${selectedAsset} for the Escrow Contract...`,
        });

        await approveTokenAllowance(budgetNum, undefined, selectedAsset);
        setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: budgetNum }));
        revertOptimisticAllowance();

        showNotification({
          type: "success",
          title: "Step 1/2 Complete: Allowance Approved",
          message: "Token allowance granted. Automatically proceeding to create campaign escrow...",
        });
        setFlowStep("approved");
      } catch (error: any) {
        console.error("Error during sequential approval step:", error);
        revertOptimisticAllowance();
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

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
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
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      revertOptimisticAllowance();
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
                On-chain escrow is funded and ready to record affiliate conversions in {" "}
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
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                Create Campaign
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-zinc-400 mtt-1">
                Deploy an on-chain escrow campaign on Stellar
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-8 space-y-6">
          {/* Campaign Name */}
          <InputField
            label="Campaign Name"
            icon={Target}
            error={errors.campaignName}
          >
            <Input
              placeholder="e.g., Summer Sale 2025"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              disabled={isExecuting}
            />
          </InputField>

          {/* Asset Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2">
              Escrow Asset
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SUPPORTED_ESCROW_ASSETS) as SupportedEscrowAssetCode[]).map(
                (asset) => (
                  <button
                    key={asset}
                    type="button"
                    onClick={() => setSelectedAsset(asset)}
                    disabled={isExecuting}
                    className={`${
                      selectedAsset === asset
                        ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                        : "border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                    } border rounded-xl p-3 text-sm font-medium transition-colors`}
                  >
                    {asset}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Budget */}
          <InputField
            label={`Budget (${selectedAsset})`}
            icon={DollarSign}
            error={errors.budget}
          >
            <Input
              type="number"
              placeholder="0.00"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              disabled={isExecuting}
            />
          </InputField>

          {/* Commission Rate */}
          <InputField
            label="Commission Rate (%)"
            icon={Coins}
            error={errors.commissionRate}
          >
            <Input
              type="number"
              placeholder="e.g., 10"
              value={commissionRate}
              onChange={(e) => setCommissionRate(e.target.value)}
              disabled={isExecuting}
            />
          </InputField>

          {/* Clearing Period */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-2">
              Clearing Period
            </label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {presetPeriods.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setClearingPeriod(preset.value)}
                  disabled={isExecuting}
                  className={`${
                    clearingPeriod === preset.value
                      ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300"
                      : "border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                  } border rounded-xl p-2 text-xs font-medium transition-colors`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <InputField icon={Clock} error={errors.clearingPeriod}>
              <Input
                type="number"
                placeholder="Seconds"
                value={clearingPeriod}
                onChange={(e) => setClearingPeriod(e.target.value)}
                disabled={isExecuting}
              />
            </InputField>
          </div>

          {/* Allowance Status */}
          {isConnected && isValidBudget && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {isAllowanceSufficient ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">
                    {isAllowanceSufficient
                      ? "Allowance sufficient"
                      : `Approval needed: ${allowanceDeficit.toFixed(2)} ${selectedAsset}`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleManualRefreshAllowance}
                  disabled={isRefreshingAllowance || isExecuting}
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshingAllowance ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={(e) => handleSequentialApproveAndCreate(e)}
            disabled={isExecuting || !isConnected}
            className="w-full h-12 rounded-xl bg-zinc-900 dark:bg-indigo-600 hover:bg-zinc-800 dark:hover:bg-indigo-700 text-white font-semibold"
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {flowStep === "approving" ? "Approving..." : "Creating Campaign..."}
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {isAllowanceSufficient ? "Create Campaign" : "Approve & Create Campaign"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
