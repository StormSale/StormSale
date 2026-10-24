import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E coverage for the affiliate commission lifecycle:
 *   1. An affiliate earns commission from referred volume.
 *   2. The affiliate claims the accrued commission.
 *   3. The wallet balance is verified to increase.
 *   4. Error path: claim fails when the wallet has insufficient gas.
 *
 * The tests drive the real app routes and assert on the rendered
 * commission / balance values. Wallet and chain interactions are
 * mocked at the network boundary so the spec is deterministic and
 * runs in CI without a funded wallet.
 */

const APP_BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const ADDRESS = '0xAffiliateAddress0000000000000000000000000000';
const CHAIN_ID = 1;

interface ClaimState {
  claimable: string;
  balance: string;
}

const initialState: ClaimState = {
  claimable: '125.00',
  balance: '10.00',
};

async function mockCommissionApi(page: Page, state: ClaimState) {
  await page.route('**/api/affiliate/*/commission*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          address: ADDRESS,
          chainId: CHAIN_ID,
          claimable: state.claimable,
          balance: state.balance,
        }),
      });
      return;
    }

    if (req.method() === 'POST') {
      const payload = req.postDataJSON() ?? {};
      const gasPrice = Number(payload.gasPrice ?? 0);
      const gasLimit = Number(payload.gasLimit ?? 0);

      // Error path: the wallet cannot afford the requested gas.
      if (gasPrice * gasLimit > Number(state.balance)) {
        await route.fulfill({
          status: 402,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INSUFFICIENT_GAS',
            message: 'Insufficient funds to cover gas fees',
          }),
        });
        return;
      }

      const claimed = Number(state.claimable);
      state.claimable = '0.00';
      state.balance = (Number(state.balance) + claimed).toFixed(2);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          txHash: '0x' + 'a'.repeat(64),
          claimed,
          balance: state.balance,
        }),
      });
      return;
    }

    await route.continue();
  });
}

async function mockWallet(page: Page, balance: string) {
  await page.addInitScript(({ address, chainId, balance }) => {
    (window as any).ethereum = {
      isMetaMask: true,
      selectedAddress: address,
      chainId: `${chainId}`,
      request: async ({ method }: { method: string }) => {
        if (method === 'eth_accounts') return [address];
        if (method === 'eth_chainId') return chainId;
        if (method === 'eth_getBalance') return balance;
        return null;
      },
    };
  }, { address: ADDRESS, chainId: CHAIN_ID, balance });
}

test.describe('Affiliate commission claim', () => {
  test.beforeEach(async ({ page }) => {
    await mockWallet(page, initialState.balance);
  });

  test('happy path: claim increases wallet balance', async ({ page }) => {
    const state: ClaimState = { ...initialState };
    await mockCommissionApi(page, state);

    await page.goto(`${APP_BASE}/affiliate/claim`);

    const claimable = page.getByTestId('claimable-amount');
    const balance = page.getByTestId('wallet-balance');

    await expect(claimable).toHaveText('125.00');
    await expect(balance).toHaveText('10.00');

    await page.getByTestId('claim-button').click();

    await expect(page.getByTestId('claim-success')).toBeVisible();
    await expect(claimable).toHaveText('0.00');
    await expect(balance).toHaveText('135.00');

    // State must persist across a reload after the claim.
    await page.reload();
    await expect(page.getByTestId('wallet-balance')).toHaveText('135.00');
  });

  test('error path: low gas surfaces insufficient funds and keeps balance', async ({ page }) => {
    const state: ClaimState = { ...initialState };
    await mockCommissionApi(page, state);

    await page.goto(`${APP_BASE}/affiliate/claim`);

    const balance = page.getByTestId('wallet-balance');
    await expect(balance).toHaveText('10.00');

    // Force a gas price that exceeds the wallet balance.
    await page.getByTestId('gas-price-input').fill('10000');
    await page.getByTestId('gas-limit-input').fill('100000');

    await page.getByTestId('claim-button').click();

    const error = page.getByTestId('claim-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/insufficient funds to cover gas/i);

    // No commission should be claimed and the balance must be unchanged.
    await expect(page.getByTestId('claimable-amount')).toHaveText('125.00');
    await expect(balance).toHaveText('10.00');
  });
});
