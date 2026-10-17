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
import { Shield, Zap, Users, FileKey } from "lucide-react";
import { dispatchTelegramConversionAlert } from "../../lib/telegramBot";

export const LogSaleForm = () => {
  const [affiliateAddress, setAffiliateAddress] = useState("");
  const [saleAmount, setSaleAmount] = useState("");
  const [campaignAddress, setCampaignAddress] = useState("");
  const [customerData, setCustomerData] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { getCampaignContract, userAddress } = useWeb3();
  const { showNotification } = useNotification();
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramMuted, setTelegramMuted] = useState(false);
  const [telegramToken, setTelegramToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedToken = localStorage.getItem("stormsale_telegram_token");
      const storedMuted = localStorage.getItem("stormsale_telegram_muted");
      if (storedToken) {
        setTelegramToken(storedToken);
        setTelegramConnected(true);
      }
      if (storedMuted === "true") {
        setTelegramMuted(true);
      }
    } catch (err) {
      console.warn("Telegram preference load warning:", err);
    }
  }, []);

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

    setIsLoading(true);
    try {
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

      // Telegram Instant Commission Alert Dispatch
      if (telegramConnected && !telegramMuted) {
        try {
          await dispatchTelegramConversionAlert({
            telegramToken: telegramToken || undefined,
            affiliateAddress,
            campaignAddress,
            campaignName: `Campaign ${campaignAddress.slice(0, 8)}`,
            saleAmount,
            currency: "XLM",
            commissionEarned: (parseFloat(saleAmount) * 0.1).toFixed(4),
            saleId: payload.saleId,
          });
        } catch (telegramErr) {
          console.warn("Telegram alert warning:", telegramErr);
        }
      }

      showNotification({
        type: "success",
        title: "Sale Logged Successfully!",
        message: "Encrypted sale data has been recorded on-chain",
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

  const handleConnectTelegram = () => {
    try {
      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `TG_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const deepLink = `https://t.me/StormSaleBot?start=${token}`;
      localStorage.setItem("stormsale_telegram_token", token);
      setTelegramToken(token);
      setTelegramConnected(true);
      window.open(deepLink, "_blank", "noopener,noreferrer");
      showNotification({
        type: "success",
        title: "Telegram Connect Started",
        message: "Open the StormSale bot and press Start to finish linking.",
      });
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Telegram Connect Failed",
        message: err?.message || "Unable to start Telegram connection.",
      });
    }
  };

  const handleToggleTelegramMute = () => {
    const next = !telegramMuted;
    setTelegramMuted(next);
    try {
      localStorage.setItem("stormsale_telegram_muted", String(next));
    } catch (err) {
      console.warn("Telegram mute persist warning:", err);
    }
  };

  const handleDisconnectTelegram = () => {
    setTelegramConnected(false);
    setTelegramMuted(false);
    setTelegramToken(null);
    try {
      localStorage.removeItem("stormsale_telegram_token");
      localStorage.removeItem("stormsale_telegram_muted");
    } catch (err) {
      console.warn("Telegram disconnect warning:", err);
    }
    showNotification({
      type: "info",
      title: "Telegram Disconnected",
      message: "You will no longer receive instant commission alerts.",
    });
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
        <CardHeader className="pb-4 pt-6 px-8">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Connect Telegram Alerts
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Get instant commission alerts whenever a sale is logged.
              </CardDescription>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                telegramConnected
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {telegramConnected ? (telegramMuted ? "Muted" : "Connected") : "Not Connected"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {!telegramConnected ? (
            <Button
              type="button"
              onClick={handleConnectTelegram}
              className="w-full h-12 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl"
            >
              Connect Telegram Alerts
            </Button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                onClick={handleToggleTelegramMute}
                variant="outline"
                className="flex-1 h-12 rounded-xl"
              >
                {telegramMuted ? "Unmute Alerts" : "Mute Alerts"}
              </Button>
              <Button
                type="button"
                onClick={handleDisconnectTelegram}
                variant="outline"
                className="flex-1 h-12 rounded-xl text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/30 dark:hover:bg-red-500/10"
              >
                Disconnect Bot
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                  description="The affiliate who will receive commission"
                  required
                >
                  <Input
                    value={affiliateAddress}
                    onChange={(e) => setAffiliateAddress(e.target.value)}
                    placeholder="e.g. G... affiliate address"
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    required
                  />
                </InputField>

                <InputField
                  label="Sale Amount"
                  description="The total value of the sale in XLM"
                  required
                >
                  <Input
                    value={saleAmount}
                    onChange={(e) => setSaleAmount(e.target.value)}
                    placeholder="e.g. 100.00"
                    type="number"
                    step="0.0001"
                    className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                    required
                  />
                </InputField>
              </div>

              <InputField
                label="Customer Data (Optional)"
                description="Optional reference or customer identifier"
              >
                <Input
                  value={customerData}
                  onChange={(e) => setCustomerData(e.target.value)}
                  placeholder="e.g. Customer email or reference"
                  className="h-12 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
                />
              </InputField>

              <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                <FileKey className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                <p className="text-sm text-indigo-700 dark:text-indigo-300">
                  Sale data is encrypted with AES-256 and wrapped keys for both parties.
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold text-lg rounded-xl shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Zap className="w-5 h-5 animate-pulse" />
                    Logging Sale...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Log Encrypted Sale
                  </span>
                )}
              </Button>
            </InputGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
