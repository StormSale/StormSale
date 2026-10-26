import type {
  WebhookEndpoint,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookEventType,
  ConversionPayloadData,
  SimulationMode,
} from "../types/webhook";
import { generateWebhookSecret, generateWebhookSignature } from "./webhookSecurity";
import { addErrorBreadcrumb } from "./errorTracking";

const STORAGE_ENDPOINTS_KEY = "stormsale_webhook_endpoints_v1";
const STORAGE_DELIVERIES_KEY = "stormsale_webhook_deliveries_v1";
const MAX_CONSECUTIVE_FAILURES = 5;
const DEFAULT_DELIVERY_TIMEOUT_MS = 8000;

export function isSafeWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".intranet") ||
      hostname.endsWith(".lan") ||
      hostname.endsWith(".home.arpa") ||
      !hostname.includes(".")
    ) {
      return false;
    }

    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
      const octets = hostname.split(".").map(Number);
      if (octets.some((octet) => octet < 0 || octet > 255)) {
        return false;
      }

      const [first, second] = octets;
      return !(
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 192 && second === 0) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 192 && second === 88 && octets[2] === 99) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && octets[2] === 100) ||
        (first === 203 && second === 0 && octets[2] === 113) ||
        (first === 100 && second >= 64 && second <= 127) ||
        first >= 224
      );
    }

    if (hostname.includes(":")) {
      return false;
    }

    return hostname.length > 0;
  } catch {
    return false;
  }
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate default seed endpoints dynamically without hardcoded secrets
 */
export function createDefaultWebhookEndpoints(): WebhookEndpoint[] {
  return [
    {
      id: "wh_crm_hubspot",
      name: "HubSpot Enterprise CRM (Demo)",
      url: "https://api.crm.stormsale-demo.org/v1/conversions",
      secret: generateWebhookSecret(),
      events: ["conversion.confirmed", "payout.claimed"],
      isActive: true,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      description: "Production CRM ingestion endpoint for affiliate sale attribute tracking",
      simulationMode: "mock_200",
      failureCount: 0,
      totalDeliveries: 12,
      lastDeliveryStatus: "delivered",
      lastDeliveryAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "wh_retry_queue_demo",
      name: "Billing Ingestion Gateway (Flaky Retry Demo)",
      url: "https://billing-webhook.stormsale-demo.org/postbacks",
      secret: generateWebhookSecret(),
      events: ["conversion.confirmed", "commission.escrowed"],
      isActive: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      description:
        "Simulates transient 503 service unavailable to demonstrate automated exponential backoff",
      simulationMode: "mock_flaky",
      failureCount: 2,
      totalDeliveries: 8,
      lastDeliveryStatus: "retrying",
      lastDeliveryAt: new Date(Date.now() - 120000).toISOString(),
    },
  ];
}

// In-memory cache for SSR, Node testing, and active runtime
let memoryEndpoints: WebhookEndpoint[] | null = null;
let memoryDeliveries: WebhookDelivery[] = [];

// Track in-flight deliveries and retry timers to prevent overlapping dispatches
const inFlightDeliveries = new Set<string>();
const pendingRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Clear a scheduled retry timer for a delivery
 */
export function clearPendingRetryTimer(deliveryId: string): void {
  const timer = pendingRetryTimers.get(deliveryId);
  if (timer) {
    clearTimeout(timer);
    pendingRetryTimers.delete(deliveryId);
  }
}

/**
 * Reset memory store (useful for unit tests)
 */
export function resetWebhookEngineStore(): void {
  for (const timer of pendingRetryTimers.values()) {
    clearTimeout(timer);
  }
  pendingRetryTimers.clear();
  inFlightDeliveries.clear();
  memoryEndpoints = null;
  memoryDeliveries = [];
}

/**
 * Get registered endpoints from storage or default fallback
 */
export function getRegisteredEndpoints(): WebhookEndpoint[] {
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = localStorage.getItem(STORAGE_ENDPOINTS_KEY);
    if (!raw) {
      const defaults = createDefaultWebhookEndpoints();
      localStorage.setItem(STORAGE_ENDPOINTS_KEY, JSON.stringify(defaults));
      memoryEndpoints = defaults;
    } else {
      try {
        memoryEndpoints = JSON.parse(raw);
      } catch {
        memoryEndpoints = createDefaultWebhookEndpoints();
      }
    }
  }

  if (!memoryEndpoints) {
    memoryEndpoints = createDefaultWebhookEndpoints();
  }
  return memoryEndpoints;
}

