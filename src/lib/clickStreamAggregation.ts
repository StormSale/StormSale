/*
 * Click Stream Aggregation
 *
 * Aggregates affiliate click/conversion events by country ISO code
 * for the real-time heatmap and geolocation visualizer.
 *
 * Design principles:
 *  - No raw PII is stored. Only country ISO codes and aggregated counts are kept.
 *  - Pure functions for testability and reuse in both server and client code.
 *  - Deterministic output ordering so the SVG map can animate smoothly between
 *    date filter changes without key chaos.
 */

export type ClickEventType = "click" | "conversion";

/**
 * Minimal input shape for a click stream event.
 * Only non-PII fields are required. Additional fields are ignored.
 */
export interface ClickStreamEvent {
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "DE"). */
  countryIso: string;
  /** Event type. */
  type: ClickEventType;
  /** Event timestamp (ISO string or Date or number). */
  timestamp: string | Date | number;
  /** Optional campaign link identifier for filtering. */
  campaignLinkId?: string | null;
}

export interface DateRangeFilter {
  /** Inclusive start. */
  start?: string | Date | number | null;
  /**
   * Exclusive end. A date-only string (`YYYY-MM-DD`) includes that whole
   * UTC day, i.e. the bound becomes the start of the following day.
   */
  end?: string | Date | number | null;
}

export interface AggregationFilters {
  dateRange?: DateRangeFilter;
  /** Only include events for this campaign link. */
  campaignLinkId?: string | null;
}

export interface CountryAggregate {
  /** Uppercase ISO 3166-1 alpha-2 country code. */
  countryIso: string;
  clicks: number;
  conversions: number;
  /** Conversions / clicks * 100, rounded to 2 decimals. 0 when clicks === 0. */
  conversionRate: number;
  /** Relative intensity in [0, 1] for heatmap rendering. */
  intensity: number;
}

export interface HeatmapResult {
  /** All countries with at least one event, sorted by clicks desc. */
  countries: CountryAggregate[];
  /**
   * Top 5 countries by conversion percentage (ties broken by clicks, then
   * ISO code).
   */
  topCountries: CountryAggregate[];
  totalClicks: number;
  totalConversions: number;
  /** Maximum click count across countries (used for intensity normalization). */
  maxClicks: number;
}

const ISO_ALPHA2_RE = /^[A-Z]{2}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function toTimestamp(value: string | Date | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Exclusive upper bound; a date-only string covers its whole day. */
function toEndTimestamp(value: string | Date | number): number | null {
  const t = toTimestamp(value);
  if (t === null) return null;
  return typeof value === "string" && DATE_ONLY_RE.test(value.trim()) ? t + DAY_MS : t;
}

function normalizeIso(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const trimmed = iso.trim().toUpperCase();
  return ISO_ALPHA2_RE.test(trimmed) ? trimmed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Aggregate click stream events by country ISO code.
 *
 * - Events with invalid/missing country ISO are skipped.
 * - Events with unparseable timestamps are skipped.
 * - Date range is half-open: [start, end). A date-only `end` includes that day.
 * - Campaign filter is exact match on campaignLinkId.
 */
export function aggregateClickStreamByCountry(
  events: Iterable<ClickStreamEvent>,
  filters: AggregationFilters = {},
): HeatmapResult {
  const startRaw = filters.dateRange?.start;
  const endRaw = filters.dateRange?.end;
  const start = startRaw != null ? toTimestamp(startRaw) : null;
  const end = endRaw != null ? toEndTimestamp(endRaw) : null;
  const campaignFilter = filters.campaignLinkId ?? null;

  const buckets = new Map<string, { clicks: number; conversions: number }>();

  for (const event of events) {
    if (!event || typeof event !== "object") continue;

    const iso = normalizeIso(event.countryIso);
    if (!iso) continue;

    if (event.type !== "click" && event.type !== "conversion") continue;

    if (campaignFilter !== null) {
      if ((event.campaignLinkId ?? null) !== campaignFilter) continue;
    }

    const ts = toTimestamp(event.timestamp);
    if (ts === null) continue;
    if (start !== null && ts < start) continue;
    if (end !== null && ts >= end) continue;

    const bucket = buckets.get(iso) ?? { clicks: 0, conversions: 0 };
    if (event.type === "click") bucket.clicks += 1;
    else bucket.conversions += 1;
    buckets.set(iso, bucket);
  }

  let maxClicks = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  for (const bucket of buckets.values()) {
    if (bucket.clicks > maxClicks) maxClicks = bucket.clicks;
    totalClicks += bucket.clicks;
    totalConversions += bucket.conversions;
  }

  const countries: CountryAggregate[] = [];
  for (const [iso, bucket] of buckets) {
    if (bucket.clicks === 0 && bucket.conversions === 0) continue;
    const conversionRate =
      bucket.clicks === 0 ? 0 : round2((bucket.conversions / bucket.clicks) * 100);
    const intensity = maxClicks === 0 ? 0 : bucket.clicks / maxClicks;
    countries.push({
      countryIso: iso,
      clicks: bucket.clicks,
      conversions: bucket.conversions,
      conversionRate,
      intensity,
    });
  }

  countries.sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    if (b.conversions !== a.conversions) return b.conversions - a.conversions;
    return a.countryIso.localeCompare(b.countryIso);
  });

  const topCountries = [...countries]
    .sort(
      (a, b) =>
        b.conversionRate - a.conversionRate ||
        b.clicks - a.clicks ||
        a.countryIso.localeCompare(b.countryIso),
    )
    .slice(0, 5);

  return {
    countries,
    topCountries,
    totalClicks,
    totalConversions,
    maxClicks,
  };
}

/**
 * Build a lookup map from country ISO to aggregate for O(1) SVG rendering.
 */
export function toCountryLookup(
  countries: ReadonlyArray<CountryAggregate>,
): Map<string, CountryAggregate> {
  const map = new Map<string, CountryAggregate>();
  for (const c of countries) map.set(c.countryIso, c);
  return map;
}

/**
 * Compute a stable key for a country aggregate so the SVG layer can animate
 * changes between date filters without remounting elements.
 */
export function countryAnimationKey(c: CountryAggregate): string {
  return `${c.countryIso}:${c.clicks}:${c.conversions}`;
}
