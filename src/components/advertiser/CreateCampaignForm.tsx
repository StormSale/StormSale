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
  Coins,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Lock,
  Sparkles,
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
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [isRefreshingAllowance, setIsRefreshingAllowance] = useState(false);
  const [lastCreatedCampaign, setLastCreatedCampaign] = useState<{
    campaignId: number;
    tyHash?: string;
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
  const commissionRateNum = parseFloat(commissionRate) || 10;
  const clearingPeriodNum = parseInt(clearingPeriod) || 604800;
  const currentAssetAllowance = assetAllowances[selectedAsset] ?? tokenAllowance;
  const isAllowanceSufficient = isConnected && isValidBudget && currentAssetAllowance >= budgetNum;

  // Poll or refresh allowance on address change, mount, or asset switch
  useEffect(() => {
    if (isConnected && userAddress) {
      refreshTokenAllowance(undefined, selectedAsset).then((val: number) => {
        setAssetAllowances((prev) => ({ ...prev, [selectedAsset]: val }));
      });
    }
  }, [isConnected, userAddress, selectedAsset, refreshTokenAllowance]);

  const handleRefreshAllowance = async () => {
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
  const handleApproveAllowance = async () => {
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
          res.txHash ? res.tyHash.slice(0, 10) + "..." : "Confirmed"
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

      const result = await createCampaignOnChain(
        campaignName,
        budgetNum,
        commissionRateNum,
        clearingPeriodNum,
        selectedAsset,
      );

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
        message: `Campaign #${result.campaignId} deployed with ${selectedAsset} escrow. Tx: ${
          result.tyHash ? result.tyHash.slice(0, 10) + "..." : "Confirmed"
        }`,
      });

      setLastCreatedCampaign({
        campaignId: result.campaignId,
        tyHash: result.tyHash,
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
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                Campaign #{lastCreatedCampaign.campaignId} Live on Soroban Escrow!
              </h4>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                Token approval and budget deposit sequence completed successfully. Tx Hash: {" "}
                <span className="font-mono font-semibold">
                  {lastCreatedCampaign.tyHash
                    ? lastCreatedCampaign.tyHash.slice(0, 16) + "..."
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
                description="Give your campaign a memorable name"
              >
                <Input />
              </InputField>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