/**
 * Save or update a webhook endpoint
 */
export function saveWebhookEndpoint(endpoint: WebhookEndpoint): WebhookEndpoint[] {
  const current = getRegisteredEndpoints();
  const index = current.findIndex((ep) => ep.id === endpoint.id);
  let updated: WebhookEndpoint[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = endpoint;
  } else {
    updated = [endpoint, ...current];
  }
  memoryEndpoints = updated;
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(STORAGE_ENDPOINTS_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Delete a webhook endpoint
 */
export function deleteWebhookEndpoint(id: string): WebhookEndpoint[] {
  // Cancel pending retry timers for deliveries associated with this endpoint
  const deliveries = getWebhookDeliveries();
  for (const delivery of deliveries) {
    if (delivery.webhookId === id) {
      clearPendingRetryTimer(delivery.id);
    }
  }

  const current = getRegisteredEndpoints();
  const updated = current.filter((ep) => ep.id !== id);
  memoryEndpoints = updated;
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(STORAGE_ENDPOINTS_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Toggle active status of a webhook endpoint
 */
export function toggleWebhookEndpoint(id: string, isActive: boolean): WebhookEndpoint[] {
  if (!isActive) {
    const deliveries = getWebhookDeliveries();
    for (const delivery of deliveries) {
      if (delivery.webhookId === id) {
        clearPendingRetryTimer(delivery.id);
      }
    }
  }

  const current = getRegisteredEndpoints();
  const updated = current.map((ep) => (ep.id === id ? { ...ep, isActive } : ep));
  memoryEndpoints = updated;
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(STORAGE_ENDPOINTS_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Get all webhook deliveries from storage
 */
export function getWebhookDeliveries(): WebhookDelivery[] {
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = localStorage.getItem(STORAGE_DELIVERIES_KEY);
    if (raw) {
      try {
        memoryDeliveries = JSON.parse(raw);
      } catch {
        // Keep memoryDeliveries
      }
    }
  }
  return memoryDeliveries;
}

/**
 * Save or update a delivery in storage
 */
export function saveWebhookDelivery(delivery: WebhookDelivery): WebhookDelivery[] {
  const current = getWebhookDeliveries();
  const index = current.findIndex((d) => d.id === delivery.id);
  let updated: WebhookDelivery[];
  if (index >= 0) {
    updated = [...current];
    updated[index] = delivery;
  } else {
    // Keep max 100 historical delivery records
    updated = [delivery, ...current.slice(0, 99)];
  }
  memoryDeliveries = updated;
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.setItem(STORAGE_DELIVERIES_KEY, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Clear all delivery logs from storage
 */
export function clearWebhookDeliveries(): void {
  for (const timer of pendingRetryTimers.values()) {
    clearTimeout(timer);
  }
  pendingRetryTimers.clear();
  inFlightDeliveries.clear();
  memoryDeliveries = [];
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.removeItem(STORAGE_DELIVERIES_KEY);
  }
}

/**
 * Calculate Exponential Backoff Delay in milliseconds
 * Delay = min(baseDelayMs * 2^(attemptNumber - 1), maxDelayMs)
 */
export function calculateBackoffDelayMs(
  attemptNumber: number,
  baseDelayMs = 2000,
  maxDelayMs = 60000,
): number {
  const exponent = Math.max(0, attemptNumber - 1);
  const delay = baseDelayMs * Math.pow(2, exponent);
  return Math.min(delay, maxDelayMs);
}

/**
 * Create a new delivery record
 */
export async function createDeliveryRecord(
  endpoint: WebhookEndpoint,
  event: WebhookEventType,
  payload: Record<string, unknown>,
  maxRetries = 4,
): Promise<WebhookDelivery> {
  const deliveryId = `del_${generateUUID()}`;
  const now = new Date().toISOString();

  const delivery: WebhookDelivery = {
    id: deliveryId,
    webhookId: endpoint.id,
    webhookName: endpoint.name,
    url: endpoint.url,
    event,
    status: "queued",
    attempts: 0,
    maxRetries,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
    payload,
    logs: [],
    signatureHeader: "",
  };

  saveWebhookDelivery(delivery);
  return delivery;
}

export interface DispatchExecutionResult {
  success: boolean;
  httpStatusCode: number;
  statusText: string;
  responseBody: string;
  durationMs: number;
  signatureHeader: string;
  error?: string;
  isPermanentFailure?: boolean;
}

/**
 * Execute HTTP POST or simulated HTTP response
 * Fresh HMAC signature is generated dynamically for each attempt
 */
export async function executeHttpDispatch(
  delivery: WebhookDelivery,
  endpoint?: WebhookEndpoint,
  timeoutMs = DEFAULT_DELIVERY_TIMEOUT_MS,
): Promise<DispatchExecutionResult> {
  const startTime = Date.now();
  const mode: SimulationMode = endpoint?.simulationMode || "live";
  const secret = endpoint?.secret || generateWebhookSecret();

  if (!isSafeWebhookUrl(delivery.url)) {
    return {
      success: false,
      httpStatusCode: 400,
      statusText: "Invalid webhook URL",
      signatureHeader: "",
      responseBody: "",
      durationMs: Date.now() - startTime,
      error: "Webhook URL must use HTTPS and a public hostname.",
      isPermanentFailure: true,
    };
  }

  // Generate fresh HMAC signature with current attempt timestamp
  const { signatureHeader, timestamp } = await generateWebhookSignature({
    payload: delivery.payload,
    secret,
  });

  // Simulation handlers for demonstration and sandbox evaluation
  if (mode === "mock_200") {
    await new Promise((r) => setTimeout(r, 50));
    return {
      success: true,
      httpStatusCode: 200,
      statusText: "OK",
      signatureHeader,
      responseBody: JSON.stringify({
        status: "success",
        received_at: new Date().toISOString(),
        crm_record_id: `CRM_REC_${Math.floor(100000 + Math.random() * 900000)}`,
        signature_verified: true,
      }),
      durationMs: Date.now() - startTime,
    };
  }

  if (mode === "mock_500") {
    await new Promise((r) => setTimeout(r, 50));
    return {
      success: false,
      httpStatusCode: 500,
      statusText: "Internal Server Error",
      signatureHeader,
      responseBody: JSON.stringify({
        error: "CRM Database connection pool exhausted",
        code: "ERR_DB_TIMEOUT",
        retryable: true,
      }),
      durationMs: Date.now() - startTime,
      error: "HTTP 500: Internal Server Error from remote CRM host",
    };
  }

  if (mode === "mock_503") {
    await new Promise((r) => setTimeout(r, 50));
    return {
      success: false,
      httpStatusCode: 503,
      statusText: "Service Unavailable",
      signatureHeader,
      responseBody: JSON.stringify({
        error: "CRM Ingestion API is currently under maintenance",
        retry_after: 30,
      }),
      durationMs: Date.now() - startTime,
      error: "HTTP 503: Service Unavailable",
    };
  }

  if (mode === "mock_flaky") {
    await new Promise((r) => setTimeout(r, 50));
    const attempt = delivery.attempts + 1;
    if (attempt < 3) {
      return {
        success: false,
        httpStatusCode: 503,
        statusText: "Service Unavailable (Transient)",
        signatureHeader,
        responseBody: JSON.stringify({
          error: `Transient backend queue lock (attempt ${attempt} of 3 before recovery)`,
          retry_in_progress: true,
        }),
        durationMs: Date.now() - startTime,
        error: "HTTP 503: Transient Service Unavailable",
      };
    } else {
      return {
        success: true,
        httpStatusCode: 200,
        statusText: "OK (Recovered)",
        signatureHeader,
        responseBody: JSON.stringify({
          status: "success",
          message: "CRM Recovered! Postback processed after exponential retry backoff.",
          recovered_on_attempt: attempt,
          crm_record_id: `CRM_RETRY_REC_${Math.floor(100000 + Math.random() * 900000)}`,
        }),
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Real HTTP dispatch
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "StormSale-Conversion-Webhook-Engine/1.0",
      "X-StormSale-Signature": signatureHeader,
      "X-StormSale-Event": delivery.event,
      "X-StormSale-Delivery-Id": delivery.id,
      "X-StormSale-Timestamp": timestamp.toString(),
    };

    const res = await fetch(delivery.url, {
      method: "POST",
      headers,
      body: JSON.stringify(delivery.payload),
      signal: controller.signal,
    });

    const responseText = await res.text();
    const durationMs = Date.now() - startTime;

    return {
      success: res.ok,
      httpStatusCode: res.status,
      statusText: res.statusText || (res.ok ? "OK" : "Error"),
      signatureHeader,
      responseBody: responseText.slice(0, 1000),
      durationMs,
      error: res.ok ? undefined : `HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Network dispatch failure";
    return {
      success: false,
      httpStatusCode: 0,
      statusText: "Network/Connection Failure",
      signatureHeader,
      responseBody: JSON.stringify({
        error: message,
        hint: "Target host refused connection or CORS policy prevented browser dispatch.",
      }),
      durationMs,
      error: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Dispatch a single delivery through the retry queue with race-condition prevention
 */
export async function dispatchDelivery(
  deliveryId: string,
  endpoints?: WebhookEndpoint[],
): Promise<WebhookDelivery | null> {
  // Clear any scheduled retry timer for this delivery
  clearPendingRetryTimer(deliveryId);

  // Prevent concurrent in-flight dispatches for the exact same delivery
  if (inFlightDeliveries.has(deliveryId)) {
    return getWebhookDeliveries().find((d) => d.id === deliveryId) || null;
  }

  const deliveries = getWebhookDeliveries();
  const delivery = deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return null;

  addErrorBreadcrumb("webhook.dispatch", `Dispatching webhook ${deliveryId}`, {
    deliveryId,
    endpointCount: endpoints?.length ?? 0,
  });

  // Mark status as delivering
  inFlightDeliveries.add(deliveryId);
  delivery.status = "delivering";
  delivery.updatedAt = new Date().toISOString();
  saveWebhookDelivery(delivery);

  const allEndpoints = endpoints || getRegisteredEndpoints();
  const endpoint = allEndpoints.find((ep) => ep.id === delivery.webhookId);

  try {
    const result = await executeHttpDispatch(delivery, endpoint);
    const now = new Date().toISOString();
    const newAttemptNumber = delivery.attempts + 1;

    delivery.signatureHeader = result.signatureHeader;

    const attemptLog: WebhookDeliveryAttempt = {
      attemptNumber: newAttemptNumber,
      timestamp: now,
      httpStatusCode: result.httpStatusCode,
      statusText: result.statusText,
      durationMs: result.durationMs,
      requestHeaders: {
        "Content-Type": "application/json",
        "X-StormSale-Signature": result.signatureHeader,
        "X-StormSale-Event": delivery.event,
        "X-StormSale-Delivery-Id": delivery.id,
      },
      requestPayload: delivery.payload,
      responseBody: result.responseBody,
      error: result.error,
    };

    delivery.attempts = newAttemptNumber;
    delivery.logs = [...delivery.logs, attemptLog];
    delivery.updatedAt = now;

    const getFreshEndpoint = () =>
      getRegisteredEndpoints().find((ep) => ep.id === delivery.webhookId) ?? endpoint;

    if (result.success) {
      delivery.status = "delivered";
      delivery.nextRetryAt = null;

      if (endpoint) {
        const fresh = getFreshEndpoint()!;
        saveWebhookEndpoint({
          ...fresh,
          failureCount: 0,
          totalDeliveries: fresh.totalDeliveries + 1,
          lastDeliveryStatus: "delivered",
          lastDeliveryAt: now,
        });
      }
    } else {
      const fresh = endpoint ? getFreshEndpoint() : undefined;

      if (result.isPermanentFailure) {
        // Permanent URL rejection or invalid destination - do not retry
        delivery.status = "failed";
        delivery.nextRetryAt = null;

        if (fresh) {
          saveWebhookEndpoint({
            ...fresh,
            lastDeliveryStatus: "failed",
            lastDeliveryAt: now,
          });
        }
      } else if (result.httpStatusCode === 410) {
        // Destination unsubscribed (410 Gone) - immediate disable
        delivery.status = "failed";
        delivery.nextRetryAt = null;

        if (fresh) {
          const nextFailureCount = fresh.failureCount + 1;
          saveWebhookEndpoint({
            ...fresh,
            isActive: false,
            failureCount: nextFailureCount,
            lastDeliveryStatus: "failed",
            lastDeliveryAt: now,
          });
        }
      } else if (delivery.attempts < delivery.maxRetries) {
        // Retry scheduled - do not increment endpoint failureCount until retries are exhausted
        const backoffMs = calculateBackoffDelayMs(delivery.attempts);
        const nextRetryDate = new Date(Date.now() + backoffMs);

        delivery.status = "retrying";
        delivery.nextRetryAt = nextRetryDate.toISOString();

        if (fresh) {
          saveWebhookEndpoint({
            ...fresh,
            lastDeliveryStatus: "retrying",
            lastDeliveryAt: now,
          });
        }

        // Schedule automated background retry tracking current attempt number
        const currentAttempt = newAttemptNumber;
        if (typeof window !== "undefined") {
          const timerId = setTimeout(() => {
            pendingRetryTimers.delete(deliveryId);
            const current = getWebhookDeliveries().find((d) => d.id === deliveryId);
            const currentEp = getRegisteredEndpoints().find((ep) => ep.id === current?.webhookId);
            if (
              current &&
              current.status === "retrying" &&
              current.attempts === currentAttempt &&
              currentEp?.isActive === true
            ) {
              dispatchDelivery(deliveryId);
            }
          }, backoffMs);
          pendingRetryTimers.set(deliveryId, timerId);
        }
      } else {
        // Retries exhausted - increment failureCount and disable if consecutive threshold reached
        delivery.status = "failed";
        delivery.nextRetryAt = null;

        if (fresh) {
          const nextFailureCount = fresh.failureCount + 1;
          const shouldDisableEndpoint = nextFailureCount >= MAX_CONSECUTIVE_FAILURES;
          saveWebhookEndpoint({
            ...fresh,
            failureCount: nextFailureCount,
            isActive: shouldDisableEndpoint ? false : fresh.isActive,
            lastDeliveryStatus: "failed",
            lastDeliveryAt: now,
          });
        }
      }
    }

    saveWebhookDelivery(delivery);
    return delivery;
  } finally {
    inFlightDeliveries.delete(deliveryId);
  }
}

/**
 * Trigger an automated conversion postback across all active endpoints subscribed to conversion.confirmed
 */
export async function triggerConversionPostback(
  data: ConversionPayloadData,
): Promise<WebhookDelivery[]> {
  const endpoints = getRegisteredEndpoints().filter(
    (ep) => ep.isActive && ep.events.includes("conversion.confirmed"),
  );

  const payload: Record<string, unknown> = {
    event: "conversion.confirmed",
    event_id: `evt_${generateUUID()}`,
    timestamp: new Date().toISOString(),
    protocol: "StormSale Stellar Escrow Protocol",
    data: {
      sale_id: data.saleId,
      campaign_address: data.campaignAddress,
      affiliate_address: data.affiliateAddress,
      advertiser_address: data.advertiserAddress,
      amount: data.saleAmount,
      currency: data.currency || "XLM",
      stellar_tx_hash: data.stellarTxHash,
      ledger_timestamp: data.ledgerTimestamp,
      customer_ref: data.customerRef || "Anonymous Customer",
      status: data.status,
    },
  };

  const dispatchedDeliveries: WebhookDelivery[] = [];

  for (const endpoint of endpoints) {
    const delivery = await createDeliveryRecord(endpoint, "conversion.confirmed", payload);
    const updated = await dispatchDelivery(delivery.id);
    if (updated) {
      dispatchedDeliveries.push(updated);
    }
  }

  return dispatchedDeliveries;
}

export interface WebhookSamplePayload extends Record<string, unknown> {
  id: string;
  event: WebhookEventType;
  created_at: string;
  is_test_event: true;
}

export function getWebhookSamplePayload(event: WebhookEventType): WebhookSamplePayload {
  const common = {
    id: `sample_${event.replace(".", "_")}_001`,
    event,
    created_at: new Date().toISOString(),
    is_test_event: true as const,
  };

  switch (event) {
    case "campaign.created":
      return {
        ...common,
        campaign_id: 42,
        campaign_name: "Summer Launch",
        advertiser_address: "GADVERTISER_SAMPLE_WALLET",
        budget: 500,
        currency: "XLM",
        commission_rate_percent: 12,
        clearing_period_seconds: 604800,
        tx_hash: "sample_campaign_transaction",
        status: "created",
      };
    case "conversion.created":
      return {
        ...common,
        conversion_id: "SALE_SAMPLE_001",
        campaign_id: 42,
        campaign_address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        affiliate_address: "GAFFILIATE_SAMPLE_WALLET",
        advertiser_address: "GADVERTISER_SAMPLE_WALLET",
        amount: 125,
        currency: "XLM",
        tx_hash: "sample_conversion_transaction",
        status: "confirmed",
      };
    case "payout.created":
      return {
        ...common,
        payout_id: "PAYOUT_SAMPLE_001",
        campaign_id: 42,
        affiliate_address: "GAFFILIATE_SAMPLE_WALLET",
        currency: "XLM",
        tx_hash: "sample_payout_transaction",
        status: "claimed",
      };
    default:
      return {
        ...common,
        campaign_id: 42,
        affiliate_address: "GAFFILIATE_SAMPLE_WALLET",
        amount: 125,
        currency: "XLM",
        tx_hash: "sample_transaction",
        status: "sample",
      };
  }
}

/**
 * Starts delivery to matching destinations without requiring the caller to wait.
 * Delivery state and failures remain visible in the webhook manager.
 */
export async function dispatchWebhookEvent(
  event: WebhookEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = getRegisteredEndpoints().filter(
      (endpoint) => endpoint.isActive && endpoint.events.includes(event),
    );

    await Promise.all(
      endpoints.map(async (endpoint) => {
        try {
          const delivery = await createDeliveryRecord(endpoint, event, payload);
          await dispatchDelivery(delivery.id, endpoints);
        } catch (error) {
          console.error(`Webhook delivery failed for ${event} (${endpoint.id}):`, error);
        }
      }),
    );
  } catch (error) {
    console.error(`Could not enqueue webhook event ${event}:`, error);
  }
}

/**
 * Dispatch a test dummy payload to a specific webhook endpoint
 */
export async function dispatchTestDummyPayload(
  endpointId: string,
  eventType: WebhookEventType = "conversion.confirmed",
): Promise<WebhookDelivery | null> {
  const endpoints = getRegisteredEndpoints();
  const endpoint = endpoints.find((ep) => ep.id === endpointId);
  if (!endpoint) return null;

  const dummyPayload: Record<string, unknown> =
    eventType === "campaign.created" ||
    eventType === "conversion.created" ||
    eventType === "payout.created"
      ? getWebhookSamplePayload(eventType)
      : {
          event: eventType,
          event_id: `test_evt_${generateUUID()}`,
          timestamp: new Date().toISOString(),
          is_test_event: true,
          protocol: "StormSale Stellar Escrow Protocol",
          data: {
            sale_id: `TEST_SALE_${Math.floor(1000 + Math.random() * 9000)}`,
            campaign_address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            affiliate_address: "GAFFILIATE777DEMOWALLET9999STORMTESTNET1234567890",
            advertiser_address: "GADVERTISER888DEMOWALLET9999STORMTESTNET1234567890",
            amount: "250.00",
            currency: "XLM",
            stellar_tx_hash: "0x1111111111111111111111111111111111111111111111111111111111111111",
            ledger_timestamp: new Date().toISOString(),
            customer_ref: "CUST_TEST_REF_42",
            status: "CONFIRMED_ON_LEDGER",
          },
        };

  const delivery = await createDeliveryRecord(endpoint, eventType, dummyPayload);
  return await dispatchDelivery(delivery.id);
}

/**
 * Manually trigger immediate retry of a delivery
 */
export async function retryDeliveryNow(deliveryId: string): Promise<WebhookDelivery | null> {
  clearPendingRetryTimer(deliveryId);

  const deliveries = getWebhookDeliveries();
  const delivery = deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return null;

  delivery.status = "queued";
  delivery.nextRetryAt = null;
  saveWebhookDelivery(delivery);

  return await dispatchDelivery(deliveryId);
}

export { generateWebhookSecret };
