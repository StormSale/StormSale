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

    // Private campaigns only credit approved affiliates. Checked before any
    // encryption work so the advertiser sees why. The id is already validated
    // as a u32 by the schema, so this cannot throw on an out-of-range value.
    if (/^\d+$/.test(data.campaignAddress)) {
      const access = getAffiliateAccess(data.campaignAddress, data.affiliateAddress);
      if (!access.allowed) {
        showNotification({
          type: "error",
          title: "Affiliate Not Approved",
          message: access.reason,
        });
        return;
      }
    }

    setIsLoading(true);

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
      const affiliatePublicKey = await getPublicKeyForAddress(data.affiliateAddress);

      const advertiserWrappedKey = await wrapAESKey(aesKey, advertiserPublicKey);
      const affiliateWrappedKey = await wrapAESKey(aesKey, affiliatePublicKey);

      showNotification({
        type: "info",
        title: "Transaction Submitted",
        message: "Logging encrypted sale...",
      });

      const tx = await campaignContract.logEncryptedSale(
        data.affiliateAddress,
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
        affiliate_address: data.affiliateAddress,
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
          affiliateAddress: data.affiliateAddress,
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
                  description="Stellar public key of the affiliate (G…)"
                  error={errors.affiliateAddress}
                  required
                >
                  <Input
                    value={affiliateAddress}
                    onChange={(e) => {
                      setAffiliateAddress(e.target.value);
                      clearError("affiliateAddress");
                    }}
                    placeholder="GAFFILIATE... (56-char Stellar Public Key)"
                    variant={errors.affiliateAddress ? "error" : "default"}
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono"
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
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      XLM
                    </div>
                  </div>
                </InputField>
              </div>

              <InputField
                label="Customer Information"
                description="Optional customer data (will be encrypted) — max 256 characters"
                error={errors.customerData}
              >
                <Input
                  value={customerData}
                  onChange={(e) => {
                    setCustomerData(e.target.value);
                    clearError("customerData");
                  }}
                  placeholder="Customer name, email, or reference ID"
                  variant={errors.customerData ? "error" : "default"}
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                />
              </InputField>

              <div className="bg-slate-50 dark:bg-zinc-950/50 p-6 rounded-2xl border border-slate-100 dark:border-zinc-800/50">
                <h4 className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-xs mb-6 flex items-center">
                  <FileKey className="w-4 h-4 mr-2 text-indigo-500" />
                  Encryption Security Flow
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
                  {[
                    { step: "1", label: "Generate AES Key", icon: Zap },
                    { step: "2", label: "Encrypt Data", icon: Shield },
                    { step: "3", label: "Get Public Keys", icon: Users },
                    { step: "4", label: "Wrap Keys", icon: FileKey },
                    { step: "5", label: "Store On-Chain", icon: Shield },
                  ].map((item) => {
                    const IconComponent = item.icon;

                    return (
                      <div key={item.step} className="flex flex-col items-center">
                        <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-full flex items-center justify-center text-sm font-bold mb-3 border border-indigo-200 dark:border-indigo-500/30">
                          {item.step}
                        </div>
                        <IconComponent className="w-5 h-5 text-zinc-400 dark:text-zinc-500 mb-2" />
                        <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          {item.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button
                type="submit"
                loading={isLoading}
                cooldown
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Logging Encrypted Sale...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Shield className="w-5 h-5" />
                    <span>Log Encrypted Sale</span>
                  </div>
                )}
              </Button>
            </InputGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
