/**
 * Webhook configuration and delivery types
 */

export type WebhookEventType =
  | "conversion.confirmed"
  | "conversion.disputed"
  | "payout.processed"
  | "affiliate.approved"
  | "affiliate.rejected";

export interface WebhookEndpoint {
  id: string;
  url: string;
  name: string;
  secret: string;
  isActive: boolean;
  events: WebhookEventType[];
  createdAt: string;
  lastPingedAt?: string;
  deliveryCount: number;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  event: WebhookEventType;
  statusCode: number;
  statusText: string;
  responseTime: number;
  payload: unknown;
  timestamp: string;
  retryCount: number;
  success: boolean;
}

export type SimulationMode = "live" | "test" | "sandbox";

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: unknown;
}
