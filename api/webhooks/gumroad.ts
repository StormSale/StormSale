import { constantTimeCompare } from "../../src/lib/webhookSecurity";
import { parseGumroadPing } from "../../src/lib/storefront/gumroad";
import { processStorefrontEvent } from "../../src/lib/storefront/processor";
import { getProcessorConfig, json } from "../_lib/runtime";

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.GUMROAD_WEBHOOK_SECRET;
  if (!expected) return json({ error: "GUMROAD_WEBHOOK_SECRET is not configured" }, 500);

  // Gumroad pings are not signed, so the secret travels in the URL: ...?secret=XXXX
  const provided = new URL(request.url).searchParams.get("secret") ?? "";
  if (!constantTimeCompare(provided, expected)) return json({ error: "unauthorized" }, 401);

  let event;
  try {
    const form = Object.fromEntries(new URLSearchParams(await request.text()));
    event = parseGumroadPing(form);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "bad payload" }, 400);
  }

  try {
    return json(await processStorefrontEvent(event, getProcessorConfig()));
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "processing failed" }, 500);
  }
}
