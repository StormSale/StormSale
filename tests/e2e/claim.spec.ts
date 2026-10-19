import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E coverage for the affiliate commission lifecycle:
 *   1. An affiliate earns commission from referred sales.
 *   2. The affiliate claims the commission and the wallet balance increases.
 *   3. Error path: claiming with insufficient gas fails gracefully and leaves the
 *      balance unchanged.
 *
 * The suite drives the real app through the browser and stubs only the network
 * boundary (JSON fixtures for the affiliate dashboard API) so the tests
 * remain deterministic and run against any environment with the app running.
 */

type Commission = {
  id: string;
  amount: string; // decimal string in token units
  currency: string;
  status: 'pending' | 'claimed';
  createdAt: string;
};

type WalletState = {
  balance: string;
  currency: string;
};

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const initialBalance = '125.000000';
const commissionAmount = '42.500000';
const expectedBalance = (
  Number(initialBalance) + Number(commissionAmount)
).toFixed(6);

const pendingCommission: Commission = {
  id: 'comm_e2e_001',
  amount: commissionAmount,
  currency: 'USDC',
  status: 'pending',
  createdAt: '2024-01-15T10:00:00.000Z',
};

async function mockAffiliateApi(page: Page) {
  let claimed = false;
  let balance = initialBalance;

  await page.route('**/api/affiliate/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith('/commissions')) {
      const commissions = claimed
        ? [{ ...pendingCommission, status: 'claimed' as const }]
        : [pendingCommission];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ commissions }),
      });
      return;
    }

    if (path.endsWith('/wallet')) {
      const state: WalletState = { balance, currency: 'USDC' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state),
      });
      return;
    }

    if (path.endsWith('/claim') && request.method() === 'POST') {
      const payload = request.postDataJSON() as { commissionId?: string; gasLimit?: string } | null;
      const gasLimit = Number(payload?.gasLimit ?? '0');

      // Error path: a gas limit below the required threshold is rejected by the
      // claim endpoint and must not mutate the wallet balance.
      if (gasLimit < 21000) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INSUFFICIENT_GAS',
            message: 'Gas limit too low to complete the claim transaction.',
          }),
        });
        return;
      }

      claimed = true;
      balance = expectedBalance;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tx: '0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface',
          newBalance: expectedBalance,
        }),
      });
      return;
    }

    await route.continue();
  });
}

async function openAffiliateDashboard(page: Page) {
  await page.goto(`${BASE_URL}/affiliate/dashboard`);
  await expect(page.getByTestId('affiliate-dashboard')).toBeVisible();
  await expect(page.getByTestId('wallet-balance')).toHaveText(initialBalance);
}

test.describe('Affiliate commission claim lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await mockAffiliateApi(page);
  });

  test('claims pending commission and increases wallet balance', async ({ page }) => {
    await openAffiliateDashboard(page);

    const rowLocator = page.getByTestId(`commission-${pendingCommission.id}`);
    await expect(rowLocator).toBeVisible();
    await expect(rowLocator.getByTestId('commission-amount')).toHaveText(commissionAmount);

    await page.getByTestId('claim-button').click();

    // Confirm the claim in the confirmation modal.
    await expect(page.getByTestId('claim-confirm-modal')).toBeVisible();
    await page.getByTestId('confirm-claim-button').click();

    // Verify the wallet balance increased by the commission amount.
    await expect(page.getByTestId('wallet-balance')).toHaveText(expectedBalance);

    // The commission is now marked as claimed and the claim button is disabled.
    await expect(rowLocator.getByTestId('commission-status')).toHaveText('claimed');
    await expect(page.getByTestId('claim-button')).toBeDisabled();
  });

  test('rejects claim with insufficient gas and keeps balance unchanged', async ({ page }) => {
    await openAffiliateDashboard(page);

    await page.getByTestId('claim-button').click();
    await expect(page.getByTestId('claim-confirm-modal')).toBeVisible();

    // Force a low gas limit to exercise the error path.
    const gasInput = page.getByTestId('gas-limit-input');
    await gasInput.fill('10000');
    await page.getByTestId('confirm-claim-button').click();

    // The claim fails with a user-facing error.
    const errorAlert = page.getByTestId('claim-error');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('INSUFFICIENT_GAS');

    // Balance must remain at the initial value and the commission stays pending.
    await expect(page.getByTestId('wallet-balance')).toHaveText(initialBalance);
    await expect(
      page.getByTestId(`commission-${pendingCommission.id}`).getByTestId('commission-status'),
    ).toHaveText('pending');
  });
});
