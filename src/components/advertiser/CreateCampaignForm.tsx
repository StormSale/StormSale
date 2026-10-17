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
import { useNotification } from "../../context/NotificationContext";
import {
  Zap,
  Target,
  Clock,
  DollarSign,
  Coins,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { SUPPORTED_ESCROW_ASSETS } from "../../config/stellar";
import type { SupportedEscrowAssetCode } from "../../config/stellar";

export const CreateCampaignForm = () => {
  const [selectedAsset, setSelectedAsset] = useState<SupportedEscrowAssetCode>("XLM");
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { createCampaignOnChain, isConnected, assetBalances } = useWeb3();
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

    const parsedBudget = parseFloat(budget);
    if (!budget || isNaN(parsedBudget) || !isFinite(parsedBudget) || parsedBudget <= 0) {
      showNotification({
        type: "error",
        title: "Invalid Budget",
        message: "Please enter a valid positive budget amount.",
      });
      return;
    }

    setIsLoading(true);
    try {
      showNotification({
        type: "info",
        title: "Soroban Escrow Initiated",
        message: `Locking ${selectedAsset} budget and deploying escrow on Stellar...`,
      });

      const result = await createCampaignOnChain(
        campaignName,
        parsedBudget,
        parseFloat(commissionRate) || 10,
        parseInt(clearingPeriod) || 604800,
        selectedAsset,
      );

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
        message: `Campaign #${result.campaignId} deployed with ${selectedAsset} escrow. Tx: ${result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"}`,
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
                        EURC — Euro Coin (Circle SAC) · Balance: {assetBalances?.EURC ?? "0.00"} EURC
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
                        <span className="font-semibold text-zinc-500 dark:text-zinc-400">SAC Contract: </span>
                        <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200" title={SUPPORTED_ESCROW_ASSETS[selectedAsset].contractAddress}>
                          {SUPPORTED_ESCROW_ASSETS[selectedAsset].contractAddress.slice(0, 8)}...
                          {SUPPORTED_ESCROW_ASSETS[selectedAsset].contractAddress.slice(-6)}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-500 dark:text-zinc-400">Wallet Balance: </span>
                        <span className="font-bold text-zinc-900 dark:text-white">
                          {assetBalances?.[selectedAsset] ?? "0.00"} {selectedAsset}
                        </span>
                      </div>
                    </div>

                    {selectedAsset !== "XLM" && (
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-1.5 pt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        SAC Allowance Workflow: Auto-authorizes token approval on Circle SAC before escrow deployment.
                      </p>
                    )}
                  </div>
                </div>
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
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Input
                        type="number"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder="e.g., 10000"
                        className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                      />
                      <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-bold uppercase text-xs">
                        {selectedAsset}
                      </div>
                    </div>
                    {budget && parseFloat(budget) > parseFloat(assetBalances?.[selectedAsset] || "0") && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Warning: Budget exceeds current {selectedAsset} balance ({assetBalances?.[selectedAsset] ?? "0.00"}).
                      </p>
                    )}
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
                      {budget || "0"} {selectedAsset}
                    </div>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creating {selectedAsset} Campaign...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Zap className="w-5 h-5" />
                    <span>Launch {selectedAsset} Escrow Campaign</span>
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
