import { useState, useRef } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputGroup, InputField } from "../../components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  generateAESKey,
  encryptPayload,
  wrapAESKey,
  getPublicKeyForAddress,
} from "../../lib/crypto";
import { logSaleSchema, getFieldErrors } from "../../lib/validation";
import { dispatchWebhookEvent, triggerConversionPostback } from "../../lib/webhookEngine";
import { getAffiliateAccess } from "../../lib/campaignAccess";
import { notifyTelegramConversion } from "../../lib/telegramClient";
import { resolveRecipient } from "../../lib/stellar";
import { FederatedAddressInput } from "../shared/FederatedAddressInput";
import { Shield, Zap, Users, FileKey, FileSpreadsheet } from "lucide-react";
import { BatchSaleUploader } from "./BatchSaleUploader";

export const LogSaleForm = () => {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [affiliateAddress, setAffiliateAddress] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [customerData, setCustomerData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Optimistic UI state: tracks an in-flight optimistic sale entry so it can
  // be reverted if the on-chain transaction fails.
  const [optimisticSale, setOptimisticSale] = useState<{
    id: string;
    affiliateAddress: string;
    saleAmount: string;
    campaignAddress: string;
    customerData: string;
    status: "pending" | "confirmed";
  } | null>(null);
  const revertRef = useRef<(() => void) | null>(null);

  const { getCampaignContract, userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const clearError = (field: string) => {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleLogSale = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    const result = logSaleSchema.safeParse({
      campaignAddress,
      affiliateAddress,
      saleAmount,
      customerData: customerData || undefined,
    });

    if (!result.success) {
      setErrors(getFieldErrors(result.error));
      return;
    }

    if (!userAddress) {
      showNotification({
        type: "error",
        title: "Wallet Not Connected",
        message: "Connect your wallet before logging a sale.",
      });
      return;
    }

    const { data } = result;

    // Always re-resolve the submitted recipient so a stale or unresolved
    // federation string can never reach the contract call.
    setIsLoading(true);
    let recipientAddress: string | undefined;
    try {
      const resolution = await resolveRecipient(data.affiliateAddress);
      recipientAddress =
        resolution.status === "raw" || resolution.status === "federated"
          ? resolution.address
          : undefined;
      if (!recipientAddress) {
        const message =
          resolution.error || "Could not resolve the affiliate address to a Stellar public key.";
        setErrors({ affiliateAddress: message });
        showNotification({ type: "error", title: "Recipient Not Verified", message });
        setIsLoading(false);
        return;
      }
    } catch (error: unknown) {
      setIsLoading(false);
      setErrors({
        affiliateAddress: error instanceof Error ? error.message : "Federation lookup failed.",
      });
      return;
    }

    // Private campaigns only credit approved affiliates. Checked before any
    // encryption work so the advertiser sees why. The id is already validated
    // as a u32 by the schema, so this cannot throw on an out-of-range value.
    if (/^\d+$/.test(data.campaignAddress)) {
      const access = getAffiliateAccess(data.campaignAddress, recipientAddress);
      if (!access.allowed) {
        showNotification({
          type: "error",
          title: "Affiliate Not Approved",
          message: access.reason,
        });
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);

    // --- Optimistic UI: apply instant (<50ms) feedback before the network
    // round-trip. Snapshot the current form values so we can restore them if
    // the transaction fails.
    const snapshot = {
      affiliateAddress,
      saleAmount,
      campaignAddress,
      customerData,
    };
    const optimisticId = `OPT_${Date.now()}`;
    setOptimisticSale({
      id: optimisticId,
      affiliateAddress: data.affiliateAddress,
      saleAmount: data.saleAmount,
      campaignAddress: data.campaignAddress,
      customerData: data.customerData || "",
      status: "pending",
    });
    revertRef.current = () => {
      setOptimisticSale(null);
      setAffiliateAddress(snapshot.affiliateAddress);
      setSaleAmount(snapshot.saleAmount);
      setCampaignAddress(snapshot.campaignAddress);
      setCustomerData(snapshot.customerData);
    };

    try {
      const campaignContract = getCampaignContract(data.campaignAddress);

      showNotification({
        type: "info",
        title: "Encrypting Data",
        message: "Securing sale information...",
      });

      const aesKey = await generateAESKey();

      const payload = {
        customer: data.customerData || "Anonymous Customer",
        saleId: `SALE_${Date.now()}`,
        product: "Digital Product",
        timestamp: new Date().toISOString(),
        metadata: "Additional sale information",
      };

      const encryptedPayload = await encryptPayload(payload, aesKey);

      const advertiserPublicKey = await getPublicKeyForAddress(userAddress);
      const affiliatePublicKey = await getPublicKeyForAddress(recipientAddress);

      const advertiserWrappedKey = await wrapAESKey(aesKey, advertiserPublicKey);
      const affiliateWrappedKey = await wrapAESKey(aesKey, affiliatePublicKey);

      showNotification({
        type: "info",
        title: "Transaction Submitted",
        message: "Logging encrypted sale...",
      });

      const tx = await campaignContract.logEncryptedSale(
        recipientAddress,
        data.saleAmount,
        encryptedPayload,
        advertiserWrappedKey,
        affiliateWrappedKey,
      );

      const waitResult = await tx.wait();

      // Transaction confirmed — promote the optimistic entry to confirmed.
      setOptimisticSale((prev) =>
        prev ? { ...prev, status: "confirmed" } : prev,
      );
      revertRef.current = null;

      const postbackTxHash =
        waitResult?.txHash || tx?.hash || tx?.id || "PENDING_CONFIRMED_LEDGER_TX";
      const createdAt = new Date().toISOString();

      const conversionPayload = {
        id: payload.saleId,
        event: "conversion.created",
        created_at: createdAt,
        conversion_id: payload.saleId,
        campaign_id: data.campaignAddress,
        campaign_address: data.campaignAddress,
        affiliate_address: recipientAddress,
        advertiser_address: userAddress || "GADVERTISER_DEFAULT_TESTNET",
        amount: Number(data.saleAmount),
        currency: "XLM",
        tx_hash: postbackTxHash,
        status: "confirmed",
      };
      void dispatchWebhookEvent("conversion.created", conversionPayload);

      try {
        const postbacks = await triggerConversionPostback({
          saleId: payload.saleId,
          campaignAddress: data.campaignAddress,
          affiliateAddress: recipientAddress,
          advertiserAddress: userAddress || "GADVERTISER_DEFAULT_TESTNET",
          saleAmount: data.saleAmount,
          currency: "XLM",
          stellarTxHash: postbackTxHash,
          ledgerTimestamp: createdAt,
          customerRef: data.customerData ? `REF_${payload.saleId.slice(-8)}` : "Anonymous Customer",
          status: "CONFIRMED_ON_LEDGER",
        });

        if (postbacks.length > 0) {
          showNotification({
            type: "info",
            title: "Webhooks Dispatched",
            message: `Automated postback queued for ${postbacks.length} active endpoint(s).`,
          });
        }
      } catch (webhookErr) {
        console.warn("Conversion postback warning:", webhookErr);

        showNotification({
          type: "warning",
          title: "Postback Notice",
          message:
            "Sale confirmed on-chain, but automated webhook dispatch encountered an issue. You can review or retry from the Webhook Manager tab.",
        });
      }

      // Best effort: the server re-reads this log_sale transaction from the
      // ledger and messages the affiliate on Telegram if they connected
      // alerts. It is not awaited, so it never delays the sale confirmation.
      if (/^[0-9a-f]{64}$/i.test(postbackTxHash)) {
        void notifyTelegramConversion(postbackTxHash).then((outcome) => {
          // "send_failed" means the affiliate has alerts on but Telegram
          // rejected the message; tell the advertiser. Other failures (alerts
          // not configured, RPC lag) are not actionable from this form.
          if (outcome === "error") console.warn("Telegram alert request failed.");
          if (outcome === "send_failed") {
            showNotification({
              type: "warning",
              title: "Telegram Alert Not Sent",
              message:
                "The sale is confirmed on-chain, but the affiliate's Telegram alert could not be delivered.",
            });
          }
        });
      }

      showNotification({
        type: "success",
        title: "Sale Logged Successfully!",
        message: "Encrypted sale data has been recorded on-chain.",
      });

      setAffiliateAddress("");
      setSaleAmount("");
      setCampaignAddress("");
      setCustomerData("");
      setErrors({});
    } catch (error: unknown) {
      console.error("Error logging sale:", error);

      // --- Revert optimistic state on failure so the UI reflects reality.
      if (revertRef.current) {
        revertRef.current();
        revertRef.current = null;
      }

      showNotification({
        type: "error",
        title: "Logging Failed",
        message: error instanceof Error ? error.message : "Failed to log sale.",
      });
    } finally {
      revertRef.current = null;
      setIsLoading(false);
    }
  };

  const handleCancelOptimistic = () => {
    if (revertRef.current) {
      revertRef.current();
      revertRef.current = null;
    }
    showNotification({
      type: "info",
      title: "Sale Cancelled",
      message: "Optimistic sale entry was reverted.",
    });
  };

  if (mode === "batch") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 text-xs">
            <button
              type="button"
              onClick={() => setMode("single")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              Single Sale Entry
            </button>
            <button
              type="button"
              onClick={() => setMode("batch")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Batch Uploader (CSV/JSON)
            </button>
          </div>
        </div>
        <BatchSaleUploader />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Log Encrypted Sale
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Record a new sale with military-grade encryption and commission escrow
          </p>
        </div>

        <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 text-xs self-start">
          <button
            type="button"
            onClick={() => setMode("single")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            Single Sale
          </button>
          <button
            type="button"
            onClick={() => setMode("batch")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Batch CSV/JSON
          </button>
        </div>
      </div>

      {optimisticSale && (
        <div
          className={`rounded-2xl border p-4 flex items-start justify-between gap-4 ${
            optimisticSale.status === "pending"
              ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10"
              : "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div
              className={`mt-0.5 w-3 h-3 rounded-full ${
                optimisticSale.status === "pending"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <div>
              <div className="text-sm font-bold text-zinc-900 dark:text-white">
                {optimisticSale.status === "pending"
                  ? "Sale pending confirmation…"
                  : "Sale confirmed on-chain"}
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-mono">
                {optimisticSale.saleAmount} XLM → {optimisticSale.affiliateAddress.slice(0, 8)}…{optimisticSale.affiliateAddress.slice(-4)}
              </div>
            </div>
          </div>
          {optimisticSale.status === "pending" && (
            <button
              type="button"
              onClick={handleCancelOptimistic}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 underline underline-offset-2"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-6 pt-8 px-8">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center">
              <FileKey className="w-7 h-7 text-zinc-700 dark:text-zinc-300" />
            </div>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
};