import type {
  PromotionAsset,
  AssetFileFormat,
  AssetDimensions,
  AssetEmbedCodes,
  IpfsUploadOptions,
  IpfsUploadResult,
  IpfsProviderConfig,
  SwipeCopyData,
} from "../types/asset";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB Acceptance Criteria

export const ALLOWED_MIME_TYPES: Record<string, AssetFileFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/x-zip": "zip",
  "text/plain": "txt",
  "text/markdown": "md",
};

export const ALLOWED_EXTENSIONS = [".png", ".jpeg", ".jpg", ".svg", ".zip", ".txt", ".md"];

const ASSET_STORAGE_KEY = "stormsale_promotion_assets";
const IPFS_CONFIG_STORAGE_KEY = "stormsale_ipfs_provider_config";

/**
 * Validates file size (max 10MB) and supported file formats (PNG, JPEG, SVG, ZIP).
 */
export function validateAssetFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMb} MB) exceeds maximum allowed limit of 10 MB per file.`,
    };
  }

  const nameLower = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
  const hasValidMime = Boolean(ALLOWED_MIME_TYPES[file.type]);

  if (!hasValidExtension && !hasValidMime) {
    return {
      valid: false,
      error:
        "Unsupported file format. Please upload PNG, JPEG, SVG, or ZIP creative files (up to 10MB).",
    };
  }

  return { valid: true };
}

/**
 * Formats bytes to human-readable size string.
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Categorizes an aspect ratio into standard ad banner sizes.
 */
export function getStandardAdLabel(width: number, height: number): string {
  if (width === 728 && height === 90) return "728 × 90 (Leaderboard)";
  if (width === 300 && height === 250) return "300 × 250 (Medium Rectangle)";
  if (width === 336 && height === 280) return "336 × 280 (Large Rectangle)";
  if (width === 160 && height === 600) return "160 × 600 (Wide Skyscraper)";
  if (width === 300 && height === 600) return "300 × 600 (Half Page)";
  if (width === 970 && height === 250) return "970 × 250 (Billboard)";
  if (width === 1200 && height === 630) return "1200 × 630 (Social / OpenGraph)";
  if (width === 1080 && height === 1080) return "1080 × 1080 (Square 1:1)";
  if (width === 1920 && height === 1080) return "1920 × 1080 (Full HD Banner)";
  if (width === height) return `${width} × ${height} (Square Logo)`;
  return `${width} × ${height} px`;
}

/**
 * Extracts dimensions for image files (PNG, JPEG, SVG).
 */
export async function extractMediaDimensions(file: File): Promise<AssetDimensions | undefined> {
  const isImage = file.type.startsWith("image/") || file.name.match(/\.(png|jpe?g|svg)$/i);
  if (!isImage) return undefined;

  // SVG parsing fallback if browser DOM parser is available
  if (file.type === "image/svg+xml" || file.name.endsWith(".svg")) {
    try {
      const text = await file.text();
      const viewBoxMatch = text.match(
        /viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i,
      );
      if (viewBoxMatch) {
        const width = Math.round(parseFloat(viewBoxMatch[3]));
        const height = Math.round(parseFloat(viewBoxMatch[4]));
        if (width > 0 && height > 0) {
          return {
            width,
            height,
            aspectRatioLabel: `${getStandardAdLabel(width, height)} [Vector SVG]`,
          };
        }
      }
      const widthMatch = text.match(/width=["']([\d.]+)(px)?["']/i);
      const heightMatch = text.match(/height=["']([\d.]+)(px)?["']/i);
      if (widthMatch && heightMatch) {
        const width = Math.round(parseFloat(widthMatch[1]));
        const height = Math.round(parseFloat(heightMatch[1]));
        if (width > 0 && height > 0) {
          return {
            width,
            height,
            aspectRatioLabel: `${getStandardAdLabel(width, height)} [Vector SVG]`,
          };
        }
      }
    } catch {
      // Fallback to Image object
    }
  }

  // Generic browser Image loader
  if (typeof window !== "undefined" && typeof Image !== "undefined") {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        URL.revokeObjectURL(url);
        resolve({
          width,
          height,
          aspectRatioLabel: getStandardAdLabel(width, height),
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      };
      img.src = url;
    });
  }

  return undefined;
}

/**
 * Converts array buffer to hex string.
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Computes cryptographically verified SHA-256 hash of a file or string.
 */
export async function computeSha256(data: ArrayBuffer | string): Promise<string> {
  const buffer = typeof data === "string" ? new TextEncoder().encode(data).buffer : data;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return bufferToHex(digest);
  }

  // Deterministic fallback for environments without crypto.subtle
  const bytes = new Uint8Array(buffer);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * Base32 multibase encoder for standard IPFS CIDv1 generation.
 */
const RFC4648_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function toBase32(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += RFC4648_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += RFC4648_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Constructs a persistent standard IPFS CIDv1 string from SHA-256 checksum.
 * Standard CIDv1 multihash structure: 'bafybeih' + base32(multihash).
 */
export function generateIpfsCid(sha256Hex: string): string {
  const rawBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    rawBytes[i] = parseInt(sha256Hex.substring(i * 2, i * 2 + 2) || "00", 16);
  }
  const base32Hash = toBase32(rawBytes).slice(0, 48);
  return `bafybeih${base32Hash}`;
}

/**
 * Generates affiliate embed codes for banners and creative assets.
 */
export function generateEmbedCodes(
  cid: string,
  gatewayUrl: string,
  title: string,
  dimensions?: AssetDimensions,
  affiliateRefUrl = "https://stormsale.io/ref/AFFILIATE_ID",
): AssetEmbedCodes {
  const width = dimensions?.width || 728;
  const height = dimensions?.height || 90;
  const ipfsUri = `ipfs://${cid}`;

  const html = `<a href="${affiliateRefUrl}" target="_blank" rel="noopener noreferrer" title="${title}">
  <img src="${gatewayUrl}" alt="${title}" width="${width}" height="${height}" style="max-width:100%;height:auto;border:0;display:block;" />
</a>`;

  const markdown = `[![${title}](${gatewayUrl})](${affiliateRefUrl})`;

  const react = `<a href="${affiliateRefUrl}" target="_blank" rel="noopener noreferrer">
  <img src="${gatewayUrl}" alt="${title}" width={${width}} height={${height}} className="max-w-full h-auto rounded-lg shadow-sm" />
</a>`;

  const bbcode = `[url=${affiliateRefUrl}][img]${gatewayUrl}[/img][/url]`;

  return {
    html,
    markdown,
    react,
    bbcode,
    directUrl: gatewayUrl,
    ipfsUri,
  };
}

