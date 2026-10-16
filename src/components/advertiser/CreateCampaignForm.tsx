import { useState, useRef } from "react";
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
import { Zap, Target, Clock, DollarSign } from "lucide-react";

export const CreateCampaignForm = () => {
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [optimisticCampaign, setOptimisticCampaign] = useState<{
    campaignId: string;
    name: string;
    budget: number;
    commissionRate: number;
    clearingPeriod: number;
    txHash?: string;
    status: "pending" | "confirmed" | "failed";
  } | null>(null);
  const snapshotRef = useRef<{
    campaignName: string;
    budget: string;
    commissionRate: string;
    clearingPeriod: string;
  } | null>(null);
  const [lastFailedCampaign, setLastFailedCampaign] = useState<string | null>(null);

  const { createCampaignOnChain, isConnected } = useWeb3();
  const { showNotification } = useNotification();

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Please connect your Freighter wallet first",
      });
      return;
    }

    setIsLoading(true);

    // Snapshot current form state for reliable revert on failure
    snapshotRef.current = {
      campaignName,
      budget,
      commissionRate,
      clearingPeriod,
    };

    const parsedBudget = parseFloat(budget) || 1000;
    const parsedCommission = parseFloat(commissionRate) || 10;
    const parsedClearing = parseInt(clearingPeriod) || 604800;

    // Optimistic UI: update state instantly (<50ms) before awaiting the chain
    const optimisticId = `pending-${Date.now()}`;
    setOptimisticCampaign({
      campaignId: optimisticId,
      name: campaignName,
      budget: parsedBudget,
      commissionRate: parsedCommission,
      clearingPeriod: parsedClearing,
      status: "pending",
    });
    setLastFailedCampaign(null);

    // Clear the form immediately for instant feedback
    setCommissionRate("");
    setClearingPeriod("");
    setCampaignName("");
    setBudget("");

    try {
      showNotification({
        type: "info",
        title: "Soroban Escrow Initiated",
        message: "Locking budget and creating campaign on Stellar...",
      });

      const result = await createCampaignOnChain(
        campaignName,
        parsedBudget,
        parsedCommission,
        parsedClearing,
      );

      // Confirm the optimistic entry with the real on-chain data
      setOptimisticCampaign({
        campaignId: result.campaignId,
        name: campaignName,
        budget: parsedBudget,
        commissionRate: parsedCommission,
        clearingPeriod: parsedClearing,
        txHash: result.txHash,
        status: "confirmed",
      });

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
        message: `Campaign #${result.campaignId} deployed on Soroban. Tx: ${result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });
    } catch (error: any) {
      console.error("Error creating campaign:", error);

      // Reliable revert: restore the exact pre-submit form state
      const snapshot = snapshotRef.current;
      if (snapshot) {
        setCampaignName(snapshot.campaignName);
        setBudget(snapshot.budget);
        setCommissionRate(snapshot.commissionRate);
        setClearingPeriod(snapshot.clearingPeriod);
      }

      // Mark the optimistic entry as failed so the UI can reflect the revert
      setOptimisticCampaign((prev) =>
        prev ? { ...prev, status: "failed" } : null,
      );
      setLastFailedCampaign(campaignName);

      showNotification({
        type: "error",
        title: "Creation Failed",
        message:
          error instanceof Error ? error.message : "Failed to create campaign",
      });
    } finally {
      setIsLoading(false);
      snapshotRef.current = null;
      setLastFailedCampaign(null);
    }
  };

  const presetPeriods = [
    { label: "7 Days", value: "604800" },
    { label: "14 Days", value: "1209600" },
    { label: "30 Days", value: "2592000" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Create New Campaign
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Set up a new affiliate campaign with commission rates and payout terms
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-6 pt-8 px-8">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Campaign Details
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Configure your affiliate program settings
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleCreateCampaign}>
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
                  description="Total budget allocated for commissions"
                >
                  <div className="relative">
                    <Input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="e.g., 10000"
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
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
                      Estimated Budget
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {budget || "0"} XLM
                    </div>
                  </div>
                </div>
              </div>

              {optimisticCampaign && (
                <div
                  className={`p-4 rounded-2xl border text-sm font-medium flex items-center justify-between ${
                    optimisticCampaign.status === "pending"
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300"
                      : optimisticCampaign.status === "confirmed"
                        ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300"
                        : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300"
                  }`}
                >
                  <span>
                    {optimisticCampaign.status === "pending" &&
                      `Creating "${optimisticCampaign.name}" (${optimisticCampaign.budget} XLM)...`}
                    {optimisticCampaign.status === "confirmed" &&
                      `Campaign #${optimisticCampaign.campaignId} confirmed on-chain`}
                    {optimisticCampaign.status === "failed" &&
                      `Creation failed — form state reverted`}
                  </span>
                  {optimisticCampaign.status === "pending" && (
                    <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  )}
                  {optimisticCampaign.status === "failed" && lastFailedCampaign && (
                    <span className="text-xs opacity-75">{lastFailedCampaign}</span>
                  )}
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating Campaign...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5" />
                    <span>Launch Campaign</span>
                  </div>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
