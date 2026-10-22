import type {
  SlackBlock,
  SlackEscrowAlertData,
  SlackHighValueAlertData,
  SlackWebhookPayload,
} from "../types/slack";

const SLACK_USERNAME = "StormSale Escrow Bot";
const SLACK_ICON = ":zap:";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function joinAppUrl(baseUrl: string, query: string): string {
  const base = trimTrailingSlash(baseUrl || "");
  return `${base}/advertiser?${query}`;
}

/** Deep link into the advertiser campaign list for the alerted campaign. */
export function buildCampaignViewUrl(
  campaignId?: string,
  baseUrl = "https://stormsale.app",
): string {
  const query = campaignId
    ? `tab=my-campaigns&campaignId=${encodeURIComponent(campaignId)}`
    : "tab=my-campaigns";
  return joinAppUrl(baseUrl, query);
}

/** Deep link into the top-up flow, matching the in-app notification action URL. */
export function buildEscrowTopUpUrl(
  campaignId?: string,
  baseUrl = "https://stormsale.app",
): string {
  const query = campaignId
    ? `action=topup&campaignId=${encodeURIComponent(campaignId)}`
    : "action=topup";
  return joinAppUrl(baseUrl, query);
}

function actionButtons(campaignId?: string, baseUrl?: string): SlackBlock {
  return {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "View Campaign", emoji: true },
        url: buildCampaignViewUrl(campaignId, baseUrl),
      },
      {
        type: "button",
        text: { type: "plain_text", text: "Top Up Escrow", emoji: true },
        style: "primary",
        url: buildEscrowTopUpUrl(campaignId, baseUrl),
      },
    ],
  };
}

/** Formatted low-balance warning with the two direct action links. */
export function buildLowEscrowAlertPayload(
  data: SlackEscrowAlertData,
  options?: { appBaseUrl?: string; channel?: string },
): SlackWebhookPayload {
  const remaining = `${data.remainingXlm.toLocaleString()} XLM (${data.percentageRemaining.toFixed(
    1,
  )}%)`;

  return {
    text: `Escrow depletion warning: ${data.campaignName} is down to ${remaining}`,
    username: SLACK_USERNAME,
    icon_emoji: SLACK_ICON,
    channel: options?.channel,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Escrow Depletion Warning", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${data.campaignName}* has fallen below the ${data.thresholdPercent}% escrow budget threshold. Affiliate payouts stall once the on-chain escrow is exhausted.`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Remaining*\n${remaining}` },
          { type: "mrkdwn", text: `*Initial Budget*\n${data.initialXlm.toLocaleString()} XLM` },
          { type: "mrkdwn", text: `*Campaign ID*\n\`${data.campaignId}\`` },
        ],
      },
      actionButtons(data.campaignId, options?.appBaseUrl),
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `StormSale escrow monitor • ${new Date().toISOString()}` },
        ],
      },
    ],
  };
}

/** Formatted high-value conversion announcement with a link to the campaign. */
export function buildHighValueConversionPayload(
  data: SlackHighValueAlertData,
  options?: { appBaseUrl?: string; channel?: string },
): SlackWebhookPayload {
  return {
    text: `High-value conversion on ${data.campaignName}: ${data.amountXlm.toLocaleString()} XLM`,
    username: SLACK_USERNAME,
    icon_emoji: SLACK_ICON,
    channel: options?.channel,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "High-Value Conversion Logged", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `An affiliate just confirmed a conversion of *${data.amountXlm.toLocaleString()} XLM* on *${data.campaignName}*.`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Amount*\n${data.amountXlm.toLocaleString()} XLM` },
          { type: "mrkdwn", text: `*Affiliate*\n\`${data.affiliateAddress}\`` },
        ],
      },
      ...(data.stellarTxHash
        ? [
            {
              type: "context" as const,
              elements: [
                {
                  type: "mrkdwn" as const,
                  text: `Tx: \`${data.stellarTxHash}\``,
                },
              ],
            },
          ]
        : []),
      actionButtons(data.campaignId, options?.appBaseUrl),
    ],
  };
}

/** Connectivity check message used by the "Test Webhook" action in settings. */
export function buildTestAlertPayload(options?: {
  channel?: string;
  appBaseUrl?: string;
}): SlackWebhookPayload {
  return {
    text: "StormSale Slack integration test message",
    username: SLACK_USERNAME,
    icon_emoji: SLACK_ICON,
    channel: options?.channel,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "StormSale Webhook Test", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Connection verified. Escrow depletion and high-value conversion alerts will post to this channel.",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Campaign", emoji: true },
            url: joinAppUrl(options?.appBaseUrl || "https://stormsale.app", "tab=my-campaigns"),
          },
        ],
      },
    ],
  };
}
