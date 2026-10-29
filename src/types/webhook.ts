export type WebhookEventType =
  | "campaign.created"
  | "conversion.created"
  | "payout.created"
  | "conversion.confirmed"
  | "campaign.funded"
  | "commission.escrowed"
  | "payout.claimed"
  | "ping.test"
  | "escrow.low_balance"
  | "conversion.high_value";

export type DeliveryStatus = "queued" | "delivering" | "delivered" | "retrying" | "failed";

export type SimulationMode = "live" | "mock_200" | "mock_500" | "mock_503" | "mock_flaky";

export type WebhookChannelType = "generic" | "slack";

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
  channelType?: WebhookChannelType;
  rateLimitPerMinute?: number;
  lowBalanceThresholdPercent?: number;
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

export interface EscrowLowBalancePayloadData {
  campaignAddress: string;
  advertiserAddress: string;
  currency: string;
  remainingBalance: string | number;
  initialBudget: string | number;
  remainingPercent: number;
  thresholdPercent: number;
  campaignUrl: string;
  topUpUrl: string;
}

export interface SlackBlockKitAction {
  type: "button";
  text: { type: "plain_text"; text: string; emoji?: boolean };
  url: string;
  action_id: string;
}

export interface SlackBlockKitBlock {
  type: "header" | "section" | "actions" | "context" | "divider";
  text?: { type: "plain_text" | "mrkdwn"; text: string; emoji?: boolean };
  fields?: { type: "mrkdwn"; text: string }[];
  elements?: SlackBlockKitAction[];
}

export interface SlackWebhookMessage {
  text: string;
  blocks: SlackBlockKitBlock[];
}

export interface WebhookNotificationLog {
  id: string;
  webhookId: string;
  event: WebhookEventType;
  message: string;
  sentAt: string;
  status: "sent" | "rate_limited" | "failed";
  httpStatusCode?: number;
  error?: string;
}

export interface WebhookSignatureVerificationResult {
  isValid: boolean;
  reason?: string;
  timestamp?: number;
  nonce?: string;
  ageSeconds?: number;
}
