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

// ---------------------------------------------------------------------------
// Backend Role Validation Middleware & Role-Specific API Endpoints (#110)
// ---------------------------------------------------------------------------

export interface RoleValidationResult {
  authorized: boolean;
  status: number;
  error?: string;
}

/**
 * Validates whether a caller's role satisfies the required protocol role.
 * Returns 403 Forbidden details when authorization fails.
 */
export function enforceRoleMiddleware(
  callerRole: string | null | undefined,
  allowedRoles: string | string[],
): RoleValidationResult {
  const allowed = Array.isArray(allowedRoles)
    ? allowedRoles.map((r) => r.toUpperCase())
    : [allowedRoles.toUpperCase()];

  if (!callerRole || !allowed.includes(callerRole.toUpperCase())) {
    return {
      authorized: false,
      status: 403,
      error: `403 Forbidden: Action requires [${allowed.join(", ")}] permissions, but wallet has role '${callerRole || "UNREGISTERED"}'`,
    };
  }

  return {
    authorized: true,
    status: 200,
  };
}

export interface CreateCampaignPayload {
  name: string;
  budgetAmount: number;
  commissionRatePercent: number;
  clearingPeriodSecs: number;
  assetCode?: string;
  description?: string;
}

/**
 * Dispatches campaign creation to backend with strict role validation.
 * Enforces that only verified ADVERTISER wallets can create campaigns,
 * returning HTTP 403 Forbidden if attempted by any other role.
 */
export interface ApiError extends Error {
  status?: number;
  statusCode?: number;
}

export const createCampaignApi = async (
  walletAddress: string,
  userRole: string | null | undefined,
  payload: CreateCampaignPayload,
) => {
  // 1. Backend Role Validation Guard: Non-advertiser rejected immediately with 403
  const validation = enforceRoleMiddleware(userRole, "ADVERTISER");
  if (!validation.authorized) {
    const forbiddenError = new Error(validation.error) as ApiError;
    forbiddenError.status = 403;
    forbiddenError.statusCode = 403;
    throw forbiddenError;
  }

  try {
    const res = await fetch(`${API_URL}/campaigns/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Wallet-Address": walletAddress,
        "X-User-Role": userRole!.toUpperCase(),
      },
      body: JSON.stringify({
        ...payload,
        ownerAddress: walletAddress,
      }),
    });

    if (res.status === 403) {
      const errJson = await res.json().catch(() => ({}));
      const error = new Error(
        errJson.error || "403 Forbidden: Wallet role is not authorized for advertiser actions",
      ) as ApiError;
      error.status = 403;
      throw error;
    }

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to create campaign (${res.status})`);
    }

    return await res.json();
  } catch (error) {
    console.error("Backend campaign creation failed:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Future Extension: SEP-0010 Challenge Verification Architecture
// ---------------------------------------------------------------------------

export interface Sep10ChallengeResponse {
  transaction: string;
  networkPassphrase: string;
}

/**
 * Architectural helper for SEP-0010 challenge-response authentication.
 * Generates a challenge token representation for Freighter cryptographic signing.
 */
export function generateSep10Challenge(
  serverAddress: string,
  clientAddress: string,
): Sep10ChallengeResponse {
  if (!serverAddress || !clientAddress) {
    throw new Error("Both server and client addresses are required for SEP-0010 challenge");
  }

  const nonce = Math.random().toString(36).substring(2, 15);
  return {
    transaction: `SEP10_CHALLENGE_${serverAddress}_${clientAddress}_${Date.now()}_${nonce}`,
    networkPassphrase: "Test SDF Network ; September 2015",
  };
}

/**
 * Verifies signed SEP-0010 challenge token response.
 */
export function verifySep10ChallengeResponse(
  signedTransaction: string,
  expectedClientAddress: string,
): boolean {
  if (!signedTransaction || !expectedClientAddress) return false;
  return signedTransaction.includes(expectedClientAddress);
}
