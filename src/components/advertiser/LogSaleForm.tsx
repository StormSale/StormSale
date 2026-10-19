import { useMemo, useState } from "react";
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
import { triggerConversionPostback } from "../../lib/webhookEngine";
import { Shield, Zap, Users, FileKey, TrendingUp } from "lucide-react";
import {
  assessCommissionTier,
  calculateCommissionAmount,
  getAffiliateCampaignVolume,
  loadCampaignCommissionConfig,
  normalizeCommissionCampaignId,
  recordAffiliateCampaignSale,
} from "../../lib/commissionTiers";

export const LogSaleForm = () => {
  const [affiliateAddress, setAffiliateAddress] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [customerData, setCustomerData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { getCampaignContract, userAddress } = useWeb3();
  const { showNotification } = useNotification();

  const { tierPreview, tierPreviewError } = useMemo(() => {
    const normalizedCampaignId = normalizeCommissionCampaignId(campaignAddress);
    if (!normalizedCampaignId || !affiliateAddress.trim()) {
      return { tierPreview: null, tierPreviewError: "" };
    }

    try {
      const config = loadCampaignCommissionConfig(normalizedCampaignId);
      if (!config) {
        return { tierPreview: null, tierPreviewError: "" };
      }
      const historicalVolume = getAffiliateCampaignVolume(normalizedCampaignId, affiliateAddress);
      return {
        tierPreview: {
          config,
          historicalVolume,
          assessment: assessCommissionTier(config, historicalVolume),
        },
        tierPreviewError: "",
      };
    } catch (error) {
      return {
        tierPreview: null,
        tierPreviewError:
          error instanceof Error ? error.message : "Could not load local commission tier data.",
      };
    }
  }, [campaignAddress, affiliateAddress]);

  const handleLogSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliateAddress || !saleAmount || !campaignAddress) {
      showNotification({
        type: "warning",
        title: "Missing Information",
        message: "Please fill all required fields",
      });
      return;
    }
    const parsedSaleAmount = Number(saleAmount);
    if (!Number.isFinite(parsedSaleAmount) || parsedSaleAmount <= 0) {
      showNotification({
        type: "warning",
        title: "Invalid Sale Amount",
        message: "Sale amount must be a positive number.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const normalizedCampaignId = normalizeCommissionCampaignId(campaignAddress);
      const commissionConfig = loadCampaignCommissionConfig(normalizedCampaignId);
      const historicalVolume = commissionConfig
        ? getAffiliateCampaignVolume(normalizedCampaignId, affiliateAddress)
        : 0;
      const commissionAssessment = commissionConfig
        ? assessCommissionTier(commissionConfig, historicalVolume)
        : null;
      const estimatedCommission = commissionAssessment
        ? calculateCommissionAmount(parsedSaleAmount, commissionAssessment.commissionRate)
        : null;
      const campaignContract = getCampaignContract(campaignAddress);

      showNotification({
        type: "info",
        title: "Encrypting Data",
        message: "Securing sale information...",
      });

      const aesKey = await generateAESKey();

      const payload = {
        customer: customerData || "Anonymous Customer",
        saleId: `SALE_${Date.now()}`,
        product: "Digital Product",
        timestamp: new Date().toISOString(),
        metadata: "Additional sale information",
        tierCommissionEstimate:
          commissionAssessment && estimatedCommission !== null
            ? {
                tierName: commissionAssessment.currentTier?.name ?? "Base",
                commissionRatePercent: commissionAssessment.commissionRate,
                estimatedCommissionAmount: estimatedCommission,
                historicalVolume,
                volumeAfterSale: historicalVolume + parsedSaleAmount,
              }
            : null,
      };
      const encryptedPayload = await encryptPayload(payload, aesKey);

      const advertiserPublicKey = await getPublicKeyForAddress(userAddress!);
      const affiliatePublicKey = await getPublicKeyForAddress(affiliateAddress);

      const advertiserWrappedKey = await wrapAESKey(aesKey, advertiserPublicKey);
      const affiliateWrappedKey = await wrapAESKey(aesKey, affiliatePublicKey);

      showNotification({
        type: "info",
        title: "Transaction Submitted",
        message: "Logging encrypted sale...",
      });

      const tx = await campaignContract.logEncryptedSale(
        affiliateAddress,
        saleAmount,
        encryptedPayload,
        advertiserWrappedKey,
        affiliateWrappedKey,
      );

      await tx.wait();

      if (commissionConfig) {
        try {
          recordAffiliateCampaignSale(normalizedCampaignId, affiliateAddress, parsedSaleAmount);
        } catch (storageError) {
          console.error("Could not update local affiliate sales volume:", storageError);
          showNotification({
            type: "warning",
            title: "Tier Progress Not Updated",
            message:
              "The sale is confirmed on-chain, but local tier progress could not be updated in this browser.",
          });
        }
      }

      // Automated Conversion Postback Dispatch
      try {
        const postbackTxHash = tx?.hash || tx?.id || "PENDING_CONFIRMED_LEDGER_TX";

        const postbacks = await triggerConversionPostback({
          saleId: payload.saleId,
          campaignAddress,
          affiliateAddress,
          advertiserAddress: userAddress || "GADVERTISER_DEFAULT_TESTNET",
          saleAmount,
          currency: "XLM",
          stellarTxHash: postbackTxHash,
          ledgerTimestamp: new Date().toISOString(),
          customerRef: customerData ? `REF_${payload.saleId.slice(-8)}` : "Anonymous Customer",
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
        message: commissionAssessment
          ? `Encrypted sale recorded. Estimated tier rate: ${commissionAssessment.commissionRate}% (${estimatedCommission} XLM). The contract still pays its fixed base rate.`
          : "Encrypted sale data has been recorded on-chain",
      });

      setAffiliateAddress("");
      setSaleAmount("");
      setCampaignAddress("");
      setCustomerData("");
    } catch (error: any) {
      console.error("Error logging sale:", error);
      showNotification({
        type: "error",
        title: "Logging Failed",
        message: error.message || "Failed to log sale",
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
          <form onSubmit={handleLogSale}>
            <InputGroup className="space-y-8">
              <InputField
                label="Campaign ID"
                description="The numeric Soroban campaign ID where this sale belongs"
                required
              >
                <Input
                  value={campaignAddress}
                  onChange={(e) => setCampaignAddress(e.target.value)}
                  placeholder="e.g. 1 or Campaign #1"
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                  required
                />
              </InputField>

              <div className="grid md:grid-cols-2 gap-6">
                <InputField
                  label="Affiliate Address"
                  description="The affiliate who made this sale"
                  required
                >
                  <Input
                    value={affiliateAddress}
                    onChange={(e) => setAffiliateAddress(e.target.value)}
                    placeholder="GAFFILIATE... (Stellar Public Key)"
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    required
                  />
                </InputField>

                <InputField
                  label="Sale Amount (XLM)"
                  description="Total sale amount in XLM tokens"
                  required
                >
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={saleAmount}
                      onChange={(e) => setSaleAmount(e.target.value)}
                      placeholder="e.g., 100.50"
                      className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                      required
                    />
                    <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-zinc-400 font-medium">
                      XLM
                    </div>
                  </div>
                </InputField>
              </div>

              {(tierPreview || tierPreviewError) && (
                <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-950/20 p-5">
                  {tierPreview ? (
                    <>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <h3 className="font-bold text-zinc-900 dark:text-white">
                          Estimated tier commission
                        </h3>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">Current tier</p>
                          <p className="font-semibold text-zinc-900 dark:text-white">
                            {tierPreview.assessment.currentTier?.name ?? "Base"} ·{" "}
                            {tierPreview.assessment.commissionRate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Historical volume
                          </p>
                          <p className="font-semibold text-zinc-900 dark:text-white">
                            {tierPreview.historicalVolume.toLocaleString()} XLM
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Estimated commission on this sale
                          </p>
                          <p className="font-semibold text-zinc-900 dark:text-white">
                            {Number.isFinite(Number(saleAmount)) && Number(saleAmount) > 0
                              ? calculateCommissionAmount(
                                  Number(saleAmount),
                                  tierPreview.assessment.commissionRate,
                                )
                              : "—"}{" "}
                            XLM
                          </p>
                        </div>
                      </div>
                      {tierPreview.assessment.nextTier && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-zinc-600 dark:text-zinc-300">
                            <span>
                              Next: {tierPreview.assessment.nextTier.name} (
                              {tierPreview.assessment.nextTier.commissionRate}%)
                            </span>
                            <span>
                              {Math.max(
                                0,
                                tierPreview.assessment.nextTier.volumeThreshold -
                                  tierPreview.historicalVolume,
                              ).toLocaleString()}{" "}
                              XLM to go
                            </span>
                          </div>
                          <div
                            className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900/50"
                            role="progressbar"
                            aria-label="Progress toward next commission tier"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(tierPreview.assessment.progressPercent)}
                          >
                            <div
                              className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400"
                              style={{ width: `${tierPreview.assessment.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                        This estimate and history are stored in this browser only. Tier rates are
                        included in the encrypted sale metadata; the current Soroban contract still
                        pays its fixed base rate.
                      </p>
                    </>
                  ) : (
                    <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
                      {tierPreviewError}
                    </p>
                  )}
                </div>
              )}

              <InputField
                label="Customer Information"
                description="Optional customer data (will be encrypted)"
              >
                <Input
                  value={customerData}
                  onChange={(e) => setCustomerData(e.target.value)}
                  placeholder="Customer name, email, or reference ID"
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                />
              </InputField>

              {/* Encryption Flow Visualization */}
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
                  ].map((item, index) => {
                    const IconComponent = item.icon;
                    return (
                      <div key={index} className="flex flex-col items-center">
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
                disabled={isLoading}
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
