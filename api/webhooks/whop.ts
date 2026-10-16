import { processStorefrontEvent } from "../../src/lib/storefront/processor";
import { parseWhopEvent } from "../../src/lib/storefront/whop";
import { verifyWhopSignature } from "../../src/lib/storefront/whopSignature";
import { getProcessorConfig, json } from "../_lib/runtime";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) return json({ error: "WHOP_WEBHOOK_SECRET is not configured" }, 500);

  const rawBody = await request.text();
  const valid = await verifyWhopSignature({
    secret,
    rawBody,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });
  if (!valid) return json({ error: "invalid signature" }, 401);

  let event;
  try {
    event = parseWhopEvent(JSON.parse(rawBody));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "bad payload" }, 400);
  }
  if (!event) return json({ status: "ignored", reason: "unsupported event type" });

  try {
    return json(await processStorefrontEvent(event, getProcessorConfig()));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "processing failed" }, 500);
  }
}
