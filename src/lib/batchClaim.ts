import {
  rpc,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  Address,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";
import { signWalletTransaction, getSorobanRpcServer, type WalletType } from "./stellar";

export interface ClaimableCampaignItem {
  campaignId: number;
  campaignName: string;
  advertiserAddress: string;
  maturedSalesCount: number;
  claimableXlm: number;
  clearingPeriodDays: number;
  lastSaleDate: string;
  status: "matured" | "clearing" | "claimed";
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
}

/**
 * Queries active campaigns where the affiliate has cleared matured commission payouts.
 * Returns the matured claimable items from the Soroban contract configured in STELLAR_CONFIG.
 */
export async function fetchAffiliateMaturedClaims(
  affiliateAddress: string,
): Promise<ClaimableCampaignItem[]> {
  if (!affiliateAddress) {
    throw new Error("Affiliate address is required to fetch claims.");
  }

  const server = getSorobanRpcServer();
  const contract = new Contract(STELLAR_CONFIG.contractId);

  const account = await server.getAccount(affiliateAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_CONFIG.networkPassphrase,
  })
    .addOperation(
      contract.call(
        "get_matured_claims",
        new Address(affiliateAddress).toScVal(),
      ),
    )
    .setTimeout(90)
    .build();

  const simResponse = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(
      `Failed to fetch matured claims: ${simResponse.error}`,
    );
  }

  const retVal = (simResponse as rpc.Api.SimulateTransactionSuccessResponse).result
    ?.retVal;
  if (!retVal) {
    return [];
  }

  const decoded = scValToNative(retVal);
  if (!Array.isArray(decoded)) {
    return [];
  }

  return decoded.map((entry: any) => {
    const campaignId = Number(entry.campaign_id ?? entry.campaignId ?? 0);
    const claimableXlm = Number(entry.claimable_xlm ?? entry.claimableXlm ?? 0) / 10_000_000;
    const maturedSalesCount = Number(entry.matured_sales_count ?? entry.maturedSalesCount ?? 0);
    const clearingPeriodDays = Number(entry.clearing_period_days ?? entry.clearingPeriodDays ?? 0);
    const lastSaleDate = String(entry.last_sale_date ?? entry.lastSaleDate ?? "");
    const status = (entry.status ?? "matured") as ClaimableCampaignItem["status"];

    return {
      campaignId,
      campaignName: String(entry.campaign_name ?? entry.campaignName ?? `Campaign ${campaignId}`),
      advertiserAddress: String(entry.advertiser_address ?? entry.advertiserAddress ?? ""),
      maturedSalesCount,
      claimableXlm,
      clearingPeriodDays,
      lastSaleDate,
      status,
    };
  });
}

/**
 * Calculates total withdrawable XLM balance across an array of matured claim items.
 */
export function calculateTotalClaimableXlm(items: ClaimableCampaignItem[]): number {
  const sum = items.reduce((acc, item) => acc + item.claimableXlm, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Executes an Automated Batch Commission Claim Dispatcher:
 * 1. Takes an array of campaign IDs.
 * 2. Packages multiple `claim_payout` Soroban contract calls into a single Stellar transaction envelope.
 * 3. Signs and submits one transaction instead of individual prompts.
 * 4. Itemizes claimed amounts from each campaign in the receipt.
 */
export async function executeBatchCommissionClaim(
  affiliateAddress: string,
  campaignsToClaim: ClaimableCampaignItem[],
  walletType: WalletType = "freighter",
): Promise<BatchClaimReceipt> {
  if (campaignsToClaim.length === 0) {
    throw new Error("No campaigns selected for batch claim.");
  }

  const totalClaimedXlm = calculateTotalClaimableXlm(campaignsToClaim);
  const itemizedClaims = campaignsToClaim.map((c) => ({
    campaignId: c.campaignId,
    campaignName: c.campaignName,
    claimedXlm: c.claimableXlm,
  }));

  const server = getSorobanRpcServer();
  const contract = new Contract(STELLAR_CONFIG.contractId);

  // 1. Fetch source account from Soroban RPC
  const account = await server.getAccount(affiliateAddress);

  // 2. Build multi-operation transaction envelope
  const baseOpFee = Number(BASE_FEE) * campaignsToClaim.length;
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

  const preliminaryTx = txBuilder.setTimeout(90).build();

  // 3. Simulate batch transaction
  const simResponse = await server.simulateTransaction(preliminaryTx);
  if (rpc.Api.isSimulationError(simResponse)) {
    throw new Error(`Batch claim simulation failed: ${simResponse.error}`);
  }

  const preparedTx = rpc.assembleTransaction(preliminaryTx, simResponse).build();
  const signedXtr = await signWalletTransaction(preparedTx.toXDR(), walletType);
  const signedTx = TransactionBuilder.fromXDR(signedXtr, STELLAR_CONFIG.networkPassphrase);

  const sendResponse = await server.sendTransaction(signedTx);
  if (sendResponse.status === "ERROR") {
    throw new Error(`Batch claim submission failed: ${sendResponse.errorResultXdr ?? "unknown error"}`);
  }

  const txHash = sendResponse.hash;
  if (!txHash) {
    throw new Error("Batch claim submission returned no transaction hash.");
  }

  return {
    success: true,
    txHash,
    totalClaimedXlm,
    timestamp: Date.now(),
    itemizedClaims,
  };
}
