export type WebhookEventType =
  | "conversion.confirmed"
  | "campaign.funded"
  | "commission.escrowed"
  | "payout.claimed"
  | "ping.test";

export type DeliveryStatus = "queued" | "delivering" | "delivered" | "retrying" | "failed";

export type SimulationMode = "live" | "mock_200" | "mock_500" | "mock_503" | "mock_flaky";

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: string;
  description?: string;
  simulationMode?: SimulationMode;
  failureCount: number;
  totalDeliveries: number;
  lastDeliveryStatus?: "delivered" | "retrying" | "failed";
  lastDeliveryAt?: string;
}

export interface WebhookDeliveryAttempt {
  attemptNumber: number;
  timestamp: string;
  httpStatusCode: number;
  statusText: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestPayload: unknown;
  responseBody: string;
  error?: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  webhookName: string;
  url: string;
  event: WebhookEventType;
  status: DeliveryStatus;
  attempts: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
  logs: WebhookDeliveryAttempt[];
  signatureHeader: string;
}

export interface ConversionPayloadData {
  saleId: string;
  campaignAddress: string;
  affiliateAddress: string;
  advertiserAddress: string;
  saleAmount: string | number;
  currency: string;
  stellarTxHash: string;
  ledgerTimestamp: string;
  customerRef?: string;
  status: "CONFIRMED_ON_LEDGER";
}

export interface WebhookSignatureVerificationResult {
  isValid: boolean;
  reason?: string;
  timestamp?: number;
  nonce?: string;
  ageSeconds?: number;
}
