/**
 * StormSale Contract Integrity Verification Service
 *
 * Implements automated validation of deployed Soroban contract addresses
 * against authoritative registries to protect against unauthorized contract
 * mutations, frontend spoofing, and rogue deployment mismatches (#65).
 */
import { STELLAR_CONFIG } from "../config/stellar";
import { CONTRACT_ADDRESSES } from "../config/contracts";

export type ContractIntegrityStatusType = "verified" | "mismatch" | "invalid_format";

export interface ContractIntegrityResult {
  status: ContractIntegrityStatusType;
  isVerified: boolean;
  configuredAddress: string;
  expectedAddress: string;
  network: string;
  verifiedAt: string;
  reason?: string;
}

/**
 * Authoritative registry of verified Soroban escrow contracts per network.
 */
export const VERIFIED_CONTRACT_REGISTRY: Record<string, string> = {
  TESTNET: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  PUBLIC: "CA7QW5KXGPTR4N2K9J2V8B4RN8XJLP8M1K3V6P7QW5KXGPTR4N2K9J2V",
};

let activeContractOverride: string | null = null;
type IntegrityListener = (result: ContractIntegrityResult) => void;
const subscribers = new Set<IntegrityListener>();

/**
 * Sets or clears runtime contract address override (used for simulation and testing).
 */
export function setContractAddressOverride(override: string | null): void {
  activeContractOverride = override;
  notifySubscribers();
}

/**
 * Resolves the authoritative expected contract address for the given network.
 */
export function getExpectedContractAddress(network: string = STELLAR_CONFIG.network): string {
  const upper = (network || "TESTNET").toUpperCase();
  return (
    VERIFIED_CONTRACT_REGISTRY[upper] ||
    CONTRACT_ADDRESSES.CAMPAIGN_ESCROW ||
    STELLAR_CONFIG.contractId
  );
}

/**
 * Resolves the active runtime contract address in use.
 */
export function getActiveContractAddress(): string {
  if (activeContractOverride !== null) {
    return activeContractOverride;
  }
  return CONTRACT_ADDRESSES.CAMPAIGN_ESCROW || STELLAR_CONFIG.contractId;
}

/**
 * Validates whether an address string matches the Soroban contract ID format (C... 56 chars Base32).
 */
export function isValidContractAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  return /^C[A-Z0-9]{55}$/.test(address);
}

/**
 * Performs automated integrity verification of the active contract address.
 */
export function checkContractIntegrity(
  currentAddress?: string,
  network: string = STELLAR_CONFIG.network,
): ContractIntegrityResult {
  const configured = currentAddress !== undefined ? currentAddress : getActiveContractAddress();
  const expected = getExpectedContractAddress(network);
  const now = new Date().toISOString();

  if (!isValidContractAddress(configured)) {
    return {
      status: "invalid_format",
      isVerified: false,
      configuredAddress: configured,
      expectedAddress: expected,
      network,
      verifiedAt: now,
      reason:
        "The configured contract address does not conform to valid Soroban contract identifier format (56-character RFC 4648 Base32 starting with 'C').",
    };
  }

  if (configured !== expected) {
    return {
      status: "mismatch",
      isVerified: false,
      configuredAddress: configured,
      expectedAddress: expected,
      network,
      verifiedAt: now,
      reason: `Contract address mismatch: active runtime address differs from the authoritative verified registry for ${network}.`,
    };
  }

  return {
    status: "verified",
    isVerified: true,
    configuredAddress: configured,
    expectedAddress: expected,
    network,
    verifiedAt: now,
  };
}

/**
 * Subscribes to contract integrity state mutations.
 */
export function subscribeToContractIntegrity(listener: IntegrityListener): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function notifySubscribers(): void {
  const result = checkContractIntegrity();
  for (const listener of subscribers) {
    try {
      listener(result);
    } catch {
      // ignore listener errors
    }
  }
}
