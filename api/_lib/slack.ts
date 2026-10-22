export type SlackNotificationKind = "low_escrow" | "high_value_conversion";

export interface SlackNotificationInput {
  kind: SlackNotificationKind;
  campaignId: string;
  campaignName: string;
  dashboardUrl: string;
  topUpUrl: string;
  remainingPercent?: number;
  conversionValue?: number;
  currency?: string;
}

const lastSent = new Map<string, number>();
const RATE_LIMIT_MS = 15 * 60 * 1000;

function assertSlackWebhook(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "hooks.slack.com") {
    throw new Error("Invalid Slack webhook URL");
  }
  return url;
}

export function buildSlackBlocks(input: SlackNotificationInput) {
  const lowEscrow = input.kind === "low_escrow";
  const detail = lowEscrow
    ? `Escrow is down to *${input.remainingPercent?.toFixed(1)}%*.`
    : `A conversion worth *${input.conversionValue?.toLocaleString()} ${input.currency ?? "USD"}* was recorded.`;
  return {
    text: `${lowEscrow ? "Low escrow" : "High-value conversion"}: ${input.campaignName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: lowEscrow ? "⚠️ Low escrow balance" : "🎉 High-value conversion" },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${input.campaignName}*\n${detail}` },
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: { type: "plain_text", text: "View Campaign" }, url: input.dashboardUrl },
          { type: "button", style: "primary", text: { type: "plain_text", text: "Top Up Escrow" }, url: input.topUpUrl },
        ],
      },
    ],
  };
}

export async function sendSlackNotification(webhook: string, input: SlackNotificationInput) {
  const url = assertSlackWebhook(webhook);
  const key = `${input.kind}:${input.campaignId}`;
  const now = Date.now();
  if (now - (lastSent.get(key) ?? 0) < RATE_LIMIT_MS) {
    return { sent: false, reason: "rate_limited" as const };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildSlackBlocks(input)),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Slack delivery failed (${response.status})`);
  lastSent.set(key, now);
  return { sent: true as const };
}
