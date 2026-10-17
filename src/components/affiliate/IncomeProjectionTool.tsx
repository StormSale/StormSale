import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  TrendingUp,
  DollarSign,
  Users,
  Percent,
  Calculator,
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  BarChart3,
  Coins,
  Check,
  Copy,
} from "lucide-react";
import {
  calculateIncomeProjection,
  formatCurrency,
  formatCompactNumber,
  SLIDER_CONFIGS,
  PROJECTION_PRESETS,
  type IncomeProjectionParams,
} from "../../lib/incomeProjection";

export const IncomeProjectionTool: React.FC = () => {
  const [params, setParams] = useState<Required<IncomeProjectionParams>>({
    monthlyClicks: SLIDER_CONFIGS.monthlyClicks.defaultValue,
    conversionRate: SLIDER_CONFIGS.conversionRate.defaultValue,
    averageOrderValue: SLIDER_CONFIGS.averageOrderValue.defaultValue,
    commissionRate: SLIDER_CONFIGS.commissionRate.defaultValue,
    promotionalCost: SLIDER_CONFIGS.promotionalCost.defaultValue,
  });

  const [currency, setCurrency] = useState<"USD" | "XLM">("USD");
  const [activeChartView, setActiveChartView] = useState<"trajectory" | "tiers">("trajectory");
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Live calculated projection result
  const projection = useMemo(() => calculateIncomeProjection(params), [params]);

  const handleSliderChange = (key: keyof IncomeProjectionParams, value: number) => {
    setActivePresetId(null);
    setParams((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = PROJECTION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(presetId);
    setParams({ ...preset.params });
  };

  const handleResetDefaults = () => {
    setActivePresetId(null);
    setParams({
      monthlyClicks: SLIDER_CONFIGS.monthlyClicks.defaultValue,
      conversionRate: SLIDER_CONFIGS.conversionRate.defaultValue,
      averageOrderValue: SLIDER_CONFIGS.averageOrderValue.defaultValue,
      commissionRate: SLIDER_CONFIGS.commissionRate.defaultValue,
      promotionalCost: SLIDER_CONFIGS.promotionalCost.defaultValue,
    });
  };

  const handleCopySummary = async () => {
    const summaryText = `StormSale Affiliate Income Projection:
- Monthly Referral Traffic: ${params.monthlyClicks.toLocaleString()} clicks
- Conversion Rate: ${params.conversionRate}% (${projection.estimatedConversions} conversions)
- Avg Order Value: ${formatCurrency(params.averageOrderValue, currency)}
- Commission Rate: ${params.commissionRate}%
- Projected Monthly Revenue: ${formatCurrency(projection.projectedMonthlyRevenue, currency)}
- Projected Monthly Net Profit: ${formatCurrency(projection.projectedMonthlyNetProfit, currency)}
- Projected Annual Revenue: ${formatCurrency(projection.projectedAnnualRevenue, currency)}
- Estimated ROI: ${projection.roiPercent}%
- Earnings Per Click (EPC): ${formatCurrency(projection.earningsPerClick, currency, 3)}`;

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  // SVG Chart Dimensions & Computations
  const chartHeight = 260;
  const chartWidth = 600;
  const paddingX = 45;
  const paddingY = 35;
  const graphWidth = chartWidth - paddingX * 2;
  const graphHeight = chartHeight - paddingY * 2;

  // Compute maximum value for chart scaling
  const maxTrajectoryVal = useMemo(() => {
    const maxVal = Math.max(
      ...projection.monthlyTrajectory.map((p) => Math.max(p.revenue, p.cost, 100)),
    );
    return Math.ceil(maxVal * 1.15);
  }, [projection.monthlyTrajectory]);

  const maxTiersVal = useMemo(() => {
    const maxVal = Math.max(
      ...projection.volumeTiers.map((t) => Math.max(t.projectedRevenue, 100)),
    );
    return Math.ceil(maxVal * 1.15);
  }, [projection.volumeTiers]);

  const currentMaxVal = activeChartView === "trajectory" ? maxTrajectoryVal : maxTiersVal;

  return (
    <div className="space-y-6" id="income-projection-estimator">
      {/* Header & Quick Action Banner */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 uppercase tracking-wide">
              <Calculator className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
              Dynamic Financial Modeling
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 uppercase tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Stellar Soroban Verified
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mt-2">
            Affiliate Income & ROI Projection Tool
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium text-sm md:text-base">
            Adjust volume sliders in real-time to forecast monthly revenue, net profit, and return
            on promotional spend.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch lg:self-auto">
          {/* Currency Toggle */}
          <div className="inline-flex p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl border border-slate-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              aria-label="Display currency in US Dollars"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currency === "USD"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              $ USD
            </button>
            <button
              type="button"
              onClick={() => setCurrency("XLM")}
              aria-label="Display currency in Stellar Lumens"
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                currency === "XLM"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Coins className="w-3 h-3 text-indigo-500" />
              XLM
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySummary}
            className="rounded-xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-semibold text-xs"
            aria-label="Copy projection summary"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy Metrics
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="rounded-xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-semibold text-xs text-zinc-600 dark:text-zinc-400"
            aria-label="Reset sliders to default values"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Preset Profiles Selector */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Affiliate Strategy Presets
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                1-tap scenario presets configured for common affiliate distribution models
              </CardDescription>
            </div>
            {activePresetId && (
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full">
                Active Scenario
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PROJECTION_PRESETS.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset.id)}
                  aria-pressed={isSelected}
                  className={`text-left p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-500/10 dark:border-indigo-500 shadow-sm"
                      : "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 hover:border-slate-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {preset.badge}
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      )}
                    </div>
                    <div className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white">
                      {preset.name}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {preset.description}
                    </p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-zinc-800/60 flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    <span>{preset.params.monthlyClicks.toLocaleString()} clicks</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-200">
                      {preset.params.commissionRate}% comm.
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* KPI Highlight Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Monthly Revenue */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-indigo-600" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Projected Monthly Revenue
                </p>
                <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">
                  {formatCurrency(projection.projectedMonthlyRevenue, currency)}
                </p>
                <div className="flex items-center space-x-1.5 mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{projection.estimatedConversions.toLocaleString()} conversions</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Monthly Net Profit
                </p>
                <p
                  className={`text-2xl font-extrabold mt-1 ${
                    projection.projectedMonthlyNetProfit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {formatCurrency(projection.projectedMonthlyNetProfit, currency)}
                </p>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                  After {formatCurrency(params.promotionalCost, currency)} overhead
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projected ROI */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Projected ROI
                </p>
                <div className="flex items-baseline space-x-1 mt-1">
                  <p
                    className={`text-2xl font-extrabold ${
                      projection.roiPercent >= 100
                        ? "text-purple-600 dark:text-purple-400"
                        : projection.roiPercent >= 0
                          ? "text-indigo-600 dark:text-indigo-400"
                          : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {projection.roiPercent > 0
                      ? `+${projection.roiPercent}%`
                      : `${projection.roiPercent}%`}
                  </p>
                </div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-1">
                  {projection.roiPercent >= 500
                    ? "🚀 Super-Yield Performance"
                    : projection.roiPercent >= 100
                      ? "✨ Strong Capital Return"
                      : projection.roiPercent >= 0
                        ? "⚖️ Breakeven Positive"
                        : "⚠️ Sub-profitable Spend"}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Annualized Earnings */}
        <Card className="bg-white dark:bg-zinc-900/80 shadow-sm border border-slate-200 dark:border-zinc-800 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Annualized Potential
                </p>
                <p className="text-2xl font-extrabold text-zinc-900 dark:text-white mt-1">
                  {formatCurrency(projection.projectedAnnualRevenue, currency)}
                </p>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-1">
                  EPC: {formatCurrency(projection.earningsPerClick, currency, 3)} / click
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Two-Column Layout: Sliders (Left) vs. Interactive Live ROI Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Sliders Controller */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                    Volume & Conversion Sliders
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                    Drag sliders or adjust values to test sensitivity
                  </CardDescription>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  Live Sync
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-6">
              {/* Slider 1: Monthly Referral Traffic (Clicks) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="slider-clicks"
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    {SLIDER_CONFIGS.monthlyClicks.label}
                  </label>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-500/30">
                    {params.monthlyClicks.toLocaleString()} {SLIDER_CONFIGS.monthlyClicks.unit}
                  </span>
                </div>
                <input
                  id="slider-clicks"
                  name="monthlyClicks"
                  type="range"
                  min={SLIDER_CONFIGS.monthlyClicks.min}
                  max={SLIDER_CONFIGS.monthlyClicks.max}
                  step={SLIDER_CONFIGS.monthlyClicks.step}
                  value={params.monthlyClicks}
                  aria-label="Monthly Referral Traffic in Clicks"
                  aria-valuemin={SLIDER_CONFIGS.monthlyClicks.min}
                  aria-valuemax={SLIDER_CONFIGS.monthlyClicks.max}
                  aria-valuenow={params.monthlyClicks}
                  aria-valuetext={`${params.monthlyClicks.toLocaleString()} clicks`}
                  onChange={(e) => handleSliderChange("monthlyClicks", Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  <span>{SLIDER_CONFIGS.monthlyClicks.min.toLocaleString()} min</span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    {SLIDER_CONFIGS.monthlyClicks.description}
                  </span>
                  <span>{SLIDER_CONFIGS.monthlyClicks.max.toLocaleString()} max</span>
                </div>
              </div>

              {/* Slider 2: Conversion Rate (%) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="slider-conversion"
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <Percent className="w-3.5 h-3.5 text-indigo-500" />
                    {SLIDER_CONFIGS.conversionRate.label}
                  </label>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-500/30">
                    {params.conversionRate.toFixed(1)}%
                  </span>
                </div>
                <input
                  id="slider-conversion"
                  name="conversionRate"
                  type="range"
                  min={SLIDER_CONFIGS.conversionRate.min}
                  max={SLIDER_CONFIGS.conversionRate.max}
                  step={SLIDER_CONFIGS.conversionRate.step}
                  value={params.conversionRate}
                  aria-label="Conversion Rate percentage"
                  aria-valuemin={SLIDER_CONFIGS.conversionRate.min}
                  aria-valuemax={SLIDER_CONFIGS.conversionRate.max}
                  aria-valuenow={params.conversionRate}
                  aria-valuetext={`${params.conversionRate.toFixed(1)} percent`}
                  onChange={(e) => handleSliderChange("conversionRate", Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  <span>{SLIDER_CONFIGS.conversionRate.min}% min</span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    {SLIDER_CONFIGS.conversionRate.description}
                  </span>
                  <span>{SLIDER_CONFIGS.conversionRate.max}% max</span>
                </div>
              </div>

              {/* Slider 3: Average Order Value */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="slider-aov"
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <DollarSign className="w-3.5 h-3.5 text-indigo-500" />
                    {SLIDER_CONFIGS.averageOrderValue.label}
                  </label>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-500/30">
                    {formatCurrency(params.averageOrderValue, currency)}
                  </span>
                </div>
                <input
                  id="slider-aov"
                  name="averageOrderValue"
                  type="range"
                  min={SLIDER_CONFIGS.averageOrderValue.min}
                  max={SLIDER_CONFIGS.averageOrderValue.max}
                  step={SLIDER_CONFIGS.averageOrderValue.step}
                  value={params.averageOrderValue}
                  aria-label="Average Order Value"
                  aria-valuemin={SLIDER_CONFIGS.averageOrderValue.min}
                  aria-valuemax={SLIDER_CONFIGS.averageOrderValue.max}
                  aria-valuenow={params.averageOrderValue}
                  aria-valuetext={`${params.averageOrderValue} ${currency}`}
                  onChange={(e) => handleSliderChange("averageOrderValue", Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  <span>{formatCurrency(SLIDER_CONFIGS.averageOrderValue.min, currency, 0)}</span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    {SLIDER_CONFIGS.averageOrderValue.description}
                  </span>
                  <span>{formatCurrency(SLIDER_CONFIGS.averageOrderValue.max, currency, 0)}</span>
                </div>
              </div>

              {/* Slider 4: Commission Rate (%) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="slider-commission"
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <Percent className="w-3.5 h-3.5 text-indigo-500" />
                    {SLIDER_CONFIGS.commissionRate.label}
                  </label>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-500/30">
                    {params.commissionRate}%
                  </span>
                </div>
                <input
                  id="slider-commission"
                  name="commissionRate"
                  type="range"
                  min={SLIDER_CONFIGS.commissionRate.min}
                  max={SLIDER_CONFIGS.commissionRate.max}
                  step={SLIDER_CONFIGS.commissionRate.step}
                  value={params.commissionRate}
                  aria-label="Affiliate Commission Rate percentage"
                  aria-valuemin={SLIDER_CONFIGS.commissionRate.min}
                  aria-valuemax={SLIDER_CONFIGS.commissionRate.max}
                  aria-valuenow={params.commissionRate}
                  aria-valuetext={`${params.commissionRate} percent`}
                  onChange={(e) => handleSliderChange("commissionRate", Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  <span>{SLIDER_CONFIGS.commissionRate.min}%</span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    {SLIDER_CONFIGS.commissionRate.description}
                  </span>
                  <span>{SLIDER_CONFIGS.commissionRate.max}%</span>
                </div>
              </div>

              {/* Slider 5: Promotional & Ad Spend Overhead */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="slider-promo"
                    className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                    {SLIDER_CONFIGS.promotionalCost.label}
                  </label>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold bg-slate-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                    {formatCurrency(params.promotionalCost, currency)}
                  </span>
                </div>
                <input
                  id="slider-promo"
                  name="promotionalCost"
                  type="range"
                  min={SLIDER_CONFIGS.promotionalCost.min}
                  max={SLIDER_CONFIGS.promotionalCost.max}
                  step={SLIDER_CONFIGS.promotionalCost.step}
                  value={params.promotionalCost}
                  aria-label="Monthly Promotional and Advertising Spend"
                  aria-valuemin={SLIDER_CONFIGS.promotionalCost.min}
                  aria-valuemax={SLIDER_CONFIGS.promotionalCost.max}
                  aria-valuenow={params.promotionalCost}
                  aria-valuetext={`${params.promotionalCost} ${currency}`}
                  onChange={(e) => handleSliderChange("promotionalCost", Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                  <span>{formatCurrency(SLIDER_CONFIGS.promotionalCost.min, currency, 0)}</span>
                  <span className="text-[11px] font-normal text-zinc-400">
                    {SLIDER_CONFIGS.promotionalCost.description}
                  </span>
                  <span>{formatCurrency(SLIDER_CONFIGS.promotionalCost.max, currency, 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live ROI & Income Projection Chart */}
        <div className="lg:col-span-7 space-y-5">
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-500" />
                    ROI & Growth Projection Chart
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                    Interactive visualization updating live with slider movements
                  </CardDescription>
                </div>

                {/* View Switcher: Trajectory vs Tiers */}
                <div className="inline-flex p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl border border-slate-200 dark:border-zinc-700 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setActiveChartView("trajectory")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeChartView === "trajectory"
                        ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    6-Month Growth
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveChartView("tiers")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      activeChartView === "tiers"
                        ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    Sensitivity Tiers
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {/* Chart Legend & Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs font-semibold">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />
                    <span className="text-zinc-700 dark:text-zinc-300">Revenue</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
                    <span className="text-zinc-700 dark:text-zinc-300">Net Profit</span>
                  </div>
                  {activeChartView === "trajectory" && (
                    <div className="flex items-center space-x-1.5">
                      <span className="w-3 h-3 rounded-full border border-purple-500 bg-purple-500/20 inline-block" />
                      <span className="text-zinc-700 dark:text-zinc-300">ROI %</span>
                    </div>
                  )}
                </div>

                <div className="text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                  Scale:{" "}
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    0 – {formatCompactNumber(currentMaxVal)} {currency}
                  </span>
                </div>
              </div>

              {/* Responsive SVG Chart Canvas */}
              <div className="w-full bg-slate-50/70 dark:bg-zinc-950/50 rounded-2xl p-3 border border-slate-100 dark:border-zinc-800/60 overflow-hidden">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto select-none overflow-visible"
                  role="img"
                  aria-label="Affiliate income projection and return on investment chart"
                >
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.75" />
                    </linearGradient>
                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.75" />
                    </linearGradient>
                    <linearGradient id="trajectoryArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines & Y-Axis Scale */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                    const y = paddingY + graphHeight * (1 - ratio);
                    const val = currentMaxVal * ratio;
                    return (
                      <g key={i}>
                        <line
                          x1={paddingX}
                          y1={y}
                          x2={chartWidth - paddingX}
                          y2={y}
                          stroke="currentColor"
                          strokeDasharray="4 4"
                          className="text-slate-200 dark:text-zinc-800"
                          strokeWidth="1"
                        />
                        <text
                          x={paddingX - 8}
                          y={y + 3}
                          textAnchor="end"
                          className="fill-zinc-400 dark:fill-zinc-600 text-[10px] font-semibold"
                        >
                          {formatCompactNumber(val)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Chart Rendering - Mode 1: 6-Month Trajectory */}
                  {activeChartView === "trajectory" && (
                    <>
                      {/* Area Fill for Trajectory */}
                      {(() => {
                        const points = projection.monthlyTrajectory.map((p, idx) => {
                          const x =
                            paddingX +
                            (graphWidth / (projection.monthlyTrajectory.length - 1)) * idx;
                          const y =
                            paddingY +
                            graphHeight * (1 - Math.min(1, Math.max(0, p.revenue / currentMaxVal)));
                          return `${x},${y}`;
                        });
                        const areaPath = `M ${paddingX},${paddingY + graphHeight} L ${points.join(
                          " L ",
                        )} L ${chartWidth - paddingX},${paddingY + graphHeight} Z`;
                        return <path d={areaPath} fill="url(#trajectoryArea)" />;
                      })()}

                      {/* Bar Pairs & Data Points for Each Month */}
                      {projection.monthlyTrajectory.map((point, idx) => {
                        const totalCols = projection.monthlyTrajectory.length;
                        const colWidth = graphWidth / totalCols;
                        const centerX = paddingX + colWidth * idx + colWidth / 2;
                        const barWidth = Math.min(22, (colWidth - 16) / 2);

                        // Heights clamped to graphHeight
                        const revHeight = Math.max(
                          2,
                          (Math.min(point.revenue, currentMaxVal) / currentMaxVal) * graphHeight,
                        );
                        const revY = paddingY + graphHeight - revHeight;

                        const profitHeight = Math.max(
                          2,
                          (Math.min(Math.max(0, point.netProfit), currentMaxVal) / currentMaxVal) *
                            graphHeight,
                        );
                        const profitY = paddingY + graphHeight - profitHeight;

                        const isHovered = activePointIndex === idx;

                        return (
                          <g
                            key={point.month}
                            className="cursor-pointer transition-opacity"
                            onMouseEnter={() => setActivePointIndex(idx)}
                            onMouseLeave={() => setActivePointIndex(null)}
                          >
                            {/* Hover highlight column */}
                            {isHovered && (
                              <rect
                                x={paddingX + colWidth * idx + 2}
                                y={paddingY}
                                width={colWidth - 4}
                                height={graphHeight}
                                className="fill-indigo-50/50 dark:fill-indigo-950/20"
                                rx="6"
                              />
                            )}

                            {/* Revenue Bar */}
                            <rect
                              x={centerX - barWidth - 1}
                              y={revY}
                              width={barWidth}
                              height={revHeight}
                              fill="url(#revenueGradient)"
                              rx="3"
                              className="transition-all duration-300"
                            />

                            {/* Net Profit Bar */}
                            <rect
                              x={centerX + 1}
                              y={profitY}
                              width={barWidth}
                              height={profitHeight}
                              fill="url(#profitGradient)"
                              rx="3"
                              className="transition-all duration-300"
                            />

                            {/* ROI Pill Badge Above Bars */}
                            <g transform={`translate(${centerX}, ${Math.min(revY, profitY) - 10})`}>
                              <rect
                                x="-18"
                                y="-10"
                                width="36"
                                height="14"
                                rx="7"
                                className="fill-zinc-900 dark:fill-zinc-800 shadow-sm"
                              />
                              <text
                                x="0"
                                y="0"
                                textAnchor="middle"
                                className="fill-white dark:fill-indigo-300 text-[9px] font-bold"
                              >
                                {point.roiPercent > 0
                                  ? `+${point.roiPercent}%`
                                  : `${point.roiPercent}%`}
                              </text>
                            </g>

                            {/* X-Axis Month Label */}
                            <text
                              x={centerX}
                              y={chartHeight - 10}
                              textAnchor="middle"
                              className={`text-[10px] font-bold ${
                                isHovered
                                  ? "fill-indigo-600 dark:fill-indigo-400 font-extrabold"
                                  : "fill-zinc-500 dark:fill-zinc-400"
                              }`}
                            >
                              M{point.month}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}

                  {/* Chart Rendering - Mode 2: Volume Sensitivity Tiers */}
                  {activeChartView === "tiers" && (
                    <>
                      {projection.volumeTiers.map((tier, idx) => {
                        const totalCols = projection.volumeTiers.length;
                        const colWidth = graphWidth / totalCols;
                        const centerX = paddingX + colWidth * idx + colWidth / 2;
                        const barWidth = Math.min(30, (colWidth - 24) / 2);

                        const revHeight = Math.max(
                          2,
                          (Math.min(tier.projectedRevenue, currentMaxVal) / currentMaxVal) *
                            graphHeight,
                        );
                        const revY = paddingY + graphHeight - revHeight;

                        const profitHeight = Math.max(
                          2,
                          (Math.min(Math.max(0, tier.projectedNetProfit), currentMaxVal) /
                            currentMaxVal) *
                            graphHeight,
                        );
                        const profitY = paddingY + graphHeight - profitHeight;

                        const isHovered = activePointIndex === idx;

                        return (
                          <g
                            key={tier.tierLabel}
                            className="cursor-pointer"
                            onMouseEnter={() => setActivePointIndex(idx)}
                            onMouseLeave={() => setActivePointIndex(null)}
                          >
                            {isHovered && (
                              <rect
                                x={paddingX + colWidth * idx + 4}
                                y={paddingY}
                                width={colWidth - 8}
                                height={graphHeight}
                                className="fill-indigo-50/50 dark:fill-indigo-950/20"
                                rx="8"
                              />
                            )}

                            {/* Revenue Bar */}
                            <rect
                              x={centerX - barWidth - 2}
                              y={revY}
                              width={barWidth}
                              height={revHeight}
                              fill="url(#revenueGradient)"
                              rx="4"
                              className="transition-all duration-300"
                            />

                            {/* Net Profit Bar */}
                            <rect
                              x={centerX + 2}
                              y={profitY}
                              width={barWidth}
                              height={profitHeight}
                              fill="url(#profitGradient)"
                              rx="4"
                              className="transition-all duration-300"
                            />

                            {/* ROI Badge */}
                            <g transform={`translate(${centerX}, ${Math.min(revY, profitY) - 12})`}>
                              <rect
                                x="-22"
                                y="-10"
                                width="44"
                                height="14"
                                rx="7"
                                className="fill-zinc-900 dark:fill-zinc-800"
                              />
                              <text
                                x="0"
                                y="0"
                                textAnchor="middle"
                                className="fill-emerald-400 text-[9px] font-bold"
                              >
                                {tier.roiPercent > 0
                                  ? `+${tier.roiPercent}%`
                                  : `${tier.roiPercent}%`}
                              </text>
                            </g>

                            {/* X-Axis Label */}
                            <text
                              x={centerX}
                              y={chartHeight - 10}
                              textAnchor="middle"
                              className={`text-[10px] font-bold ${
                                isHovered
                                  ? "fill-indigo-600 dark:fill-indigo-400 font-extrabold"
                                  : "fill-zinc-600 dark:fill-zinc-400"
                              }`}
                            >
                              {tier.tierLabel.split(" ")[0]} ({Math.round(tier.multiplier * 100)}%)
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}
                </svg>
              </div>

              {/* Interactive Detail Box on Hover / Selected Point */}
              <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                {activeChartView === "trajectory"
                  ? (() => {
                      const activePoint =
                        activePointIndex !== null
                          ? projection.monthlyTrajectory[activePointIndex]
                          : projection.monthlyTrajectory[0];

                      return (
                        <>
                          <div>
                            <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]">
                              {activePoint.label} Projection Breakdown:
                            </span>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-zinc-600 dark:text-zinc-400">
                              <span>
                                Traffic:{" "}
                                <strong className="text-zinc-900 dark:text-white">
                                  {activePoint.clicks.toLocaleString()} clicks
                                </strong>
                              </span>
                              <span>
                                Sales:{" "}
                                <strong className="text-zinc-900 dark:text-white">
                                  {activePoint.conversions}
                                </strong>
                              </span>
                              <span>
                                Revenue:{" "}
                                <strong className="text-indigo-600 dark:text-indigo-400">
                                  {formatCurrency(activePoint.revenue, currency)}
                                </strong>
                              </span>
                              <span>
                                Profit:{" "}
                                <strong className="text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(activePoint.netProfit, currency)}
                                </strong>
                              </span>
                            </div>
                          </div>
                          <div className="text-right sm:self-center shrink-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                              Cumulative Rev
                            </span>
                            <span className="font-extrabold text-sm text-zinc-900 dark:text-white">
                              {formatCurrency(activePoint.cumulativeRevenue, currency)}
                            </span>
                          </div>
                        </>
                      );
                    })()
                  : (() => {
                      const activeTier =
                        activePointIndex !== null
                          ? projection.volumeTiers[activePointIndex]
                          : projection.volumeTiers[1];

                      return (
                        <>
                          <div>
                            <span className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]">
                              {activeTier.tierLabel} Tier Breakdown:
                            </span>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-zinc-600 dark:text-zinc-400">
                              <span>
                                Volume:{" "}
                                <strong className="text-zinc-900 dark:text-white">
                                  {activeTier.monthlyClicks.toLocaleString()} clicks
                                </strong>
                              </span>
                              <span>
                                Conversions:{" "}
                                <strong className="text-zinc-900 dark:text-white">
                                  {activeTier.conversions}
                                </strong>
                              </span>
                              <span>
                                Revenue:{" "}
                                <strong className="text-indigo-600 dark:text-indigo-400">
                                  {formatCurrency(activeTier.projectedRevenue, currency)}
                                </strong>
                              </span>
                            </div>
                          </div>
                          <div className="text-right sm:self-center shrink-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
                              Tier Net Profit
                            </span>
                            <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(activeTier.projectedNetProfit, currency)}
                            </span>
                          </div>
                        </>
                      );
                    })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
