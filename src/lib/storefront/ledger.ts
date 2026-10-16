export interface LedgerEntry {
  orderId: string;
  affiliateAddress: string;
  commission: number;
  refunded: boolean;
  txHash?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class AffiliateLedger {
  private orders = new Map<string, LedgerEntry>();
  private balances = new Map<string, number>();
  private sales = new Map<string, number>();

  has(orderId: string): boolean {
    return this.orders.has(orderId);
  }

  getBalance(affiliateAddress: string): number {
    return this.balances.get(affiliateAddress) ?? 0;
  }

  getConfirmedSales(affiliateAddress: string): number {
    return this.sales.get(affiliateAddress) ?? 0;
  }

  /** Returns false if this order was already recorded (duplicate webhook). */
  recordSale(entry: Omit<LedgerEntry, "refunded">): boolean {
    if (this.orders.has(entry.orderId)) return false;
    this.orders.set(entry.orderId, { ...entry, refunded: false });
    this.balances.set(
      entry.affiliateAddress,
      round2(this.getBalance(entry.affiliateAddress) + entry.commission),
    );
    this.sales.set(entry.affiliateAddress, this.getConfirmedSales(entry.affiliateAddress) + 1);
    return true;
  }

  /** Returns null if the order is unknown or was already refunded. */
  recordRefund(orderId: string): LedgerEntry | null {
    const entry = this.orders.get(orderId);
    if (!entry || entry.refunded) return null;
    entry.refunded = true;
    this.balances.set(
      entry.affiliateAddress,
      round2(this.getBalance(entry.affiliateAddress) - entry.commission),
    );
    this.sales.set(
      entry.affiliateAddress,
      Math.max(0, this.getConfirmedSales(entry.affiliateAddress) - 1),
    );
    return entry;
  }
}
