import { logSaleContractCall, type WalletType } from "../stellar";

export interface PayoutRequest {
  advertiserAddress: string;
  campaignId: number;
  affiliateAddress: string;
  saleAmountXlm: number;
}

export type LogSaleFn = (request: PayoutRequest) => Promise<{ txHash: string }>;

/** Wraps the project's existing on-chain log_sale call. */
export function createOnChainLogSale(walletType: WalletType): LogSaleFn {
  return async (request) => {
    const result = await logSaleContractCall(
      request.advertiserAddress,
      request.campaignId,
      request.affiliateAddress,
      request.saleAmountXlm,
      walletType,
    );
    return { txHash: result.txHash };
  };
}

export function convertToXlm(amount: number, currency: string, xlmPerUsd: number): number {
  if (currency !== "usd") throw new Error(`Unsupported currency: ${currency}`);
  return amount * xlmPerUsd;
}
