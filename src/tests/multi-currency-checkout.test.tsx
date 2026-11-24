// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fix cross-realm Uint8Array instanceof check for @stellar/stellar-sdk in JSDOM
try {
  Object.defineProperty(Uint8Array, Symbol.hasInstance, {
    value: (instance: any) =>
      instance != null &&
      (ArrayBuffer.isView(instance) ||
        Object.prototype.toString.call(instance) === "[object Uint8Array]"),
  });
} catch {
  // Ignore if property is non-configurable
}

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MultiCurrencyCheckout } from "../components/checkout/MultiCurrencyCheckout";
import {
  fetchPathPaymentQuote,
  buildPathPaymentStrictSendEnvelope,
} from "../lib/pathPayment";

const VALID_BUYER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const VALID_ESCROW = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("Multi-Currency Checkout with Asset Path Payments Suite (#486)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Path Payment quote calculations and envelope building", () => {
    it("fetches Path Payment quote for 50 USDC priced item with XLM source asset", async () => {
      const quote = await fetchPathPaymentQuote({
        sourceAsset: "XLM",
        destAsset: "USDC",
        destAmount: "50.00",
        slippageBps: 50, // 0.5%
      });

      // At rate 0.125 USDC/XLM -> 50 / 0.125 = 400 XLM
      expect(quote.sourceAsset).toBe("XLM");
      expect(quote.destAsset).toBe("USDC");
      expect(quote.destAmount).toBe("50.00");
      expect(parseFloat(quote.estimatedSourceAmount)).toBeCloseTo(400, 1);
      expect(parseFloat(quote.sourceMax)).toBeGreaterThan(400); // Slippage buffer included
      expect(quote.guaranteedMinimumDest).toBe("50.00");
    });

    it("builds valid Horizon pathPaymentStrictSend transaction envelope", () => {
      const { transaction, operation } = buildPathPaymentStrictSendEnvelope({
        sourceAccount: VALID_BUYER,
        sourceAsset: "XLM",
        sourceAmount: "400.0000000",
        destinationEscrow: VALID_ESCROW,
        destAsset: "USDC",
        destAmount: "50.00",
        destMin: "50.00",
        network: "TESTNET",
      });

      expect(transaction).toBeDefined();
      expect(transaction.operations).toHaveLength(1);

      // Verify operation type is pathPaymentStrictSend
      expect(operation.type).toBe("pathPaymentStrictSend");
      expect(operation.destination).toBe(VALID_ESCROW);
      expect(operation.destMin).toBe("50.00");
      expect(operation.sendAmount).toBe("400.0000000");
    });
  });

  describe("2. Interactive UI checkout journey", () => {
    it("selects item priced in 50 USDC and displays price details", async () => {
      render(<MultiCurrencyCheckout buyerAddress={VALID_BUYER} escrowAddress={VALID_ESCROW} />);

      expect(screen.getByTestId("multi-currency-checkout")).toBeTruthy();
      const proOption = screen.getByTestId("product-option-item-pro-50");
      expect(proOption).toBeTruthy();
      fireEvent.click(proOption);

      const priceTags = screen.getAllByTestId("item-price-usdc");
      expect(priceTags.length).toBeGreaterThan(0);
      expect(priceTags[0].textContent).toContain("50 USDC");
    });

    it("selects payment wallet holding only XLM", async () => {
      render(<MultiCurrencyCheckout buyerAddress={VALID_BUYER} escrowAddress={VALID_ESCROW} />);

      const xlmBtn = screen.getByTestId("btn-select-asset-XLM");
      fireEvent.click(xlmBtn);
      expect(xlmBtn.className).toContain("bg-indigo-600");
    });

    it("displays estimated XLM required and guaranteed minimum in quote box", async () => {
      render(<MultiCurrencyCheckout buyerAddress={VALID_BUYER} escrowAddress={VALID_ESCROW} />);

      await waitFor(() => {
        const sourceAmount = screen.getByTestId("quote-source-amount");
        expect(sourceAmount.textContent).toContain("400.0000000 XLM");
        const guaranteedMin = screen.getByTestId("quote-guaranteed-minimum");
        expect(guaranteedMin.textContent).toContain("50.00 USDC");
      });
    });

    it("executes transaction and displays confirmation receipt with USDC delivered to advertiser escrow", async () => {
      const onSuccessSpy = vi.fn();
      render(
        <MultiCurrencyCheckout
          buyerAddress={VALID_BUYER}
          escrowAddress={VALID_ESCROW}
          onSuccess={onSuccessSpy}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("quote-source-amount").textContent).toContain("400.0000000 XLM");
      });

      const payBtn = screen.getByTestId("btn-pay-path-payment");
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(screen.getByTestId("checkout-receipt-modal")).toBeTruthy();
        expect(screen.getByTestId("checkout-success-receipt")).toBeTruthy();
        expect(screen.getByTestId("receipt-delivered").textContent).toBe("50.00 USDC");
        expect(screen.getByTestId("receipt-paid").textContent).toBe("400.0000000 XLM");
        expect(screen.getByTestId("receipt-envelope-type").textContent).toBe("pathPaymentStrictSend");
        expect(screen.getByTestId("receipt-escrow-address").textContent).toContain(VALID_ESCROW);
        expect(screen.getByTestId("receipt-tx-hash").textContent).toMatch(/^tx_[a-f0-9]{64}$/);
      });

      expect(onSuccessSpy).toHaveBeenCalledTimes(1);
    });
  });
});
