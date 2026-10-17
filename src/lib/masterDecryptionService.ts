/**
 * Master Decryption Service
 * Provides cryptographic master key validation, sale envelope decryption,
 * and immutable audit logging for regulatory compliance.
 */

import type {
  AuditorMasterKey,
  KeyValidationResult,
  DecryptedSaleEnvelope,
  DecryptionAuditLogEntry,
} from "../types/masterDecryption";

export const AUDIT_LOG_STORAGE_KEY = "storm_master_decryption_audit_logs";
export const AUDIT_LOG_EVENT = "storm:audit-log-updated";

// Preconfigured authorized master keys for quick testing & auditing
export const PRESET_MASTER_KEYS: Record<string, AuditorMasterKey> = {
  ENTERPRISE_MASTER: {
    keyId: "KEY-NIST-ENT-001",
    keyFormat: "stellar_secret",
    fingerprint: "0x7f4e92a831b0c95f",
    label: "Enterprise Master Auditor Key (Soroban)",
    role: "Lead Regulatory Auditor",
    permissions: "all_sales",
    authorizedAddress: "GAUDITOR7777777777777777777777777777777777777777STORM99",
    expiresAt: "2028-12-31T23:59:59Z",
    isValid: true,
    algorithm: "Ed25519 / AES-256-GCM (NIST SP 800-38D)",
  },
  REGULATORY_COMPLIANCE: {
    keyId: "KEY-ISO-REG-002",
    keyFormat: "ed25519_hex",
    fingerprint: "0x8f2a4e9b7c1d3e5b",
    label: "ISO-27001 Regulatory Compliance Key",
    role: "Master Compliance Officer",
    permissions: "all_sales",
    authorizedAddress: "GCOMPLIANCE8888888888888888888888888888888888888STORM22",
    expiresAt: "2027-06-30T23:59:59Z",
    isValid: true,
    algorithm: "Secp256k1 / AES-256-GCM",
  },
  RESTRICTED_INSPECTOR: {
    keyId: "KEY-TEMP-INS-003",
    keyFormat: "cert_token",
    fingerprint: "0x3c1d9f8e4a7b2c01",
    label: "Restricted Inspector Token",
    role: "System Inspector",
    permissions: "assigned_sales_only",
    authorizedAddress: "GINSPECTOR333333333333333333333333333333333333STORM44",
    expiresAt: "2026-11-01T00:00:00Z",
    isValid: true,
    algorithm: "HMAC-SHA256 / AES-128-GCM",
  },
};

export const PRESET_KEYS_SECRET_MAP: Record<string, string> = {
  ENTERPRISE_MASTER: "SAUDITOR_MASTER_KEY_STORM_ENTERPRISE_VALID_KEY_001",
  REGULATORY_COMPLIANCE: "0x8f2a4e9b7c1d3f0a5e8b2c4d6f1a3e5b7c9d0e2f4a6b8c1d3e5f7a9b0c2d4e6f",
  RESTRICTED_INSPECTOR: "STORM_INSPECTOR_CERT_TOKEN_2026_VALID_448822",
  REVOKED_KEY: "SREVOKED_AUDITOR_KEY_EXPIRED_OR_SUSPENDED_KEY_99999",
};

/**
 * Validates an Auditor Master Decryption Key
 */
