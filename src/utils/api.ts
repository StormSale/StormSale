export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export type PlatformVolumePoint = {
  timestamp: string;
  escrowVolume: number;
  payoutVolume: number;
};

export type PlatformVolumeSummary = {
  totalEscrowVolume: number;
  totalPayoutVolume: number;
  totalVolume: number;
  escrowGrowthPercent: number;
  payoutGrowthPercent: number;
  trend: PlatformVolumePoint[];
};

export const registerUser = async (walletAddress: string, role: string = "AFFILIATE") => {
  try {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, role }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Backend registration failed");
    }

    return await res.json();
  } catch (error) {
    console.error("Backend registration failed:", error);
    throw error;
  }
};

// Fetches campaign metadata for a given campaign id.
export const fetchCampaign = async (campaignId: string) => {
  try {
    const res = await fetch(`${API_URL}/campaigns/${campaignId}`);
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};

// Coerces unknown values (string/number/null) into a finite number, defaulting to 0.
const toFiniteNumber = (value: unknown): number => {
  const num = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeTrendPoint = (raw: Record<unknown, unknown>): PlatformVolumePoint => ({
  timestamp: String(raw.timestamp ?? raw.date ?? new Date().toISOString()),
  escrowVolume: toFiniteNumber(raw.escrowVolume ?? raw.escrow ?? 0),
  payoutVolume: toFiniteNumber(raw.payoutVolume ?? raw.payout ?? 0),
});

// Computes percent growth between the last two trend points for the given key.
const computeGrowthPercent = (points: PlatformVolumePoint[], key: "escrowVolume" | "payoutVolume"): number => {
  if (points.length < 2) return 0;
  const prev = points[points.length - 2][key];
  const curr = points[points.length - 1][key];
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
};

// Aggregates platform-wide escrow and payout volume with trend data.
export const fetchPlatformVolume = async (): Promise<PlatformVolumeSummary> => {
  try {
    const res = await fetch(`${API_URL}/admin/platform-volume`);
    if (!res.ok) {
      throw new Error(`Failed to fetch platform volume: ${res.status}`);
    }

    const data = await res.json();
    const rawTrend: Record<unknown, unknown>[] = Array.isArray(data.trend) ? data.trend : [];
    const trend = rawTrend.map(normalizeTrendPoint);

    const totalEscrowVolume = toFiniteNumber(data.totalEscrowVolume);
    const totalPayoutVolume = toFiniteNumber(data.totalPayoutVolume);

    return {
      totalEscrowVolume,
      totalPayoutVolume,
      totalVolume: totalEscrowVolume + totalPayoutVolume,
      escrowGrowthPercent: computeGrowthPercent(trend, "escrowVolume"),
      payoutGrowthPercent: computeGrowthPercent(trend, "payoutVolume"),
      trend,
    };
  } catch (error) {
    console.error("Failed to fetch platform volume:", error);
    throw error;
  }
};
