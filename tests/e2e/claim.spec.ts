import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ------------------------------------------------------------------------------
// ELI 5 Affiliate Claim - E2E Lifecycle Test
//
// This spec exercises the full lifecycle of an affiliate commission:
//   1. Affiliate registration / referral attribution
//   2. Referred user action that generates commission
//   3. Commission accrual in the affiliate's pending balance
//   4. Claim / withdraw of the commission
//   5. Verified wallet balance increase
//   6. Error path: claim fails when gas is insufficient
// ------------------------------------------------------------------------------

interface WalletState {
  address: string;
  balance: bigint;
  pendingCommission: bigint;
}

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';

/**
 * Read the current on-chain / database balance for a wallet address.
 * This hits the application's own API so the test reflects what the UI
 * would actually show to the user.
 */
async function fetchWalletState(address: string): Promise<WalletState> {
  const res = await fetch(`${API_URL}/api/wallet/${address}/state`);
  if (!res.ok) {
    throw new Error(`Failed to fetch wallet state for ${address}: ${res.status}`);
  }
  const body = (await res.json()) as {
    balance: string;
    pendingCommission: string;
  };
  return {
    address,
    balance: BigInt(body.balance),
    pendingCommission: BigInt(body.pendingCommission),
  };
}

/**
 * Seed a referral relationship between an affiliate and a referred user.
 * This is the action that would normally be performed by the affiliate
 * sharing their link and the referred user signing up.
 */
async function seedReferral(affiliate: string, referred: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/affiliate/referrals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ affiliate, referred }),
  });
  if (!res.ok) {
    throw new Error(`Failed to seed referral: ${res.status} ${await res.text()}`);
  }
}

/**
 * Trigger the commission-generating action for a referred user.
 * In this app that is a stake / swap / purchase that generates a fee.
 */
async function triggerCommissionEvent(referred: string, amount: bigint): Promise<void> {
  const res = await fetch(`${API_URL}/api/actions/stake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wallet: referred, amount: amount.toString() }),
  });
  if (!res.ok) {
    throw new Error(`Failed to trigger commission event: ${res.status} ${await res.text()}`);
  }
}

async function connectWallet(page: Page, address: string): Promise<void> {
  await page.goto(BASE_URL);
  await page.getByTestId('connect-wallet-btn').click();
  await page.getByTestId('wallet-option-mock').click();
  await page.getByTestId('wallet-address-input').fill(address);
  await page.getByTestId('wallet-confirm').click();
  await expect(page.getByTestId('wallet-connected-indicator')).toBeVisible();
}

test.describe('Affiliate commission lifecycle', () => {
  const affiliateAddress = '0xAFF11ATE00000000000000000000000000000001';
  const referredAddress = '0xREFERRED00000000000000000000000000000002';
  const commissionAmount = BigInt('1000000000000000000'); // 1 token in wei

  test.beforeEach(async ({ request }) => {
    // Reset the backend state for the two wallets so the test is deterministic.
    await request.post(`${API_URL}/api/test/reset`, {
      data: { wallets: [affiliateAddress, referredAddress] },
    });
  });

  test('full lifecycle: earn commission then claim it with verified balance increase', async ({ page }) => {
    // 1. Affiliate connects their wallet.
    await connectWallet(page, affiliateAddress);

    // 2. Seed the referral relationship and trigger the commission-generating action.
    await seedReferral(affiliateAddress, referredAddress);
    await triggerCommissionEvent(referredAddress, commissionAmount);

    // 3. Reload the affiliate dashboard and assert the pending commission is visible.
    await page.goto(`${BASE_URL}/affiliate`);
    await expect(page.getByTestId('pending-commission')).toHaveText(commissionAmount.toString());

    // 4. Capture the wallet balance before claiming.
    const before = await fetchWalletState(affiliateAddress);

    // 5. Claim the commission through the UI.
    await page.getByTestId('claim-commission-btn').click();
    await expect(page.getByTestId('claim-confirm-btn')).toBeVisible();
    await page.getByTestId('claim-confirm-btn').click();
    await expect(page.getByTestId('claim-success-toast')).toBeVisible();

    // 6. Verify the wallet balance increased by the commission amount.
    const after = await fetchWalletState(affiliateAddress);
    expect(after.balance - before.balance).toEqual(commissionAmount);
    expect(after.pendingCommission).toEqual(BigInt(0));
  });

  test('error path: claim fails with insufficient gas and pending commission is preserved', async ({ page, request }) => {
    // Set the affiliate's gas balance to zero so the claim transaction cannot
    // be broadcast. This is the condition the acceptance criteria calls
    // "low gas".
    await request.post(`${API_URL}/api/test/set-gas`, {
      data: { wallet: affiliateAddress, gasBalance: '0' },
    });

    // Seed a pending commission so there is something to claim.
    await seedReferral(affiliateAddress, referredAddress);
    await triggerCommissionEvent(referredAddress, commissionAmount);

    await connectWallet(page, affiliateAddress);
    await page.goto(`${BASE_URL}/affiliate`);

    const before = await fetchWalletState(affiliateAddress);

    await page.getByTestId('claim-commission-btn').click();
    await page.getByTestId('claim-confirm-btn').click();

    // The UI must surface an error and must not report success.
    await expect(page.getByTestId('claim-error-toast')).toBeVisible();
    await expect(page.getByTestId('claim-error-toast')).toContainText(/insufficient gas/i);
    await expect(page.getByTestId('claim-success-toast')).not.toBeVisible();

    // The pending commission must remain unchanged and the balance must not have
    // increased.
    const after = await fetchWalletState(affiliateAddress);
    expect(after.balance).toEqual(before.balance);
    expect(after.pendingCommission).toEqual(commissionAmount);
  });
});
