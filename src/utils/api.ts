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

export interface TelegramStatus {
  connected: boolean;
  username?: string;
  muted: boolean;
  connectedAt?: string;
}

export const fetchTelegramStatus = async (walletAddress: string): Promise<TelegramStatus> => {
  try {
    const res = await fetch(`${API_URL}/telegram/status?walletAddress=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) {
      throw new Error("Failed to fetch Telegram status");
    }
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch Telegram status:", error);
    return { connected: false, muted: false };
  }
};

export const createTelegramLinkToken = async (walletAddress: string): Promise<{ token: string; deepLink: string }> => {
  const res = await fetch(`${API_URL}/telegram/link-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to create Telegram link token");
  }
  return await res.json();
};

export const updateTelegramPreferences = async (
  walletAddress: string,
  prefs: { muted?: boolean },
): Promise<TelegramStatus> => {
  const res = await fetch(`${API_URL}/telegram/preferences`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, ...prefs }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to update Telegram preferences");
  }
  return await res.json();
};

export const disconnectTelegram = async (walletAddress: string): Promise<void> => {
  const res = await fetch(`${API_URL}/telegram/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to disconnect Telegram");
  }
};
