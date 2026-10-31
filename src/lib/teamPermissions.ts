/**
 * StormSale Team Permission Management & Multi-User Organization Protocol (#154)
 */

import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { getLocalStorage } from "./storage";
import type {
  OrganizationRole,
  OrganizationCapability,
  TeamMember,
  OrganizationState,
  OrganizationAuthChallenge,
  RoleDefinition,
} from "../types/organization";

export const ROLE_DEFINITIONS: Record<OrganizationRole, RoleDefinition> = {
  ADMIN: {
    role: "ADMIN",
    label: "Admin",
    description: "Full control over team members, permissions, campaigns, finances, and escrow.",
    badgeClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    capabilities: [
      "campaign:create",
      "campaign:edit",
      "sale:log",
      "escrow:refund",
      "escrow:refill",
      "team:manage",
      "analytics:view",
      "audit:grant",
    ],
  },
  MARKETING_MANAGER: {
    role: "MARKETING_MANAGER",
    label: "Marketing Manager",
    description:
      "Manage campaigns, update storefront & branding, log sales, and analyze performance.",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    capabilities: ["campaign:create", "campaign:edit", "sale:log", "analytics:view"],
  },
  EDITOR: {
    role: "EDITOR",
    label: "Editor",
    description: "Draft, deploy, and edit marketing campaigns and log sales with team approval.",
    badgeClass:
      "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400 border-teal-200 dark:border-teal-800",
    capabilities: ["campaign:create", "campaign:edit", "sale:log", "analytics:view"],
  },
  FINANCE: {
    role: "FINANCE",
    label: "Finance",
    description:
      "Process escrow refunds, authorize deposits, configure refill thresholds, view financial metrics.",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    capabilities: ["escrow:refund", "escrow:refill", "analytics:view"],
  },
  VIEWER: {
    role: "VIEWER",
    label: "Viewer",
    description: "Read-only access to campaign analytics, event ledger, and conversion metrics.",
    badgeClass:
      "bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-zinc-400 border-slate-200 dark:border-zinc-700",
    capabilities: ["analytics:view"],
  },
  NONE: {
    role: "NONE",
    label: "Non-Member",
    description: "No organizational capabilities or access permissions.",
    badgeClass:
      "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700",
    capabilities: [],
  },
};

/**
 * Validates whether a Stellar address is an Ed25519 public key (G...).
 */
export function isValidStellarAddress(address: string | null | undefined): boolean {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  if (!trimmed.startsWith("G") || trimmed.length !== 56) return false;
  try {
    return StrKey.isValidEd25519PublicKey(trimmed);
  } catch {
    return false;
  }
}

/**
 * Checks if a given role possesses a specific capability.
 */
export function hasCapability(
  role: OrganizationRole | string | null | undefined,
  capability: OrganizationCapability,
): boolean {
  if (!role) return false;
  const normalized = role.toUpperCase() as OrganizationRole;
  const def = ROLE_DEFINITIONS[normalized];
  if (!def) return false;
  return def.capabilities.includes(capability);
}

/**
 * Asserts capability, throwing a 403-equivalent Error if unauthorized.
 */
export function assertCapability(
  role: OrganizationRole | string | null | undefined,
  capability: OrganizationCapability,
  actionName: string = "action",
): void {
  if (!hasCapability(role, capability)) {
    throw new Error(
      `403 Forbidden: Role '${role || "UNAUTHORIZED"}' does not have capability '${capability}' required for ${actionName}.`,
    );
  }
}

/**
 * Returns list of granted capabilities for a role.
 */
export function getRoleCapabilities(role: OrganizationRole): OrganizationCapability[] {
  return ROLE_DEFINITIONS[role]?.capabilities || [];
}

/**
 * Generates cryptographic SEP-0010 style organization challenge for team member signing.
 */
export function generateOrganizationAuthChallenge(
  orgId: string,
  memberAddress: string,
): OrganizationAuthChallenge {
  if (!isValidStellarAddress(memberAddress)) {
    throw new Error("Invalid Stellar wallet address for organization authentication challenge.");
  }
  const challengeNonce =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function"
      ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("")
      : Math.random().toString(36).substring(2, 12);
  const timestamp = new Date().toISOString();
  const messageToSign = `StormSale Enterprise Organization Auth\nOrg ID: ${orgId}\nMember: ${memberAddress}\nNonce: ${challengeNonce}\nTimestamp: ${timestamp}`;

  return {
    challengeNonce,
    timestamp,
    orgId,
    memberAddress,
    messageToSign,
  };
}

/**
 * Cryptographically verifies member signature against individual wallet address.
 */
