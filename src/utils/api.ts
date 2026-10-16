export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const PLATFORM_VOLUME_ENDPOINT = `${API_URL}/auditor/platform-volume`;

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

export interface PlatformVolumeSnapshot {
  totalEscrowVolume: number;
  totalPayoutVolume: number;
  activeEscrowCount: number;
  completedPayoutCount: number;
  timestamp: string;
}

export interface PlatformVolumePoint {
  timestamp: string;
  escrowVolume: number;
  payoutVolume: number;
}

export interface PlatformVolumeResponse {
  snapshot: PlatformVolumeSnapshot;
  history: PlatformVolumePoint[];
}

export const fetchPlatformVolume = async (): Promise<PlatformVolumeResponse | null> => {
  try {
    const res = await fetch(PLATFORM_VOLUME_ENDPOINT);
    if (!res.ok) {
      throw new Error(`Failed to fetch platform volume: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch platform volume:", error);
    return null;
  }
};
