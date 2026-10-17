export type AssetCategory = "banner" | "logo" | "swipe_copy" | "bundle" | "badge" | "other";

export type AssetFileFormat = "png" | "jpeg" | "jpg" | "svg" | "zip" | "txt" | "md";

export type PinProvider = "pinata" | "web3.storage" | "ipfs-direct" | "simulated";

export interface AssetDimensions {
  width: number;
  height: number;
  aspectRatioLabel?: string; // e.g. "728x90 (Leaderboard)", "300x250 (Medium Rectangle)", "1200x630 (Social)"
}

export interface SwipeCopyData {
  headline: string;
  bodyCopy: string;
  callToAction: string;
  targetAudience?: string;
  recommendedChannels?: string[];
}

export interface AssetEmbedCodes {
  html: string;
  markdown: string;
  react: string;
  bbcode: string;
  directUrl: string;
  ipfsUri: string;
}

export interface PromotionAsset {
  id: string;
  campaignId: string;
  campaignName: string;
  name: string;
  title: string;
  description?: string;
  category: AssetCategory;
  fileFormat: AssetFileFormat;
  mimeType: string;
  sizeBytes: number;
  formattedSize: string;
  dimensions?: AssetDimensions;
  cid: string; // Persistent IPFS CID (e.g. bafybeic...)
  ipfsUri: string; // ipfs://<cid>
  gatewayUrl: string; // e.g. https://gateway.pinata.cloud/ipfs/<cid>
  pinProvider: PinProvider;
  pinnedAt: string;
  checksumSha256: string;
  contentDataUrl?: string; // Data URL or text content for in-memory preview & zip creation
  textContent?: string; // For text/swipe copy assets
  swipeCopy?: SwipeCopyData;
  embedCodes: AssetEmbedCodes;
  downloadCount: number;
}

export interface IpfsUploadOptions {
  campaignId: string;
  campaignName: string;
  category?: AssetCategory;
  title?: string;
  description?: string;
  provider?: PinProvider;
  pinataJwt?: string;
  pinataApiKey?: string;
  pinataSecretApiKey?: string;
  web3StorageToken?: string;
  swipeCopy?: SwipeCopyData;
}

export interface IpfsUploadResult {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  provider: PinProvider;
  checksumSha256: string;
  sizeBytes: number;
  dimensions?: AssetDimensions;
  pinnedAt: string;
}

export interface IpfsProviderConfig {
  activeProvider: PinProvider;
  pinataJwt?: string;
  pinataApiKey?: string;
  pinataSecretApiKey?: string;
  web3StorageToken?: string;
  customGatewayUrl?: string;
}

export interface AssetFilterState {
  searchQuery: string;
  selectedCampaign: string;
  selectedCategory: string;
  selectedFormat: string;
  sortBy: "newest" | "oldest" | "name" | "size" | "downloads";
}
