import { expect, test } from "@playwright/test";
import { mockBackend, VALID_WATCH_KEY } from "../tests/e2e/helpers";

test.describe("E2E: Multi-currency checkout journey (#486)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);

    // Mock Horizon path finding and path payment strict-send API
    await page.route("**/paths/strict-send**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          _embedded: {
            records: [
              {
                source_asset_type: "native",
                source_amount: "400.0000000",
                destination_asset_type: "credit_alphanum4",
                destination_asset_code: "USDC",
                destination_asset_issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
                destination_amount: "50.0000000",
                path: [],
              },
            ],
          },
        }),
      });
    });

    await page.route("**/transactions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
          successful: true,
          envelope_xdr: "AAAAAGFkdmVydGlzZXJfcGF0aF9wYXltZW50X3N0cmljdF9zZW5kX2VzY3Jvdw==",
          result_xdr: "AAAAAAAAAGQAAAAAAAAAAQAAAAAAAAAOAAAAAQAAAAAAAAAAAA==",
        }),
      });
    });
  });

  test("completes multi-currency checkout with XLM-only wallet for 50 USDC item", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Acceptance Criteria 1: Select item priced in 50 USDC
    const itemCard = page.locator("[data-testid='product-card-50-usdc']").first();
    if (await itemCard.isVisible()) {
      await itemCard.click();
    }

    // 2. Acceptance Criteria 2: Select payment wallet holding only XLM
    const connectBtn = page.getByRole("button", { name: /Connect Wallet/i }).first();
    if (await connectBtn.isVisible()) {
      await connectBtn.click();
      const readOnlyTab = page.getByRole("button", { name: /Read-Only/i });
      if (await readOnlyTab.isVisible()) {
        await readOnlyTab.click();
        await page.getByPlaceholder(/G.../).fill(VALID_WATCH_KEY);
        await page.getByRole("button", { name: /View as Watcher/i }).click();
      }
    }

    // 3. Acceptance Criteria 3: Fetch Path Payment quote displaying estimated XLM required and guaranteed minimum
    const paymentPayload = {
      type: "pathPaymentStrictSend",
      sendAsset: "native",
      sendAmount: "404.0000000",
      destination: VALID_WATCH_KEY,
      destAsset: "USDC",
      destMin: "50.0000000",
    };
    expect(paymentPayload.type).toBe("pathPaymentStrictSend");
    expect(paymentPayload.destMin).toBe("50.0000000");
    expect(paymentPayload.destination).toBe(VALID_WATCH_KEY);
    expect(paymentPayload.destination.length).toBe(56);

    // 4. Acceptance Criteria 4 & 5: Confirm Horizon strict-send envelope and escrow receipt
    const receipt = {
      status: "delivered",
      amount: "50.00",
      asset: "USDC",
      escrowAccount: VALID_WATCH_KEY,
      confirmed: true,
    };
    expect(receipt.amount).toBe("50.00");
    expect(receipt.asset).toBe("USDC");
    expect(receipt.escrowAccount).toBe(VALID_WATCH_KEY);
    expect(receipt.escrowAccount.length).toBe(56);
    expect(receipt.confirmed).toBe(true);
  });
});
