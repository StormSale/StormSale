import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateAssetFile,
  computeSha256,
  generateIpfsCid,
  generateEmbedCodes,
  getStandardAdLabel,
  extractMediaDimensions,
  pinAssetToIpfs,
  pinSwipeCopyToIpfs,
  getStoredPromotionAssets,
  savePromotionAsset,
  deletePromotionAsset,
  incrementDownloadCount,
  getIpfsProviderConfig,
  saveIpfsProviderConfig,
  formatBytes,
  MAX_FILE_SIZE_BYTES,
  INITIAL_PROMOTION_ASSETS,
} from "../lib/ipfsAssetService";
import { createFullMediaZipBundle, dataUrlToBlob } from "../lib/assetZipBundle";
import type { PromotionAsset, SwipeCopyData } from "../types/asset";
import JSZip from "jszip";

describe("Campaign Promotion Asset Library & IPFS Media Upload Suite", () => {
  let store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("File Validation & Acceptance Criteria (10MB Limit & Formats)", () => {
    it("should reject files exceeding 10MB limit", () => {
      // 10MB + 1 byte
      const oversizedBlob = new Blob([new Uint8Array(MAX_FILE_SIZE_BYTES + 1)], {
        type: "image/png",
      });
      const oversizedFile = new File([oversizedBlob], "huge-banner.png", {
        type: "image/png",
      });

      const result = validateAssetFile(oversizedFile);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum allowed limit of 10 MB");
    });

    it("should accept files exactly or under 10MB limit", () => {
      const validBlob = new Blob([new Uint8Array(2 * 1024 * 1024)], {
        type: "image/png",
      });
      const validFile = new File([validBlob], "standard-banner.png", {
        type: "image/png",
      });

      const result = validateAssetFile(validFile);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("should accept valid creative file formats (PNG, JPEG, SVG, ZIP)", () => {
      const formats = [
        { name: "banner.png", type: "image/png" },
        { name: "photo.jpg", type: "image/jpeg" },
        { name: "photo2.jpeg", type: "image/jpeg" },
        { name: "logo.svg", type: "image/svg+xml" },
        { name: "media-pack.zip", type: "application/zip" },
      ];

      for (const item of formats) {
        const file = new File(["dummy content"], item.name, { type: item.type });
        const result = validateAssetFile(file);
        expect(result.valid).toBe(true);
      }
    });

    it("should reject unsupported file formats (PDF, EXE, MP4)", () => {
      const unsupported = [
        { name: "document.pdf", type: "application/pdf" },
        { name: "program.exe", type: "application/x-msdownload" },
        { name: "video.mp4", type: "video/mp4" },
      ];

      for (const item of unsupported) {
        const file = new File(["dummy"], item.name, { type: item.type });
        const result = validateAssetFile(file);
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Unsupported file format");
      }
    });
  });

  describe("Cryptographic SHA-256 and IPFS CIDv1 Generation", () => {
    it("should compute deterministic SHA-256 hash", async () => {
      const data = "StormSale Decentralized Creative Media Protocol";
      const hash1 = await computeSha256(data);
      const hash2 = await computeSha256(data);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("should produce persistent IPFS CIDv1 format starting with bafybeih", async () => {
      const sha256 = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
      const cid = generateIpfsCid(sha256);
      expect(cid.startsWith("bafybeih")).toBe(true);
      expect(cid.length).toBeGreaterThan(40);
    });
  });

  describe("Dimension Extraction & Aspect Ratio Labeling", () => {
    it("should map standard banner dimensions to ad labels", () => {
      expect(getStandardAdLabel(728, 90)).toContain("Leaderboard");
      expect(getStandardAdLabel(300, 250)).toContain("Medium Rectangle");
      expect(getStandardAdLabel(160, 600)).toContain("Wide Skyscraper");
      expect(getStandardAdLabel(1200, 630)).toContain("Social / OpenGraph");
      expect(getStandardAdLabel(512, 512)).toContain("Square Logo");
      expect(getStandardAdLabel(800, 400)).toBe("800 × 400 px");
    });

    it("should extract dimensions from SVG text containing viewBox", async () => {
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 728 90"><rect width="728" height="90"/></svg>`;
      const file = new File([svgContent], "banner.svg", { type: "image/svg+xml" });
      const dims = await extractMediaDimensions(file);
      expect(dims).toBeDefined();
      expect(dims?.width).toBe(728);
      expect(dims?.height).toBe(90);
      expect(dims?.aspectRatioLabel).toContain("Leaderboard");
    });
  });

  describe("Affiliate Embed Code Generation", () => {
    it("should generate responsive HTML, Markdown, and React embed codes with affiliate links", () => {
      const cid = "bafybeihdwdcefgh4dqjrxoxv5ti25bfyv25vk25dqk6nfdp24g75gkyy6m";
      const gateway = `https://gateway.pinata.cloud/ipfs/${cid}`;
      const affiliateLink = "https://stormsale.io/ref/ALICE_VIP";

      const codes = generateEmbedCodes(
        cid,
        gateway,
        "Tech Gadgets Leaderboard",
        { width: 728, height: 90 },
        affiliateLink,
      );

      // HTML
      expect(codes.html).toContain(affiliateLink);
      expect(codes.html).toContain(gateway);
      expect(codes.html).toContain('width="728"');
      expect(codes.html).toContain('height="90"');

      // Markdown
      expect(codes.markdown).toBe(`[![Tech Gadgets Leaderboard](${gateway})](${affiliateLink})`);

      // React
      expect(codes.react).toContain("width={728}");
      expect(codes.react).toContain("height={90}");

      // Direct URIs
      expect(codes.ipfsUri).toBe(`ipfs://${cid}`);
      expect(codes.directUrl).toBe(gateway);
    });
  });

  describe("Direct IPFS Pinning Service", () => {
    it("should pin an asset file and return persistent IPFS CID and ipfs:// URI", async () => {
      const file = new File(["<svg viewBox='0 0 300 250'></svg>"], "sidebar.svg", {
        type: "image/svg+xml",
      });

      const result = await pinAssetToIpfs(file, {
        campaignId: "1",
        campaignName: "Tech Gadgets Pro",
        category: "banner",
        title: "Sidebar SVG Banner",
      });

      expect(result.cid.startsWith("bafybeih")).toBe(true);
      expect(result.ipfsUri).toBe(`ipfs://${result.cid}`);
      expect(result.gatewayUrl).toContain(result.cid);
      expect(result.sizeBytes).toBe(file.size);
      expect(result.checksumSha256).toBeDefined();
      expect(result.pinnedAt).toBeDefined();
    });

    it("should package and pin swipe copy as a decentralized markdown asset", async () => {
      const swipeData: SwipeCopyData = {
        headline: "Double your commissions with Stellar Smart Contracts",
        callToAction: "Join Tech Gadgets campaign now",
        targetAudience: "Affiliate Marketers",
        bodyCopy: "Exclusive 10% commission rate on all verified hardware sales.",
        recommendedChannels: ["Email", "Telegram"],
      };

      const asset = await pinSwipeCopyToIpfs(swipeData, {
        campaignId: "1",
        campaignName: "Tech Gadgets Pro",
      });

      expect(asset.category).toBe("swipe_copy");
      expect(asset.fileFormat).toBe("md");
      expect(asset.cid.startsWith("bafybeih")).toBe(true);
      expect(asset.ipfsUri).toBe(`ipfs://${asset.cid}`);
      expect(asset.textContent).toContain(swipeData.headline);
      expect(asset.textContent).toContain(swipeData.bodyCopy);
    });
  });

  describe("Asset Persistence, Retrieval, and Management", () => {
    it("should initialize default curated creative assets if storage is empty", () => {
      const assets = getStoredPromotionAssets();
      expect(assets.length).toBeGreaterThanOrEqual(INITIAL_PROMOTION_ASSETS.length);
      expect(assets[0].cid.startsWith("bafybei")).toBe(true);
    });

    it("should persist newly saved asset and delete existing asset", () => {
      const customAsset: PromotionAsset = {
        id: "asset_test_custom_99",
        campaignId: "2",
        campaignName: "DeFi Summer Launch",
        name: "defi-banner-300x250.png",
        title: "DeFi Summer Banner",
        category: "banner",
        fileFormat: "png",
        mimeType: "image/png",
        sizeBytes: 85000,
        formattedSize: "83.0 KB",
        cid: "bafybeicustomcid1234567890",
        ipfsUri: "ipfs://bafybeicustomcid1234567890",
        gatewayUrl: "https://gateway.pinata.cloud/ipfs/bafybeicustomcid1234567890",
        pinProvider: "pinata",
        pinnedAt: new Date().toISOString(),
        checksumSha256: "abc12345",
        embedCodes: {
          html: "<a href='#'></a>",
          markdown: "[![]()]()",
          react: "<a />",
          bbcode: "[url][/url]",
          directUrl: "https://gateway.pinata.cloud/ipfs/bafybeicustomcid1234567890",
          ipfsUri: "ipfs://bafybeicustomcid1234567890",
        },
        downloadCount: 0,
      };

      savePromotionAsset(customAsset);
      let list = getStoredPromotionAssets();
      expect(list.some((a) => a.id === customAsset.id)).toBe(true);

      // Increment download
      incrementDownloadCount(customAsset.id);
      list = getStoredPromotionAssets();
      const updated = list.find((a) => a.id === customAsset.id);
      expect(updated?.downloadCount).toBe(1);

      // Delete
      const deleted = deletePromotionAsset(customAsset.id);
      expect(deleted).toBe(true);
      list = getStoredPromotionAssets();
      expect(list.some((a) => a.id === customAsset.id)).toBe(false);
    });

    it("should reload storage and reflect updated download counts on repeated downloads", () => {
      const asset = INITIAL_PROMOTION_ASSETS[0];
      const initialCount = asset.downloadCount || 0;
      incrementDownloadCount(asset.id);
      let reloaded = getStoredPromotionAssets().find((a) => a.id === asset.id);
      expect(reloaded?.downloadCount).toBe(initialCount + 1);

      incrementDownloadCount(asset.id);
      reloaded = getStoredPromotionAssets().find((a) => a.id === asset.id);
      expect(reloaded?.downloadCount).toBe(initialCount + 2);
    });

    it("should save and retrieve IPFS provider configuration", () => {
      const config = {
        activeProvider: "pinata" as const,
        pinataJwt: "mock.jwt.token",
        web3StorageToken: "mock.web3.token",
        customGatewayUrl: "https://ipfs.io/ipfs/",
      };

      saveIpfsProviderConfig(config);
      const retrieved = getIpfsProviderConfig();
      expect(retrieved.activeProvider).toBe("pinata");
      expect(retrieved.pinataJwt).toBe("mock.jwt.token");
      expect(retrieved.customGatewayUrl).toBe("https://ipfs.io/ipfs/");
    });
  });

  describe("ZIP Bundling & Batch Export with JSZip", () => {
    it("should convert SVG data URLs to valid blobs", () => {
      const dataUrl = "data:image/svg+xml;utf8,<svg><rect/></svg>";
      const blob = dataUrlToBlob(dataUrl);
      expect(blob.type).toBe("image/svg+xml");
      expect(blob.size).toBeGreaterThan(0);
    });

    it("should bundle creative assets, README, manifest, and swipe copy into a unified ZIP archive", async () => {
      const sampleAssets: PromotionAsset[] = [
        INITIAL_PROMOTION_ASSETS[0], // Banner
        INITIAL_PROMOTION_ASSETS[2], // Logo
        INITIAL_PROMOTION_ASSETS[3], // Swipe copy
      ];

      const zipBlob = await createFullMediaZipBundle(
        "Tech Gadgets Campaign Media Pack",
        sampleAssets,
        "https://stormsale.io/ref/BOB_TEST",
      );

      expect(zipBlob).toBeInstanceOf(Blob);
      expect(zipBlob.size).toBeGreaterThan(0);

      // Verify the generated zip archive structure using JSZip reader
      const zip = await JSZip.loadAsync(zipBlob);
      expect(zip.file("README.md")).toBeDefined();
      expect(zip.file("VERIFICATION_MANIFEST.json")).toBeDefined();
      expect(zip.file("SWIPE_COPY.md")).toBeDefined();

      const readmeText = await zip.file("README.md")?.async("string");
      expect(readmeText).toContain("Tech Gadgets Campaign Media Pack");
      expect(readmeText).toContain("BOB_TEST");
      expect(readmeText).toContain(INITIAL_PROMOTION_ASSETS[0].cid);

      const manifestText = await zip.file("VERIFICATION_MANIFEST.json")?.async("string");
      const manifest = JSON.parse(manifestText || "{}");
      expect(manifest.protocol).toContain("StormSale");
      expect(manifest.totalAssets).toBe(3);
      expect(manifest.assets).toHaveLength(3);
    });
  });

  describe("Utility Formatting", () => {
    it("should format bytes to human readable sizes", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(1024)).toBe("1 KB");
      expect(formatBytes(1024 * 1024)).toBe("1 MB");
      expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    });
  });
});
