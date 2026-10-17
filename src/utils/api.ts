export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
export const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "StormSaleBot";

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

export const generateTelegramConnectLink = (token: string) => {
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`;
};

export const fetchTelegramStatus = async (walletAddress: string) => {
  try {
    const res = await fetch(
      `${API_URL}/users/${encodeURIComponent(walletAddress)}/telegram`
    );
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to fetch Telegram status");
    }
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch Telegram status:", error);
    return null;
  }
};

export const connectTelegram = async (walletAddress: string) => {
  try {
    const res = await fetch(
      `${API_URL}/users/${encodeURIComponent(walletAddress)}/telegram/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to generate Telegram connect link");
    }

    const data = await res.json();
    return {
      ...data,
      deepLink: data.deepLink || generateTelegramConnectLink(data.token),
    };
  } catch (error) {
    console.error("Failed to connect Telegram:", error);
    throw error;
  }
};

export const updateTelegramPreferences = async (
  walletAddress: string,
  preferences: { muted?: boolean; enabled?: boolean }
): Promise<any> => {
  try {
    const res = await fetch(
      `${API_URL}/users/${encodeURIComponent(walletAddress)}/telegram/preferences`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to update Telegram preferences");
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to update Telegram preferences:", error);
    throw error;
  }
};

export const disconnectTelegram = async (walletAddress: string) => {
  try {
    const res = await fetch(
      `${API_URL}/users/${encodeURIComponent(walletAddress)}/telegram`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Failed to disconnect Telegram");
    }

    return await res.json();
  } catch (error) {
    console.error("Failed to disconnect Telegram:", error);
    throw error;
  }
};
