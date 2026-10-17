export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export type AffiliateClick = {
  id?: string;
  countryIso: string;
  countryName?: string;
  clicks: number;
  conversions: number;
  conversionRate?: number;
  lat?: number;
  lng?: number;
  timestamp?: string;
};

export type ClickStreamFilters = {
  startDate?: string;
  endDate?: string;
  campaignId?: string;
  linkId?: string;
};

export type ClickStreamResponse = {
  countries: AffiliateClick[];
  totalClicks: number;
  totalConversions: number;
  generatedAt?: string;
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

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      search.append(key, value);
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
};

export const fetchClickStreamHeatmap = async (
  filters: ClickStreamFilters = {},
): Promise<ClickStreamResponse> => {
  const query = buildQuery({
    startDate: filters.startDate,
    endDate: filters.endDate,
    campaignId: filters.campaignId,
    linkId: filters.linkId,
  });

  try {
    const res = await fetch(`${API_URL}/affiliate/clicks/heatmap${query}`);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch click stream heatmap");
    }

    const data = await res.json();
    const countries: AffiliateClick[] = Array.isArray(data.countries) ? data.countries : [];

    const normalized = countries.map((c): AffiliateClick => {
      const clicks = Number.isFinite(Number(c.clicks)) ? Number(c.clicks) : 0;
      const conversions = Number.isFinite(Number(c.conversions)) ? Number(c.conversions) : 0;
      return {
        ...c,
        clicks,
        conversions,
        conversionRate:
          c.conversionRate ?? (clicks > 0 ? (conversions / clicks) * 100 : 0),
      };
    });

    return {
      countries: normalized,
      totalClicks:
        data.totalClicks ?? normalized.reduce((sum, c) => sum + c.clicks, 0),
      totalConversions:
        data.totalConversions ?? normalized.reduce((sum, c) => sum + c.conversions, 0),
      generatedAt: data.generatedAt,
    };
  } catch (error) {
    console.error("Failed to fetch click stream heatmap:", error);
    throw error;
  }
};

export const getTopCountries = (
  countries: AffiliateClick[],
  limit = 5,
): AffiliateClick[] =>
  [...countries]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit)
    .map((c) => ({
      ...c,
      conversionRate: c.conversionRate ?? (c.clicks > 0 ? (c.conversions / c.clicks) * 100 : 0),
    }));
