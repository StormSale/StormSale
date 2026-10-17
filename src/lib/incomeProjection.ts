/**
 * StormSale Affiliate Protocol - Income Projection & ROI Engine
 * Pure mathematical model for dynamic affiliate revenue and return-on-investment estimation.
 */

export interface IncomeProjectionParams {
  monthlyClicks: number;
  conversionRate: number;
  averageOrderValue: number;
  commissionRate: number;
  promotionalCost?: number;
}

export interface MonthlyTrajectoryPoint {
  month: number;
  label: string;
  clicks: number;
  conversions: number;
  grossMerchandiseVolume: number;
  revenue: number;
  cost: number;
  netProfit: number;
  cumulativeRevenue: number;
  cumulativeCost: number;
  cumulativeNetProfit: number;
  roiPercent: number;
}

export interface VolumeTierProjection {
  multiplier: number;
  tierLabel: string;
  monthlyClicks: number;
  conversions: number;
  grossMerchandiseVolume: number;
  projectedRevenue: number;
  projectedNetProfit: number;
  roiPercent: number;
}

export interface IncomeProjectionResult {
  monthlyClicks: number;
  conversionRate: number;
  averageOrderValue: number;
  commissionRate: number;
  promotionalCost: number;

  estimatedConversions: number;
  grossMerchandiseVolume: number;
  projectedMonthlyRevenue: number;
  projectedMonthlyNetProfit: number;
  projectedAnnualRevenue: number;
  projectedAnnualNetProfit: number;
  roiPercent: number;
  earningsPerClick: number;

  monthlyTrajectory: MonthlyTrajectoryPoint[];
  volumeTiers: VolumeTierProjection[];
}

export interface PresetProfile {
  id: string;
  name: string;
  badge: string;
  description: string;
  params: Required<IncomeProjectionParams>;
}

export const SLIDER_CONFIGS = {
  monthlyClicks: {
    min: 100,
    max: 50000,
    step: 100,
    defaultValue: 5000,
    label: "Monthly Referral Traffic",
    unit: "clicks",
    description: "Estimated monthly unique clicks through your tracking links",
  },
  conversionRate: {
    min: 0.1,
    max: 15.0,
    step: 0.1,
    defaultValue: 3.5,
    label: "Conversion Rate",
    unit: "%",
    description: "Percentage of referred users who complete a verified purchase",
  },
  averageOrderValue: {
    min: 10,
    max: 1000,
    step: 5,
    defaultValue: 120,
    label: "Average Order Value",
    unit: "$",
    description: "Average customer cart value per verified conversion",
  },
  commissionRate: {
    min: 1,
    max: 50,
    step: 1,
    defaultValue: 15,
    label: "Affiliate Commission",
    unit: "%",
    description: "On-chain escrow commission percentage paid to your wallet",
  },
  promotionalCost: {
    min: 0,
    max: 2000,
    step: 25,
    defaultValue: 150,
    label: "Promotional Spend",
    unit: "$",
    description: "Monthly ad spend, domain hosting, or marketing tool overhead",
  },
} as const;

export const PROJECTION_PRESETS: PresetProfile[] = [
  {
    id: "micro-influencer",
    name: "Social Micro-Influencer",
    badge: "Organic Social",
    description: "Community-driven influencer sharing curated product links to engaged followers.",
    params: {
      monthlyClicks: 2500,
      conversionRate: 3.0,
      averageOrderValue: 65,
      commissionRate: 12,
      promotionalCost: 50,
    },
  },
  {
    id: "content-publisher",
    name: "Niche Content Publisher",
    badge: "SEO / Editorial",
    description:
      "Educational blog or review comparison portal capturing high-intent organic search.",
    params: {
      monthlyClicks: 7500,
      conversionRate: 4.0,
      averageOrderValue: 120,
      commissionRate: 15,
      promotionalCost: 200,
    },
  },
  {
    id: "growth-arbitrage",
    name: "Paid Traffic Arbitrageur",
    badge: "Performance Ads",
    description: "PPC search and social ads optimized for direct conversion and positive return.",
    params: {
      monthlyClicks: 20000,
      conversionRate: 4.8,
      averageOrderValue: 180,
      commissionRate: 18,
      promotionalCost: 1000,
    },
  },
  {
    id: "enterprise-partner",
    name: "Web3 Ecosystem Partner",
    badge: "High Ticket",
    description: "DeFi aggregator or wallet integration driving high-volume on-chain sales.",
    params: {
      monthlyClicks: 40000,
      conversionRate: 5.5,
      averageOrderValue: 320,
      commissionRate: 25,
      promotionalCost: 1800,
    },
  },
];

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function round1(num: number): number {
  return Math.round((num + Number.EPSILON) * 10) / 10;
}