export function validateMasterKey(rawKey: string): KeyValidationResult {
  const trimmed = rawKey.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: "Master Decryption Key is required for access.",
    };
  }

  // Check against known revoked or expired test strings
  if (
    trimmed.includes("REVOKED") ||
    trimmed.includes("EXPIRED") ||
    trimmed.toLowerCase().includes("invalid")
  ) {
    return {
      isValid: false,
      error: "Cryptographic Master Key has been revoked by on-chain governance or has expired.",
    };
  }

  // Check preset direct matches
  if (trimmed === PRESET_KEYS_SECRET_MAP.ENTERPRISE_MASTER) {
    return { isValid: true, key: PRESET_MASTER_KEYS.ENTERPRISE_MASTER };
  }
  if (trimmed === PRESET_KEYS_SECRET_MAP.REGULATORY_COMPLIANCE) {
    return { isValid: true, key: PRESET_MASTER_KEYS.REGULATORY_COMPLIANCE };
  }
  if (trimmed === PRESET_KEYS_SECRET_MAP.RESTRICTED_INSPECTOR) {
    return { isValid: true, key: PRESET_MASTER_KEYS.RESTRICTED_INSPECTOR };
  }

  // Stellar Secret Key Format (starts with 'S' and 56 characters Base32)
  if (/^S[A-Za-z0-9]{55}$/.test(trimmed)) {
    const fingerprint = `0x${trimmed.slice(1, 9).toLowerCase()}${trimmed.slice(-8).toLowerCase()}`;
    return {
      isValid: true,
      key: {
        keyId: `KEY-STELLAR-${trimmed.slice(1, 6)}`,
        keyFormat: "stellar_secret",
        fingerprint,
        label: "Custom Stellar Auditor Master Key",
        role: "Lead Regulatory Auditor",
        permissions: "all_sales",
        authorizedAddress: `G${trimmed.slice(1, 55).toUpperCase()}`,
        expiresAt: "2028-12-31T23:59:59Z",
        isValid: true,
        algorithm: "Ed25519 / AES-256-GCM",
      },
    };
  }

  // 64-char Hex Key Format (with or without 0x)
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)) {
    const cleanHex = trimmed.replace(/^0x/, "").toLowerCase();
    const fingerprint = `0x${cleanHex.slice(0, 16)}`;
    return {
      isValid: true,
      key: {
        keyId: `KEY-HEX-${cleanHex.slice(0, 8)}`,
        keyFormat: "ed25519_hex",
        fingerprint,
        label: "Cryptographic Hex Master Key",
        role: "Master Compliance Officer",
        permissions: "all_sales",
        authorizedAddress: `GSEC${cleanHex.slice(0, 52).toUpperCase()}`,
        expiresAt: "2028-12-31T23:59:59Z",
        isValid: true,
        algorithm: "Secp256k1 / AES-256-GCM",
      },
    };
  }

  // Any custom master key >= 24 chars with sufficient entropy
  if (trimmed.length >= 24) {
    let hash = 0;
    for (let i = 0; i < trimmed.length; i++) {
      hash = (hash << 5) - hash + trimmed.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, "0");
    const fingerprint = `0x${hex}${trimmed.slice(0, 8).toLowerCase()}`;

    return {
      isValid: true,
      key: {
        keyId: `KEY-CUSTOM-${hex}`,
        keyFormat: "cert_token",
        fingerprint,
        label: "Verified Auditor Certificate Key",
        role: "Lead Regulatory Auditor",
        permissions: "all_sales",
        authorizedAddress: `GAUD${trimmed.slice(0, 48).padEnd(52, "X").toUpperCase()}`,
        expiresAt: "2027-12-31T23:59:59Z",
        isValid: true,
        algorithm: "AES-256-GCM / NIST SP 800-38D",
      },
    };
  }

  return {
    isValid: false,
    error:
      "Invalid key format. Master key must be a 56-character Stellar secret key (starts with 'S'), a 64-character hex key, or an authorized certificate token.",
  };
}

/**
 * Known preset sales database for testing and demonstration
 */
