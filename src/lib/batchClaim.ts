import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Account,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG, type SupportedEscrowAssetCode } from "../config/stellar";
import { signWalletTransaction, getSorobanRpcServer, type WalletType } from "./stellar";
import {
  type SplitPlan,
  type SplitAllocationReceipt,
  computeSplitAllocations,
  toSplitAllocationReceipts,
  buildSplitPaymentOperations,
  xlmToStroops,
} from "./commissionSplit";
const MOCK_AFFILIATE_ADDRESS = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

function isPlausibleStellarAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  const t = address.trim();
  if (t === MOCK_AFFILIATE_ADDRESS) return true;
  return /^[GC][A-Z0-9]{55}$/.test(t);
}

function randomHex64(): string {
  const bytes = new Uint8Array(32);
  const c = globalThis.crypto ?? (globalThis as unknown as { webcrypto?: Crypto }).webcrypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function validateClaimItems(items: ClaimableCampaignItem[]): void {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No campaigns selected for batch claim.");
  }
  const seen = new Set<number>();
  for (const c of items) {
    if (!c || typeof c !== "object") throw new Error("Invalid campaign entry in batch claim.");
    if (!Number.isInteger(c.campaignId) || c.campaignId <= 0) {
      throw new Error(`Invalid campaignId in batch claim: ${String(c.campaignId)}.`);
    }
    if (seen.has(c.campaignId)) {
      throw new Error(`Duplicate campaignId in batch claim: ${c.campaignId}.`);
    }
    seen.add(c.campaignId);
    if (
      typeof c.claimableXlm !== "number" ||
      !Number.isFinite(c.claimableXlm) ||
      c.claimableXlm <= 0
    ) {
      throw new Error(`Invalid claimable amount for campaign #${c.campaignId}.`);
    }
    if (c.claimableXlm > 1_000_000_000) {
      throw new Error(`Claimable amount out of bounds for campaign #${c.campaignId}.`);
    }
    if (c.status !== "matured") {
      throw new Error(`Campaign #${c.campaignId} is not matured and cannot be claimed.`);
    }
    if (!c.campaignName || typeof c.campaignName !== "string") {
      throw new Error(`Invalid campaign name for campaign #${c.campaignId}.`);
    }
  }
}

export interface ClaimableCampaignItem {
  campaignId: number;
  campaignName: string;
  advertiserAddress: string;
  maturedSalesCount: number;
  claimableXlm: number;
  clearingPeriodDays: number;
  lastSaleDate: string;
  status: "matured" | "clearing" | "claimed";
  assetCode?: SupportedEscrowAssetCode;
}

export interface BatchClaimReceipt {
  success: boolean;
  txHash: string;
  totalClaimedXlm: number;
  timestamp: number;
  itemizedClaims: {
    campaignId: number;
    campaignName: string;
    claimedXlm: number;
  }[];
  /**
   * Per-destination payment operations executed inside the same atomic
   * transaction envelope when a Commission Auto-Split plan is active (#167).
   */
  splitAllocations?: SplitAllocationReceipt[];
  /** Count of extra payment operations appended to the claim transaction. */
  paymentOperationCount?: number;
}

/**
 * Mock/Query active campaigns where the affiliate has cleared matured commission payouts.
 */
export async function fetchAffiliateMaturedClaims(
  _affiliateAddress: string,
): Promise<ClaimableCampaignItem[]> {
  // In production, queries Soroban contract and Horizon ledger events for cleared sales
  return [
    {
      campaignId: 101,
      campaignName: "Apex Alpha Performance Tech",
      advertiserAddress: "GA7QW5KXGPTR4N2K9J2M3N4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D",
      maturedSalesCount: 4,
      claimableXlm: 45.5,
      clearingPeriodDays: 7,
      lastSaleDate: "2026-10-01",
      status: "matured",
    },
    {
      campaignId: 204,
      campaignName: "Nova Quantum Cloud Services",
      advertiserAddress: "GB4RN8XJLP8M1K3V6P7Q8R9S0T1U2V3W4X5Y6Z7A8B9C0D1E2F3G",
      maturedSalesCount: 7,
      claimableXlm: 78.0,
      clearingPeriodDays: 14,
      lastSaleDate: "2026-09-28",
      status: "matured",
    },
    {
      campaignId: 309,
      campaignName: "Stellar Horizon SaaS Hub",
      advertiserAddress: "GC1M2N3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0G1H2I3J4K5L",
      maturedSalesCount: 3,
      claimableXlm: 32.25,
      clearingPeriodDays: 3,
      lastSaleDate: "2026-10-08",
      status: "matured",
    },
  ];
}

/**
 * Calculates total withdrawable XLM balance across an array of matured claim items.
 */
