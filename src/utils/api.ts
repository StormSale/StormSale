export const API_URL = import.meta.env && import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : "http://localhost:3001/api";

export interface GeoClickRow {
  countryIso: string;
  countryName: string;
  clicks: number;
  conversions: number;
  lat: number;
  lng: number;
}

export interface GeoAnalyticsResponse {
  rows: GeoClickRow[];
  totalClicks: number;
  totalConversions: number;
  from: string;
  to: string;
  campaignId?: string;
}

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

export const fetchGeoAnalytics = async (params: {
  from: string;
  to: string;
  campaignId?: string;
}): Promise<GeoAnalyticsResponse> => {
  const search = new URLSearchParams();
  search.set("from", params.from);
  search.set("to", params.to);
  if (params.campaignId) search.set("campaignId", params.campaignId);

  const res = await fetch(`${API_URL}/affiliate/geo-analytics?${search.toString()}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch geo analytics");
  }
  return await res.json();
};

export const fetchAffiliateCampaigns = async (): Promise<{ id: string; name: string }[]> => {
  const res = await fetch(`${API_URL}/affiliate/campaigns`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch campaigns");
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.campaigns ?? [];
};