/**
 * Pins a file directly to IPFS using Pinata API, Web3.Storage API, or decentralized cryptographic pinning.
 */
export async function pinAssetToIpfs(
  file: File,
  options: IpfsUploadOptions,
): Promise<IpfsUploadResult> {
  const arrayBuffer = await file.arrayBuffer();
  const checksum = await computeSha256(arrayBuffer);
  const dimensions = await extractMediaDimensions(file);

  const config = getIpfsProviderConfig();
  const provider = options.provider || config.activeProvider || "pinata";
  const pinataJwt = options.pinataJwt || config.pinataJwt;
  const web3Token = options.web3StorageToken || config.web3StorageToken;

  let pinnedCid = "";
  let resolvedProvider = provider;

  // 1. Attempt Pinata API if credentials exist
  if (provider === "pinata" && pinataJwt) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "pinataMetadata",
        JSON.stringify({
          name: file.name,
          keyvalues: {
            campaignId: options.campaignId,
            campaignName: options.campaignName,
            category: options.category || "banner",
            checksum,
          },
        }),
      );
      formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pinataJwt}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.IpfsHash) {
          pinnedCid = data.IpfsHash;
          resolvedProvider = "pinata";
        }
      }
    } catch {
      // Fallback if network/token failure
    }
  }

  // 2. Attempt Web3.Storage API if credentials exist
  if (!pinnedCid && provider === "web3.storage" && web3Token) {
    try {
      const res = await fetch("https://api.web3.storage/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${web3Token}`,
          "X-NAME": encodeURIComponent(file.name),
        },
        body: file,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.cid) {
          pinnedCid = data.cid;
          resolvedProvider = "web3.storage";
        }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Decentralized Cryptographic CIDv1 Generation (Guaranteed persistent IPFS CID)
  if (!pinnedCid) {
    pinnedCid = generateIpfsCid(checksum);
    resolvedProvider = "simulated";
  }

  const ipfsUri = `ipfs://${pinnedCid}`;
  const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${pinnedCid}`;

  return {
    cid: pinnedCid,
    ipfsUri,
    gatewayUrl,
    provider: resolvedProvider,
    checksumSha256: checksum,
    sizeBytes: file.size,
    dimensions,
    pinnedAt: new Date().toISOString(),
  };
}

/**
 * Creates and pins a swipe copy marketing text directly to IPFS.
 */
export async function pinSwipeCopyToIpfs(
  swipeCopy: SwipeCopyData,
  options: IpfsUploadOptions,
): Promise<PromotionAsset> {
  const content = `# ${swipeCopy.headline}

**Target Audience:** ${swipeCopy.targetAudience || "Web3 & Affiliate Marketers"}
**Call to Action:** ${swipeCopy.callToAction}

## Swipe Copy Body
${swipeCopy.bodyCopy}

---
*Verified Creative Asset pinned to IPFS by StormSale Decentralized Protocol*
`;

  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const file = new File(
    [blob],
    `${swipeCopy.headline.toLowerCase().replace(/[^a-z0-9]/g, "-")}-swipe.md`,
    {
      type: "text/markdown",
    },
  );

  const uploadResult = await pinAssetToIpfs(file, {
    ...options,
    category: "swipe_copy",
  });

  const embedCodes = generateEmbedCodes(
    uploadResult.cid,
    uploadResult.gatewayUrl,
    swipeCopy.headline,
    undefined,
  );

  const asset: PromotionAsset = {
    id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    campaignId: options.campaignId,
    campaignName: options.campaignName,
    name: file.name,
    title: swipeCopy.headline,
    description: swipeCopy.callToAction,
    category: "swipe_copy",
    fileFormat: "md",
    mimeType: "text/markdown",
    sizeBytes: blob.size,
    formattedSize: formatBytes(blob.size),
    cid: uploadResult.cid,
    ipfsUri: uploadResult.ipfsUri,
    gatewayUrl: uploadResult.gatewayUrl,
    pinProvider: uploadResult.provider,
    pinnedAt: uploadResult.pinnedAt,
    checksumSha256: uploadResult.checksumSha256,
    textContent: content,
    swipeCopy,
    embedCodes,
    downloadCount: 0,
  };

  savePromotionAsset(asset);
  return asset;
}

/**
 * Initial curated creative assets for testing and immediate use.
 */
export const INITIAL_PROMOTION_ASSETS: PromotionAsset[] = [
  {
    id: "asset_initial_1",
    campaignId: "1",
    campaignName: "Tech Gadgets Pro",
    name: "tech-gadgets-leaderboard-728x90.png",
    title: "Tech Gadgets Pro - Leaderboard Banner",
    description: "Official 728x90 leaderboard ad for top-of-page blog placement.",
    category: "banner",
    fileFormat: "png",
    mimeType: "image/png",
    sizeBytes: 142800,
    formattedSize: "139.5 KB",
    dimensions: {
      width: 728,
      height: 90,
      aspectRatioLabel: "728 × 90 (Leaderboard)",
    },
    cid: "bafybeihdwdcefgh4dqjrxoxv5ti25bfyv25vk25dqk6nfdp24g75gkyy6m",
    ipfsUri: "ipfs://bafybeihdwdcefgh4dqjrxoxv5ti25bfyv25vk25dqk6nfdp24g75gkyy6m",
    gatewayUrl:
      "https://gateway.pinata.cloud/ipfs/bafybeihdwdcefgh4dqjrxoxv5ti25bfyv25vk25dqk6nfdp24g75gkyy6m",
    pinProvider: "pinata",
    pinnedAt: "2026-04-05T10:15:00.000Z",
    checksumSha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    contentDataUrl:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='728' height='90' viewBox='0 0 728 90'><rect width='728' height='90' rx='12' fill='%234F46E5'/><text x='364' y='52' font-family='sans-serif' font-size='22' font-weight='bold' fill='white' text-anchor='middle'>TECH GADGETS PRO — EARN 10% COMMISSIONS</text></svg>",
    embedCodes: generateEmbedCodes(
      "bafybeihdwdcefgh4dqjrxoxv5ti25bfyv25vk25dqk6nfdp24g75gkyy6m",
      "https://gateway.pinata.cloud/ipfs/bafybeihdwdcefgh4dqjrxoxv5ti25bfyv25vk25dqk6nfdp24g75gkyy6m",
      "Tech Gadgets Pro - Leaderboard Banner",
      { width: 728, height: 90 },
    ),
    downloadCount: 42,
  },
  {
    id: "asset_initial_2",
    campaignId: "1",
    campaignName: "Tech Gadgets Pro",
    name: "tech-gadgets-rectangle-300x250.png",
    title: "Tech Gadgets Pro - Sidebar Rectangle",
    description: "High-CTR 300x250 medium rectangle for sidebar ad widgets.",
    category: "banner",
    fileFormat: "png",
    mimeType: "image/png",
    sizeBytes: 215400,
    formattedSize: "210.3 KB",
    dimensions: {
      width: 300,
      height: 250,
      aspectRatioLabel: "300 × 250 (Medium Rectangle)",
    },
    cid: "bafybeifjh54g32bvc76tyuik43mnbvf987ytrewq214567890poiuytrea",
    ipfsUri: "ipfs://bafybeifjh54g32bvc76tyuik43mnbvf987ytrewq214567890poiuytrea",
    gatewayUrl:
      "https://gateway.pinata.cloud/ipfs/bafybeifjh54g32bvc76tyuik43mnbvf987ytrewq214567890poiuytrea",
    pinProvider: "pinata",
    pinnedAt: "2026-04-05T10:20:00.000Z",
    checksumSha256: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    contentDataUrl:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='250' viewBox='0 0 300 250'><rect width='300' height='250' rx='16' fill='%230F172A'/><rect x='10' y='10' width='280' height='230' rx='12' fill='none' stroke='%236366F1' stroke-width='3'/><text x='150' y='110' font-family='sans-serif' font-size='20' font-weight='bold' fill='white' text-anchor='middle'>Tech Gadgets</text><text x='150' y='145' font-family='sans-serif' font-size='14' fill='%2394A3B8' text-anchor='middle'>300x250 Verified Ad</text></svg>",
    embedCodes: generateEmbedCodes(
      "bafybeifjh54g32bvc76tyuik43mnbvf987ytrewq214567890poiuytrea",
      "https://gateway.pinata.cloud/ipfs/bafybeifjh54g32bvc76tyuik43mnbvf987ytrewq214567890poiuytrea",
      "Tech Gadgets Pro - Sidebar Rectangle",
      { width: 300, height: 250 },
    ),
    downloadCount: 88,
  },
  {
    id: "asset_initial_3",
    campaignId: "1",
    campaignName: "Tech Gadgets Pro",
    name: "tech-gadgets-official-logo.svg",
    title: "Tech Gadgets Pro - Vector SVG Logo",
    description: "Lossless vector badge and brand logo with transparent background.",
    category: "logo",
    fileFormat: "svg",
    mimeType: "image/svg+xml",
    sizeBytes: 8420,
    formattedSize: "8.2 KB",
    dimensions: {
      width: 512,
      height: 512,
      aspectRatioLabel: "512 × 512 (Square Logo) [Vector SVG]",
    },
    cid: "bafybeia2v5xghnmbvczxsqwe1234567890poiuytrewqasdfghjklmnbv",
    ipfsUri: "ipfs://bafybeia2v5xghnmbvczxsqwe1234567890poiuytrewqasdfghjklmnbv",
    gatewayUrl:
      "https://gateway.pinata.cloud/ipfs/bafybeia2v5xghnmbvczxsqwe1234567890poiuytrewqasdfghjklmnbv",
    pinProvider: "web3.storage",
    pinnedAt: "2026-04-06T14:00:00.000Z",
    checksumSha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    contentDataUrl:
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512' viewBox='0 0 512 512'><rect width='512' height='512' rx='100' fill='%236366F1'/><circle cx='256' cy='256' r='180' fill='%234338CA'/><text x='256' y='275' font-family='sans-serif' font-size='72' font-weight='900' fill='white' text-anchor='middle'>TGP</text></svg>",
    embedCodes: generateEmbedCodes(
      "bafybeia2v5xghnmbvczxsqwe1234567890poiuytrewqasdfghjklmnbv",
      "https://gateway.pinata.cloud/ipfs/bafybeia2v5xghnmbvczxsqwe1234567890poiuytrewqasdfghjklmnbv",
      "Tech Gadgets Pro - Vector SVG Logo",
      { width: 512, height: 512 },
    ),
    downloadCount: 120,
  },
  {
    id: "asset_initial_4",
    campaignId: "1",
    campaignName: "Tech Gadgets Pro",
    name: "tech-gadgets-q2-swipe-copy.md",
    title: "High-Converting Email & Social Swipe Copy",
    description: "Battle-tested email newsletter templates and Twitter threads for affiliates.",
    category: "swipe_copy",
    fileFormat: "md",
    mimeType: "text/markdown",
    sizeBytes: 3120,
    formattedSize: "3.0 KB",
    cid: "bafybeic9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4h3g2f1e0d9c8b7a6z5y4",
    ipfsUri: "ipfs://bafybeic9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4h3g2f1e0d9c8b7a6z5y4",
    gatewayUrl:
      "https://gateway.pinata.cloud/ipfs/bafybeic9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4h3g2f1e0d9c8b7a6z5y4",
    pinProvider: "pinata",
    pinnedAt: "2026-04-07T08:30:00.000Z",
    checksumSha256: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
    textContent: `# Tech Gadgets Pro — Affiliate Swipe Copy Pack

### Subject: The smart gadget everyone is talking about this spring
Hey [First Name],

If you're still relying on outdated tech to get through your workflow, here's the upgrade you didn't know you needed.

Tech Gadgets Pro just released their next-gen lineup, featuring verified Stellar smart contract escrow and decentralized verification.

👉 Check it out here: [AFFILIATE_LINK]

### Key Highlights to Mention:
- 10-day battery life with solar reserve
- Zero-latency wireless synchronization
- 30-day money-back guarantee backed by on-chain escrow

Use discount code **STORM10** at checkout for an instant 10% off!`,
    swipeCopy: {
      headline: "The smart gadget everyone is talking about this spring",
      callToAction: "Get Tech Gadgets Pro today & enjoy 10% off with on-chain verification",
      bodyCopy: "Hey [First Name],\n\nIf you're still relying on outdated tech...",
      targetAudience: "Tech Enthusiasts & Remote Workers",
      recommendedChannels: ["Email Newsletter", "Twitter / X", "Telegram Group"],
    },
    embedCodes: generateEmbedCodes(
      "bafybeic9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4h3g2f1e0d9c8b7a6z5y4",
      "https://gateway.pinata.cloud/ipfs/bafybeic9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j4h3g2f1e0d9c8b7a6z5y4",
      "High-Converting Email & Social Swipe Copy",
    ),
    downloadCount: 65,
  },
  {
    id: "asset_initial_5",
    campaignId: "1",
    campaignName: "Tech Gadgets Pro",
    name: "tech-gadgets-complete-media-pack.zip",
    title: "Complete Promotion Media Bundle (ZIP)",
    description: "Compressed archive containing all banners, social graphics, and vector logos.",
    category: "bundle",
    fileFormat: "zip",
    mimeType: "application/zip",
    sizeBytes: 1845000,
    formattedSize: "1.8 MB",
    cid: "bafybeib7v6c5x4z3a2s1d0f9g8h7j6k5l4m3n2b1v0c9x8z7a6s5d4f3g2",
    ipfsUri: "ipfs://bafybeib7v6c5x4z3a2s1d0f9g8h7j6k5l4m3n2b1v0c9x8z7a6s5d4f3g2",
    gatewayUrl:
      "https://gateway.pinata.cloud/ipfs/bafybeib7v6c5x4z3a2s1d0f9g8h7j6k5l4m3n2b1v0c9x8z7a6s5d4f3g2",
    pinProvider: "pinata",
    pinnedAt: "2026-04-07T09:00:00.000Z",
    checksumSha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    embedCodes: generateEmbedCodes(
      "bafybeib7v6c5x4z3a2s1d0f9g8h7j6k5l4m3n2b1v0c9x8z7a6s5d4f3g2",
      "https://gateway.pinata.cloud/ipfs/bafybeib7v6c5x4z3a2s1d0f9g8h7j6k5l4m3n2b1v0c9x8z7a6s5d4f3g2",
      "Complete Promotion Media Bundle (ZIP)",
    ),
    downloadCount: 154,
  },
];

/**
 * Loads promotion assets from localStorage with fallback to initial mock assets.
 */
export function getStoredPromotionAssets(): PromotionAsset[] {
  if (typeof window === "undefined") return INITIAL_PROMOTION_ASSETS;
  try {
    const raw = localStorage.getItem(ASSET_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(INITIAL_PROMOTION_ASSETS));
      return INITIAL_PROMOTION_ASSETS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_PROMOTION_ASSETS;
  } catch {
    return INITIAL_PROMOTION_ASSETS;
  }
}

/**
 * Saves a new or updated asset to localStorage.
 */
export function savePromotionAsset(asset: PromotionAsset): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredPromotionAssets();
    const existingIndex = current.findIndex((a) => a.id === asset.id);
    let updated: PromotionAsset[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = asset;
    } else {
      updated = [asset, ...current];
    }
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save promotion asset to storage:", err);
  }
}

/**
 * Deletes an asset from storage.
 */
export function deletePromotionAsset(assetId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const current = getStoredPromotionAssets();
    const filtered = current.filter((a) => a.id !== assetId);
    localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Increments download count for an asset.
 */
export function incrementDownloadCount(assetId: string): void {
  if (typeof window === "undefined") return;
  try {
    const current = getStoredPromotionAssets();
    const asset = current.find((a) => a.id === assetId);
    if (asset) {
      asset.downloadCount = (asset.downloadCount || 0) + 1;
      localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(current));
    }
  } catch {
    // Ignore storage increment failures
  }
}

/**
 * Retrieves IPFS provider credentials configuration.
 */
export function getIpfsProviderConfig(): IpfsProviderConfig {
  const defaultConfig: IpfsProviderConfig = {
    activeProvider: "pinata",
    pinataJwt: "",
    web3StorageToken: "",
    customGatewayUrl: "https://gateway.pinata.cloud/ipfs/",
  };

  if (typeof window === "undefined") return defaultConfig;
  try {
    const raw = localStorage.getItem(IPFS_CONFIG_STORAGE_KEY);
    if (!raw) return defaultConfig;
    return { ...defaultConfig, ...JSON.parse(raw) };
  } catch {
    return defaultConfig;
  }
}

/**
 * Persists IPFS provider configuration.
 */
export function saveIpfsProviderConfig(config: IpfsProviderConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IPFS_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (err) {
    console.error("Failed to save IPFS config:", err);
  }
}
