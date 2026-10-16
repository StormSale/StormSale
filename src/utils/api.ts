export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const STELLAR_HOME_DOMAIN = import.meta.env.VITE_STELLAR_HOME_DOMAIN || "testanchor.stellar.org";

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

export interface Sep24AnchorInfo {
  transferServerSep24: string;
  webAuthEndpoint?: string;
  signingKey?: string;
}

export interface Sep24WithdrawalParams {
  assetCode: string;
  assetIssuer?: string;
  account: string;
  amount?: string;
  memo?: string;
  memoType?: string;
  lang?: string;
  onchangeCallback?: string;
}

export interface Sep24InteractiveResponse {
  type: string;
  url: string;
  id: string;
}

export interface Sep24Transaction {
  id: string;
  kind: string;
  status: string;
  status_eta?: number;
  more_info_url?: string;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  started_at?: string;
  completed_at?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  message?: string;
  to?: string;
  from?: string;
  deposit_memo?: string;
  deposit_memo_type?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
}

export const fetchSep24AnchorInfo = async (homeDomain: string = STELLAR_HOME_DOMAIN): Promise<Sep24AnchorInfo | null> => {
  try {
    const res = await fetch(`https://${homeDomain}/.well-known/stellar.toml`);
    if (!res.ok) {
      throw new Error(`Failed to fetch stellar.toml from ${homeDomain}`);
    }
    const toml = await res.text();
    const transferServerMatch = toml.match(/TRANSFER_SERVER_SEP0024\s*=\s*"([^"]+)"/);
    const webAuthMatch = toml.match(/WEB_AUTH_ENDPOINT\s*=\s*"([^"]+)"/);
    const signingKeyMatch = toml.match(/SIGNING_KEY\s*=\s*"([^"]+)"/);
    if (!transferServerMatch) {
      throw new Error("Anchor does not advertise SEP-0024 TRANSFER_SERVER_SEP0024");
    }
    return {
      transferServerSep24: transferServerMatch[1],
      webAuthEndpoint: webAuthMatch ? webAuthMatch[1] : undefined,
      signingKey: signingKeyMatch ? signingKeyMatch[1] : undefined,
    };
  } catch (error) {
    console.error("Failed to fetch SEP-0024 anchor info:", error);
    return null;
  }
};

export const initiateSep24Withdrawal = async (
  transferServer: string,
  params: Sep24WithdrawalParams,
  authToken?: string
): Promise<Sep24InteractiveResponse | null> => {
  try {
    const res = await fetch(`${transferServer}/transactions/withdraw/interactive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to initiate SEP-0024 withdrawal");
    }
    return await res.json();
  } catch (error) {
    console.error("Failed to initiate SEP-0024 withdrawal:", error);
    return null;
  }
};

export const fetchSep24Transaction = async (
  transferServer: string,
  transactionId: string,
  authToken?: string
): Promise<Sep24Transaction | null> => {
  try {
    const res = await fetch(`${transferServer}/transaction?id=${encodeURIComponent(transactionId)}`, {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || "Failed to fetch SEP-0024 transaction status");
    }
    const data = await res.json();
    return data.transaction || null;
  } catch (error) {
    console.error("Failed to fetch SEP-0024 transaction status:", error);
    return null;
  }
};

export const pollSep24Transaction = async (
  transferServer: string,
  transactionId: string,
  authToken?: string,
  intervalMs: number = 3000,
  maxAttempts: number = 100
): Promise<Sep24Transaction | null> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const tx = await fetchSep24Transaction(transferServer, transactionId, authToken);
    if (tx && (tx.status === "completed" || tx.status === "error" || tx.status === "refunded")) {
      return tx;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
};
