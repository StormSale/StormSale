import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendSlackNotification, type SlackNotificationInput } from "../../_lib/slack";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  const { webhookUrl, notification } = request.body as {
    webhookUrl?: string;
    notification?: SlackNotificationInput;
  };
  if (!webhookUrl || !notification?.campaignId || !notification.campaignName) {
    return response.status(400).json({ error: "INVALID_REQUEST" });
  }
  try {
    const result = await sendSlackNotification(webhookUrl, notification);
    return response.status(result.sent ? 202 : 429).json(result);
  } catch (error) {
    return response.status(502).json({
      error: error instanceof Error ? error.message : "SLACK_DELIVERY_FAILED",
    });
  }
}
