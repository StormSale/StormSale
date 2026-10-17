import { API_URL } from "../utils/api";
import type {
  ClickStreamResponse,
  CountryMetric,
  GeoClickPoint,
  GeoFilters,
} from "../types/geo";

/**
 * Country centroid coordinates (lat, lng) keyed by ISO 3166-1 alpha-2 code.
 * Used to place heat clusters on the SVG world map without storing raw PII.
 */
export const COUNTRY_CENTROIDS: Record<string, { name: string; lat: number; lng: number }> = {
  US: { name: "United States", lat: 37.0905, lng: -95.7129 },
  CA: { name: "Canada", lat: 56.1305, lng: -106.3469 },
  GB: { name: "United Kingdom", lat: 55.3781, lng: -3.436 },
  DE: { name: "Germany", lat: 51.1656, lng: 10.4512 },
  FR: { name: "France", lat: 46.2277, lng: 2.2136 },
  NG: { name: "Nigeria", lat: 9.082, lng: 8.6752 },
  IN: { name: "India", lat: 20.5937, lng: 78.9629 },
  BR: { name: "Brazil", lat: -14.2354, lng: -51.9255 },
  AU: { name: "Australia", lat: -25.2743, lng: 133.7754 },
  JP: { name: "Japan", lat: 36.2048, lng: 138.2529 },
  ZA: { name: "South Africa", lat: -30.5596, lng: 22.9378 },
  MX: { name: "Mexico", lat: 23.6345, lng: -102.5527 },
  ES: { name: "Spain", lat: 40.4637, lng: -3.7497 },
  IT: { name: "Italy", lat: 41.8717, lng: 12.5676 },
  NL: { name: "Netherlands", lat: 52.1325, lng: 5.2915 },
  SG: { name: "Singapore", lat: 1.3521, lng: 103.8198 },
  AE: { name: "United Arab Emirates", lat: 23.4245, lng: 53.8477 },
  PH: { name: "Philippines", lat: 12.8797, lng: 121.774 },
  KE: { name: "Kenya", lat: -0.0236, lng: 37.9064 },
  AR: { name: "Argentina", lat: -38.4167, lng: -63.6167 },
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 500;

/**
 * Equirectangular projection from lat/lng to SVG viewBox coordinates.
 */
export const projectToMap = (lat: number, lng: number) => {
  const x = ((lng + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x: Number(x) || 0, y: Number(y) || 0 };
};

export const getCountryCoords = (iso: string) => {
  const normalized = iso.toUpperCase();
  const entry = COUNTRY_CENTROIDS[normalized];
  if (!entry) return null;
  return { ...entry, iso: normalized };
};

/**
 * Aggregate raw click records by country ISO code. Raw records are never
 * persisted or exposed - only aggregate counts are returned.
 */
export const aggregateByCountry = (
  records: Array<{ countryIso: string; converted?: boolean }>,
): GeoClickPoint[] => {
  const buckets = new Map<string, GeoClickPoint>();

  for (const record of records) {
    const iso = (record.countryIso || "").toUpperCase();
    if (!iso) continue;
    const coords = getCountryCoords(iso);
    if (!coords) continue;

    const existing = buckets.get(iso);
    if (existing) {
      existing.clicks += 1;
      if (record.converted) existing.conversions += 1;
    } else {
      buckets.set(iso, {
        countryIso: iso,
        countryName: coords.name,
        clicks: 1,
        conversions: record.converted ? 1 : 0,
        latitude: coords.lat,
        longitude: coords.lng,
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => b.clicks - a.clicks);
};

/**
 * Rank countries by clicks and attach conversion rate metrics.
 */
export const rankCountries = (points: GeoClickPoint[], limit = 5): CountryMetric[] => {
  return [...points]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      conversionRate: p.clicks > 0 ? (p.conversions / p.clicks) * 100 : 0,
    }));
};

/**
 * Fetch the aggregated click stream for the given filters. The backend
 * returns country-level aggregates only (no raw PII).
 */
export const fetchClickStream = async (
  filters: GeoFilters,
): Promise<ClickStreamResponse> => {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("startDate", filters.startDate);
  if (filters.endDate) params.set("endDate", filters.endDate);
  if (filters.campaignId) params.set("campaignId", filters.campaignId);

  const res = await fetch(`${API_URL}/affiliate/click-stream?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch click stream: ${res.status}`);
  }

  const data = (await res.json()) as ClickStreamResponse;
  const points = Array.isArray(data.points) ? data.points : [];
  const normalized: GeoClickPoint[] = points.map((p) => {
    const coords = getCountryCoords(p.countryIso);
    return {
      countryIso: p.countryIso.toUpperCase(),
      countryName: p.countryName || coords?.name || p.countryIso,
      clicks: Number(p.clicks) || 0,
      conversions: Number(p.conversions) || 0,
      latitude: p.latitude ?? coords?.lat ?? 0,
      longitude: p.longitude ?? coords?.lng ?? 0,
    };
  });

  return {
    points: normalized,
    totalClicks: data.totalClicks ?? normalized.reduce((s, p) => s + p.clicks, 0),
    totalConversions:
      data.totalConversions ?? normalized.reduce((s, p) => s + p.conversions, 0),
  };
};
