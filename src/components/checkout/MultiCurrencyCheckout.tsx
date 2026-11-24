import React, { useState, useEffect } from "react";
import {
  fetchPathPaymentQuote,
  executePathPaymentCheckout,
  type PathPaymentQuote,
  type PathPaymentExecutionReceipt,
} from "../../lib/pathPayment";
import { ShoppingCart, CheckCircle2, ArrowRight, RefreshCw, Zap, ShieldCheck } from "lucide-react";

export interface CheckoutItem {
  id: string;
  name: string;
  description: string;
  priceAmount: string;
  priceAsset: "USDC" | "EURC" | "XLM";
}

export const CHECKOUT_PRODUCTS: CheckoutItem[] = [
  {
    id: "item-pro-50",
    name: "StormSale Pro Campaign License",
    description: "Enterprise tier smart contract campaign license and verification suite.",
    priceAmount: "50",
    priceAsset: "USDC",
  },
  {
    id: "item-starter-10",
    name: "StormSale Starter Pack",
    description: "Affiliate onboarding and custom link generator allocation.",
    priceAmount: "10",
    priceAsset: "USDC",
  },
  {
    id: "item-eurc-40",
    name: "EU Regional Marketing Pass",
    description: "Multi-tenant EU affiliate directory inclusion.",
    priceAmount: "40",
    priceAsset: "EURC",
  },
];

export const DEMO_ADVERTISER_ESCROW =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const DEMO_BUYER_WALLET =
  "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

interface MultiCurrencyCheckoutProps {
  onSuccess?: (receipt: PathPaymentExecutionReceipt) => void;
  buyerAddress?: string;
  escrowAddress?: string;
}

