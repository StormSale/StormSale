import { Operation, Asset, Claimant } from '@stellar/stellar-sdk';

export interface ClaimableBalanceOptions {
  sourcePublicKey: string;
  destinationPublicKey: string;
  amount: string;
  asset?: Asset;
  clawbackDays?: number; // default 180 days
}

export function buildClaimableBalanceOp(options: ClaimableBalanceOptions) {
  const asset = options.asset || Asset.native();
  
  // Claimant predicate: Unconditional (can claim anytime)
  const claimantPredicate = Claimant.predicateUnconditional();
  
  const claimant = new Claimant(options.destinationPublicKey, claimantPredicate);

  return Operation.createClaimableBalance({
    asset,
    amount: options.amount,
    claimants: [claimant],
    source: options.sourcePublicKey,
  });
}

export function calculateClawbackExpiration(createdAt: string, clawbackDays: number = 180): { expirationDate: Date; isExpired: boolean } {
  const created = new Date(createdAt);
  const expirationDate = new Date(created.getTime() + clawbackDays * 24 * 60 * 60 * 1000);
  const isExpired = Date.now() >= expirationDate.getTime();
  return { expirationDate, isExpired };
}
