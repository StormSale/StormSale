/**
 * Enterprise B2B API Key Types (#436)
 */

export type ApiKeyScope =
  "campaigns:read" | "campaigns:write" | "analytics:read" | "conversions:read" | "escrow:read";

export type ApiKeyStatus = "active" | "revoked";

export interface ScopeDefinition {
  id: ApiKeyScope;
  label: string;
  description: string;
  category: "campaigns" | "analytics" | "financial";
}

export interface EnterpriseApiKey {
  id: string;
  name: string;
  maskedKey: string; // e.g. "sk_live_...4f8a"
  keyPrefix: string; // "sk_live_"
  keySuffix: string; // e.g. "4f8a"
  scopes: ApiKeyScope[];
  createdAt: string;
  lastUsedAt?: string | null;
  status: ApiKeyStatus;
  ownerWallet: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
}

export interface CreateApiKeyResult {
  apiKey: EnterpriseApiKey;
  secretKey: string; // The plaintext secret key, returned ONLY once at creation
}
