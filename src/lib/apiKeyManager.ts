/**
 * Enterprise B2B API Key Management Logic (#436)
 */

import type {
  ApiKeyScope,
  CreateApiKeyInput,
  CreateApiKeyResult,
  EnterpriseApiKey,
  ScopeDefinition,
} from "../types/apiKey";

export const AVAILABLE_SCOPES: ScopeDefinition[] = [
  {
    id: "campaigns:read",
    label: "campaigns:read",
    description: "Read campaign details, budget allocations, terms, and creative assets",
    category: "campaigns",
  },
  {
    id: "campaigns:write",
    label: "campaigns:write",
    description: "Create, pause, update, and deploy automated campaign configurations",
    category: "campaigns",
  },
  {
    id: "analytics:read",
    label: "analytics:read",
    description: "Access aggregated click, conversion, partner performance, and traffic analytics",
    category: "analytics",
  },
  {
    id: "conversions:read",
    label: "conversions:read",
    description: "Inspect on-chain conversion verification and attribution audit logs",
    category: "analytics",
  },
  {
    id: "escrow:read",
    label: "escrow:read",
    description: "Query smart contract escrow balances, reserves, and TTL status",
    category: "financial",
  },
];

const STORAGE_PREFIX = "b2b_api_keys_";

// In-memory fallback if localStorage is unavailable
const memoryStore: Record<string, EnterpriseApiKey[]> = {};

function getStorage(wallet: string): EnterpriseApiKey[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${wallet}`);
      return raw ? JSON.parse(raw) : [];
    }
  } catch {
    // fallback to memoryStore
  }
  return memoryStore[wallet] || [];
}

function setStorage(wallet: string, keys: EnterpriseApiKey[]): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${wallet}`, JSON.stringify(keys));
    }
  } catch {
    // fallback to memoryStore
  }
  memoryStore[wallet] = keys;
}

/**
 * Generate a cryptographically secure random hexadecimal string
 */
export function generateRandomHex(length: number = 32): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }
  // Math.random fallback for test or constrained environments
  let result = "";
  while (result.length < length) {
    result += Math.random().toString(16).substring(2);
  }
  return result.slice(0, length);
}

/**
 * Generates an unmasked live secret key starting with `sk_live_`
 */
export function generateSecretKey(): string {
  return `sk_live_${generateRandomHex(32)}`;
}

/**
 * Masks a secret key in the format `sk_live_...4f8a`
 */
export function maskApiKey(secretKey: string): string {
  if (!secretKey) return "";
  const suffix = secretKey.slice(-4);
  return `sk_live_...${suffix}`;
}

/**
 * Creates an enterprise API key, returning the raw secret key exactly once.
 * Plaintext secret keys are NEVER stored in persistent storage.
 */
export function createApiKey(wallet: string, input: CreateApiKeyInput): CreateApiKeyResult {
  const trimmedName = input.name?.trim() || "";
  if (!trimmedName || trimmedName.length < 1 || trimmedName.length > 64) {
    throw new Error("API key name is required and must be between 1 and 64 characters");
  }

  if (!input.scopes || input.scopes.length === 0) {
    throw new Error("At least one permission scope must be selected");
  }

  const validScopeIds = new Set(AVAILABLE_SCOPES.map((s) => s.id));
  for (const scope of input.scopes) {
    if (!validScopeIds.has(scope)) {
      throw new Error(`Invalid permission scope: ${scope}`);
    }
  }

  const secretKey = generateSecretKey();
  const suffix = secretKey.slice(-4);
  const maskedKey = `sk_live_...${suffix}`;
  const keyId = `key_${generateRandomHex(12)}`;

  const newKey: EnterpriseApiKey = {
    id: keyId,
    name: trimmedName,
    maskedKey,
    keyPrefix: "sk_live_",
    keySuffix: suffix,
    scopes: [...input.scopes],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    status: "active",
    ownerWallet: wallet,
  };

  const existing = getStorage(wallet);
  setStorage(wallet, [newKey, ...existing]);

  return {
    apiKey: newKey,
    secretKey,
  };
}

/**
 * List all API keys for an enterprise wallet.
 * Plaintext secrets are never present in the stored or returned records.
 */
export function listApiKeys(wallet: string): EnterpriseApiKey[] {
  return getStorage(wallet);
}

/**
 * Revokes an existing API key. Requires explicit confirmation identifier matching key name or ID.
 */
export function revokeApiKey(
  wallet: string,
  keyId: string,
  confirmationIdentifier: string,
): EnterpriseApiKey {
  const keys = getStorage(wallet);
  const key = keys.find((k) => k.id === keyId);
  if (!key) {
    throw new Error("API key not found");
  }

  const trimmedConfirm = confirmationIdentifier?.trim() || "";
  if (trimmedConfirm !== key.name.trim() && trimmedConfirm !== key.id.trim()) {
    throw new Error(
      `Confirmation identifier "${trimmedConfirm}" does not match required key identifier "${key.name}"`,
    );
  }

  const updatedKey: EnterpriseApiKey = {
    ...key,
    status: "revoked",
  };

  const updatedKeys = keys.map((k) => (k.id === keyId ? updatedKey : k));
  setStorage(wallet, updatedKeys);

  return updatedKey;
}

/**
 * Validates whether an active API key holds a specific required permission scope.
 */
export function validateKeyScope(apiKey: EnterpriseApiKey, requiredScope: ApiKeyScope): boolean {
  if (apiKey.status !== "active") return false;
  return apiKey.scopes.includes(requiredScope);
}
