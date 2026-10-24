/**
 * Country geometry for the click stream heatmap (issue #162).
 *
 * Clusters are placed at a country's centroid, keyed by ISO 3166-1 alpha-2
 * code, so the map never needs (or sees) anything finer than the country a
 * click came from.
 */

export interface CountryCentroid {
  name: string;
  lat: number;
  lng: number;
}

export const COUNTRY_CENTROIDS: Readonly<Record<string, CountryCentroid>> = {
  AE: { name: "United Arab Emirates", lat: 23.4245, lng: 53.8477 },
  AR: { name: "Argentina", lat: -38.4167, lng: -63.6167 },
  AU: { name: "Australia", lat: -25.2743, lng: 133.7754 },
  BR: { name: "Brazil", lat: -14.2354, lng: -51.9255 },
  CA: { name: "Canada", lat: 56.1305, lng: -106.3469 },
  CN: { name: "China", lat: 35.8617, lng: 104.1954 },
  DE: { name: "Germany", lat: 51.1656, lng: 10.4512 },
  EG: { name: "Egypt", lat: 26.8206, lng: 30.8025 },
  ES: { name: "Spain", lat: 40.4637, lng: -3.7497 },
  FR: { name: "France", lat: 46.2277, lng: 2.2136 },
  GB: { name: "United Kingdom", lat: 55.3781, lng: -3.436 },
  GH: { name: "Ghana", lat: 7.9465, lng: -1.0232 },
  ID: { name: "Indonesia", lat: -0.7893, lng: 113.9213 },
  IN: { name: "India", lat: 20.5937, lng: 78.9629 },
  IT: { name: "Italy", lat: 41.8719, lng: 12.5674 },
  JP: { name: "Japan", lat: 36.2048, lng: 138.2529 },
  KE: { name: "Kenya", lat: -0.0236, lng: 37.9062 },
  KR: { name: "South Korea", lat: 35.9078, lng: 127.7669 },
  MX: { name: "Mexico", lat: 23.6345, lng: -102.5528 },
  NG: { name: "Nigeria", lat: 9.082, lng: 8.6753 },
  NL: { name: "Netherlands", lat: 52.1326, lng: 5.2913 },
  PH: { name: "Philippines", lat: 12.8797, lng: 121.774 },
  PK: { name: "Pakistan", lat: 30.3753, lng: 69.3451 },
  PL: { name: "Poland", lat: 51.9194, lng: 19.1451 },
  RU: { name: "Russia", lat: 61.524, lng: 105.3188 },
  SA: { name: "Saudi Arabia", lat: 23.8859, lng: 45.0792 },
  SE: { name: "Sweden", lat: 60.1282, lng: 18.6435 },
  SG: { name: "Singapore", lat: 1.3521, lng: 103.8198 },
  TR: { name: "Turkey", lat: 38.9637, lng: 35.2433 },
  UA: { name: "Ukraine", lat: 48.3794, lng: 31.1656 },
  US: { name: "United States", lat: 37.0902, lng: -95.7129 },
  VN: { name: "Vietnam", lat: 14.0583, lng: 108.2772 },
  ZA: { name: "South Africa", lat: -30.5595, lng: 22.9375 },
};

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

/** Equirectangular projection from lat/lng to the map's SVG viewBox. */
export function projectToMap(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * MAP_WIDTH;
  const y = ((90 - lat) / 180) * MAP_HEIGHT;
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

/** Centroid and display name for an ISO code, or null when unknown. */
export function getCountryCentroid(iso: string): (CountryCentroid & { iso: string }) | null {
  const normalized = iso.trim().toUpperCase();
  const entry = COUNTRY_CENTROIDS[normalized];
  return entry ? { ...entry, iso: normalized } : null;
}
