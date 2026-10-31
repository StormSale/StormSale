export type WebhookEventType =
  | "campaign.created"
  | "conversion.created"
  | "payout.created"
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

export type Sep24SepPaymentType = "SEP-24";

export type Sep24TransferStatus =
  | "incomplete"
  | "pending_user_transfer"
  | "pending_anchor_status"
  | "pending_external"
  | "completed"
  | "refunded"
  | "expired"
  | "error";

export type Sep24WithdrawalType = "bank_account" | "mobile_money" | "cash";

export interface Sep24AnchorInfo {
  tomlUrl: string;
  domain: string;
  name: string;
  description?: string;
  transferServerSep24: string;
  knownCustomers?: boolean;
  signingAppendix?: string;
  supportedAssets: Array<{
    asset: string;
    issuer?: string;
    withdrawalTypes: Sep24WithdrawalType[];
    fees?: {
      fixed?: string;
      percent?: string;
    };
    minAmount?: string;
    maxAmount?: string;
  }>;
}

export interface Sep24TransferResponse {
  id: string;
  kind: "withdrawal" | "deposit";
  status: Sep24TransferStatus;
  statusEta?: string;
  moreInfoUrl?: string;
  amountIn: {
    amount: string;
    asset: string;
  };
  amountOut?: {
    amount: string;
    asset: string;
  };
  fees?: {
    amount: string;
    asset: string;
  };
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  externalTransactionId?: string;
  message?: string;
  refunded?: boolean;
  tomatoTxHash?: string;
}

export interface Sep24InteractiveResponse {
  type: "interactive_customer_info_needed";
  url: string;
  id: string;
}

export interface Sep24AnchorToml {
  TRANSFER_SERVER_SEP0024?: string;
  SIGNING_KEY?: string;
  DOCUMENTATION?: {
    ORG_NAME?: string;
    ORG_URL?: string;
    ORG_DESCRIPTION?: string;
  };
  CURRENCIES?: Array<{
    code: string;
    issuer?: string;
    status?: string;
    anchor_asset_type?: string;
  }>;
}

export interface Sep24WithdrawalRequest {
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  account: string;
  withdrawalType: Sep24WithdrawalType;
  destinationExtra?: Record<string, string>;
  language?: string;
  onchainMemo?: string;
  clientDomain?: string;
  walletUrl?: string;
  refundMemo?: string;
}

export interface Sep24WithdrawalReceipt {
  id: string;
  transferId: string;
  anchorDomain: string;
  anchorName: string;
  assetCode: string;
  amountIn: string;
  amountOut?: string;
  fiatComponent?: string;
  fiatComponency?: string;
  fiatPayoutReference?: string;
  status: Sep24TransferStatus;
  startedAt: string;
  completedAt?: string;
  externalTransactionId?: string;
  message?: string;
}

export type Sep24PayoutStatus = Sep24TransferStatus;
