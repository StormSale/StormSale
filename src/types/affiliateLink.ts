export interface CustomShortLink {
  id: string;
  slug: string;
  affiliateWallet: string;
  walletFingerprint: string;
  campaignId: string;
  campaignName: string;
  destinationUrl: string;
  trackingParams: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  clickCount: number;
  lastClickedAt?: string;
}

export interface SlugAvailabilityResult {
  slug: string;
  normalizedSlug: string;
  isAvailable: boolean;
  reason?: string;
}

export interface CreateShortLinkInput {
  slug: string;
  affiliateWallet: string;
  campaignId: string;
  campaignName?: string;
  destinationUrl: string;
  customUtmCampaign?: string;
  extraTrackingParams?: Record<string, string>;
}

export interface ShortLinkRedirectResult {
  slug: string;
  targetUrl: string;
  affiliateWallet: string;
  walletFingerprint: string;
  campaignId: string;
  trackingHeaders: Record<string, string>;
  trackingParams: Record<string, string>;
  clickCount: number;
}
