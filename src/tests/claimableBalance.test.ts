import { describe, it, expect } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { buildClaimableBalanceOp, calculateClawbackExpiration } from '../lib/stellar/claimableBalance';

describe('Stellar Claimable Balance Support (#131)', () => {
  it('builds create claimable balance operation correctly', () => {
    const sourceKp = Keypair.random();
    const destKp = Keypair.random();

    const op = buildClaimableBalanceOp({
      sourcePublicKey: sourceKp.publicKey(),
      destinationPublicKey: destKp.publicKey(),
      amount: '100.50',
      clawbackDays: 180,
    });

    expect(op).toBeDefined();
    expect(typeof op).toBe('object');
  });

  it('calculates clawback expiration date correctly', () => {
    const pastDate = '2025-01-01T00:00:00.000Z';
    const { expirationDate, isExpired } = calculateClawbackExpiration(pastDate, 180);

    expect(expirationDate).toBeInstanceOf(Date);
    expect(isExpired).toBe(true); // Since 2025 is in the past relative to 2026
  });
});