export const MultiCurrencyCheckout: React.FC<MultiCurrencyCheckoutProps> = ({
  onSuccess,
  buyerAddress = DEMO_BUYER_WALLET,
  escrowAddress = DEMO_ADVERTISER_ESCROW,
}) => {
  const [selectedItemId, setSelectedItemId] = useState<string>("item-pro-50");
  const [paymentAsset, setPaymentAsset] = useState<"XLM" | "USDC" | "EURC">("XLM");
  const [quote, setQuote] = useState<PathPaymentQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [receipt, setReceipt] = useState<PathPaymentExecutionReceipt | null>(null);

  const selectedItem =
    CHECKOUT_PRODUCTS.find((p) => p.id === selectedItemId) || CHECKOUT_PRODUCTS[0];

  // Refresh path payment quote whenever selected item or payment asset changes
  useEffect(() => {
    let active = true;
    setLoadingQuote(true);

    fetchPathPaymentQuote({
      sourceAsset: paymentAsset,
      destAsset: selectedItem.priceAsset,
      destAmount: selectedItem.priceAmount,
      slippageBps: 50, // 0.5% max slippage
    })
      .then((q) => {
        if (active) {
          setQuote(q);
          setLoadingQuote(false);
        }
      })
      .catch(() => {
        if (active) setLoadingQuote(false);
      });

    return () => {
      active = false;
    };
  }, [selectedItemId, paymentAsset, selectedItem]);

  const handleCheckout = async () => {
    if (!quote) return;
    setSubmitting(true);
    try {
      const res = await executePathPaymentCheckout({
        buyerAddress,
        sourceAsset: paymentAsset,
        sourceAmount: quote.estimatedSourceAmount,
        destAsset: selectedItem.priceAsset,
        destAmount: selectedItem.priceAmount,
        advertiserEscrow: escrowAddress,
      });
      setReceipt(res);
      if (onSuccess) {
        onSuccess(res);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) {
    return (
      <div
        data-testid="checkout-receipt-modal"
        className="w-full max-w-xl mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-fade-in"
      >
        <div className="flex items-center gap-4 border-b border-slate-100 dark:border-zinc-800/80 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3
              data-testid="checkout-success-receipt"
              className="text-xl font-extrabold text-zinc-900 dark:text-white"
            >
              Path Payment Settled Successfully
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              USDC delivered directly to advertiser escrow via Stellar DEX strict send.
            </p>
          </div>
        </div>

        {/* Item & Transaction summary */}
        <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Purchased Item</span>
            <span className="font-bold text-zinc-800 dark:text-zinc-200">{selectedItem.name}</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Delivered to Escrow</span>
            <span
              data-testid="receipt-delivered"
              className="font-mono font-bold text-emerald-600 dark:text-emerald-400"
            >
              {receipt.deliveredAmount}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Paid from Wallet</span>
            <span data-testid="receipt-paid" className="font-mono font-bold text-indigo-500">
              {receipt.paidAmount}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-500">Envelope Operation</span>
            <span
              data-testid="receipt-envelope-type"
              className="font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded"
            >
              {receipt.envelopeType}
            </span>
          </div>

          <div className="flex flex-col gap-1 text-xs pt-1 border-t border-slate-200/50 dark:border-zinc-800">
            <span className="text-zinc-500">Advertiser Escrow Destination</span>
            <span
              data-testid="receipt-escrow-address"
              className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 break-all"
            >
              {receipt.advertiserEscrow}
            </span>
          </div>

          <div className="flex flex-col gap-1 text-xs pt-1">
            <span className="text-zinc-500">Horizon Transaction Hash</span>
            <span
              data-testid="receipt-tx-hash"
              className="font-mono text-[11px] text-sky-500 break-all"
            >
              {receipt.txHash}
            </span>
          </div>
        </div>

        <button
          type="button"
          data-testid="btn-reset-checkout"
          onClick={() => setReceipt(null)}
          className="w-full py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs transition shadow-md"
        >
          Done / Return to Store
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="multi-currency-checkout"
      className="w-full max-w-xl mx-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-extrabold text-zinc-900 dark:text-white">
              Multi-Currency Checkout
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Pay in XLM using Stellar Path Payments for USDC/EURC goods
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[11px] font-bold">
          <Zap className="w-3.5 h-3.5" />
          <span>Path Payments</span>
        </div>
      </div>

      {/* Product Selection */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
          Select Product / Item
        </label>
        <div className="space-y-2">
          {CHECKOUT_PRODUCTS.map((prod) => (
            <div
              key={prod.id}
              data-testid={`product-option-${prod.id}`}
              onClick={() => setSelectedItemId(prod.id)}
              className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-center justify-between ${
                selectedItemId === prod.id
                  ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm"
                  : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
              }`}
            >
              <div>
                <div className="text-xs font-bold text-zinc-900 dark:text-white">{prod.name}</div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {prod.description}
                </div>
              </div>
              <div
                data-testid={`item-price-${prod.priceAsset.toLowerCase()}`}
                className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400 shrink-0 ml-4"
              >
                {prod.priceAmount} {prod.priceAsset}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Asset Selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block">
          Select Payment Asset (Wallet Balance)
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["XLM", "USDC", "EURC"] as const).map((asset) => (
            <button
              key={asset}
              type="button"
              data-testid={`btn-select-asset-${asset}`}
              onClick={() => setPaymentAsset(asset)}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                paymentAsset === asset
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-800"
              }`}
            >
              {asset}
              {asset === "XLM" && " (XLM Only)"}
            </button>
          ))}
        </div>
      </div>

      {/* Live Path Payment Quote Preview */}
      <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-4 space-y-2.5">
        <div className="flex justify-between items-center text-xs font-bold text-zinc-700 dark:text-zinc-300 pb-1 border-b border-slate-200/60 dark:border-zinc-800">
          <span>Stellar Path Payment Quote</span>
          {loadingQuote ? (
            <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
          ) : (
            <span className="text-[11px] font-mono text-emerald-500">Live Horizon DEX</span>
          )}
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500">Estimated {paymentAsset} Required</span>
          <span
            data-testid="quote-source-amount"
            className="font-mono font-bold text-indigo-600 dark:text-indigo-400"
          >
            {quote ? `${quote.estimatedSourceAmount} ${paymentAsset}` : "Calculating..."}
          </span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500">Guaranteed Minimum Delivered</span>
          <span
            data-testid="quote-guaranteed-minimum"
            className="font-mono font-bold text-emerald-600 dark:text-emerald-400"
          >
            {quote
              ? `${quote.guaranteedMinimumDest} ${selectedItem.priceAsset}`
              : `${selectedItem.priceAmount} ${selectedItem.priceAsset}`}
          </span>
        </div>

        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500">Max Send (0.5% Slippage)</span>
          <span data-testid="quote-source-max" className="font-mono text-zinc-500">
            {quote ? `${quote.sourceMax} ${paymentAsset}` : "--"}
          </span>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="button"
        data-testid="btn-pay-path-payment"
        disabled={loadingQuote || submitting || !quote}
        onClick={handleCheckout}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            Signing & Broadcasting Horizon Envelope...
          </>
        ) : (
          <>
            Pay {quote?.estimatedSourceAmount} {paymentAsset} for {selectedItem.priceAmount}{" "}
            {selectedItem.priceAsset}
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-400 text-center">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span>Strict send guarantee: excess XLM is refunded automatically by Horizon ledger</span>
      </div>
    </div>
  );
};