export function calculateTotalClaimableXlm(items: ClaimableCampaignItem[]): number {
  if (!Array.isArray(items)) throw new Error("Invalid campaigns list.");
  const sum = items.reduce((acc, item) => {
    if (!item || typeof item.claimableXlm !== "number" || !Number.isFinite(item.claimableXlm)) {
      throw new Error("Invalid claimable amount in campaigns list.");
    }
    if (item.claimableXlm < 0) throw new Error("Negative claimable amount is not allowed.");
    return acc + item.claimableXlm;
  }, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Executes an Automated Batch Commission Claim Dispatcher:
 * 1. Takes an array of campaign IDs.
 * 2. Packages multiple `claim_payout` Soroban contract calls into a single Stellar transaction envelope.
 * 3. Appends one `payment` operation per auto-split destination (issue #167) to the
 *    same envelope, so commissions route to vault accounts atomically upon claim.
 * 4. Signs and submits one transaction instead of individual prompts.
 * 5. Itemizes claimed amounts and split allocations in the receipt.
 */
export async function executeBatchCommissionClaim(
  affiliateAddress: string,
  campaignsToClaim: ClaimableCampaignItem[],
  walletType: WalletType = "freighter",
  splitPlan?: SplitPlan | null,
): Promise<BatchClaimReceipt> {
  validateClaimItems(campaignsToClaim);
  if (!isPlausibleStellarAddress(affiliateAddress)) {
    throw new Error("Invalid affiliate address for batch claim.");
  }

  const totalClaimedXlm = calculateTotalClaimableXlm(campaignsToClaim);
  const itemizedClaims = campaignsToClaim.map((c) => ({
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    claimedXlm: c.claimableXlm,
  }));

  // Pre-compute the atomic split across destinations (exact stroop accounting).
  const activeDestinations = splitPlan?.enabled ? splitPlan.destinations : [];
  const allocations = computeSplitAllocations(xlmToStroops(totalClaimedXlm), activeDestinations);
  const splitAllocations = toSplitAllocationReceipts(allocations);
  const paymentOperationCount = splitAllocations.length;

  // If mock/test/readonly fallback, return instant simulated transaction receipt
  // Explicit sandbox/test modes return a deterministic-shape simulated receipt.
  // Readonly wallets cannot sign, so claiming is rejected instead of faked.
  if (walletType === "readonly") {
    throw new Error("Readonly wallet cannot sign a batch claim transaction.");
  }
  if (walletType === "mock" || (typeof window !== "undefined" && (window as any).__MOCK_BATCH__)) {
    const mockHash = "0x" + randomHex64();

    return {
      success: true,
      txHash: mockHash,
      totalClaimedXlm,
      timestamp: Date.now(),
      itemizedClaims,
      splitAllocations: splitAllocations.length > 0 ? splitAllocations : undefined,
      paymentOperationCount,
    };
  }

  const server = getSorobanRpcServer();
  const contract = new Contract(STELLAR_CONFIG.contractId);

  // 1. Fetch source account from Soroban RPC. Never fake success:
  // an unfunded/unreachable account must surface as an error so the UI
  // cannot display an unconfirmed settlement as claimed.
  let account: Account;
  try {
    account = await server.getAccount(affiliateAddress);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Batch claim settlement failed: affiliate account is not available on the ledger (${reason}). Fund it and retry.`,
      { cause: err },
    );
  }

  // 2. Build multi-operation transaction envelope:
  //    claim_payout invocations first, then split payment operations — all atomic.
  const operationCount = campaignsToClaim.length + paymentOperationCount;
  const baseOpFee = Number(BASE_FEE) * operationCount;
  const txBuilder = new TransactionBuilder(account, {
    fee: String(baseOpFee),
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  });

  for (const campaign of campaignsToClaim) {
    const callOp = contract.call(
      "claim_payout",
      new Address(affiliateAddress).toScVal(),
      nativeToScVal(campaign.campaignId, { type: "u32" }),
    );
    txBuilder.addOperation(callOp);
  }

  for (const paymentOp of buildSplitPaymentOperations(allocations)) {
    txBuilder.addOperation(paymentOp);
  }

  const preliminaryTx = txBuilder.setTimeout(90).build();

  // 3. Simulate batch transaction. Any RPC/simulation failure is fatal:
  // the caller must see the error rather than a fabricated receipt.
  const simResponse = await server.simulateTransaction(preliminaryTx);
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Batch claim simulation failed: ${simResponse.error}`);
  }
  const preparedTx = rpc.assembleTransaction(preliminaryTx, simResponse).build();
  const signedXdr = await signWalletTransaction(preparedTx.toXDR(), walletType);
  if (!signedXdr || typeof signedXdr !== "string") {
    throw new Error("Batch claim failed: wallet did not return a signed transaction.");
  }
  const signedTx = TransactionBuilder.fromXDR(signedXdr, STELLAR_CONFIG.networkPassphrase);
  const sendResponse = await server.sendTransaction(signedTx);
  const txHash = sendResponse.hash;
  if (!txHash) {
    throw new Error("Batch claim failed: ledger did not return a transaction hash.");
  }
  return {
    success: true,
    txHash,
    totalClaimedXlm,
    timestamp: Date.now(),
    itemizedClaims,
    splitAllocations: splitAllocations.length > 0 ? splitAllocations : undefined,
    paymentOperationCount,
  };
}