function round3(num: number): number {
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

/**
 * Pure calculation function for income, volume tiers, and multi-month ROI trajectory.
 */
export function calculateIncomeProjection(params: IncomeProjectionParams): IncomeProjectionResult {
  const monthlyClicks = Math.max(0, Math.round(params.monthlyClicks || 0));
  const conversionRate = Math.max(0, Number(params.conversionRate || 0));
  const averageOrderValue = Math.max(0, Number(params.averageOrderValue || 0));
  const commissionRate = Math.max(0, Number(params.commissionRate || 0));
  const promotionalCost = Math.max(0, Number(params.promotionalCost || 0));

  const exactConversions = (monthlyClicks * conversionRate) / 100;
  const estimatedConversions = Math.round(exactConversions);

  const grossMerchandiseVolume = round2(exactConversions * averageOrderValue);
  const projectedMonthlyRevenue = round2(grossMerchandiseVolume * (commissionRate / 100));
  const projectedMonthlyNetProfit = round2(projectedMonthlyRevenue - promotionalCost);
  const projectedAnnualRevenue = round2(projectedMonthlyRevenue * 12);
  const projectedAnnualNetProfit = round2(projectedMonthlyNetProfit * 12);

  let roiPercent: number;
  if (promotionalCost > 0) {
    roiPercent = round1(((projectedMonthlyRevenue - promotionalCost) / promotionalCost) * 100);
  } else if (projectedMonthlyRevenue > 0) {
    roiPercent = 100;
  } else {
    roiPercent = 0;
  }

  const earningsPerClick = monthlyClicks > 0 ? round3(projectedMonthlyRevenue / monthlyClicks) : 0;

  // 6-Month progressive growth trajectory
  const trajectoryRamp = [0.8, 0.9, 1.0, 1.15, 1.3, 1.45];
  let cumulativeRevenue = 0;
  let cumulativeCost = 0;
  let cumulativeNetProfit = 0;

  const monthlyTrajectory: MonthlyTrajectoryPoint[] = trajectoryRamp.map((ramp, index) => {
    const month = index + 1;
    const mClicks = Math.round(monthlyClicks * ramp);
    const mExactConvs = (mClicks * conversionRate) / 100;
    const mConvs = Math.round(mExactConvs);
    const mGmv = round2(mExactConvs * averageOrderValue);
    const mRev = round2(mGmv * (commissionRate / 100));
    const mCost = round2(promotionalCost * (0.85 + index * 0.05));
    const mProfit = round2(mRev - mCost);

    cumulativeRevenue = round2(cumulativeRevenue + mRev);
    cumulativeCost = round2(cumulativeCost + mCost);
    cumulativeNetProfit = round2(cumulativeNetProfit + mProfit);

    const mRoi = mCost > 0 ? round1(((mRev - mCost) / mCost) * 100) : mRev > 0 ? 100 : 0;

    return {
      month,
      label: `Month ${month}`,
      clicks: mClicks,
      conversions: mConvs,
      grossMerchandiseVolume: mGmv,
      revenue: mRev,
      cost: mCost,
      netProfit: mProfit,
      cumulativeRevenue,
      cumulativeCost,
      cumulativeNetProfit,
      roiPercent: mRoi,
    };
  });

  // Volume sensitivity tiers
  const tierConfigs = [
    { multiplier: 0.5, tierLabel: "Conservative (50%)" },
    { multiplier: 1.0, tierLabel: "Target Baseline (100%)" },
    { multiplier: 1.5, tierLabel: "Accelerated (150%)" },
    { multiplier: 2.0, tierLabel: "Scale Mode (200%)" },
  ];

  const volumeTiers: VolumeTierProjection[] = tierConfigs.map(({ multiplier, tierLabel }) => {
    const tierClicks = Math.round(monthlyClicks * multiplier);
    const tierExactConvs = (tierClicks * conversionRate) / 100;
    const tierConvs = Math.round(tierExactConvs);
    const tierGmv = round2(tierExactConvs * averageOrderValue);
    const tierRev = round2(tierGmv * (commissionRate / 100));
    const tierCost = round2(promotionalCost * multiplier);
    const tierProfit = round2(tierRev - tierCost);
    const tierRoi =
      tierCost > 0 ? round1(((tierRev - tierCost) / tierCost) * 100) : tierRev > 0 ? 100 : 0;

    return {
      multiplier,
      tierLabel,
      monthlyClicks: tierClicks,
      conversions: tierConvs,
      grossMerchandiseVolume: tierGmv,
      projectedRevenue: tierRev,
      projectedNetProfit: tierProfit,
      roiPercent: tierRoi,
    };
  });

  return {
    monthlyClicks,
    conversionRate,
    averageOrderValue,
    commissionRate,
    promotionalCost,
    estimatedConversions,
    grossMerchandiseVolume,
    projectedMonthlyRevenue,
    projectedMonthlyNetProfit,
    projectedAnnualRevenue,
    projectedAnnualNetProfit,
    roiPercent,
    earningsPerClick,
    monthlyTrajectory,
    volumeTiers,
  };
}

/**
 * Currency and numeral presentation helpers.
 */
export function formatCurrency(
  amount: number,
  currency: "USD" | "XLM" = "USD",
  decimals: number = 2,
): string {
  if (currency === "XLM") {
    return `${amount.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} XLM`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toLocaleString("en-US");
}
