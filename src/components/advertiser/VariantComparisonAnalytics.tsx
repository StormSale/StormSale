/**
 * src/components/advertiser/VariantComparisonAnalytics.tsx
 *
 * Side-by-side performance comparison widget for Landing Page Variants (Issue #155).
 */
import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Award, TrendingUp } from "lucide-react";
import {
  type LandingPageVariant,
  type VariantMetrics,
  calculateVariantPerformance,
} from "../../utils/abTesting";

export interface VariantComparisonAnalyticsProps {
  variants?: LandingPageVariant[];
  stats?: Array<{
    variantId: string;
    visitors: number;
    bounces: number;
    conversions: number;
    totalRevenue: number;
  }>;
}

const DEFAULT_VARIANTS: LandingPageVariant[] = [
  {
    id: "var_a",
    name: "Variant A (Hero Direct)",
    url: "https://store.stormsale.xyz/shop",
    weight: 50,
  },
  {
    id: "var_b",
    name: "Variant B (Discount Banner)",
    url: "https://store.stormsale.xyz/promo-20",
    weight: 50,
  },
];

const DEFAULT_STATS = [
  {
    variantId: "var_a",
    visitors: 1240,
    bounces: 496,
    conversions: 62,
    totalRevenue: 6200,
  },
  {
    variantId: "var_b",
    visitors: 1180,
    bounces: 354,
    conversions: 89,
    totalRevenue: 10680,
  },
];

export const VariantComparisonAnalytics: React.FC<VariantComparisonAnalyticsProps> = ({
  variants = DEFAULT_VARIANTS,
  stats = DEFAULT_STATS,
}) => {
  const metrics: VariantMetrics[] = calculateVariantPerformance(variants, stats);

  return (
    <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Landing Page A/B Testing Attribution Optimizer
            </CardTitle>
            <CardDescription className="text-xs">
              Side-by-side performance comparison of deterministic referral traffic splits.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((m) => (
            <div
              key={m.variantId}
              className={`rounded-xl p-4 border transition-all ${
                m.isWinner
                  ? "bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/40 shadow-sm ring-1 ring-indigo-500/30"
                  : "bg-slate-50 dark:bg-zinc-950/60 border-slate-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                      {m.variantName}
                    </h5>
                    {m.isWinner && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500 text-white shadow-xs">
                        <Award className="w-3 h-3" /> Winner
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">
                    {m.variantUrl}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {m.weight}% Split
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-zinc-800">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase">CVR</span>
                  <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                    {m.cvr}%
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase">Bounce</span>
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                    {m.bounceRate}%
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase">AOV</span>
                  <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">${m.aov}</p>
                </div>
              </div>

              <div className="mt-3 pt-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex justify-between">
                <span>{m.visitors.toLocaleString()} visitors</span>
                <span>{m.conversions.toLocaleString()} sales</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
