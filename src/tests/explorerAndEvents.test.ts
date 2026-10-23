import { describe, it, expect } from 'vitest';
import { getStellarExpertUrl } from '../lib/stellar/explorer';

describe('Stellar.Expert Explorer Utilities (#113)', () => {
  it('generates correct transaction deep link', () => {
    const url = getStellarExpertUrl('tx', 'abc123hash', 'testnet');
    expect(url).toBe('https://stellar.expert/explorer/testnet/tx/abc123hash');
  });

  it('generates correct contract deep link', () => {
    const url = getStellarExpertUrl('contract', 'C_ABC123', 'testnet');
    expect(url).toBe('https://stellar.expert/explorer/testnet/contract/C_ABC123');
  });

  it('generates correct account deep link', () => {
    const url = getStellarExpertUrl('account', 'G_USER123', 'testnet');
    expect(url).toBe('https://stellar.expert/explorer/testnet/account/G_USER123');
  });
});
