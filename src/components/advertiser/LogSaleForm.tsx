import { useState, useMemo, useEffect } from "react";
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
import { useOrganization } from "../../hooks/useOrganization";
import { generateAESKey, encryptPayload, wrapAESKey } from "../../lib/cryptoWorkerBridge";
import { getPublicKeyForAddress } from "../../lib/crypto";
import { logSaleSchema, getFieldErrors } from "../../lib/validation";
import { dispatchWebhookEvent, triggerConversionPostback } from "../../lib/webhookEngine";
import { getAffiliateAccess } from "../../lib/campaignAccess";
import { notifyTelegramConversion } from "../../lib/telegramClient";
import { resolveRecipient } from "../../lib/stellar";
import { FederatedAddressInput } from "../shared/FederatedAddressInput";
import {
  Shield,
  Zap,
  Users,
  FileKey,
  FileSpreadsheet,
  Lock,
  GitBranch,
  Activity,
  RefreshCw,
} from "lucide-react";
import { BatchSaleUploader } from "./BatchSaleUploader";
import {
  getRecruiterForAffiliate,
  calculateTwoTierCommission,
  formatAffiliateAddress,
} from "../../lib/referralTree";
import { initialMockCampaigns } from "./MyCampaignsList";
import {
  fetchLiveOracleRates,
  convertFiatToXlm,
  convertXlmToFiat,
  formatOracleFreshness,
  type OracleRateResponse,
} from "../../lib/priceOracle";

