import React, { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { calculateCommissionEstimate, getTierProgress } from "../../lib/affiliateTiers";
import { FALLBACK_RATES, type OracleRates } from "../../lib/priceOracle";

interface TierCommissionCalculatorProps {
  lifetimeVolumeUsd?: number;
  rates?: OracleRates;
}

const formatAmount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const TierCommissionCalculator: React.FC<TierCommissionCalculatorProps> = ({
  lifetimeVolumeUsd = 0,
  rates = FALLBACK_RATES,
}) => {
  const [lifetimeVolume, setLifetimeVolume] = useState(lifetimeVolumeUsd);
  const [monthlyVolume, setMonthlyVolume] = useState(1000);

  const progress = useMemo(() => getTierProgress(lifetimeVolume), [lifetimeVolume]);
  const estimate = useMemo(
    () => calculateCommissionEstimate(monthlyVolume, lifetimeVolume, rates),
    [monthlyVolume, lifetimeVolume, rates],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
          Tier &amp; Commission Calculator
        </h2>
        <p className="mt-2 font-medium text-zinc-500 dark:text-zinc-400">
          Track lifetime referred volume and project commissions in real time.
        </p>
      </div>

      <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                Affiliate Tier Progress
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                Based on lifetime referred volume
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <label
                htmlFor="lifetime-volume"
                className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
              >
                Lifetime referred volume (USD)
              </label>
              <input
                id="lifetime-volume"
                type="number"
                min="0"
                step="100"
                aria-label="Lifetime referred volume (USD)"
                data-testid="lifetime-volume-input"
                value={lifetimeVolume}
                onChange={(event) => setLifetimeVolume(Number(event.target.value))}
                className="mt-2 h-11 w-56 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Current tier
              </div>
              <div className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">
                <span data-testid="tier-name">{progress.tier.name}</span>
                <span className="ml-2 text-sm font-bold" data-testid="tier-rate">
                  {progress.tier.commissionRate * 100}% commission
                </span>
              </div>
            </div>
          </div>

          <div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800"
              role="progressbar"
              aria-label={
                progress.nextTier ? `Progress to ${progress.nextTier.name}` : "Maximum tier reached"
              }
              aria-valuenow={progress.progressPercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                data-testid="tier-progress-fill"
                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-indigo-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${progress.progressPercentage}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span data-testid="remaining-volume">
                {progress.nextTier
                  ? `${formatAmount(progress.remainingVolumeUsd).replace(/\.00$/, "")} USD to ${progress.nextTier.name}`
                  : "Maximum tier reached"}
              </span>
              <span>{progress.progressPercentage}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            Commission Earnings Simulator
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Adjust projected monthly referred volume to preview earnings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="volume-simulator"
              className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Monthly referred volume simulator
            </label>
            <input
              id="volume-simulator"
              type="range"
              min="0"
              max="500000"
              step="100"
              aria-label="Monthly referred volume simulator"
              data-testid="volume-simulator"
              value={monthlyVolume}
              onChange={(event) => setMonthlyVolume(Number(event.target.value))}
              className="w-full accent-indigo-600"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="custom-volume"
              className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
            >
              Custom monthly referred volume (USD)
            </label>
            <input
              id="custom-volume"
              type="number"
              min="0"
              step="1"
              aria-label="Custom monthly referred volume"
              data-testid="custom-volume"
              value={monthlyVolume}
              onChange={(event) => setMonthlyVolume(Number(event.target.value))}
              className="h-11 w-56 rounded-xl border border-slate-200 bg-white px-3 font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">USD estimate</p>
              <p className="mt-2 text-xl font-black text-zinc-900 dark:text-white" data-testid="commission-usd">
                ${formatAmount(estimate.usd)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">XLM estimate</p>
              <p className="mt-2 text-xl font-black text-zinc-900 dark:text-white" data-testid="commission-xlm">
                {formatAmount(estimate.xlm)} XLM
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">USDC estimate</p>
              <p className="mt-2 text-xl font-black text-zinc-900 dark:text-white" data-testid="commission-usdc">
                {formatAmount(estimate.usdc)} USDC
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">EUR estimate</p>
              <p className="mt-2 text-xl font-black text-zinc-900 dark:text-white" data-testid="commission-eur">
                €{formatAmount(estimate.eur)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
