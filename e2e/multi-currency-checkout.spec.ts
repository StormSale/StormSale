import { expect, test } from "@playwright/test";
import { mockBackend } from "../tests/e2e/helpers";

test.describe("E2E Journey: Multi-Currency Checkout with Asset Path Payments (#486)", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
  });

  test("completes multi-currency path payment checkout from XLM to USDC delivered to escrow", async ({
    page,
  }) => {
    // 1. Navigate to multi-currency checkout view
    await page.goto("/?view=checkout");
    await expect(page.getByTestId("multi-currency-checkout")).toBeVisible({ timeout: 15_000 });

    // 2. Select item priced in 50 USDC
    const proItemOption = page.getByTestId("product-option-item-pro-50");
    await expect(proItemOption).toBeVisible();
    await proItemOption.click();

    // Verify 50 USDC item price is highlighted
    const priceDisplay = page.getByTestId("item-price-usdc").first();
    await expect(priceDisplay).toBeVisible();
    await expect(priceDisplay).toHaveText(/50\s+USDC/);

    // 3. Select payment wallet holding only XLM
    const xlmAssetBtn = page.getByTestId("btn-select-asset-XLM");
    await expect(xlmAssetBtn).toBeVisible();
    await xlmAssetBtn.click();

    // 4. Fetch Path Payment quote displaying estimated XLM required and guaranteed minimum
    const sourceAmountQuote = page.getByTestId("quote-source-amount");
    await expect(sourceAmountQuote).toBeVisible();
    await expect(sourceAmountQuote).toHaveText(/400\.0000000\s+XLM/);

    const guaranteedMinQuote = page.getByTestId("quote-guaranteed-minimum");
    await expect(guaranteedMinQuote).toBeVisible();
    await expect(guaranteedMinQuote).toHaveText(/50\.00\s+USDC/);

    const maxSendQuote = page.getByTestId("quote-source-max");
    await expect(maxSendQuote).toBeVisible();
    await expect(maxSendQuote).toHaveText(/402\.0000000\s+XLM/);

    // 5. Execute transaction and verify Horizon path payment strict send envelope
    const payBtn = page.getByTestId("btn-pay-path-payment");
    await expect(payBtn).toBeEnabled();
    await payBtn.click();

    // 6. Confirm receipt display showing USDC delivered to advertiser escrow
    const receiptModal = page.getByTestId("checkout-receipt-modal");
    await expect(receiptModal).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("checkout-success-receipt")).toBeVisible();

    const deliveredAmount = page.getByTestId("receipt-delivered");
    await expect(deliveredAmount).toHaveText("50.00 USDC");

    const paidAmount = page.getByTestId("receipt-paid");
    await expect(paidAmount).toHaveText("400.0000000 XLM");

    const envelopeType = page.getByTestId("receipt-envelope-type");
    await expect(envelopeType).toHaveText("pathPaymentStrictSend");

    const escrowAddress = page.getByTestId("receipt-escrow-address");
    await expect(escrowAddress).toBeVisible();
    await expect(escrowAddress).toHaveText(/GBBD47/);

    const txHash = page.getByTestId("receipt-tx-hash");
    await expect(txHash).toBeVisible();
    await expect(txHash).toHaveText(/^tx_[a-f0-9]{64}$/);
  });
});