export const LogSaleForm = () => {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [affiliateAddress, setAffiliateAddress] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [currencyMode, setCurrencyMode] = useState<"XLM" | "USD" | "EUR">("XLM");
  const [fiatAmount, setFiatAmount] = useState("");
  const [oracleData, setOracleData] = useState<OracleRateResponse | null>(null);
  const [isRefreshingOracle, setIsRefreshingOracle] = useState(false);
  const [campaignAddress, setCampaignAddress] = useState("");
  const [customerData, setCustomerData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Issue #145: Live Price Oracle Feed Engine
  const loadOracleRates = async (force = false) => {
    setIsRefreshingOracle(true);
    try {
      const data = await fetchLiveOracleRates(force);
      setOracleData(data);
    } catch (err) {
      console.warn("Failed to refresh oracle rates:", err);
    } finally {
      setIsRefreshingOracle(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchLiveOracleRates(false).then((data) => {
      if (mounted) setOracleData(data);
    });
    const interval = setInterval(() => {
      fetchLiveOracleRates(false).then((data) => {
        if (mounted) setOracleData(data);
      });
    }, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleFiatAmountChange = (val: string) => {
    setFiatAmount(val);
    clearError("saleAmount");
    if (!val || isNaN(Number(val)) || Number(val) <= 0) {
      setSaleAmount("");
      return;
    }
    if (oracleData) {
      const calculatedXlm = convertFiatToXlm(
        Number(val),
        currencyMode === "EUR" ? "EUR" : "USD",
        oracleData.rates,
      );
      setSaleAmount(calculatedXlm > 0 ? calculatedXlm.toString() : "");
    }
  };

  const handleCurrencyChange = (newCurrency: "XLM" | "USD" | "EUR") => {
    setCurrencyMode(newCurrency);
    if (newCurrency === "XLM") {
      setFiatAmount("");
    } else if (saleAmount && oracleData) {
      const fiat = convertXlmToFiat(
        Number(saleAmount),
        newCurrency === "EUR" ? "EUR" : "USD",
        oracleData.rates,
      );
      setFiatAmount(fiat > 0 ? fiat.toString() : "");
    }
  };

  const { getCampaignContract, userAddress } = useWeb3();
  const { showNotification } = useNotification();
  const { hasCapability, currentRole } = useOrganization();
  const canLogSale = hasCapability("sale:log");

  const recruiterRelation =
    affiliateAddress.trim().length >= 10
      ? getRecruiterForAffiliate(affiliateAddress.trim())
      : undefined;

  const campaignCommissionRate = useMemo(() => {
    const raw = campaignAddress.trim();
    if (!raw) return 10.0;
    const match = initialMockCampaigns.find(
      (c) =>
        c.id === raw ||
        String(c.onChainId) === raw ||
        c.contractAddress.toLowerCase() === raw.toLowerCase(),
    );
    return match ? match.commissionRate : 10.0;
  }, [campaignAddress]);

  const twoTierSplit = recruiterRelation
    ? calculateTwoTierCommission(
        parseFloat(saleAmount) || 0,
        campaignCommissionRate,
        recruiterRelation.overrideRatePercent,
        recruiterRelation.parentAddress,
        affiliateAddress.trim(),
      )
    : null;

  const clearError = (field: string) => {
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const handleLogSale = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});

    if (!canLogSale) {
      showNotification({
        type: "error",
        title: "Permission Denied",
        message: `Your role '${currentRole}' is not authorized to log sales. Requires Admin or Editor role.`,
      });
      return;
    }

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
        oracleMetadata: {
          currencyMode,
          fiatAmount: currencyMode !== "XLM" ? fiatAmount : undefined,
          lockedRate: oracleData ? oracleData.rates[currencyMode === "EUR" ? "EUR" : "USD"] : 0.125,
          oracleSource: oracleData ? oracleData.source : "Fallback",
          rateTimestamp: oracleData ? oracleData.updatedAt : Date.now(),
          isStale: oracleData ? oracleData.isStale : false,
          lockedXlmAmount: data.saleAmount,
        },
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
        campaignCommissionRate,
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

      showNotification({
        type: "error",
        title: "Logging Failed",
        message: error instanceof Error ? error.message : "Failed to log sale.",
      });
    } finally {
      setIsLoading(false);
    }
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
          {!canLogSale && (
            <div
              className="p-4 mb-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start gap-3"
              data-testid="log-sale-locked-banner"
              role="alert"
            >
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <div className="font-bold">Sale Logging Restricted</div>
                <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                  Your active role is <strong>{currentRole}</strong>. Logging encrypted sales
                  requires <strong>Admin</strong> or <strong>Editor / Marketing Manager</strong>{" "}
                  permissions.
                </p>
              </div>
            </div>
          )}

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

              {/* Live Oracle Price Feeds Bar (Issue #145) */}
              <div
                className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-zinc-950/60 border border-indigo-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                data-testid="oracle-status-bar"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="font-bold text-zinc-900 dark:text-white">Live Price Feeds:</span>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 flex-wrap">
                    <span>
                      XLM/USD:{" "}
                      <strong>${oracleData ? oracleData.rates.USD.toFixed(4) : "0.1250"}</strong>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <span>
                      XLM/EUR:{" "}
                      <strong>€{oracleData ? oracleData.rates.EUR.toFixed(4) : "0.1150"}</strong>
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                    <span>
                      XLM/USDC:{" "}
                      <strong>${oracleData ? oracleData.rates.USDC.toFixed(4) : "0.1250"}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5" data-testid="oracle-indicator">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        oracleData && !oracleData.isStale
                          ? "bg-emerald-500 animate-pulse"
                          : "bg-amber-500"
                      }`}
                    />
                    <span
                      className={`text-[11px] font-bold ${
                        oracleData && !oracleData.isStale
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {oracleData && !oracleData.isStale
                        ? `Live (${oracleData.source})`
                        : "Stale Feed"}
                    </span>
                    {oracleData && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                        ({formatOracleFreshness(oracleData.updatedAt)})
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => loadOracleRates(true)}
                    disabled={isRefreshingOracle}
                    className="p-1 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                    title="Refresh oracle rates"
                    data-testid="btn-refresh-oracle"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isRefreshingOracle ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

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
                  label={
                    <div className="flex items-center justify-between w-full">
                      <span>Sale Amount ({currencyMode})</span>
                      <div className="flex items-center gap-1">
                        {(["XLM", "USD", "EUR"] as const).map((curr) => (
                          <button
                            key={curr}
                            type="button"
                            onClick={() => handleCurrencyChange(curr)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider transition-all ${
                              currencyMode === curr
                                ? "bg-indigo-600 text-white shadow-xs"
                                : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
                            }`}
                            data-testid={`btn-currency-${curr}`}
                          >
                            {curr}
                          </button>
                        ))}
                      </div>
                    </div>
                  }
                  description={
                    currencyMode === "XLM"
                      ? "Enter native XLM amount (up to 7 decimals)"
                      : `Enter fiat ${currencyMode} amount; converted to XLM via live oracle`
                  }
                  error={errors.saleAmount}
                  required
                >
                  <div className="relative">
                    {currencyMode === "XLM" ? (
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
                        className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950 pr-16"
                        data-testid="input-sale-amount-xlm"
                      />
                    ) : (
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={fiatAmount}
                        onChange={(e) => handleFiatAmountChange(e.target.value)}
                        placeholder={`e.g., 50.00 (${currencyMode})`}
                        variant={errors.saleAmount ? "error" : "default"}
                        className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950 pr-20"
                        data-testid="input-sale-amount-fiat"
                      />
                    )}
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-semibold text-xs">
                      {currencyMode}
                    </div>
                  </div>

                  {/* Real-time conversion equivalence preview */}
                  {currencyMode !== "XLM" && (
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>
                        Live XLM Equivalent:{" "}
                        <strong className="text-indigo-600 dark:text-indigo-400 font-mono">
                          {saleAmount ? `${Number(saleAmount).toFixed(4)} XLM` : "0.0000 XLM"}
                        </strong>
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        Locked @ $
                        {oracleData?.rates[currencyMode === "EUR" ? "EUR" : "USD"] ?? 0.125} / XLM
                      </span>
                    </div>
                  )}

                  {currencyMode === "XLM" && saleAmount && oracleData && (
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      ≈ ${convertXlmToFiat(Number(saleAmount), "USD", oracleData.rates).toFixed(2)}{" "}
                      USD
                    </div>
                  )}
                </InputField>
              </div>

              {twoTierSplit && twoTierSplit.hasRecruiter && (
                <div
                  className="p-4 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-start gap-3 shadow-sm"
                  data-testid="banner-twotier-split-active"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                      <span>Two-Tier Referral Split Active ({twoTierSplit.splitRatioLabel})</span>
                    </div>
                    <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      Affiliate recruited by <strong>{recruiterRelation?.parentName}</strong> (
                      <span className="font-mono">
                        {formatAffiliateAddress(twoTierSplit.recruiterAddress || "")}
                      </span>
                      ). Commission split:{" "}
                      <strong className="text-indigo-600 dark:text-indigo-400">
                        {twoTierSplit.sellingAffiliateRatePercent}% (
                        {twoTierSplit.sellingAffiliateCommissionXlm} XLM)
                      </strong>{" "}
                      to seller,{" "}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {twoTierSplit.recruiterOverrideRatePercent}% (+
                        {twoTierSplit.recruiterOverrideCommissionXlm} XLM)
                      </strong>{" "}
                      passive override to master recruiter.
                    </p>
                  </div>
                </div>
              )}

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
                disabled={isLoading || !canLogSale}
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all disabled:opacity-50"
                data-testid="btn-log-sale"
              >
                {!canLogSale ? (
                  <div className="flex items-center space-x-2">
                    <Lock className="w-5 h-5" />
                    <span>Action Locked ({currentRole} Restricted)</span>
                  </div>
                ) : isLoading ? (
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
