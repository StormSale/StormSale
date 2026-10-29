import type { ClickStreamEvent } from "./clickStreamAggregation";

/**
 * Same-origin Vercel Serverless Function that serves the click stream
 * (api/affiliate/click-stream.ts), alongside the /api/custom-links/* functions
 * that record each click when a short link resolves.
 */
export const CLICK_STREAM_API = "/api/affiliate/click-stream";

/**
 * Keep only the country-level fields of a raw event, or drop it when it is
 * malformed. Anything else the backend sends (IP, user agent, wallet) is
 * discarded so it never reaches component state.
 */
export function normalizeClickStreamEvent(raw: unknown): ClickStreamEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const { countryIso, type, timestamp, campaignLinkId } = raw as Record<string, unknown>;
  if (typeof countryIso !== "string" || !countryIso.trim()) return null;
  if (type !== "click" && type !== "conversion") return null;
  if (typeof timestamp !== "string" && typeof timestamp !== "number") return null;
  const event: ClickStreamEvent = { countryIso, type, timestamp };
  if (typeof campaignLinkId === "string" && campaignLinkId) event.campaignLinkId = campaignLinkId;
  return event;
}

/** The backend's `{ error }` message, if the error body carries one. */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    return body && typeof body.error === "string" && body.error ? `: ${body.error}` : "";
  } catch {
    return "";
  }
}

/**
 * Load the click stream events for an affiliate wallet's custom short links.
 * The backend contract is `GET /api/affiliate/click-stream?wallet=G...`
 * returning `{ events: ClickStreamEvent[] }` with country ISO codes only (no
 * IP, user agent or wallet data). Date-range and campaign-link filtering
 * happen client-side in the heatmap so filter changes animate without a
 * network round trip; the endpoint also accepts `from`, `to` and
 * `campaignLinkId` for other callers.
 */
export async function fetchClickStreamEvents(wallet: string): Promise<ClickStreamEvent[]> {
  const trimmed = wallet.trim();
  if (!trimmed) throw new Error("Connect a wallet to load the click stream.");
  const res = await fetch(`${CLICK_STREAM_API}?wallet=${encodeURIComponent(trimmed)}`);
  if (!res.ok) {
    throw new Error(`Failed to load click stream (${res.status})${await errorDetail(res)}`);
  }
  const data = (await res.json()) as { events?: unknown };
  if (!Array.isArray(data.events)) return [];
  return data.events
    .map(normalizeClickStreamEvent)
    .filter((e): e is ClickStreamEvent => e !== null);
}
