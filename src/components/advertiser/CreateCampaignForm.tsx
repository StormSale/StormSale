import { useState } from "react";
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
import { useAccountReserve } from "../../hooks/useAccountReserve";
import { useNotification } from "../../context/NotificationContext";
import { InfoTooltip } from "../ui/tooltip";
import { Zap, Target, Clock, DollarSign, TriangleAlert, Wallet } from "lucide-react";

const formatXlm = (value: number): string => value.toFixed(7).replace(/\.?0+$/, "");

export const CreateCampaignForm = () => {
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { createCampaignOnChain, isConnected, userAddress, xlmBalance } = useWeb3();
  const {
    spendableXlm,
    reserveXlm,
    balanceXlm,
    subentries,
    baseReserveXlm,
    isLoading: isReserveLoading,
    isFallback,
  } = useAccountReserve(userAddress, xlmBalance);
  const { showNotification } = useNotification();

  const parsedBudget = parseFloat(budget);
  const hasBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
  const exceedsSpendable = isConnected && hasBudget && parsedBudget > spendableXlm + 1e-7;

  const handleMaxBudget = () => {
    if (spendableXlm <= 0) {
      setBudget("");
      return;
    }
    setBudget(formatXlm(spendableXlm));
  };

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

    // Enforce Stellar minimum reserve: escrow can only draw from spendable balance.
    if (exceedsSpendable) {
      showNotification({
        type: "error",
        title: "Insufficient Spendable Balance",
        message: `Budget exceeds your spendable balance of ${formatXlm(spendableXlm)} XLM. ${formatXlm(reserveXlm)} XLM is locked by the Stellar minimum reserve.`,
      });
      return;
    }

    setIsLoading(true);
    try {
      showNotification({
        type: "info",
        title: "Soroban Escrow Initiated",
        message: "Locking budget and creating campaign on Stellar...",
      });

      const result = await createCampaignOnChain(
        campaignName,
        parseFloat(budget) || 1000,
        parseFloat(commissionRate) || 10,
        parseInt(clearingPeriod) || 604800,
      );

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
        message: `Campaign #${result.campaignId} deployed on Soroban. Tx: ${result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });

      setCommissionRate("");
      setClearingPeriod("");
      setCampaignName("");
      setBudget("");
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      showNotification({
        type: "error",
        title: "Creation Failed",
        message: error.message || "Failed to create campaign",
      });
    } finally {
      setIsLoading(false);
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
                      min="0"
                      step="0.0000001"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="e.g., 10000"
                      variant={exceedsSpendable ? "error" : "default"}
                      className="h-12 pr-28 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleMaxBudget}
                        disabled={!isConnected || spendableXlm <= 0}
                        className="h-8 rounded-lg px-3 text-xs font-bold border-slate-200 dark:border-zinc-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                      >
                        Max
                      </Button>
                      <span className="text-zinc-400 font-medium">XLM</span>
                    </div>
                  </div>

                  {exceedsSpendable && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-1.5">
                      <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Amount exceeds your spendable balance of {formatXlm(spendableXlm)} XLM. The
                        Stellar minimum reserve keeps {formatXlm(reserveXlm)} XLM locked.
                      </span>
                    </p>
                  )}
                </InputField>
              </div>

              {/* Reserve & spendable balance awareness */}
              <div className="rounded-2xl border border-slate-100 dark:border-zinc-800/50 bg-slate-50 dark:bg-zinc-950/50 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <Wallet className="w-4 h-4" />
                    Escrow Capacity
                  </div>
                  <InfoTooltip
                    label="Base reserve"
                    text={`Stellar requires every account to keep a minimum reserve of 1 XLM (2 × ${formatXlm(baseReserveXlm)} XLM base reserve) plus ${formatXlm(baseReserveXlm)} XLM for each subentry — trustlines, open offers, data entries, and extra signers. Funds held by that reserve cannot be spent or escrowed.`}
                  />
                </div>

                {!isConnected ? (
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Connect a wallet to see how much XLM is available to escrow.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Balance
                        </p>
                        <p className="font-bold text-zinc-900 dark:text-white">
                          {isReserveLoading ? "…" : `${formatXlm(balanceXlm)} XLM`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Min. Reserve
                        </p>
                        <p className="font-bold text-amber-600 dark:text-amber-400">
                          {isReserveLoading ? "…" : `-${formatXlm(reserveXlm)} XLM`}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                          Spendable
                        </p>
                        <p className="font-bold text-emerald-600 dark:text-emerald-400">
                          {isReserveLoading ? "…" : `${formatXlm(spendableXlm)} XLM`}
                        </p>
                      </div>
                    </div>

                    {subentries > 0 && (
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {subentries} subentr{subentries === 1 ? "y" : "ies"} detected (trustlines,
                        open offers, data entries, or extra signers) locking an additional{" "}
                        {formatXlm(subentries * baseReserveXlm)} XLM.
                      </p>
                    )}

                    {isFallback && (
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        Live reserve data is unavailable right now; using your wallet balance with
                        the default base reserve.
                      </p>
                    )}
                  </>
                )}
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

              <Button
                type="submit"
                disabled={isLoading || exceedsSpendable}
                title={
                  exceedsSpendable
                    ? `Budget exceeds your spendable balance of ${formatXlm(spendableXlm)} XLM`
                    : undefined
                }
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating Campaign...</span>
                  </div>
                ) : exceedsSpendable ? (
                  <div className="flex items-center space-x-2">
                    <TriangleAlert className="w-5 h-5" />
                    <span>Exceeds Spendable Balance</span>
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
