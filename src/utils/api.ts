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

export const fetchUser = async (walletAddress: string) => {
  if (!walletAddress) return null;
  try {
    const res = await fetch(`${API_URL}/users/${encodeURIComponent(walletAddress)}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to fetch user: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch user:", error);
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
