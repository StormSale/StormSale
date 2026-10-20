import { useState, useEffect, useId } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { useNotification } from "../../context/NotificationContext";
import {
  getRegisteredEndpoints,
  saveWebhookEndpoint,
  deleteWebhookEndpoint,
  toggleWebhookEndpoint,
  getWebhookDeliveries,
  dispatchTestDummyPayload,
  retryDeliveryNow,
  clearWebhookDeliveries,
  generateWebhookSecret,
  isSafeWebhookUrl,
} from "../../lib/webhookEngine";
import { verifyWebhookSignature, generateWebhookSignature } from "../../lib/webhookSecurity";
import type {
  WebhookEndpoint,
  WebhookDelivery,
  WebhookEventType,
  SimulationMode,
} from "../../types/webhook";
import {
  Radio,
  Plus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Send,
  Code2,
  FileJson,
  Layers,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";

export const WebhookManager = () => {
  const [activeTab, setActiveTab] = useState<"endpoints" | "deliveries" | "security">("endpoints");
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>(() => getRegisteredEndpoints());
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>(() => getWebhookDeliveries());
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);

  // Form state for creating / editing endpoint
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [endpointSecret, setEndpointSecret] = useState("");
  const [endpointEvents, setEndpointEvents] = useState<WebhookEventType[]>([
    "conversion.confirmed",
  ]);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>("live");
  const [showSecretMap, setShowSecretMap] = useState<Record<string, boolean>>({});

  // In-flight state tracking to prevent duplicate actions
  const [testingEndpointId, setTestingEndpointId] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testEventType, setTestEventType] = useState<WebhookEventType>("conversion.confirmed");
  const [retryingDeliveries, setRetryingDeliveries] = useState<Record<string, boolean>>({});

  // Security validator state
  const [valSecret, setValSecret] = useState("");
  const [valPayload, setValPayload] = useState("");
  const [valSignature, setValSignature] = useState("");
  const [valTolerance, setValTolerance] = useState(300);
  const [valResult, setValResult] = useState<{
    tested: boolean;
    valid?: boolean;
    reason?: string;
    age?: number;
  }>({ tested: false });

  const { showNotification } = useNotification();

  // IDs for accessibility
  const endpointNameId = useId();
  const endpointUrlId = useId();
  const endpointSecretId = useId();
  const simulationModeId = useId();
  const valSecretId = useId();
  const valSigId = useId();
  const valTolId = useId();
  const valPayloadId = useId();

  const refreshData = () => {
    setEndpoints(getRegisteredEndpoints());
    setDeliveries(getWebhookDeliveries());
  };

  // Polling update for active retrying deliveries
  useEffect(() => {
    const interval = setInterval(() => {
      setDeliveries(getWebhookDeliveries());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard accessibility: Escape closes open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedDelivery) setSelectedDelivery(null);
        else if (isModalOpen) setIsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen, selectedDelivery]);

  const handleOpenCreateModal = () => {
    setEditingEndpointId(null);
    setEndpointName("");
    setEndpointUrl("");
    setEndpointSecret(generateWebhookSecret());
    setEndpointEvents(["conversion.confirmed"]);
    setSimulationMode("live");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ep: WebhookEndpoint) => {
    setEditingEndpointId(ep.id);
    setEndpointName(ep.name);
    setEndpointUrl(ep.url);
    setEndpointSecret(ep.secret);
    setEndpointEvents(ep.events);
    setSimulationMode(ep.simulationMode || "live");
    setIsModalOpen(true);
  };

  const handleSaveEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endpointName.trim() || !endpointUrl.trim() || !endpointSecret.trim()) {
      showNotification({
        type: "warning",
        title: "Required Fields Missing",
        message: "Please enter a label, target URL, and HMAC secret key.",
      });
      return;
    }

    if (!isSafeWebhookUrl(endpointUrl.trim())) {
      showNotification({
        type: "error",
        title: "Unsafe Webhook URL",
        message:
          "Webhook URLs must use HTTPS and a public hostname. Local, private, and IP-literal destinations are not allowed.",
      });
      return;
    }

    const existing = editingEndpointId ? endpoints.find((ep) => ep.id === editingEndpointId) : null;

    const endpoint: WebhookEndpoint = {
      id: existing ? existing.id : `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: endpointName.trim(),
      url: endpointUrl.trim(),
      secret: endpointSecret.trim(),
      events: endpointEvents.length > 0 ? endpointEvents : ["conversion.confirmed"],
      isActive: existing ? existing.isActive : true,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      description: existing?.description,
      simulationMode,
      failureCount: existing ? existing.failureCount : 0,
      totalDeliveries: existing ? existing.totalDeliveries : 0,
      lastDeliveryStatus: existing?.lastDeliveryStatus,
      lastDeliveryAt: existing?.lastDeliveryAt,
    };

    const updated = saveWebhookEndpoint(endpoint);
    setEndpoints(updated);
    setIsModalOpen(false);

    showNotification({
      type: "success",
      title: editingEndpointId ? "Endpoint Updated" : "Webhook Endpoint Registered",
      message: `Endpoint '${endpoint.name}' is ${endpoint.isActive ? "active" : "paused"} and ready for conversion events.`,
    });
  };

  const handleDeleteEndpoint = (id: string, name: string) => {
    const updated = deleteWebhookEndpoint(id);
    setEndpoints(updated);
    showNotification({
      type: "info",
      title: "Endpoint Removed",
      message: `Deleted webhook destination '${name}'.`,
    });
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    const updated = toggleWebhookEndpoint(id, !currentStatus);
    setEndpoints(updated);
    showNotification({
      type: "info",
      title: !currentStatus ? "Endpoint Activated" : "Endpoint Paused",
      message: `Webhook endpoint status updated.`,
    });
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification({
        type: "info",
        title: "Copied to Clipboard",
        message: `${label} copied.`,
      });
    } catch {
      showNotification({
        type: "error",
        title: "Copy Failed",
        message: "Unable to write to clipboard.",
      });
    }
  };

  const handleSendTestPayload = async (endpointId: string) => {
    setIsTesting(true);
    setTestingEndpointId(endpointId);
    showNotification({
      type: "info",
      title: "Dispatching Sample Event",
      message: "Signing payload with HMAC-SHA256 and posting to endpoint...",
    });

    try {
      const delivery = await dispatchTestDummyPayload(endpointId, testEventType);
      refreshData();

      if (delivery && delivery.status === "delivered") {
        showNotification({
          type: "success",
          title: "Sample Event Delivered (200 OK)",
          message: "Endpoint successfully responded with status 200.",
        });
      } else if (delivery && delivery.status === "retrying") {
        showNotification({
          type: "warning",
          title: "Endpoint Returned Non-200 (Queued for Retry)",
          message: `HTTP ${delivery.logs[0]?.httpStatusCode || "Error"} received. Added to exponential retry queue.`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Delivery Failed",
          message: "Endpoint connection failed.",
        });
      }
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Test Dispatch Error",
        message: err instanceof Error ? err.message : "Failed to send dummy payload",
      });
    } finally {
      setIsTesting(false);
      setTestingEndpointId(null);
    }
  };

  const handleRetryNow = async (deliveryId: string) => {
    if (retryingDeliveries[deliveryId]) return;
    setRetryingDeliveries((prev) => ({ ...prev, [deliveryId]: true }));

    showNotification({
      type: "info",
      title: "Immediate Retry Triggered",
      message: "Bypassing exponential backoff delay and retrying delivery now...",
    });

    try {
      const res = await retryDeliveryNow(deliveryId);
      refreshData();

      if (!res) {
        showNotification({
          type: "error",
          title: "Delivery Not Found",
          message: "Could not locate delivery record to retry.",
        });
        return;
      }

      if (res.status === "delivered") {
        showNotification({
          type: "success",
          title: "Retry Succeeded!",
          message: "Delivery recovered and received HTTP 200 OK.",
        });
      } else {
        showNotification({
          type: "warning",
          title: "Retry Attempt Executed",
          message: `HTTP ${res.logs.slice(-1)[0]?.httpStatusCode || "Error"} recorded.`,
        });
      }
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Retry Dispatch Error",
        message: err instanceof Error ? err.message : "Retry attempt failed",
      });
    } finally {
      setRetryingDeliveries((prev) => ({ ...prev, [deliveryId]: false }));
    }
  };

  const handleValidateSecurity = async () => {
    if (!valPayload.trim() || !valSignature.trim() || !valSecret.trim()) {
      showNotification({
        type: "warning",
        title: "Missing Input",
        message: "Please enter payload JSON, secret key, and signature header.",
      });
      return;
    }

    try {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(valPayload);
      } catch {
        parsedPayload = valPayload;
      }

      const result = await verifyWebhookSignature({
        payload: parsedPayload,
        signatureHeader: valSignature.trim(),
        secret: valSecret.trim(),
        toleranceSeconds: Number(valTolerance) || 300,
        disableNonceCheck: false,
      });

      setValResult({
        tested: true,
        valid: result.isValid,
        reason: result.reason,
        age: result.ageSeconds,
      });

      if (result.isValid) {
        showNotification({
          type: "success",
          title: "Cryptographic Signature Verified!",
          message: "Authentic payload signature confirmed. Safe from replay attacks.",
        });
      } else {
        showNotification({
          type: "error",
          title: "Verification Failed",
          message: result.reason || "Signature verification failed",
        });
      }
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Evaluation Error",
        message: err instanceof Error ? err.message : "Failed to verify signature",
      });
    }
  };

  const handleLoadSampleVector = async () => {
    const sampleSecret = generateWebhookSecret();
    const samplePayload = {
      event: "conversion.confirmed",
      event_id: `evt_sample_${Date.now()}`,
      protocol: "StormSale Stellar Escrow",
      data: {
        sale_id: "SALE_STORM_8821",
        amount: "450.00",
        currency: "XLM",
        stellar_tx_hash: "0x4b9c1e2d7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
        affiliate_address: "GAFFILIATE999DEMOALBEDOWALLETTESTNET",
        status: "CONFIRMED_ON_LEDGER",
      },
    };

    const { signatureHeader } = await generateWebhookSignature({
      payload: samplePayload,
      secret: sampleSecret,
    });

    setValSecret(sampleSecret);
    setValPayload(JSON.stringify(samplePayload, null, 2));
    setValSignature(signatureHeader);
    setValResult({ tested: false });

    showNotification({
      type: "info",
      title: "Sample Vector Loaded",
      message: "Ready to verify authentic HMAC-SHA256 signature and replay checks.",
    });
  };

  // Metrics calculation
  const totalDeliveries = deliveries.length;
  const deliveredCount = deliveries.filter((d) => d.status === "delivered").length;
  const retryingCount = deliveries.filter((d) => d.status === "retrying").length;
  const failedCount = deliveries.filter((d) => d.status === "failed").length;
  const successRate =
    totalDeliveries > 0 ? Math.round((deliveredCount / totalDeliveries) * 100) : 100;

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-zinc-900 rounded-[2.5rem] p-8 md:p-12 border border-zinc-800 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/30 via-indigo-600/5 to-transparent blur-3xl rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center">
                <Radio className="w-3.5 h-3.5 mr-2 animate-pulse" />
                Automated Postback Engine
              </div>
              <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-bold">
                HMAC-SHA256 Signed
              </div>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-2">
              Conversion Postback Webhooks
            </h1>
            <p className="text-zinc-400 font-medium text-lg max-w-2xl">
              Dispatch real-time cryptographic postbacks to your CRM when sales confirm on the
              Stellar ledger. Built with exponential retry queue and replay protection.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleOpenCreateModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-6 h-14 text-base font-bold shadow-lg shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5 mr-2" />
              Register Endpoint
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Active Endpoints
            </p>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-zinc-900 dark:text-white">
                {endpoints.filter((e) => e.isActive).length}
              </span>
              <span className="text-xs text-zinc-400">/ {endpoints.length} registered</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Success Rate
            </p>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {successRate}%
              </span>
              <span className="text-xs text-zinc-400">{deliveredCount} delivered</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              In Retry Queue
            </p>
            <div className="flex items-baseline space-x-2">
              <span
                className={`text-3xl font-black ${retryingCount > 0 ? "text-amber-500 animate-pulse" : "text-zinc-900 dark:text-white"}`}
              >
                {retryingCount}
              </span>
              <span className="text-xs text-zinc-400">exponential backoff</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm">
          <CardContent className="p-6">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
              Exhausted / Failed
            </p>
            <div className="flex items-baseline space-x-2">
              <span className="text-3xl font-black text-rose-500">{failedCount}</span>
              <span className="text-xs text-zinc-400">max retries hit</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab("endpoints")}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "endpoints"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/50"
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Webhook Endpoints ({endpoints.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("deliveries")}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "deliveries"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/50"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Delivery & Retry Queue ({deliveries.length})</span>
          {retryingCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping ml-1" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "security"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800/50"
          }`}
        >
          <Code2 className="w-4 h-4" />
          <span>Signature & Replay Validator</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: ENDPOINTS MANAGER (Acceptance Criteria 1: Test with dummy payloads)
         ========================================================================= */}
      {activeTab === "endpoints" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Registered Postback Destinations
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Manage destination URLs and test with sample event payloads
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-zinc-500">Test Payload Type:</span>
              <select
                value={testEventType}
                onChange={(e) => setTestEventType(e.target.value as WebhookEventType)}
                className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold rounded-xl px-3 py-2 text-zinc-800 dark:text-zinc-200"
              >
                <option value="conversion.confirmed">conversion.confirmed</option>
                <option value="campaign.created">campaign.created (New Campaign)</option>
                <option value="conversion.created">conversion.created (New Conversion)</option>
                <option value="payout.created">payout.created (New Payout)</option>
                <option value="payout.claimed">payout.claimed</option>
                <option value="commission.escrowed">commission.escrowed</option>
                <option value="ping.test">ping.test</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {endpoints.map((ep) => {
              const isSecretVisible = showSecretMap[ep.id] || false;
              const isCurrentlyTesting = isTesting && testingEndpointId === ep.id;

              return (
                <Card
                  key={ep.id}
                  className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm hover:shadow-md transition-all overflow-hidden"
                >
                  <CardContent className="p-6 md:p-8">
                    <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6">
                      <div className="space-y-3 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                            {ep.name}
                          </h3>
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              ep.isActive
                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"
                            }`}
                          >
                            {ep.isActive ? "Active" : "Paused"}
                          </span>
                          {ep.simulationMode && ep.simulationMode !== "live" && (
                            <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                              Mode: {ep.simulationMode}
                            </span>
                          )}
                          {ep.lastDeliveryStatus && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                ep.lastDeliveryStatus === "delivered"
                                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                  : ep.lastDeliveryStatus === "retrying"
                                    ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                                    : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                              }`}
                            >
                              Last: {ep.lastDeliveryStatus}
                            </span>
                          )}
                        </div>

                        {/* URL Row */}
                        <div className="flex items-center space-x-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 font-mono text-xs">
                          <span className="text-zinc-400 select-none">POST</span>
                          <span className="text-zinc-900 dark:text-zinc-200 truncate flex-1">
                            {ep.url}
                          </span>
                          <button
                            onClick={() => handleCopy(ep.url, "Endpoint URL")}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded text-zinc-500"
                            title="Copy URL"
                            aria-label="Copy Endpoint URL"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Secret Key Row */}
                        <div className="flex items-center space-x-2 bg-slate-50 dark:bg-zinc-950 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 font-mono text-xs">
                          <Key className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          <span className="text-zinc-400 select-none text-[10px] uppercase font-bold">
                            HMAC Secret:
                          </span>
                          <span className="text-zinc-700 dark:text-zinc-300 truncate flex-1">
                            {isSecretVisible
                              ? ep.secret
                              : `${ep.secret.slice(0, 10)}••••••••••••••••••••••••••••••`}
                          </span>
                          <button
                            onClick={() =>
                              setShowSecretMap((prev) => ({ ...prev, [ep.id]: !isSecretVisible }))
                            }
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded text-zinc-500"
                            title={isSecretVisible ? "Hide Secret" : "Reveal Secret"}
                            aria-label={isSecretVisible ? "Hide Secret" : "Reveal Secret"}
                          >
                            {isSecretVisible ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleCopy(ep.secret, "HMAC Secret")}
                            className="p-1 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded text-zinc-500"
                            title="Copy Secret"
                            aria-label="Copy HMAC Secret"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Events Subscribed */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span className="text-xs font-semibold text-zinc-500">Events:</span>
                          {ep.events.map((evt) => (
                            <span
                              key={evt}
                              className="px-2.5 py-0.5 rounded-md text-[11px] font-mono font-medium bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                            >
                              {evt}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex lg:flex-col items-center justify-end gap-2.5 pt-4 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-zinc-800">
                        {/* ACCEPTANCE CRITERIA 1: Test with dummy payloads */}
                        <Button
                          onClick={() => handleSendTestPayload(ep.id)}
                          disabled={isCurrentlyTesting}
                          className="w-full lg:w-48 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-11 text-xs font-bold shadow-md shadow-indigo-500/20"
                        >
                          {isCurrentlyTesting ? (
                            <div className="flex items-center space-x-2">
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Sending Dummy...</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <Send className="w-3.5 h-3.5" />
                              <span>Send Dummy Test</span>
                            </div>
                          )}
                        </Button>

                        <div className="flex items-center space-x-2 w-full">
                          <Button
                            variant="outline"
                            onClick={() => handleToggleActive(ep.id, ep.isActive)}
                            className="flex-1 rounded-xl h-9 text-xs font-bold border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                          >
                            {ep.isActive ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleOpenEditModal(ep)}
                            className="rounded-xl h-9 text-xs font-bold border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteEndpoint(ep.id, ep.name)}
                            className="rounded-xl h-9 w-9 p-0 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            title="Delete Endpoint"
                            aria-label="Delete Endpoint"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: DELIVERIES & RETRY QUEUE (Acceptance Criteria 2: HTTP status codes & logs)
         ========================================================================= */}
      {activeTab === "deliveries" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Delivery Logs & Exponential Retry Queue
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Detailed audit trail of all webhook attempts with HTTP status codes and headers
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={clearWebhookDeliveries}
                className="rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold"
              >
                Clear History
              </Button>
            </div>
          </div>

          {deliveries.length === 0 ? (
            <Card className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-12 text-center">
              <Clock className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                No Webhook Deliveries Yet
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-1 mb-6">
                Deliveries are automatically generated when sales confirm on the Stellar ledger, or
                when you send a dummy test payload.
              </p>
              <Button
                onClick={() => setActiveTab("endpoints")}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
              >
                Go to Endpoints & Send Test
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {deliveries.map((delivery) => {
                const latestLog = delivery.logs[delivery.logs.length - 1];
                const isSuccess = delivery.status === "delivered";
                const isRetrying = delivery.status === "retrying";
                const isFailed = delivery.status === "failed";
                const isRetryInFlight = retryingDeliveries[delivery.id] || false;

                return (
                  <Card
                    key={delivery.id}
                    className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-slate-300 dark:hover:border-zinc-700 transition-all"
                  >
                    <div className="p-5 md:p-6 flex flex-col md:flex-row justify-between md:items-center gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          {/* Status Badge */}
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 ${
                              isSuccess
                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                                : isRetrying
                                  ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                                  : isFailed
                                    ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20"
                                    : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                            }`}
                          >
                            {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
                            {isRetrying && <Clock className="w-3.5 h-3.5 mr-1 animate-spin" />}
                            {isFailed && <XCircle className="w-3.5 h-3.5 mr-1" />}
                            <span className="uppercase tracking-wider">{delivery.status}</span>
                          </span>

                          {/* HTTP Status Code Badge (Acceptance Criteria 2) */}
                          {latestLog && (
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold ${
                                latestLog.httpStatusCode >= 200 && latestLog.httpStatusCode < 300
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                  : latestLog.httpStatusCode >= 500
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                                    : latestLog.httpStatusCode === 0
                                      ? "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                              }`}
                            >
                              HTTP {latestLog.httpStatusCode || "CORS/Net Error"}{" "}
                              {latestLog.statusText}
                            </span>
                          )}

                          <span className="text-xs font-mono font-semibold bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                            {delivery.event}
                          </span>

                          <span className="text-xs text-zinc-400 font-medium">
                            Attempt {delivery.attempts} of {delivery.maxRetries}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                          <span className="font-bold text-zinc-900 dark:text-white">
                            {delivery.webhookName}
                          </span>
                          <span>•</span>
                          <span className="truncate max-w-sm">{delivery.url}</span>
                          <span>•</span>
                          <span>{new Date(delivery.createdAt).toLocaleTimeString()}</span>
                        </div>

                        {/* Exponential backoff note if retrying */}
                        {isRetrying && delivery.nextRetryAt && (
                          <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center space-x-2">
                            <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                            <span>
                              Exponential backoff scheduled retry:{" "}
                              {new Date(delivery.nextRetryAt).toLocaleTimeString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-2">
                        {(isRetrying || isFailed) && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRetryInFlight}
                            onClick={() => handleRetryNow(delivery.id)}
                            className="rounded-xl border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs font-bold"
                          >
                            <RotateCcw
                              className={`w-3.5 h-3.5 mr-1 ${isRetryInFlight ? "animate-spin" : ""}`}
                            />
                            {isRetryInFlight ? "Retrying..." : "Retry Now"}
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedDelivery(delivery)}
                          className="rounded-xl border-slate-200 dark:border-zinc-800 text-xs font-bold text-zinc-800 dark:text-zinc-200"
                        >
                          <FileJson className="w-3.5 h-3.5 mr-1" />
                          Inspect Logs & Headers
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: SECURITY & REPLAY VALIDATOR (Acceptance Criteria 3: Signatures & Replay Prevention)
         ========================================================================= */}
      {activeTab === "security" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              Signature Authenticity & Replay Attack Protection Sandbox
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Verify webhook signatures with HMAC-SHA256, test timestamp freshness tolerance, and
              inspect replay attack prevention.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center">
                    <Key className="w-5 h-5 mr-2 text-indigo-500" />
                    Live Cryptographic Verifier
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadSampleVector}
                    className="text-xs font-bold rounded-xl border-slate-200 dark:border-zinc-800"
                  >
                    Load Sample Test Vector
                  </Button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor={valSecretId}
                      className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2"
                    >
                      HMAC Secret Key (whsec_...)
                    </label>
                    <Input
                      id={valSecretId}
                      value={valSecret}
                      onChange={(e) => setValSecret(e.target.value)}
                      placeholder="e.g. whsec_8f9a2b3c4d5e6f7a..."
                      className="font-mono text-xs rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={valSigId}
                      className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2"
                    >
                      X-StormSale-Signature Header (t=...,v1=...,nonce=...)
                    </label>
                    <Input
                      id={valSigId}
                      value={valSignature}
                      onChange={(e) => setValSignature(e.target.value)}
                      placeholder="t=1730000000,v1=abcdef123456...,nonce=987654321"
                      className="font-mono text-xs rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor={valTolId}
                        className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2"
                      >
                        Tolerance Window (Seconds)
                      </label>
                      <Input
                        id={valTolId}
                        type="number"
                        value={valTolerance}
                        onChange={(e) => setValTolerance(Number(e.target.value))}
                        className="font-mono text-xs rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor={valPayloadId}
                      className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2"
                    >
                      Raw Request Payload (JSON)
                    </label>
                    <textarea
                      id={valPayloadId}
                      rows={6}
                      value={valPayload}
                      onChange={(e) => setValPayload(e.target.value)}
                      placeholder={`{\n  "event": "conversion.confirmed",\n  "data": { "sale_id": "SALE_1" }\n}`}
                      className="w-full p-3 font-mono text-xs rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <Button
                    onClick={handleValidateSecurity}
                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/20"
                  >
                    Verify Payload Authenticity & Replay Protection
                  </Button>
                </div>

                {valResult.tested && (
                  <div
                    className={`p-5 rounded-2xl border ${
                      valResult.valid
                        ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                        : "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300"
                    }`}
                  >
                    <div className="flex items-center space-x-3 mb-2">
                      {valResult.valid ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-500" />
                      )}
                      <span className="font-bold text-base">
                        {valResult.valid
                          ? "Signature & Replay Checks Passed"
                          : "Verification Rejected"}
                      </span>
                    </div>
                    {valResult.reason && (
                      <p className="text-xs font-mono mt-1 opacity-90">{valResult.reason}</p>
                    )}
                    {valResult.age !== undefined && (
                      <p className="text-xs font-medium mt-1 opacity-80">
                        Packet Age: {valResult.age}s (Tolerance: {valTolerance}s)
                      </p>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Implementation Guide for Merchants */}
            <div className="space-y-6">
              <Card className="bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 space-y-4">
                <h3 className="font-bold text-zinc-900 dark:text-white flex items-center">
                  <ExternalLink className="w-4 h-4 mr-2 text-indigo-500" />
                  CRM Integration Guide
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Drop this verification into your CRM endpoint (e.g. Node.js Express) to verify
                  authenticity and prevent replay attacks:
                </p>

                <div className="bg-slate-900 p-4 rounded-xl text-zinc-300 font-mono text-[11px] leading-relaxed overflow-x-auto border border-zinc-800">
                  <pre>{`// Node.js (Express / Fastify)
import crypto from 'crypto';

const seenNonces = new Set();

function parseSig(header) {
  const parts = Object.fromEntries(
    header.split(',').map(s => s.trim().split('='))
  );
  return { t: parseInt(parts.t, 10), v1: parts.v1, nonce: parts.nonce };
}

function verifyStormSale(req, secret) {
  const sigHeader = req.headers['x-stormsale-signature'];
  if (!sigHeader) return false;
  
  const { t, v1, nonce } = parseSig(sigHeader);
  if (!t || !v1 || !nonce) return false;
  
  // 1. Replay window: Max 300s
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > 300) return false;
  
  // 2. Constant-time HMAC-SHA256
  const data = \`\${t}.\${nonce}.\${JSON.stringify(req.body)}\`;
  const hmac = crypto.createHmac('sha256', secret)
    .update(data).digest('hex');
    
  const b1 = Buffer.from(v1, 'hex');
  const b2 = Buffer.from(hmac, 'hex');
  if (b1.length !== b2.length) return false;
  if (!crypto.timingSafeEqual(b1, b2)) return false;
  
  // 3. Record nonce after verification
  if (seenNonces.has(nonce)) return false;
  seenNonces.add(nonce);
  return true;
}`}</pre>
                </div>

                <div className="text-xs space-y-2 text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>HMAC-SHA256 signature ensures tamper-free data</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Cryptographic nonce blocks duplicate packet replay</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Automated exponential backoff retries on 5xx errors</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REGISTER / EDIT ENDPOINT
         ========================================================================= */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="endpoint-modal-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl space-y-6"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3
                  id="endpoint-modal-title"
                  className="text-2xl font-black text-zinc-900 dark:text-white"
                >
                  {editingEndpointId ? "Edit Webhook Endpoint" : "Register Webhook Endpoint"}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Configure target destination for automated conversion postbacks
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEndpoint} className="space-y-5">
              <div>
                <label
                  htmlFor={endpointNameId}
                  className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1"
                >
                  Endpoint Label / CRM Name
                </label>
                <Input
                  id={endpointNameId}
                  value={endpointName}
                  onChange={(e) => setEndpointName(e.target.value)}
                  placeholder="e.g. HubSpot CRM Webhook or Zapier Lead"
                  className="h-11 rounded-xl bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor={endpointUrlId}
                  className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1"
                >
                  Target Webhook URL (HTTPS POST)
                </label>
                <Input
                  id={endpointUrlId}
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  placeholder="https://hooks.zapier.com/..."
                  className="h-11 rounded-xl font-mono text-xs bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label
                    htmlFor={endpointSecretId}
                    className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider"
                  >
                    HMAC-SHA256 Secret Key
                  </label>
                  <button
                    type="button"
                    onClick={() => setEndpointSecret(generateWebhookSecret())}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    Generate New Secret
                  </button>
                </div>
                <Input
                  id={endpointSecretId}
                  value={endpointSecret}
                  onChange={(e) => setEndpointSecret(e.target.value)}
                  className="h-11 rounded-xl font-mono text-xs bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor={simulationModeId}
                  className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1"
                >
                  Endpoint Testing / Simulation Mode
                </label>
                <select
                  id={simulationModeId}
                  value={simulationMode}
                  onChange={(e) => setSimulationMode(e.target.value as SimulationMode)}
                  className="w-full h-11 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs font-semibold px-3 text-zinc-900 dark:text-zinc-100"
                >
                  <option value="live">Live HTTP Request (Real network dispatch)</option>
                  <option value="mock_200">Simulate 200 OK (Instant verified CRM receipt)</option>
                  <option value="mock_flaky">
                    Simulate 503 Flaky (Fails twice with 503, then recovers on retry)
                  </option>
                  <option value="mock_500">
                    Simulate 500 Server Error (Demonstrate retry exhaustion)
                  </option>
                </select>
              </div>

              <div>
                <span className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Event Subscriptions
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: "campaign.created", label: "campaign.created (New Campaign)" },
                    { id: "conversion.created", label: "conversion.created (New Conversion)" },
                    { id: "payout.created", label: "payout.created (New Payout)" },
                    { id: "conversion.confirmed", label: "conversion.confirmed (Affiliate Sale)" },
                    { id: "payout.claimed", label: "payout.claimed (Commission Payout)" },
                    { id: "commission.escrowed", label: "commission.escrowed (Escrow Fund)" },
                    { id: "campaign.funded", label: "campaign.funded (Contract Deploy)" },
                  ].map((evt) => {
                    const isSelected = endpointEvents.includes(evt.id as WebhookEventType);
                    return (
                      <label
                        key={evt.id}
                        className={`flex items-center space-x-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-bold"
                            : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEndpointEvents([...endpointEvents, evt.id as WebhookEventType]);
                            } else {
                              setEndpointEvents(endpointEvents.filter((ev) => ev !== evt.id));
                            }
                          }}
                          className="rounded text-indigo-600"
                        />
                        <span className="text-[11px] truncate">{evt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 rounded-xl h-12 text-sm font-bold border-slate-200 dark:border-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 rounded-xl h-12 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20"
                >
                  {editingEndpointId ? "Save Changes" : "Register Endpoint"}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* =========================================================================
          MODAL: INSPECT DELIVERY LOGS (Acceptance Criteria 2: HTTP status codes & logs)
         ========================================================================= */}
      {selectedDelivery && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delivery-inspector-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-3xl w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-xs font-mono uppercase bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-bold">
                    {selectedDelivery.event}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono">ID: {selectedDelivery.id}</span>
                </div>
                <h3
                  id="delivery-inspector-title"
                  className="text-xl font-black text-zinc-900 dark:text-white"
                >
                  Delivery Log Audit Inspector
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">{selectedDelivery.url}</p>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Signature Header Box */}
            <div className="bg-slate-50 dark:bg-zinc-950 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                Cryptographic Header: X-StormSale-Signature
              </span>
              <p className="font-mono text-xs text-indigo-600 dark:text-indigo-400 break-all select-all">
                {selectedDelivery.signatureHeader || "Generated on dispatch attempt"}
              </p>
            </div>

            {/* Attempt Logs List (Acceptance Criteria 2) */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Attempt History & Response Status Codes ({selectedDelivery.logs.length})
              </h4>

              <div className="space-y-3">
                {selectedDelivery.logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50 dark:bg-zinc-950/80 p-4 rounded-2xl border border-slate-200 dark:border-zinc-800/80 space-y-3 font-mono text-xs"
                  >
                    <div className="flex justify-between items-center border-b border-slate-200 dark:border-zinc-800/60 pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-zinc-900 dark:text-white">
                          Attempt #{log.attemptNumber}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            log.httpStatusCode >= 200 && log.httpStatusCode < 300
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
                          }`}
                        >
                          HTTP {log.httpStatusCode || "CORS/Network Block"} {log.statusText}
                        </span>
                      </div>
                      <span className="text-zinc-400 text-[11px]">
                        {new Date(log.timestamp).toLocaleTimeString()} ({log.durationMs}ms)
                      </span>
                    </div>

                    {log.error && (
                      <p className="text-rose-600 dark:text-rose-400 text-xs">Error: {log.error}</p>
                    )}

                    <div>
                      <span className="text-[10px] text-zinc-400 uppercase block mb-1">
                        Response Body Snippet:
                      </span>
                      <pre className="p-2.5 rounded-lg bg-zinc-900 text-zinc-300 text-[11px] overflow-x-auto">
                        {log.responseBody || "No response body received"}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Signed Payload Preview */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Signed Request Payload JSON
              </h4>
              <pre className="p-4 rounded-2xl bg-zinc-900 text-zinc-300 font-mono text-xs overflow-x-auto max-h-48 border border-zinc-800">
                {JSON.stringify(selectedDelivery.payload, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setSelectedDelivery(null)}
                className="rounded-xl bg-zinc-900 dark:bg-zinc-800 text-white text-xs font-bold px-6 h-11"
              >
                Close Inspector
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
