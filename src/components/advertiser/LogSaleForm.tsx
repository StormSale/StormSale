import { useState, useEffect } from "react";
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
import {
  getLiveOracleRates,
  convertFiatToXlm,
  lockConversionRate,
  type SupportedCurrency,
  type OracleRateData,
  type ConversionResult,
} from "../../lib/oracleEngine";
import { ConversionRateEngine } from "./ConversionRateEngine";
import { Shield, Zap, Users, FileKey, Coins } from "lucide-react";

export const LogSaleForm = () => {
  const [affiliateAddress, setAffiliateAddress] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [customerData, setCustomerData] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Oracle & Multi-Currency State
  const [inputCurrency, setInputCurrency] = useState<SupportedCurrency>("USD");
  const [saleInputAmount, setSaleInputAmount] = useState<string>("");
  const [oracleData, setOracleData] = useState<OracleRateData | null>(null);
  const [showFullOracleEngine, setShowFullOracleEngine] = useState(false);

  const { getCampaignContract, userAddress } = useWeb3();
  const { showNotification } = useNotification();

  // Load Oracle Rates on Mount
  useEffect(() => {
    getLiveOracleRates()
      .then(setOracleData)
      .catch((err) => console.error("Initial oracle load failed:", err));
  }, []);

  // Missing or stale fiat rate check
  const isFiatRateMissingOrStale =
    inputCurrency !== "XLM" &&
    (!oracleData ||
      !oracleData.rates[inputCurrency] ||
      oracleData.rates[inputCurrency]! <= 0 ||
      oracleData.source === "Unavailable" ||
      oracleData.isStale);

  // Live conversion calculations
  const numAmount = parseFloat(saleInputAmount) || 0;
  let conversionResult: ConversionResult | null = null;
  if (inputCurrency === "XLM") {
    conversionResult = {
      fiatAmount: numAmount,
      fiatCurrency: "XLM",
      xlmAmount: numAmount,
      rateUsed: 1,
      timestamp: new Date().toISOString(),
      source: oracleData?.source || "Fallback Cache",
      isStale: false,
    };
  } else if (
    oracleData &&
    oracleData.rates[inputCurrency] &&
    oracleData.rates[inputCurrency]! > 0 &&
    oracleData.source !== "Unavailable"
  ) {
    try {
      conversionResult = convertFiatToXlm(numAmount, inputCurrency, oracleData);
    } catch {
      conversionResult = null;
    }
  }

  const calculatedXlmString =
    numAmount > 0 && conversionResult ? conversionResult.xlmAmount.toFixed(4) : "";

  const handleLogSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliateAddress || !saleInputAmount || !campaignAddress) {
      showNotification({
        type: "warning",
        title: "Missing Information",
        message: "Please fill all required fields",
      });
      return;
    }

    if (numAmount <= 0) {
      showNotification({
        type: "warning",
        title: "Invalid Amount",
        message: "Sale amount must be greater than 0",
      });
      return;
    }

    if (isFiatRateMissingOrStale) {
      showNotification({
        type: "warning",
        title: "Rates Unavailable",
        message: "Live exchange rates are not loaded yet or are currently unavailable. Try again in a moment.",
      });
      return;
    }

    setIsLoading(true);
    try {
      const campaignContract = getCampaignContract(campaignAddress);

      // Refresh rate before locking to guarantee zero slippage with fresh oracle data
      let lockData = oracleData;
      try {
        lockData = await getLiveOracleRates();
        setOracleData(lockData);
      } catch {
        lockData = oracleData;
      }

      if (inputCurrency !== "XLM") {
        const rate = lockData?.rates[inputCurrency];
        if (!rate || rate <= 0 || lockData?.source === "Unavailable" || lockData?.isStale) {
          showNotification({
            type: "warning",
            title: "Live Rate Required",
            message: "Unable to retrieve a fresh live rate. Please retry or submit directly in XLM.",
          });
          setIsLoading(false);
          return;
        }
      }

      // Lock current oracle rate into immutable metadata
      const lockedRateMetadata =
        inputCurrency === "XLM" || lockData
          ? lockConversionRate(
              numAmount,
              inputCurrency,
              lockData || {
                rates: { USD: 1 },
                timestamp: Date.now(),
                source: "Fallback Cache",
                isStale: false,
              },
            )
          : null;

      if (!lockedRateMetadata) {
        throw new Error("Unable to lock conversion rate metadata.");
      }

      const xlmToLog = lockedRateMetadata.convertedXlmAmount;

      showNotification({
        type: "info",
        title: "Encrypting Data",
        message: "Securing sale and locked oracle conversion data...",
      });

      const aesKey = await generateAESKey();

      const payload = {
        customer: customerData || "Anonymous Customer",
        saleId: `SALE_${Date.now()}`,
        product: "Digital Product",
        timestamp: new Date().toISOString(),
        metadata: "Additional sale information",
        // Multi-Currency Oracle Metadata
        conversion: {
          originalAmount: lockedRateMetadata.originalAmount,
          originalCurrency: lockedRateMetadata.originalCurrency,
          convertedXlmAmount: lockedRateMetadata.convertedXlmAmount,
          exchangeRateLocked: lockedRateMetadata.exchangeRate,
          oracleProvider: lockedRateMetadata.oracleProvider,
          oracleRateTimestamp: lockedRateMetadata.rateTimestamp,
          isStaleAtLock: lockedRateMetadata.isStaleAtLock,
        },
      };

      const encryptedPayload = await encryptPayload(payload, aesKey);

      const advertiserPublicKey = await getPublicKeyForAddress(userAddress!);
      const affiliatePublicKey = await getPublicKeyForAddress(affiliateAddress);

      const advertiserWrappedKey = await wrapAESKey(aesKey, advertiserPublicKey);
      const affiliateWrappedKey = await wrapAESKey(aesKey, affiliatePublicKey);

      showNotification({
        type: "info",
        title: "Transaction Submitted",
        message: `Logging encrypted sale (${xlmToLog} XLM)...`,
      });

      const tx = await campaignContract.logEncryptedSale(
        affiliateAddress,
        xlmToLog,
        encryptedPayload,
        advertiserWrappedKey,
        affiliateWrappedKey,
      );

      await tx.wait();

      // Automated Conversion Postback Dispatch
      try {
        const postbackTxHash = tx?.hash || tx?.id || "PENDING_CONFIRMED_LEDGER_TX";

        const postbacks = await triggerConversionPostback({
          saleId: payload.saleId,
          campaignAddress,
          affiliateAddress,
          advertiserAddress: userAddress || "GADVERTISER_DEFAULT_TESTNET",
          saleAmount: xlmToLog,
          currency: "XLM",
          stellarTxHash: postbackTxHash,
          ledgerTimestamp: new Date().toISOString(),
          customerRef: customerData ? `REF_${payload.saleId.slice(-8)}` : "Anonymous Customer",
          status: "CONFIRMED_ON_LEDGER",
          metadata: {
            fiatAmount: numAmount,
            fiatCurrency: inputCurrency,
            oracleRateUsed: lockedRateMetadata.exchangeRate,
            oracleProvider: lockedRateMetadata.oracleProvider,
          },
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
        message: `Recorded ${xlmToLog} XLM (locked from ${numAmount} ${inputCurrency}) on-chain.`,
      });

      setAffiliateAddress("");
      setSaleInputAmount("");
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Log Encrypted Sale
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Record a new sale with live multi-currency conversion, locked oracle rates, and escrow
            security
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => setShowFullOracleEngine(!showFullOracleEngine)}
          className="rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold self-start sm:self-auto"
        >
          <Coins className="w-4 h-4 mr-1.5 text-indigo-500" />
          {showFullOracleEngine ? "Hide Oracle Live View" : "Show Oracle Live View"}
        </Button>
      </div>

      {/* Optional Expanded Oracle Live View */}
      {showFullOracleEngine && (
        <div className="mb-6">
          <ConversionRateEngine
            data={oracleData}
            onRefresh={() => void getLiveOracleRates(true).then(setOracleData)}
          />
        </div>
      )}

      {/* Compact Oracle Status Ribbon */}
      <ConversionRateEngine
        compact
        data={oracleData}
        onRefresh={() => void getLiveOracleRates(true).then(setOracleData)}
      />

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
                Enter amounts in USD, EUR, USDC, or XLM with real-time oracle rate lock-in
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <form onSubmit={handleLogSale}>
            <InputGroup className="space-y-8">
              <InputField
                label="Campaign Address"
                description="The campaign contract where this sale belongs"
                required
              >
                <Input
                  value={campaignAddress}
                  onChange={(e) => setCampaignAddress(e.target.value)}
                  placeholder="e.g. Campaign #1 or Soroban Contract ID"
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

                {/* Multi-Currency Sale Amount Input with Live Oracle Conversion */}
                <InputField
                  label="Sale Price & Currency"
                  description="Enter in your preferred currency (USD, EUR, USDC, XLM)"
                  required
                >
                  <div className="space-y-2">
                    <div className="relative flex rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-600">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={saleInputAmount}
                        onChange={(e) => setSaleInputAmount(e.target.value)}
                        placeholder="e.g., 50.00"
                        className="h-12 border-0 bg-transparent focus-visible:ring-0 shadow-none text-base font-semibold"
                        required
                      />

                      <div className="flex items-center border-l border-slate-200 dark:border-zinc-800 bg-slate-100/70 dark:bg-zinc-900 px-3">
                        <select
                          value={inputCurrency}
                          onChange={(e) => setInputCurrency(e.target.value as SupportedCurrency)}
                          className="bg-transparent border-0 text-sm font-bold text-zinc-800 dark:text-zinc-200 cursor-pointer focus:outline-none"
                        >
                          <option value="USD">USD ($)</option>
                          <option value="EUR">EUR (€)</option>
                          <option value="USDC">USDC</option>
                          <option value="XLM">XLM</option>
                        </select>
                      </div>
                    </div>

                    {/* Live XLM Equivalent and Rate Lock Indicator */}
                    <div className="flex items-center justify-between text-xs px-1">
                      <div className="flex items-center space-x-1.5 font-medium">
                        <span className="text-zinc-500 dark:text-zinc-400">On-Chain Value:</span>
                        <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                          {calculatedXlmString ? `${calculatedXlmString} XLM` : "0.0000 XLM"}
                        </strong>
                      </div>

                      {oracleData && inputCurrency !== "XLM" && (
                        <div className="text-[11px] text-zinc-400 flex items-center space-x-1">
                          <span>
                            1 XLM ≈ {oracleData.rates[inputCurrency]?.toFixed(4)} {inputCurrency}
                          </span>
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              !oracleData.isStale ? "bg-emerald-500" : "bg-amber-500"
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </InputField>
              </div>

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
                  Encryption & Oracle Security Flow
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
                  {[
                    { step: "1", label: "Oracle Rate Lock", icon: Coins },
                    { step: "2", label: "Generate AES Key", icon: Zap },
                    { step: "3", label: "Encrypt Sale + FX", icon: Shield },
                    { step: "4", label: "Wrap Keys", icon: FileKey },
                    { step: "5", label: "Escrow On-Chain", icon: Users },
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
                disabled={isLoading || isFiatRateMissingOrStale}
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-lg font-bold shadow-lg rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-3">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Logging Encrypted Sale...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Shield className="w-5 h-5" />
                    <span>
                      Log Encrypted Sale {calculatedXlmString && `(${calculatedXlmString} XLM)`}
                    </span>
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
