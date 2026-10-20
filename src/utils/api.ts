import {
  registerUserRequestSchema,
  registerUserResponseSchema,
  campaignMetadataResponseSchema,
  conversionsListResponseSchema,
} from "../lib/validation";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const registerUser = async (walletAddress: string, role: string = "AFFILIATE") => {
  // Validate outgoing request
  const validatedPayload = registerUserRequestSchema.parse({ walletAddress, role });

  try {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedPayload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Backend registration failed");
    }

    const json = await res.json();
    // Validate API response
    return registerUserResponseSchema.parse(json);
  } catch (error) {
    console.error("Backend registration failed:", error);
    throw error;
  }
};

export const fetchCampaign = async (campaignId: string) => {
  if (!campaignId || typeof campaignId !== "string" || !campaignId.trim()) {
    throw new Error("Invalid campaign ID");
  }

  try {
    const res = await fetch(`${API_URL}/campaigns/${encodeURIComponent(campaignId.trim())}`);
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    return campaignMetadataResponseSchema.parse(json);
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};

export const fetchConversions = async (campaignId?: string) => {
  if (campaignId !== undefined && (typeof campaignId !== "string" || !campaignId.trim())) {
    throw new Error("Invalid campaign ID");
  }

  try {
    const url = campaignId
      ? `${API_URL}/conversions?campaignId=${encodeURIComponent(campaignId.trim())}`
      : `${API_URL}/conversions`;
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    // Validate parsed API response against conversions schema
    return conversionsListResponseSchema.parse(data);
  } catch (error) {
    console.error("Failed to fetch conversions from API:", error);
    return [];
  }
};
