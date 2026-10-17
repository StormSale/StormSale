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
import { validateDailyPayoutCap } from "../../lib/payoutCap";
import { validateLandingSplit, DEFAULT_LANDING_SPLIT } from "../../lib/abTesting";
import type { LandingVariant, LandingSplitSettings } from "../../lib/abTesting";
import type { AttributionModel } from "../../lib/attribution";
import { VALID_ATTRIBUTION_WINDOW_DAYS } from "../../lib/attribution";
import {
  Zap,
  Target,
  Clock,
  DollarSign,
  MousePointerClick,
  GitCompare,
  ShieldAlert,
  Plus,
  X,
} from "lucide-react";

export const CreateCampaignForm = () => {
  const [commissionRate, setCommissionRate] = useState("");
  const [clearingPeriod, setClearingPeriod] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [budget, setBudget] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Attribution window calculator settings (#151)
  const [attributionModel, setAttributionModel] = useState<AttributionModel>("last_click");
  const [attributionWindowDays, setAttributionWindowDays] = useState(30);

  // Custom commission payout cap per affiliate per 24h window (#156)
  const [dailyPayoutCap, setDailyPayoutCap] = useState("");

  // A/B testing landing variant split (#155)
  const [abSplitEnabled, setAbSplitEnabled] = useState(false);
  const [landingVariants, setLandingVariants] = useState<LandingVariant[]>(() =>
    DEFAULT_LANDING_SPLIT.variants.map((v) => ({ ...v })),
  );

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

    // Verify the optional daily payout cap before anchoring it to the campaign
    const capCheck = validateDailyPayoutCap(dailyPayoutCap);
    if (!capCheck.valid) {
      showNotification({
        type: "error",
        title: "Invalid Payout Cap",
        message: capCheck.error || "Daily payout cap must be a positive XLM amount.",
      });
      return;
    }

    // Verify the A/B landing split when enabled
    const splitSettings: LandingSplitSettings = {
      enabled: abSplitEnabled,
      variants: landingVariants,
    };
    const splitCheck = validateLandingSplit(splitSettings);
    if (!splitCheck.valid) {
      showNotification({
        type: "error",
        title: "Invalid Landing Split",
        message: splitCheck.error || "Check your landing page variant configuration.",
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
        {
          campaignName,
          attributionModel,
          attributionWindowDays,
          dailyPayoutCapInput: dailyPayoutCap,
          landingSplit: splitSettings,
        },
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
      setAttributionModel("last_click");
      setAttributionWindowDays(30);
      setDailyPayoutCap("");
      setAbSplitEnabled(false);
      setLandingVariants(DEFAULT_LANDING_SPLIT.variants.map((v) => ({ ...v })));
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

  const updateVariant = (index: number, patch: Partial<LandingVariant>) => {
    setLandingVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  const addVariant = () => {
    setLandingVariants((prev) => [
      ...prev,
      {
        id: `variant_${prev.length + 1}`,
        label: `Variant ${String.fromCharCode(65 + prev.length)}`,
        url: "",
        weight: Math.floor(100 / (prev.length + 1)),
      },
    ]);
  };

  const removeVariant = (index: number) => {
    setLandingVariants((prev) => prev.filter((_, i) => i !== index));
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

              {/* Attribution Model & Window (#151) */}
              <InputField
                label="Attribution Model & Window"
                description="How referral clicks are credited toward commissions"
              >
                <div className="space-y-4">
                  <div className="flex gap-3">
                    {(
                      [
                        { id: "first_click", label: "First-Click" },
                        { id: "last_click", label: "Last-Click" },
                      ] as { id: AttributionModel; label: string }[]
                    ).map((model) => (
                      <Button
                        key={model.id}
                        type="button"
                        variant={attributionModel === model.id ? "default" : "outline"}
                        className={`flex-1 h-12 rounded-xl transition-all font-semibold ${
                          attributionModel === model.id
                            ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-md border-0"
                            : "border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                        onClick={() => setAttributionModel(model.id)}
                      >
                        <MousePointerClick className="w-4 h-4 mr-2" />
                        {model.label}
                      </Button>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    {VALID_ATTRIBUTION_WINDOW_DAYS.map((days) => (
                      <Button
                        key={days}
                        type="button"
                        variant={attributionWindowDays === days ? "default" : "outline"}
                        className={`flex-1 h-11 rounded-xl transition-all font-semibold text-sm ${
                          attributionWindowDays === days
                            ? "bg-zinc-900 dark:bg-indigo-600 text-white shadow-md border-0"
                            : "border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                        }`}
                        onClick={() => setAttributionWindowDays(days)}
                      >
                        {days}d window
                      </Button>
                    ))}
                  </div>

                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Conversions recorded after the window expires are treated as direct,
                    uncommissioned sales. Clicks are tracked in encrypted localStorage with a cookie
                    fallback.
                  </p>
                </div>
              </InputField>

              {/* A/B Landing Variant Split (#155) */}
              <InputField
                label="A/B Landing Variant Split"
                description="Split affiliate referral traffic across multiple landing destinations"
              >
                <div className="space-y-4">
                  <label className="flex items-center gap-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={abSplitEnabled}
                      onChange={(e) => setAbSplitEnabled(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-600"
                    />
                    Enable A/B split testing for this campaign
                  </label>

                  {abSplitEnabled && (
                    <div className="space-y-4 p-4 rounded-2xl border border-slate-100 dark:border-zinc-800/60 bg-slate-50/60 dark:bg-zinc-950/40">
                      {landingVariants.map((variant, index) => (
                        <div key={variant.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              {variant.label}
                            </span>
                            {landingVariants.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeVariant(index)}
                                className="p-1 rounded-md text-zinc-400 hover:text-red-500 transition-colors"
                                aria-label={`Remove ${variant.label}`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <Input
                            type="url"
                            value={variant.url}
                            onChange={(e) => updateVariant(index, { url: e.target.value })}
                            placeholder="https://your-store.example.com/landing-a"
                            className="h-11 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 rounded-xl bg-white dark:bg-zinc-950 font-mono text-sm"
                          />
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="1"
                              max="99"
                              value={variant.weight}
                              onChange={(e) =>
                                updateVariant(index, { weight: parseInt(e.target.value, 10) })
                              }
                              className="flex-1 accent-indigo-600"
                              aria-label={`${variant.label} traffic weight`}
                            />
                            <span className="font-mono text-sm font-bold text-zinc-700 dark:text-zinc-300 w-14 text-right">
                              {variant.weight}%
                            </span>
                          </div>
                        </div>
                      ))}

                      <div className="flex items-center justify-between">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addVariant}
                          className="rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 font-semibold"
                        >
                          <Plus className="w-4 h-4 mr-1.5" />
                          Add Variant
                        </Button>
                        <span className="text-xs font-mono text-zinc-500">
                          Total weight: {landingVariants.reduce((s, v) => s + v.weight, 0)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </InputField>

              {/* Daily Payout Cap (#156) */}
              <InputField
                label="Daily Payout Cap per Affiliate"
                description="Optional maximum commission payout per affiliate in a rolling 24-hour window"
              >
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={dailyPayoutCap}
                    onChange={(e) => setDailyPayoutCap(e.target.value)}
                    placeholder="e.g., 1000 (leave empty for unlimited)"
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                    XLM / day
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
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <MousePointerClick className="w-4 h-4 mr-2" />
                      Attribution
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {attributionModel === "first_click" ? "First-Click" : "Last-Click"} •{" "}
                      {attributionWindowDays}d
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <GitCompare className="w-4 h-4 mr-2" />
                      Landing Split
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {abSplitEnabled ? `${landingVariants.length} variants` : "Single page"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center text-zinc-500 dark:text-zinc-400 font-medium">
                      <ShieldAlert className="w-4 h-4 mr-2" />
                      Daily Payout Cap
                    </div>
                    <div className="font-bold text-zinc-900 dark:text-white text-lg">
                      {dailyPayoutCap ? `${dailyPayoutCap} XLM` : "Unlimited"}
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
