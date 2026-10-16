export type StorefrontPlatform = "whop" | "gumroad";

export interface NormalizedSaleEvent {
  platform: StorefrontPlatform;
  type: "sale" | "refund";
  orderId: string;
  /** Amount in major currency units, e.g. 49.99 */
  amount: number;
  currency: string;
  /** Stellar address of the referring affiliate (from the ?ref= link parameter) */
  affiliateAddress: string | null;
  /** On-chain campaign ID (from the ?campaign= link parameter) */
  campaignId: number | null;
}