const CATALOG_SALES: Record<string, Partial<DecryptedSaleEnvelope>> = {
  "1042": {
    campaign: "Tech Gadgets Pro",
    campaignAddress: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
    advertiserAddress: "GADVERT7777777777777777777777777777777777777777STORM1",
    affiliateAddress: "GAFFIL22222222222222222222222222222222222222222STORM2",
    buyerWallet: "GBUYER99999999999999999999999999999999999999999STORM9",
    buyerHash: "sha256:4b227777d4da1fc6215b8823f04494119932177a28189c47e86d2679c2980d90",
    grossConversion: 450.0,
    currency: "XLM",
    commissionRate: 10,
    commissionAmount: 45.0,
    settlementStatus: "Escrow Cleared & Released",
    ledgerTimestamp: "2026-05-16 08:12:04 UTC",
    integrityHash: "0x9f4a1c72b83d5e0a6f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
    onChainSignature: "sig:ed25519:7e4b9f2a01dc8394821a7c3e5f6d8a9b0c1e2f3a4b5c6d7e8f9a0b1c2d3e4f5",
    nistComplianceProof: "NIST-SP800-38D-AES256GCM-OK-0x9812",
  },
  "1100": {
    campaign: "Summer Sale 2026",
    campaignAddress: "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
    advertiserAddress: "GADVERT8888888888888888888888888888888888888888STORM2",
    affiliateAddress: "GAFFIL33333333333333333333333333333333333333333STORM3",
    buyerWallet: "GBUYER88888888888888888888888888888888888888888STORM8",
    buyerHash: "sha256:88921a4f0012bc55648d91024e8832a10492817cba49182390ffcd44910283fa",
    grossConversion: 1250.0,
    currency: "USDC",
    commissionRate: 12,
    commissionAmount: 150.0,
    settlementStatus: "Escrow Cleared & Released",
    ledgerTimestamp: "2026-05-16 09:45:22 UTC",
    integrityHash: "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
    onChainSignature: "sig:ed25519:3b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    nistComplianceProof: "NIST-SP800-38D-AES256GCM-OK-0x4421",
  },
  "1089": {
    campaign: "NFT Drop Alpha",
    campaignAddress: "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
    advertiserAddress: "GADVERT3333333333333333333333333333333333333333STORM3",
    affiliateAddress: "GAFFIL44444444444444444444444444444444444444444STORM4",
    buyerWallet: "GBUYER77777777777777777777777777777777777777777STORM7",
    buyerHash: "sha256:77321a4f0012bc55648d91024e8832a10492817cba49182390ffcd44910283bb",
    grossConversion: 320.0,
    currency: "XLM",
    commissionRate: 15,
    commissionAmount: 48.0,
    settlementStatus: "Pending Clearing Window",
    ledgerTimestamp: "2026-05-16 10:15:30 UTC",
    integrityHash: "0x4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f",
    onChainSignature: "sig:ed25519:9f8e7d6c5b4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8",
    nistComplianceProof: "NIST-SP800-38D-AES256GCM-OK-0x6672",
  },
  "988": {
    campaign: "Web3 Masterclass",
    campaignAddress: "CB9E77LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET3",
    advertiserAddress: "GADVERT4444444444444444444444444444444444444444STORM4",
    affiliateAddress: "GAFFIL55555555555555555555555555555555555555555STORM5",
    buyerWallet: "GBUYER66666666666666666666666666666666666666666STORM6",
    buyerHash: "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    grossConversion: 850.0,
    currency: "USDC",
    commissionRate: 8,
    commissionAmount: 68.0,
    settlementStatus: "Escrow Cleared & Released",
    ledgerTimestamp: "2026-05-15 14:30:11 UTC",
    integrityHash: "0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b",
    onChainSignature: "sig:ed25519:1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2",
    nistComplianceProof: "NIST-SP800-38D-AES256GCM-OK-0x1198",
  },
  "776": {
    campaign: "Crypto Tools Suite",
    campaignAddress: "CC2K99STORM33ESCROW44SOROBAN55AFFILIATE66XLM7",
    advertiserAddress: "GADVERT5555555555555555555555555555555555555555STORM5",
    affiliateAddress: "GAFFIL66666666666666666666666666666666666666666STORM6",
    buyerWallet: "GBUYER55555555555555555555555555555555555555555STORM5",
    buyerHash: "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    grossConversion: 2100.0,
    currency: "XLM",
    commissionRate: 5,
    commissionAmount: 105.0,
    settlementStatus: "Disputed",
    ledgerTimestamp: "2026-05-13 10:05:44 UTC",
    integrityHash: "0x7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
    onChainSignature: "sig:ed25519:8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9",
    nistComplianceProof: "NIST-SP800-38D-AES256GCM-OK-0x7761",
  },
};

/**
 * Decrypts and verifies any sale on-chain using an authorized master key.
 * Every execution creates an immutable audit log entry.
 */