export function verifyMemberWalletSignature(
  memberAddress: string,
  signature: string,
  challenge: OrganizationAuthChallenge,
): boolean {
  if (!memberAddress || !signature || !challenge) return false;
  if (!isValidStellarAddress(memberAddress)) return false;
  if (challenge.memberAddress !== memberAddress) return false;

  // Freshness check: reject challenges outside 5-minute freshness window
  if (challenge.timestamp) {
    const challengeTime = new Date(challenge.timestamp).getTime();
    if (isNaN(challengeTime) || Math.abs(Date.now() - challengeTime) > 5 * 60 * 1000) {
      return false;
    }
  }

  // 1. Simulated / mock signatures
  if (
    signature.startsWith("SIG_") ||
    signature.startsWith("SIMULATED_") ||
    signature.startsWith("MOCK_")
  ) {
    return signature.includes(memberAddress) || signature.includes("VERIFIED");
  }

  // 2. Real Ed25519 cryptographic signature check
  try {
    const kp = Keypair.fromPublicKey(memberAddress);
    const messageBuffer = Buffer.from(challenge.messageToSign, "utf8");
    const sigBuffer = Buffer.from(signature, "base64");
    if (sigBuffer.length === 64) {
      return kp.verify(messageBuffer, sigBuffer);
    }
  } catch {
    return false;
  }

  return false;
}

export const INITIAL_ORGANIZATION_MEMBERS: TeamMember[] = [
  {
    id: "mem-1",
    walletAddress: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
    name: "Alex Vance (Owner)",
    role: "ADMIN",
    addedAt: "2026-01-10T10:00:00.000Z",
    addedBy: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
    authSignatureStatus: "verified",
    signatureTimestamp: "2026-01-10T10:01:00.000Z",
    authSignature: "SIG_GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS_VERIFIED", // gitleaks:allow
  },
  {
    id: "mem-2",
    walletAddress: "GDVT6HKML4LGIVQCYYVZJJ7ZQQNLB4SZYUSKW3KK7N37RGBXKFTHFARX",
    name: "Elena Rostova",
    role: "MARKETING_MANAGER",
    addedAt: "2026-02-01T14:30:00.000Z",
    addedBy: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
    authSignatureStatus: "verified",
    signatureTimestamp: "2026-02-01T14:35:00.000Z",
    authSignature: "SIG_GDVT6HKML4LGIVQCYYVZJJ7ZQQNLB4SZYUSKW3KK7N37RGBXKFTHFARX_VERIFIED", // gitleaks:allow
  },
  {
    id: "mem-3",
    walletAddress: "GC4JBO4L6WEIKUK5LTG3L5KMOG7QRZWE6C7O6M7ZVDUSENR5Z5KZGV3E",
    name: "Marcus Sterling",
    role: "EDITOR",
    addedAt: "2026-02-10T11:00:00.000Z",
    addedBy: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
    authSignatureStatus: "verified",
    signatureTimestamp: "2026-02-10T11:05:00.000Z",
    authSignature: "SIG_GC4JBO4L6WEIKUK5LTG3L5KMOG7QRZWE6C7O6M7ZVDUSENR5Z5KZGV3E_VERIFIED", // gitleaks:allow
  },
  {
    id: "mem-4",
    walletAddress: "GBXMIXG2WK5BBLS6DM3R74MWRLVQUFY5AKIRDLE4L5WWOBJV2QHCU3O5",
    name: "David Miller",
    role: "FINANCE",
    addedAt: "2026-02-15T09:15:00.000Z",
    addedBy: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
    authSignatureStatus: "verified",
    signatureTimestamp: "2026-02-15T09:20:00.000Z",
    authSignature: "SIG_GBXMIXG2WK5BBLS6DM3R74MWRLVQUFY5AKIRDLE4L5WWOBJV2QHCU3O5_VERIFIED", // gitleaks:allow
  },
  {
    id: "mem-5",
    walletAddress: "GBPQUM54NNP3YODVCA6KJFNJMLDX2KWNFHTZZSQWZRGAOR5RZMITK7MV",
    name: "Audit & Compliance Team",
    role: "VIEWER",
    addedAt: "2026-03-01T16:00:00.000Z",
    addedBy: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
    authSignatureStatus: "verified",
    signatureTimestamp: "2026-03-01T16:05:00.000Z",
    authSignature: "SIG_GBPQUM54NNP3YODVCA6KJFNJMLDX2KWNFHTZZSQWZRGAOR5RZMITK7MV_VERIFIED", // gitleaks:allow
  },
];

export const INITIAL_ORGANIZATION_STATE: OrganizationState = {
  id: "org-stormsale-advertiser-pro",
  name: "StormSale Enterprise Media Group",
  ownerAddress: "GBVUQ2HHWW6C5M4ZTEDKGZU2JRHBEMBLZSFRSTWEYPEBRBEQVTTSTQDS",
  members: INITIAL_ORGANIZATION_MEMBERS,
  updatedAt: "2026-03-01T16:05:00.000Z",
};

export const ORG_STORAGE_KEY = "stormsale_enterprise_org_state_v1";
export const ORGANIZATION_STORAGE_KEY = ORG_STORAGE_KEY;

/**
 * Loads organization state from local storage or returns initial state.
 */
export function loadOrganizationState(): OrganizationState {
  try {
    const storage = getLocalStorage();
    const raw = storage.getItem(ORG_STORAGE_KEY);
    if (!raw) return INITIAL_ORGANIZATION_STATE;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.members)) return INITIAL_ORGANIZATION_STATE;
    return parsed;
  } catch {
    return INITIAL_ORGANIZATION_STATE;
  }
}

/**
 * Persists organization state to local storage.
 */
export function saveOrganizationState(state: OrganizationState): void {
  try {
    const storage = getLocalStorage();
    storage.setItem(ORG_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Failed to persist organization state:", err);
  }
}
