export interface GeoClickPoint {
  countryIso: string;
  countryName: string;
  clicks: number;
  conversions: number;
  latitude?: number;
  longitude?: number;
}

export interface GeoFilters {
  startDate: string;
  endDate: string;
  campaignId?: string;
}

export interface CountryMetric extends GeoClickPoint {
  conversionRate: number;
}

export interface ClickStreamResponse {
  points: GeoClickPoint[];
  totalClicks: number;
  totalConversions: number;
}

export interface MapProjection {
  width: number;
  height: number;
}

export interface CountryCluster {
  countryIso: string;
  countryName: string;
  clicks: number;
  conversions: number;
  conversionRate: number;
  latitude?: number;
  longitude?: number;
  x: number;
  y: number;
  radius: number;
}