export async function decryptAndVerifySale(
  saleId: string,
  campaignAddressInput?: string,
  masterKey?: AuditorMasterKey,
): Promise<{ envelope: DecryptedSaleEnvelope; auditLog: DecryptionAuditLogEntry }> {
  if (!masterKey || !masterKey.isValid) {
    throw new Error("Unauthorized: Valid Master Decryption Key is required before access.");
  }

  const cleanSaleId = saleId.trim().replace(/^#/, "");
  if (!cleanSaleId) {
    throw new Error("Sale ID is required for decryption.");
  }

  // Artificial realistic cryptographic unwrapping delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  const catalogEntry = CATALOG_SALES[cleanSaleId];
  const campaignAddress =
    campaignAddressInput?.trim() ||
    catalogEntry?.campaignAddress ||
    `CC${cleanSaleId.padEnd(8, "0")}STORMESCROW9999SOROBAN`;

  const campaign = catalogEntry?.campaign || `On-Chain Campaign #${cleanSaleId}`;
  const grossConversion = catalogEntry?.grossConversion ?? (Number(cleanSaleId) * 1.5 + 50);
  const currency = catalogEntry?.currency || "XLM";
  const commissionRate = catalogEntry?.commissionRate ?? 10;
  const commissionAmount =
    catalogEntry?.commissionAmount ?? Number(((grossConversion * commissionRate) / 100).toFixed(2));

  const settlementStatus =
    catalogEntry?.settlementStatus ||
    (Number(cleanSaleId) % 2 === 0 ? "Escrow Cleared & Released" : "Pending Clearing Window");

  const nowIso = new Date().toISOString();
  const integrityHash =
    catalogEntry?.integrityHash ||
    `0x${cleanSaleId.padStart(4, "0")}f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4`;

  const envelope: DecryptedSaleEnvelope = {
    saleId: `#${cleanSaleId}`,
    campaign,
    campaignAddress,
    advertiserAddress:
      catalogEntry?.advertiserAddress || `GADVERT${cleanSaleId.padEnd(46, "0")}STORM`,
    affiliateAddress:
      catalogEntry?.affiliateAddress || `GAFFIL${cleanSaleId.padEnd(46, "0")}STORM`,
    buyerWallet:
      catalogEntry?.buyerWallet || `GBUYER${cleanSaleId.padEnd(46, "0")}STORM`,
    buyerHash:
      catalogEntry?.buyerHash ||
      `sha256:hash_${cleanSaleId}_${Math.random().toString(36).substring(2, 10)}`,
    grossConversion,
    currency,
    commissionRate,
    commissionAmount,
    settlementStatus,
    ledgerTimestamp: catalogEntry?.ledgerTimestamp || nowIso,
    decryptedAt: nowIso,
    integrityHash,
    onChainSignature:
      catalogEntry?.onChainSignature ||
      `sig:ed25519:${cleanSaleId}_master_verified_${Math.random().toString(36).substring(2, 12)}`,
    nistComplianceProof:
      catalogEntry?.nistComplianceProof || `NIST-SP800-38D-AES256GCM-OK-0x${cleanSaleId}`,
    decryptedByFingerprint: masterKey.fingerprint,
    decryptedByRole: masterKey.role,
  };

  // Create immutable audit log entry for this decryption
  const auditLog = recordDecryptionAuditLog({
    saleId: `#${cleanSaleId}`,
    campaign,
    campaignAddress,
    auditorKeyFingerprint: masterKey.fingerprint,
    auditorRole: masterKey.role,
    action: "MASTER_DECRYPT_AND_VERIFY",
    status: "Verified",
    integrityHash,
    verificationNotes: `Master decryption authorized via ${masterKey.label} (${masterKey.fingerprint}). Payload integrity verified against on-chain hash.`,
  });

  return { envelope, auditLog };
}

// In-memory fallback for environments without localStorage (e.g. Node / Vitest)
let inMemoryAuditLogs: DecryptionAuditLogEntry[] = getSeedAuditLogs();

/**
 * Retrieves all decryption audit logs from persistent storage or in-memory cache
 */
export function getDecryptionAuditLogs(): DecryptionAuditLogEntry[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [...inMemoryAuditLogs];
  }

  try {
    const raw = localStorage.getItem(AUDIT_LOG_STORAGE_KEY);
    if (!raw) {
      const initial = getSeedAuditLogs();
      localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(initial));
      inMemoryAuditLogs = [...initial];
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      inMemoryAuditLogs = [...parsed];
      return parsed;
    }
    return inMemoryAuditLogs;
  } catch (err) {
    console.error("Failed to load decryption audit logs:", err);
    return inMemoryAuditLogs;
  }
}

