import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Store,
  Zap,
  Shield,
  Link,
  Copy,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  HardHat,
} from "lucide-react";
import {
  generateShopifySharedSecret,
  validateShopifyHmacAsync,
  extractAffiliateReferral,
  constructSorobanConversionPayload,
  generateWebhookUrl,
} from "../../lib/shopify";
import { logSaleContractCall } from "../../lib/stellar";

const SHOP_DOMAIN_PLACEHOLDER = "your-store.myshopify.com";

export const ShopifyWebhookGateway = () => {
  const [sharedSecret, setSharedSecret] = useState("");
  const [shopDomain, setShopDomain] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [isWebhookSetup, setIsWebhookSetup] = useState(false);
  const [testSignature, setTestSignature] = useState("");
  const [testSecret, setTestSecret] = useState("");
  const [testResult, setTestResult] = useState<{
    status: "idle" | "validating" | "success" | "error";
    message: string;
    details?: any;
  }>({ status: "idle", message: "" });
  const [conversionLogs, setConversionLogs] = useState<Array<{
    id: string;
    orderId: number;
    domain: string;
    amount: string;
    affiliate: string;
    txHash: string;
    timestamp: string;
    status: "pending" | "confirmed";
  }>>([]);
  const [isLogging, setIsLogging] = useState(false);

  const generateSecret = () => {
    const secret = generateShopifySharedSecret();
    setSharedSecret(secret);
    setTestSecret(secret);
  };

  const setupWebhook = () => {
    if (!shopDomain) {
      setTestResult({
        status: "error",
        message: "Please enter your Shopify store domain",
      });
      return;
    }
    const url = generateWebhookUrl(shopDomain.replace("https://", "").replace("http://", ""));
    setWebhookUrl(url);
    setIsWebhookSetup(true);
    setTestResult({
      status: "success",
      message: `Webhook configured for ${shopDomain}`,
      details: { url, secret: sharedSecret || "(generate a secret)" },
    });
  };

  const runTestWebhook = async () => {
    if (!testSecret) {
      setTestResult({ status: "error", message: "Please provide a webhook secret" });
      return;
    }

    setTestResult({ status: "validating", message: "Validating webhook signature..." });

    const orderPayload: any = {
      id: 5088429141,
      order_number: 1042,
      total_price: "149.99",
      currency: "USD",
      customer: { id: 123456789, email: "customer@example.com", first_name: "Jane", last_name: "Doe" },
      landing_site: "https://example.com/products/gadget?affiliate=aff_abc123&campaign=42",
      referring_site: "https://example.com",
      note_attributes: [{ name: "affiliate_id", value: "aff_abc123" }, { name: "campaign_id", value: "42" }],
    };

    const body = JSON.stringify(orderPayload, null, 2);

    try {
      const validation = await validateShopifyHmacAsync(body, testSecret, testSignature);
      if (!validation.valid) {
        setTestResult({
          status: "error",
          message: "Invalid HMAC signature - webhook rejected",
          details: { error: validation.error },
        });
        return;
      }

      const order = orderPayload as any;
      const referral = extractAffiliateReferral(order);
      if (!referral) {
        setTestResult({
          status: "error",
          message: "No affiliate referral found in order data",
        });
        return;
      }

      const payload = constructSorobanConversionPayload(order, referral, "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

      setIsLogging(true);
      try {
        const result = await logSaleContractCall(
          payload.args.advertiserAddress,
          payload.args.campaignId,
          payload.args.affiliateAddress,
          payload.args.saleAmountXlm,
          "mock",
        );

        const logEntry = {
          id: `wh_${Date.now()}`,
          orderId: order.id,
          domain: shopDomain || "test-store.myshopify.com",
          amount: `$${order.total_price}`,
          affiliate: referral.affiliateId,
          txHash: result.txHash,
          timestamp: new Date().toLocaleString(),
          status: "confirmed" as const,
        };
        setConversionLogs((prev) => [logEntry, ...prev]);

        setTestResult({
          status: "success",
          message: "Test webhook verified and conversion logged on-chain",
          details: { referral, payload, txHash: result.txHash },
        });
      } catch (err: any) {
        setTestResult({
          status: "error",
          message: `On-chain logging failed: ${err.message}`,
        });
      } finally {
        setIsLogging(false);
      }
    } catch (err: any) {
      setTestResult({
        status: "error",
        message: `Validation error: ${err.message}`,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Shopify Webhook Integration
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Listen to orders/paid webhooks and trigger on-chain conversion logging
        </p>
      </div>

      {/* Setup Guide */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-zinc-900/30">
              <Store className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Shopify App Gateway Setup
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Configure your store's webhook URL and shared secret
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6">
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="shopDomain" className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Shopify Store Domain
              </Label>
              <Input
                id="shopDomain"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder={SHOP_DOMAIN_PLACEHOLDER}
                className="h-12"
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Enter your myshopify.com domain (e.g., my-store.myshopify.com)
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sharedSecret" className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Webhook Shared Secret
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={generateSecret}
                  className="text-xs px-3 py-2"
                >
                  <Zap className="w-3 h-3 mr-1" /> Generate
                </Button>
              </div>
              <Input
                id="sharedSecret"
                value={sharedSecret}
                onChange={(e) => setSharedSecret(e.target.value)}
                placeholder="Auto-generated secret"
                className="h-12 font-mono text-sm"
                readOnly
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Add this secret to your Shopify app webhook settings
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="webhookUrl" className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                Webhook URL (for Shopify App)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="webhookUrl"
                  value={webhookUrl}
                  className="h-12 font-mono text-sm flex-1"
                  readOnly
                />
                <Button
                  size="sm"
                  aria-label="Copy"
                  onClick={() => copyToClipboard(webhookUrl)}
                  disabled={!webhookUrl}
                  className="text-xs px-3"
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Register this URL in your Shopify app for the orders/paid topic
              </p>
            </div>

            <Button
              onClick={setupWebhook}
              disabled={isWebhookSetup}
              className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
            >
              {isWebhookSetup ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Webhook Configured
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4" />
                  Setup Webhook
                </div>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Simulated Test Webhook */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Play className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Simulated Test Webhook
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Verify HMAC signature and log a test conversion on-chain
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label htmlFor="testSecret" className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Webhook Secret
                </Label>
                <Input
                  id="testSecret"
                  value={testSecret}
                  onChange={(e) => setTestSecret(e.target.value)}
                  placeholder="Paste shared secret"
                  className="h-11 font-mono text-sm"
                />
              </div>
              <div className="space-y-3">
                <Label htmlFor="testSignature" className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  X-Shopify-Hmac-Sha256 Signature
                </Label>
                <Input
                  id="testSignature"
                  value={testSignature}
                  onChange={(e) => setTestSignature(e.target.value)}
                  placeholder="Paste signature header"
                  className="h-11 font-mono text-sm"
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  In production, Shopify sends this in the webhook header
                </p>
              </div>
            </div>

            <Button
              onClick={runTestWebhook}
              disabled={isLogging || !testSecret || !testSignature}
              className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
            >
              {isLogging ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <HardHat className="w-4 h-4" />
                  Run Test Webhook
                </div>
              )}
            </Button>

            {testResult.status !== "idle" && (
              <div
                className={`p-4 rounded-xl border ${
                  testResult.status === "success"
                    ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20"
                    : testResult.status === "error"
                      ? "border-rose-200 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/20"
                      : "border-indigo-200 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-500/20"
                }`}
              >
                <div className="flex items-start gap-3">
                  {testResult.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : testResult.status === "error" ? (
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  ) : (
                    <Clock className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
                  )}
                  <div>
                    <p className={`font-medium ${
                      testResult.status === "success"
                        ? "text-emerald-800 dark:text-emerald-400"
                        : testResult.status === "error"
                          ? "text-rose-800 dark:text-rose-400"
                          : "text-indigo-800 dark:text-indigo-400"
                    }`}>
                      {testResult.message}
                    </p>
                    {testResult.details && testResult.status === "success" && testResult.details.referral && (
                      <div className="mt-3 p-3 bg-white dark:bg-zinc-900 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs">
                        <p className="font-bold text-zinc-900 dark:text-white mb-1">Conversion Logged</p>
                        <p className="text-zinc-500 dark:text-zinc-400">
                          Affiliate: {testResult.details.referral.affiliateId} •
                          Campaign: {testResult.details.referral.campaignId} •
                          Amount: {testResult.details.referral.saleAmount} XLM
                        </p>
                        <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-mono">
                          Tx: {testResult.details.txHash?.slice(0, 16)}...
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Production Conversion Logs */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                On-Chain Conversion Logs
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400">
                Production orders recorded on Stellar ledger
              </CardDescription>
            </div>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 uppercase tracking-wider">
              Live
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800/50 bg-slate-50 dark:bg-zinc-950/50">
                  <th className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pl-6">Order ID</th>
                  <th className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">Store</th>
                  <th className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">Amount</th>
                  <th className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">Affiliate</th>
                  <th className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">Tx Hash</th>
                  <th className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6">Time</th>
                </tr>
              </thead>
              <tbody>
                {conversionLogs.length > 0 ? (
                  conversionLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      <td className="font-mono font-bold text-zinc-900 dark:text-white py-4 pl-6">
                        #{log.orderId}
                      </td>
                      <td className="text-zinc-700 dark:text-zinc-300 py-4 font-medium">{log.domain}</td>
                      <td className="font-bold text-indigo-600 dark:text-indigo-400 py-4">{log.amount}</td>
                      <td className="text-zinc-700 dark:text-zinc-300 py-4 font-mono text-sm">{log.affiliate}</td>
                      <td className="py-4">
                        <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-xs block">
                          {log.txHash}
                        </span>
                      </td>
                      <td className="text-zinc-500 dark:text-zinc-400 font-medium py-4 pr-6 text-xs">
                        {log.timestamp}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                      No conversion logs yet. Run a test webhook to see production-style logs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <div className="bg-indigo-50 dark:bg-indigo-500/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-500/20">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">
              Production SLAs
            </p>
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mt-1 leading-relaxed">
              Production orders are recorded on the Stellar ledger within 15 seconds
              of webhook receipt. All webhooks are validated using HMAC-SHA256 before
              any on-chain transaction is constructed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
