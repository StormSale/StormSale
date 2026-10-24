import type { ClickStreamEvent } from "./clickStreamAggregation";
import { API_URL } from "../utils/api";

/**
 * Load the affiliate's click stream events. The backend contract is
 * `GET {API_URL}/affiliate/click-stream` returning `{ events: ClickStreamEvent[] }`
 * with country ISO codes only (no IP, user agent or wallet data).
 */
export async function fetchClickStreamEvents(): Promise<ClickStreamEvent[]> {
  const res = await fetch(`${API_URL}/affiliate/click-stream`);
  if (!res.ok) throw new Error(`Failed to load click stream (${res.status})`);
  const data = (await res.json()) as { events?: unknown };
  return Array.isArray(data.events) ? (data.events as ClickStreamEvent[]) : [];
}