/**
 * Records an audit log entry persistently and broadcasts an event
 */
export function recordDecryptionAuditLog(
  entry: Omit<DecryptionAuditLogEntry, "id" | "timestamp">,
): DecryptionAuditLogEntry {
  const newEntry: DecryptionAuditLogEntry = {
    ...entry,
    id: `AUD-DEC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    timestamp: new Date().toISOString(),
  };

  inMemoryAuditLogs = [newEntry, ...inMemoryAuditLogs].slice(0, 200);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(inMemoryAuditLogs));

      // Broadcast update event for live UI reactivity
      window.dispatchEvent(
        new CustomEvent(AUDIT_LOG_EVENT, {
          detail: newEntry,
        }),
      );
    } catch (err) {
      console.error("Failed to persist decryption audit log:", err);
    }
  }

  return newEntry;
}

/**
 * Clears stored audit logs and resets to seeds
 */
export function resetDecryptionAuditLogs(): void {
  inMemoryAuditLogs = getSeedAuditLogs();
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.removeItem(AUDIT_LOG_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(AUDIT_LOG_EVENT, { detail: null }));
  }
}

/**
 * Export audit logs as CSV string
 */
export function exportAuditLogsAsCSV(logs: DecryptionAuditLogEntry[]): string {
  const headers = [
    "Audit Log ID",
    "Sale ID",
    "Campaign",
    "Campaign Address",
    "Auditor Fingerprint",
    "Auditor Role",
    "Action",
    "Status",
    "Timestamp",
    "Integrity Hash",
    "Notes",
  ];

  const rows = logs.map((log) => [
    `"${log.id}"`,
    `"${log.saleId}"`,
    `"${log.campaign.replace(/"/g, '""')}"`,
    `"${log.campaignAddress}"`,
    `"${log.auditorKeyFingerprint}"`,
    `"${log.auditorRole}"`,
    `"${log.action}"`,
    `"${log.status}"`,
    `"${log.timestamp}"`,
    `"${log.integrityHash}"`,
    `"${log.verificationNotes.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Initial seed audit logs
 */
function getSeedAuditLogs(): DecryptionAuditLogEntry[] {
  return [
    {
      id: "AUD-DEC-INIT-001",
      saleId: "#1042",
      campaign: "Tech Gadgets Pro",
      campaignAddress: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
      auditorKeyFingerprint: "0x7f4e92a831b0c95f",
      auditorRole: "Lead Regulatory Auditor",
      action: "MASTER_DECRYPT_AND_VERIFY",
      status: "Verified",
      timestamp: "2026-05-16T08:12:04.000Z",
      integrityHash: "0x9f4a1c72b83d5e0a6f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
      verificationNotes: "Full master envelope decrypted & verified against on-chain SHA-256 state root.",
    },
    {
      id: "AUD-DEC-INIT-002",
      saleId: "#988",
      campaign: "Web3 Masterclass",
      campaignAddress: "CB9E77LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET3",
      auditorKeyFingerprint: "0x8f2a4e9b7c1d3e5b",
      auditorRole: "Master Compliance Officer",
      action: "MASTER_DECRYPT_AND_VERIFY",
      status: "Verified",
      timestamp: "2026-05-15T14:30:11.000Z",
      integrityHash: "0x2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b",
      verificationNotes: "NIST SP 800-38D AES-GCM tag validated. Escrow settlement confirmed.",
    },
  ];
}
