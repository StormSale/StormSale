import { type ClassValue, clsx } from "clsex";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue) {
  return twMerge(clsx(inputs));
}

export type ClickEvent = {
  id: string;
  countryIso: string;
  campaignId?: string | null;
  converted?: boolean | null;
  timestamp: string | Date | number;
};

export type CountryAggregate = {
  countryIso: string;
  clicks: number;
  conversions: number;
  conversionRate: number;
};

export type DateRangeFilter = {
  from?: Date | string | number | null;
  to?: Date | string | number | null;
};

export type HeatmapFilters = DateRangeFilter & {
  campaignId?: string | null;
};

function toTimestamp(value: string | Date | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeIso(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  return trimmed;
}

export function filterClickEvents(
  events: ClickEvent[],
  filters: HeatmapFilters = {},
): ClickEvent[] {
  const from = toTimestamp(filters.from);
  const to = toTimestamp(filters.to);
  const campaignId = filters.campaignId ? filters.campaignId.trim() : null;

  return events.filter((event) => {
    if (campaignId && event.campaignId !== campaignId) return false;
    const ts = toTimestamp(event.timestamp);
    if (ts === null) return false;
    if (from !== null && ts < from) return false;
    if (to !== null && ts > to) return false;
    return true;
  });
}

export function aggregateClicksByCountry(events: ClickEvent[]): CountryAggregate[] {
  const map = new Map<string, { clicks: number; conversions: number }>();

  for (const event of events) {
    const iso = normalizeIso(event.countryIso);
    if (!iso) continue;
    const entry = map.get(iso) ?? { clicks: 0, conversions: 0 };
    entry.clicks += 1;
    if (event.converted) entry.conversions += 1;
    map.set(iso, entry);
  }

  return Array.from(map.entries()).map(([countryIso, entry]) => ({
    countryIso,
    clicks: entry.clicks,
    conversions: entry.conversions,
    conversionRate: entry.clicks > 0 ? (entry.conversions / entry.clicks) * 100 : 0,
  }));
}

export function getTopCountries(
  aggregates: CountryAggregate[],
  limit = 5,
): CountryAggregate[] {
  return [...aggregates]
    .sort((a, b) => b.clicks - a.clicks || b.conversionRate - a.conversionRate || a.countryIso.localeCompare(b.countryIso))
    .slice(0, Math.max(0, limit));
}

export function getHeatmapScope(aggregates: CountryAggregate[]): { min: number; max: number } {
  if (aggregates.length === 0) return { min: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const aggregate of aggregates) {
    if (aggregate.clicks < min) min = aggregate.clicks;
    if (aggregate.clicks > max) max = aggregate.clicks;
  }
  return { min, max };
}

export function getHeatmapIntensity(clicks: number, scope: { min: number; max: number }): number {
  if (!Number.isFinite(clicks) || clicks <= 0) return 0;
  if (scope.max <= scope.min) return clicks > 0 ? 1 : 0;
  const ratio = (clicks - scope.min) / (scope.max - scope.min);
  return Math.min(1, Math.max(0, ratio));
}

export function formatPercentage(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(fractionDigits)}%`;
}
