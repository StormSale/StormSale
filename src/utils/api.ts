export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

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
    if (res.ok) {
      return await res.json();
    }
  } catch (error) {
    console.warn("Failed to fetch campaign metadata from API, fallback to cache:", error);
  }
  // Fallback to centralized campaign store
  try {
    const { getStoredCampaigns } = await import("../hooks/useCampaigns");
    const campaigns = getStoredCampaigns();
    return campaigns.find((c) => c.id === campaignId) || null;
  } catch {
    return null;
  }
};

export const fetchConversions = async (campaignId?: string) => {
  try {
    const url = campaignId
      ? `${API_URL}/conversions?campaignId=${campaignId}`
      : `${API_URL}/conversions`;
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Failed to fetch conversions from API:", error);
    return [];
  }
};
