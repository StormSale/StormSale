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
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};

export interface AnomalyFlagPayload {
  id: string;
  category: string;
  severity: string;
  walletAddresses: string[];
  affectedValue: number;
  note?: string;
}

export const reportAnomaly = async (flag: AnomalyFlagPayload) => {
  const res = await fetch(`${API_URL}/auditor/anomalies/${encodeURIComponent(flag.id)}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: flag.category,
      severity: flag.severity,
      walletAddresses: flag.walletAddresses,
      affectedValue: flag.affectedValue,
      note: flag.note,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to report anomaly");
  }

  return await res.json().catch(() => ({}));
};
