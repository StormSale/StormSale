import type {
  WebhookEndpoint,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookEventType,
  ConversionPayloadData,
  SimulationMode,
} from "../types/webhook";
import { generateWebhookSecret, generateWebhookSignature } from "./webhookSecurity";

const STORAGE_ENDPOINTS_KEY = "stormsale_webhook_endpoints_v1";
const STORAGE_DELIVERIES_KEY = "stormsale_webhook_deliveries_v1";

// Default seed endpoints so merchants immediately have interactive endpoints to test
export const DEFAULT_WEBHOOK_ENDPOINTS: WebhookEndpoint[] = [
  {
    id: "wh_crm_hubspot",
    name: "HubSpot Enterprise CRM",
    url: "https://api.crm.stormsale-demo.org/v1/conversions",
    secret: "whsec_8f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e",
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
    name: "Billing Ingestion Gateway (Flaky Endpoint Demo)",
    url: "https://billing-webhook.stormsale-demo.org/postbacks",
    secret: "whsec_11223344556677889900aabbccddeeff0011223344556677",
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

// In-memory cache for SSR, Node testing, and active runtime
let memoryEndpoints: WebhookEndpoint[] = [...DEFAULT_WEBHOOK_ENDPOINTS];
let memoryDeliveries: WebhookDelivery[] = [];

/**
 * Get registered endpoints from storage or default fallback
 */
export function getRegisteredEndpoints(): WebhookEndpoint[] {
  if (typeof window !== "undefined" && window.localStorage) {
    const raw = localStorage.getItem(STORAGE_ENDPOINTS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_ENDPOINTS_KEY, JSON.stringify(DEFAULT_WEBHOOK_ENDPOINTS));
      memoryEndpoints = [...DEFAULT_WEBHOOK_ENDPOINTS];
    } else {
      try {
        memoryEndpoints = JSON.parse(raw);
      } catch {
        memoryEndpoints = [...DEFAULT_WEBHOOK_ENDPOINTS];
      }
    }
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
  memoryDeliveries = [];
  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.removeItem(STORAGE_DELIVERIES_KEY);
  }
}

/**
 * Calculate Exponential Backoff Delay in milliseconds
 * Delay = min(baseDelayMs * 2^(attemptNumber - 1), maxDelayMs)
 * E.g., for baseDelay = 2000:
 * Attempt 1: 2,000 ms (2s)
 * Attempt 2: 4,000 ms (4s)
 * Attempt 3: 8,000 ms (8s)
 * Attempt 4: 16,000 ms (16s)
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
 * Create a new delivery record with HMAC-SHA256 signature
 */
export async function createDeliveryRecord(
  endpoint: WebhookEndpoint,
  event: WebhookEventType,
  payload: Record<string, unknown>,
  maxRetries = 4,
): Promise<WebhookDelivery> {
  const deliveryId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const { signatureHeader } = await generateWebhookSignature({
    payload,
    secret: endpoint.secret,
  });

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
    signatureHeader,
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
  error?: string;
}

/**
 * Execute HTTP POST or simulated HTTP response
 */
export async function executeHttpDispatch(
  delivery: WebhookDelivery,
  endpoint?: WebhookEndpoint,
): Promise<DispatchExecutionResult> {
  const startTime = Date.now();
  const mode: SimulationMode = endpoint?.simulationMode || "live";

  // Simulation handlers for demonstration and sandbox evaluation
  if (mode === "mock_200") {
    await new Promise((r) => setTimeout(r, 50));
    return {
      success: true,
      httpStatusCode: 200,
      statusText: "OK",
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
    // Fails on attempt 1 & 2 with 503, then successfully processes on attempt 3+
    const attempt = delivery.attempts + 1;
    if (attempt < 3) {
      return {
        success: false,
        httpStatusCode: 503,
        statusText: "Service Unavailable (Transient)",
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
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "StormSale-Conversion-Webhook-Engine/1.0",
      "X-StormSale-Signature": delivery.signatureHeader,
      "X-StormSale-Event": delivery.event,
      "X-StormSale-Delivery-Id": delivery.id,
      "X-StormSale-Timestamp": Math.floor(Date.now() / 1000).toString(),
    };

    const res = await fetch(delivery.url, {
      method: "POST",
      headers,
      body: JSON.stringify(delivery.payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const responseText = await res.text();

    return {
      success: res.ok,
      httpStatusCode: res.status,
      statusText: res.statusText || (res.ok ? "OK" : "Error"),
      responseBody: responseText.slice(0, 1000),
      durationMs,
      error: res.ok ? undefined : `HTTP ${res.status}: ${res.statusText}`,
    };
  } catch (err: unknown) {
    const durationMs = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Network dispatch failure";
    return {
      success: false,
      httpStatusCode: 0, // Network failure / CORS block
      statusText: "Network/Connection Failure",
      responseBody: JSON.stringify({
        error: message,
        hint: "Target host refused connection or CORS policy prevented browser dispatch.",
      }),
      durationMs,
      error: message,
    };
  }
}

/**
 * Dispatch a single delivery through the retry queue
 */
export async function dispatchDelivery(
  deliveryId: string,
  endpoints?: WebhookEndpoint[],
): Promise<WebhookDelivery | null> {
  const deliveries = getWebhookDeliveries();
  const delivery = deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return null;

  const allEndpoints = endpoints || getRegisteredEndpoints();
  const endpoint = allEndpoints.find((ep) => ep.id === delivery.webhookId);

  // Mark status as delivering
  delivery.status = "delivering";
  delivery.updatedAt = new Date().toISOString();
  saveWebhookDelivery(delivery);

  // Execute dispatch
  const result = await executeHttpDispatch(delivery, endpoint);
  const now = new Date().toISOString();
  const newAttemptNumber = delivery.attempts + 1;

  const attemptLog: WebhookDeliveryAttempt = {
    attemptNumber: newAttemptNumber,
    timestamp: now,
    httpStatusCode: result.httpStatusCode,
    statusText: result.statusText,
    durationMs: result.durationMs,
    requestHeaders: {
      "Content-Type": "application/json",
      "X-StormSale-Signature": delivery.signatureHeader,
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

  if (result.success) {
    delivery.status = "delivered";
    delivery.nextRetryAt = null;

    // Update endpoint stats if endpoint exists
    if (endpoint) {
      saveWebhookEndpoint({
        ...endpoint,
        totalDeliveries: endpoint.totalDeliveries + 1,
        lastDeliveryStatus: "delivered",
        lastDeliveryAt: now,
      });
    }
  } else {
    // Retry check
    if (delivery.attempts < delivery.maxRetries) {
      const backoffMs = calculateBackoffDelayMs(delivery.attempts);
      const nextRetryDate = new Date(Date.now() + backoffMs);

      delivery.status = "retrying";
      delivery.nextRetryAt = nextRetryDate.toISOString();

      if (endpoint) {
        saveWebhookEndpoint({
          ...endpoint,
          failureCount: endpoint.failureCount + 1,
          lastDeliveryStatus: "retrying",
          lastDeliveryAt: now,
        });
      }

      // Schedule automated background retry
      if (typeof window !== "undefined") {
        setTimeout(() => {
          // Check if still in retrying state before triggering
          const current = getWebhookDeliveries().find((d) => d.id === deliveryId);
          if (current && current.status === "retrying") {
            dispatchDelivery(deliveryId);
          }
        }, backoffMs);
      }
    } else {
      delivery.status = "failed";
      delivery.nextRetryAt = null;

      if (endpoint) {
        saveWebhookEndpoint({
          ...endpoint,
          failureCount: endpoint.failureCount + 1,
          lastDeliveryStatus: "failed",
          lastDeliveryAt: now,
        });
      }
    }
  }

  saveWebhookDelivery(delivery);
  return delivery;
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
    event_id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
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

  const dummyPayload: Record<string, unknown> = {
    event: eventType,
    event_id: `test_evt_${Date.now()}`,
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
      stellar_tx_hash: `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")}`,
      ledger_timestamp: new Date().toISOString(),
      customer_ref: "Dummy CRM Test Customer #42",
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
  const deliveries = getWebhookDeliveries();
  const delivery = deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return null;

  delivery.status = "queued";
  delivery.nextRetryAt = null;
  saveWebhookDelivery(delivery);

  return await dispatchDelivery(deliveryId);
}

export { generateWebhookSecret };
