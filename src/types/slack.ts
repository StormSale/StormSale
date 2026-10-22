/** Event classes routed to the merchant Slack channel. */
export type SlackNotificationKind = "escrow.depletion" | "conversion.high_value" | "ping.test";

export type SlackNotificationStatus = "delivered" | "failed" | "rate_limited" | "skipped";

export interface SlackIntegrationConfig {
  isEnabled: boolean;
  webhookUrl: string;
  channelName: string;
  /** Escrow alerts fire once the remaining budget drops below this percentage. */
  lowEscrowThresholdPercent: number;
  /** Conversions at or above this XLM value are announced to the channel. */
  highValueConversionXlm: number;
  /** Minimum seconds between repeat alerts for the same campaign/event pair. */
  cooldownSeconds: number;
  /** Hard cap on messages posted inside the flood-guard window. */
  maxNotificationsPerMinute: number;
  /** Absolute base used to build the Block Kit action button URLs. */
  appBaseUrl: string;
}

export interface SlackTextObject {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
}

export interface SlackSectionBlock {
  type: "section";
  text?: SlackTextObject;
  fields?: SlackTextObject[];
}

export interface SlackDividerBlock {
  type: "divider";
}

export interface SlackContextBlock {
  type: "context";
  elements: SlackTextObject[];
}

export interface SlackButtonElement {
  type: "button";
  text: SlackTextObject;
  url?: string;
  style?: "primary" | "danger";
}

export interface SlackActionsBlock {
  type: "actions";
  elements: SlackButtonElement[];
}

export interface SlackHeaderBlock {
  type: "header";
  text: SlackTextObject;
}

export type SlackBlock =
  SlackHeaderBlock | SlackSectionBlock | SlackDividerBlock | SlackContextBlock | SlackActionsBlock;

export interface SlackWebhookPayload {
  text: string;
  blocks: SlackBlock[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

export interface SlackEscrowAlertData {
  campaignId: string;
  campaignName: string;
  remainingXlm: number;
  initialXlm: number;
  percentageRemaining: number;
  thresholdPercent: number;
}

export interface SlackHighValueAlertData {
  campaignId?: string;
  campaignName: string;
  affiliateAddress: string;
  amountXlm: number;
  stellarTxHash?: string;
}

export interface SlackNotificationLog {
  id: string;
  kind: SlackNotificationKind;
  status: SlackNotificationStatus;
  channel: string;
  message: string;
  createdAt: string;
  httpStatusCode: number | null;
  campaignId?: string;
  campaignName?: string;
  error?: string;
  payload?: SlackWebhookPayload;
}

export interface SlackSendOutcome {
  ok: boolean;
  httpStatusCode: number;
  responseBody: string;
  error?: string;
}
