import { useState } from "react";
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
import { resolveRecipient } from "../../lib/stellar";
import { FederatedAddressInput } from "../shared/FederatedAddressInput";
import { Shield, Zap, Users, FileKey } from "lucide-react";

export const LogSaleForm = () => {
  const [affiliateAddress, setAffiliateAddress] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [customerData, setCustomerData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

      showNotification({
        type: "success",
        title: "Sale Logged Successfully!",
        message: "Encrypted sale data has been recorded on-chain.",
      });

      if (typeof window !== "undefined") {
        (window as unknown as { dataLayer?: unknown[] }).dataLayer =
          (window as unknown as { dataLayer?: unknown[] }).dataLayer || [];
        (window as unknown as { dataLayer: unknown[] }).dataLayer.push({
          event: "storm_sale_conversion",
          campaign_id: data.campaignAddress,
          affiliate_address: recipientAddress,
          sale_amount: data.saleAmount,
          currency: "XLM",
          sale_id: payload.saleId,
        });
      }

      setAffiliateAddress("");
      setSaleAmount("");
      setCampaignAddress("");
      setCustomerData("");
      setErrors({});
    } catch (error: unknown) {
      console.error("Error logging sale:", error);

      showNotification({
        type: "error",
        title: "Logging Failed",
        message: error instanceof Error ? error.message : "Failed to log sale.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Log Encrypted Sale
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Record a new sale with military-grade encryption and commission escrow
        </p>
      </div>

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="pb-6 pt-8 px-8">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Secure Sale Logging
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                All data is encrypted before being stored on-chain
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleLogSale} noValidate>
            <InputGroup className="space-y-8">
              <InputField
                label="Campaign Address"
                description="Soroban contract address (C…) for this campaign"
                error={errors.campaignAddress}
                required
              >
                <Input
                  value={campaignAddress}
                  onChange={(e) => {
                    setCampaignAddress(e.target.value);
                    clearError("campaignAddress");
                  }}
                  placeholder="Campaign ID (e.g. 1) or CCAMPAIGN... contract address"
                  variant={errors.campaignAddress ? "error" : "default"}
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono"
                />
              </InputField>

              <div className="grid md:grid-cols-2 gap-6">
                <InputField
                  label="Affiliate Address"
                  description="Stellar public key (G…) or federation address (name*domain.com)"
                  error={errors.affiliateAddress}
                  required
                >
                  <FederatedAddressInput
                    value={affiliateAddress}
                    onChange={(value) => {
                      setAffiliateAddress(value);
                      clearError("affiliateAddress");
                    }}
                    placeholder="GAFFILIATE... or alice*stormsale.io"
                    inputClassName="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                  />
                </InputField>

                <InputField
                  label="Sale Amount (XLM)"
                  description="Total sale amount in XLM (up to 7 decimal places)"
                  error={errors.saleAmount}
                  required
                >
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.0000001"
                      min="0"
                      value={saleAmount}
                      onChange={(e) => {
                        setSaleAmount(e.target.value);
                        clearError("saleAmount");
                      }}
                      placeholder="e.g., 100.50"
                      variant={errors.saleAmount ? "error" : "default"}
                    />
