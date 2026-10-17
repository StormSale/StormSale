export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

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

export interface TelegramConnectResponse {
  deepLink: string;
  token: string;
  expiresAt?: string;
}

export interface TelegramStatusResponse {
  connected: boolean;
  username?: string | null;
  notificationsEnabled: boolean;
  connectedAt?: string | null;
}

export interface TelegramPreferencesResponse {
  notificationsEnabled: boolean;
}

const authFetch = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(message);
  }

  return await res.json();
};

export const createTelegramConnectLink = async (): Promise<TelegramConnectResponse> => {
  try {
    return await authFetch("/telegram/connect", { method: "POST" });
  } catch (error) {
    console.error("Failed to create Telegram connect link:", error);
    throw error;
  }
};

export const fetchTelegramStatus = async (): Promise<TelegramStatusResponse> => {
  try {
    return await authFetch("/telegram/status", { method: "GET" });
  } catch (error) {
    console.error("Failed to fetch Telegram status:", error);
    throw error;
  }
};

export const updateTelegramPreferences = async (
  notificationsEnabled: boolean
): Promise<TelegramPreferencesResponse> => {
  try {
    return await authFetch("/telegram/preferences", {
      method: "PATCH",
      body: JSON.stringify({ notificationsEnabled }),
    });
  } catch (error) {
    console.error("Failed to update Telegram preferences:", error);
    throw error;
  }
};

export const disconnectTelegram = async (): Promise<{ connected: false }> => {
  try {
    return await authFetch("/telegram/disconnect", { method: "DELETE" });
  } catch (error) {
    console.error("Failed to disconnect Telegram:", error);
    throw error;
  }
};
