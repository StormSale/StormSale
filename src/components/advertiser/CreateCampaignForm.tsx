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
  Layers,
  Plus,
  Trash2,
  TrendingUp,
  Award,
  Sliders,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  type CommissionTier,
  DEFAULT_COMMISSION_TIERS,
  validateCommissionTiers,
  resolveTierForSales,
} from "../../lib/commissionTiers";

export const CreateCampaignForm = () => {
  const [commissionType, setCommissionType] = useState<"flat" | "tiered">("tiered");
  const [commissionRate, setCommissionRate] = useState("10");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Multi-Level Commission Tiers
  const [tiers, setTiers] = useState<CommissionTier[]>(DEFAULT_COMMISSION_TIERS);
  const [simulatedSales, setSimulatedSales] = useState<number>(100);

  const { createCampaignOnChain, isConnected } = useWeb3();
  const { showNotification } = useNotification();

  // Tier updates
  const handleUpdateTier = (id: string, field: keyof CommissionTier, value: any) => {
    setTiers((prev) => prev.map((tier) => (tier.id === id ? { ...tier, [field]: value } : tier)));
  };

  const handleAddTier = () => {
    const highestTier = tiers.reduce(
      (max, t) => (t.minSales > max.minSales ? t : max),
      tiers[0] || { minSales: 0, commissionRate: 10 },
    );
    const newMinSales = highestTier.minSales + 50;
    const newRate = Math.min(50, highestTier.commissionRate + 5);

    const newTier: CommissionTier = {
      id: `tier-${Date.now()}`,
      name: `Tier ${tiers.length + 1}`,
      minSales: newMinSales,
      commissionRate: newRate,
      description: `Unlocked at >${newMinSales} sales`,
    };

    setTiers((prev) => [...prev, newTier]);
  };

  const handleRemoveTier = (id: string) => {
    if (tiers.length <= 1) {
      showNotification({
        type: "warning",
        title: "Tier Limit",
        message: "You must maintain at least one commission tier.",
      });
      return;
    }
    setTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleApplyPreset = (preset: "standard" | "aggressive" | "highTicket") => {
    if (preset === "standard") {
      setTiers([
        {
          id: "tier-1",
          name: "Base Tier",
          minSales: 0,
          commissionRate: 10,
          description: "Base performance",
        },
        {
          id: "tier-2",
          name: "Silver Tier",
          minSales: 50,
          commissionRate: 15,
          description: "50+ verified sales",
        },
        {
          id: "tier-3",
          name: "Gold Tier",
          minSales: 100,
          commissionRate: 20,
          description: "Top performers (>100 sales)",
        },
        {
          id: "tier-4",
          name: "Platinum Tier",
          minSales: 250,
          commissionRate: 25,
          description: "Elite tier (>250 sales)",
        },
      ]);
    } else if (preset === "aggressive") {
      setTiers([
        {
          id: "tier-1",
          name: "Starter Tier",
          minSales: 0,
          commissionRate: 8,
          description: "Starter commission",
        },
        {
          id: "tier-2",
          name: "Rising Star",
          minSales: 25,
          commissionRate: 14,
          description: "Rapid growth tier",
        },
        {
          id: "tier-3",
          name: "Power Affiliate",
          minSales: 100,
          commissionRate: 22,
          description: "High volume (>100 sales)",
        },
      ]);
    } else if (preset === "highTicket") {
      setTiers([
        {
          id: "tier-1",
          name: "Standard Volume",
          minSales: 0,
          commissionRate: 5,
          description: "Standard ticket rate",
        },
        {
          id: "tier-2",
          name: "Pro Marketer",
          minSales: 20,
          commissionRate: 10,
          description: "20+ high-ticket units",
        },
        {
          id: "tier-3",
          name: "VIP Partner",
          minSales: 50,
          commissionRate: 15,
          description: "VIP volume (>50 sales)",
        },
      ]);
    }
  };

  const validationResult = validateCommissionTiers(tiers);
  const simulationResult = resolveTierForSales(
    simulatedSales,
    tiers,
    parseFloat(commissionRate) || 10,
  );

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

    if (commissionType === "tiered") {
      const validation = validateCommissionTiers(tiers);
      if (!validation.valid) {
        showNotification({
          type: "error",
          title: "Invalid Commission Tiers",
          message: validation.error || "Please check your tier configuration.",
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      showNotification({
        type: "info",
        title: "Soroban Escrow Initiated",
        message: "Locking budget and configuring campaign on Stellar...",
      });

      const baseCommissionRate =
        commissionType === "tiered"
          ? tiers.find((t) => t.minSales === 0)?.commissionRate || tiers[0]?.commissionRate || 10
          : parseFloat(commissionRate) || 10;

      const result = await createCampaignOnChain(
        campaignName,
        parseFloat(budget) || 1000,
        baseCommissionRate,
        parseInt(clearingPeriod) || 604800,
        commissionType === "tiered" ? tiers : undefined,
      );

      showNotification({
        type: "success",
        title: "Campaign Escrow Live on Stellar!",
        message: `Campaign #${result.campaignId} deployed with ${commissionType === "tiered" ? `${tiers.length}-level tier structure` : "flat commission"}. Tx: ${result.txHash ? result.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });

      setCommissionRate("10");
      setClearingPeriod("");
      setCampaignName("");
      setBudget("");
      setTiers(DEFAULT_COMMISSION_TIERS);
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

  const sortedTiers = [...tiers].sort((a, b) => a.minSales - b.minSales);
  const minTierRate = sortedTiers[0]?.commissionRate ?? 10;
  const maxTierRate = sortedTiers[sortedTiers.length - 1]?.commissionRate ?? 10;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Create New Campaign
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Set up a new affiliate campaign with tiered multi-level commission structures and payout
          terms
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
                Configure your affiliate program settings and performance thresholds
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

              {/* Commission Structure Mode Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Commission Structure Mode
                  </label>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Reward affiliates based on sales milestones
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-1.5 bg-slate-100 dark:bg-zinc-950 rounded-2xl border border-slate-200 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setCommissionType("tiered")}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                      commissionType === "tiered"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-zinc-700"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    <Award className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Tiered Performance Rates
                    <span className="ml-1 text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCommissionType("flat")}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                      commissionType === "flat"
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-slate-200/50 dark:border-zinc-700"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    <Target className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                    Flat Commission Rate
                  </button>
                </div>
              </div>

              {/* Tier Configuration Section */}
              {commissionType === "tiered" ? (
                <div className="space-y-6 p-6 rounded-3xl bg-slate-50/80 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        Affiliate Performance Tiers
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Define milestone thresholds (e.g. &gt;100 sales) and tiered commission
                        percentages
                      </p>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-zinc-400 font-medium">Presets:</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleApplyPreset("standard")}
                        className="h-8 text-xs rounded-lg border-slate-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
                      >
                        Standard 4-Tier
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleApplyPreset("aggressive")}
                        className="h-8 text-xs rounded-lg border-slate-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
                      >
                        Aggressive Scale
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleApplyPreset("highTicket")}
                        className="h-8 text-xs rounded-lg border-slate-200 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
                      >
                        High-Ticket
                      </Button>
                    </div>
                  </div>

                  {/* Tiers List */}
                  <div className="space-y-3">
                    {tiers.map((tier, index) => {
                      const isBaseTier = tier.minSales === 0;
                      return (
                        <div
                          key={tier.id}
                          className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-sm transition-all hover:border-indigo-200 dark:hover:border-indigo-900/40"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                            {/* Tier Badge & Name */}
                            <div className="md:col-span-4 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 text-xs font-black">
                                  {index + 1}
                                </span>
                                <Input
                                  value={tier.name}
                                  onChange={(e) =>
                                    handleUpdateTier(tier.id, "name", e.target.value)
                                  }
                                  placeholder="Tier Name"
                                  className="h-10 text-sm font-semibold border-slate-200 dark:border-zinc-800 rounded-lg"
                                  required
                                />
                              </div>
                            </div>

                            {/* Threshold (Sales Count) */}
                            <div className="md:col-span-4 space-y-1">
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="0"
                                  value={tier.minSales}
                                  onChange={(e) =>
                                    handleUpdateTier(
                                      tier.id,
                                      "minSales",
                                      parseInt(e.target.value) || 0,
                                    )
                                  }
                                  placeholder="0"
                                  disabled={isBaseTier && index === 0}
                                  className="h-10 pr-20 border-slate-200 dark:border-zinc-800 rounded-lg font-medium text-sm"
                                  required
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400 pointer-events-none">
                                  {tier.minSales === 0 ? "0 (Base)" : `>${tier.minSales} sales`}
                                </div>
                              </div>
                            </div>

                            {/* Commission Rate (%) */}
                            <div className="md:col-span-3 space-y-1">
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="1"
                                  max="50"
                                  value={tier.commissionRate}
                                  onChange={(e) =>
                                    handleUpdateTier(
                                      tier.id,
                                      "commissionRate",
                                      parseFloat(e.target.value) || 1,
                                    )
                                  }
                                  placeholder="15"
                                  className="h-10 pr-8 border-slate-200 dark:border-zinc-800 rounded-lg font-medium text-sm"
                                  required
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
                                  %
                                </div>
                              </div>
                            </div>

                            {/* Remove Button */}
                            <div className="md:col-span-1 flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveTier(tier.id)}
                                disabled={tiers.length <= 1 || (isBaseTier && index === 0)}
                                className="h-10 w-10 p-0 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg disabled:opacity-30"
                                title={isBaseTier ? "Base tier cannot be removed" : "Remove tier"}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Tier Action */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAddTier}
                      className="w-full sm:w-auto h-11 border-dashed border-2 border-slate-300 dark:border-zinc-700 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl font-semibold text-sm flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Add Performance Tier
                    </Button>

                    {!validationResult.valid && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{validationResult.error}</span>
                      </div>
                    )}
                  </div>

                  {/* Interactive Performance Simulator */}
                  <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        <Sliders className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        Affiliate Performance Simulator
                      </div>
                      <span className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                        Simulating {simulatedSales} Sales
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="300"
                        step="5"
                        value={simulatedSales}
                        onChange={(e) => setSimulatedSales(parseInt(e.target.value) || 0)}
                        className="flex-1 h-2 bg-indigo-200 dark:bg-indigo-900/60 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="1000"
                        value={simulatedSales}
                        onChange={(e) =>
                          setSimulatedSales(Math.max(0, parseInt(e.target.value) || 0))
                        }
                        className="w-20 h-9 text-xs font-bold text-center border-indigo-200 dark:border-indigo-800 rounded-lg bg-white dark:bg-zinc-900"
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs pt-1 border-t border-indigo-100/60 dark:border-indigo-900/40 gap-2">
                      <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>
                          Active Tier:{" "}
                          <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                            {simulationResult.tier?.name || "Base Tier"}
                          </strong>{" "}
                          ({simulationResult.commissionRate}% Commission)
                        </span>
                      </div>

                      {simulationResult.nextTier && (
                        <div className="text-zinc-500 dark:text-zinc-400">
                          {simulationResult.salesToNextTier} more sales to reach{" "}
                          <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                            {simulationResult.nextTier.name} (
                            {simulationResult.nextTier.commissionRate}%)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Flat Commission Rate Fallback */
                <InputField
                  label="Commission Rate"
                  description="Standard flat percentage commission for all affiliates"
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
              )}

              <div className="grid md:grid-cols-2 gap-6">
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
              </div>

              {/* Summary Card */}
              <div className="bg-slate-50 dark:bg-zinc-950/50 p-6 rounded-2xl border border-slate-100 dark:border-zinc-800/50 space-y-4">
                <h4 className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-xs">
                  Campaign Summary
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <Target className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                      Commission Structure
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {commissionType === "tiered"
                        ? `${minTierRate}% - ${maxTierRate}% (${sortedTiers.length} Tiers)`
                        : `${commissionRate || "0"}% Flat`}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <Clock className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                      Clearing Period
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {clearingPeriod ? Math.round(parseInt(clearingPeriod) / 86400) : "0"} days
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <DollarSign className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                      Estimated Budget
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {budget || "0"} XLM
                    </div>
                  </div>
                </div>

                {commissionType === "tiered" && (
                  <div className="pt-3 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-zinc-400 font-semibold">Tier Ladder:</span>
                    {sortedTiers.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium"
                      >
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">
                          {t.name}:
                        </span>
                        <span>{t.minSales === 0 ? "Base" : `>${t.minSales} sales`}</span>
                        <span className="text-zinc-400">→</span>
                        <strong className="text-zinc-900 dark:text-white">
                          {t.commissionRate}%
                        </strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading || (commissionType === "tiered" && !validationResult.valid)}
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
