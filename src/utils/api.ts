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
  totalGrowthPercent: number;
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

export const fetchCampaign = async (campaignId: string) => {
  try {
    const res = await fetch(`${API_URL}/campaigns/${campaignId}`);
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};

const toFiniteNumber = (value: unknown): number => {
  const num = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeTrend = (rawTrend: unknown): PlatformVolumePoint[] => {
  if (!Array.isArray(rawTrend)) return [];

  return rawTrend
    .map((point): PlatformVolumePoint | null => {
      if (!point || typeof point !== "object") return null;
      const entry = point as Record<string, unknown>;
      const timestamp = entry.timestamp ?? entry.date ?? entry.label;
      if (!timestamp) return null;
      return {
        timestamp: String(timestamp),
        escrowVolume: toFiniteNumber(entry.escrowVolume ?? entry.escrow),
        payoutVolume: toFiniteNumber(entry.payoutVolume ?? entry.payout),
      };
    })
    .filter((point): point is PlatformVolumePoint => point !== null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
};

const calculateGrowthPercent = (trend: PlatformVolumePoint[], key: "escrowVolume" | "payoutVolume") => {
  if (trend.length < 2) return 0;
  const previous = trend[trend.length - 2][key];
  const current = trend[trend.length - 1][key];
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const calculateTotalGrowthPercent = (trend: PlatformVolumePoint[]) => {
  if (trend.length < 2) return 0;
  const previous =
    trend[trend.length - 2].escrowVolume +
    trend[trend.length - 2].payoutVolume;
  const current =
    trend[trend.length - 1].escrowVolume +
    trend[trend.length - 1].payoutVolume;
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / Math.abs(previous)) * 100;
};

export const fetchPlatformVolume = async (): Promise<PlatformVolumeSummary> => {
  const res = await fetch(`${API_URL}/analytics/platform-volume`, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch platform volume: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const trend = normalizeTrend(data.trend ?? data.history ?? data.points);

  const totalEscrowVolume = toFiniteNumber(data.totalEscrowVolume ?? data.escrowVolume);
  const totalPayoutVolume = toFiniteNumber(data.totalPayoutVolume ?? data.payoutVolume);

  return {
    totalEscrowVolume,
    totalPayoutVolume,
    totalVolume: toFiniteNumber(data.totalVolume ?? (
      totalEscrowVolume + totalPayoutVolume
    )),
    escrowGrowthPercent: toFiniteNumber(
      data.escrowGrowthPercent ?? calculateGrowthPercent(trend, "escrowVolume")
    ),
    payoutGrowthPercent: toFiniteNumber(
      data.payoutGrowthPercent ?? calculateGrowthPercent(trend, "payoutVolume")
    ),
    totalGrowthPercent: toFiniteNumber(
      data.totalGrowthPercent ?? calculateTotalGrowthPercent(trend)
    ),
    trend,
  };
};
