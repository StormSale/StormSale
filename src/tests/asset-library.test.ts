// @vitest-environment jsdom
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
  incrementDownloadCounts,
  escapeHtmlAttr,
  getIpfsProviderConfig,
  saveIpfsProviderConfig,
  formatBytes,
  MAX_FILE_SIZE_BYTES,
  INITIAL_PROMOTION_ASSETS,
} from "../lib/ipfsAssetService";
import {
  createFullMediaZipBundle,
  dataUrlToBlob,
  downloadSingleAsset,
  downloadFullMediaZipBundle,
  triggerBlobDownload,
} from "../lib/assetZipBundle";
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

      const exactFile = new File([new Uint8Array(MAX_FILE_SIZE_BYTES)], "exact-banner.png", {
        type: "image/png",
      });
      expect(validateAssetFile(exactFile).valid).toBe(true);
    });

    it("should require an allowed extension with a consistent MIME type", () => {
      const cases = [
        // Allowed MIME but disallowed extension
        { name: "payload.html", type: "image/png" },
        // Allowed extension but mismatched MIME
        { name: "banner.png", type: "text/html" },
        { name: "logo.svg", type: "image/png" },
        // Text formats are outside the PNG/JPEG/SVG/ZIP upload scope
        { name: "notes.txt", type: "text/plain" },
        { name: "readme.md", type: "text/markdown" },
      ];

      for (const item of cases) {
        const file = new File(["dummy"], item.name, { type: item.type });
        expect(validateAssetFile(file).valid).toBe(false);
      }

      // Missing MIME type falls back to the extension check
      expect(validateAssetFile(new File(["dummy"], "banner.PNG", { type: "" })).valid).toBe(true);
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

    it("should escape titles and URLs in HTML and React embed codes", () => {
      const maliciousTitle = `x" onerror="alert(1)`;
      const maliciousRef = `https://stormsale.io/ref/a"><script>alert(1)</script>`;
      const codes = generateEmbedCodes(
        "cid",
        "https://gw/ipfs/cid",
        maliciousTitle,
        undefined,
        maliciousRef,
      );

      for (const snippet of [codes.html, codes.react]) {
        expect(snippet).not.toContain(`" onerror="`);
        expect(snippet).not.toContain("<script>");
        expect(snippet).toContain(escapeHtmlAttr(maliciousTitle));
        expect(snippet).toContain(escapeHtmlAttr(maliciousRef));
      }
      expect(escapeHtmlAttr(`<a href="x">'&'</a>`)).toBe(
        "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
      );
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

    it("should send the file to Pinata and use the returned IpfsHash as the CID", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ IpfsHash: "bafkreipinatareturnedcid" }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const file = new File(["<svg viewBox='0 0 300 250'></svg>"], "sidebar.svg", {
        type: "image/svg+xml",
      });
      const result = await pinAssetToIpfs(file, {
        campaignId: "7",
        campaignName: "Pinata Campaign",
        category: "logo",
        provider: "pinata",
        pinataJwt: "jwt.for.test",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.pinata.cloud/pinning/pinFileToIPFS");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer jwt.for.test");

      const body = init.body as FormData;
      expect((body.get("file") as File).name).toBe("sidebar.svg");
      const metadata = JSON.parse(body.get("pinataMetadata") as string);
      expect(metadata.name).toBe("sidebar.svg");
      expect(metadata.keyvalues).toMatchObject({
        campaignId: "7",
        campaignName: "Pinata Campaign",
        category: "logo",
        checksum: result.checksumSha256,
      });
      expect(JSON.parse(body.get("pinataOptions") as string)).toEqual({ cidVersion: 1 });

      expect(result.provider).toBe("pinata");
      expect(result.cid).toBe("bafkreipinatareturnedcid");
      expect(result.gatewayUrl).toBe("https://gateway.pinata.cloud/ipfs/bafkreipinatareturnedcid");
    });

    it("should build the gateway URL from the configured custom gateway", async () => {
      saveIpfsProviderConfig({
        activeProvider: "pinata",
        pinataJwt: "jwt",
        web3StorageToken: "",
        customGatewayUrl: "https://ipfs.io/ipfs",
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ IpfsHash: "bafkreicustom" }) }),
      );

      const file = new File(["<svg viewBox='0 0 10 10'></svg>"], "a.svg", {
        type: "image/svg+xml",
      });
      const result = await pinAssetToIpfs(file, { campaignId: "1", campaignName: "C" });
      expect(result.gatewayUrl).toBe("https://ipfs.io/ipfs/bafkreicustom");
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

      // Batched increments touch every listed asset once
      incrementDownloadCounts([customAsset.id, INITIAL_PROMOTION_ASSETS[0].id]);
      list = getStoredPromotionAssets();
      expect(list.find((a) => a.id === customAsset.id)?.downloadCount).toBe(2);
      expect(list.find((a) => a.id === INITIAL_PROMOTION_ASSETS[0].id)?.downloadCount).toBe(
        (INITIAL_PROMOTION_ASSETS[0].downloadCount || 0) + 1,
      );

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

    it("should handle triggerBlobDownload creating and revoking URL", () => {
      vi.useFakeTimers();
      try {
        const createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
        const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        const clickSpy = vi.fn();
        vi.spyOn(document, "createElement").mockReturnValue({
          set href(_val: string) {},
          set download(_val: string) {},
          click: clickSpy,
        } as any);
        vi.spyOn(document.body, "appendChild").mockImplementation(() => null as any);
        vi.spyOn(document.body, "removeChild").mockImplementation(() => null as any);

        const blob = new Blob(["test"], { type: "text/plain" });
        triggerBlobDownload(blob, "test.txt");

        expect(createSpy).toHaveBeenCalledWith(blob);
        expect(clickSpy).toHaveBeenCalled();
        vi.advanceTimersByTime(2500);
        expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
      } finally {
        vi.useRealTimers();
      }
    });

    it("should downloadSingleAsset with swipe copy or markdown text", async () => {
      const downloadSpy = vi.fn();
      vi.stubGlobal("document", {
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        createElement: () => ({ href: "", download: "", click: downloadSpy }),
      });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() });

      const textAsset = INITIAL_PROMOTION_ASSETS[3]; // Swipe copy
      await downloadSingleAsset(textAsset);
      expect(downloadSpy).toHaveBeenCalled();
    });

    it("should downloadSingleAsset with contentDataUrl", async () => {
      const downloadSpy = vi.fn();
      vi.stubGlobal("document", {
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        createElement: () => ({ href: "", download: "", click: downloadSpy }),
      });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() });

      const svgAsset = INITIAL_PROMOTION_ASSETS[0]; // Has contentDataUrl
      await downloadSingleAsset(svgAsset);
      expect(downloadSpy).toHaveBeenCalled();
    });

    it("should downloadSingleAsset via gateway fetch success", async () => {
      const downloadSpy = vi.fn();
      vi.stubGlobal("document", {
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        createElement: () => ({ href: "", download: "", click: downloadSpy }),
      });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() });

      const remoteAsset: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[0],
        id: "remote_1",
        textContent: undefined,
        contentDataUrl: undefined,
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          blob: async () => new Blob(["fetched content"]),
        }),
      );

      await downloadSingleAsset(remoteAsset);
      expect(downloadSpy).toHaveBeenCalled();
    });

    it("should downloadSingleAsset fallback to markdown descriptor when fetch fails", async () => {
      const downloadSpy = vi.fn();
      vi.stubGlobal("document", {
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        createElement: () => ({ href: "", download: "", click: downloadSpy }),
      });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() });

      const remoteAsset: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[0],
        id: "remote_2",
        textContent: undefined,
        contentDataUrl: undefined,
      };

      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network Error")));

      await downloadSingleAsset(remoteAsset);
      expect(downloadSpy).toHaveBeenCalled();
    });

    it("should support downloadFullMediaZipBundle", async () => {
      const downloadSpy = vi.fn();
      vi.stubGlobal("document", {
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        createElement: () => ({ href: "", download: "", click: downloadSpy }),
      });
      vi.stubGlobal("URL", { createObjectURL: () => "blob:mock", revokeObjectURL: vi.fn() });

      await downloadFullMediaZipBundle("Test Campaign", [INITIAL_PROMOTION_ASSETS[0]]);
      expect(downloadSpy).toHaveBeenCalled();
    });

    it("should pull uncached creative files from the IPFS gateway into the ZIP", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => new Blob(["REMOTE_PNG_BYTES"]),
      });
      vi.stubGlobal("fetch", fetchMock);

      const uncachedBanner: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[1],
        id: "uncached_banner",
        name: "uncached-banner.png",
        contentDataUrl: undefined,
        textContent: undefined,
      };

      const zip = await JSZip.loadAsync(
        await createFullMediaZipBundle("Remote Pack", [uncachedBanner]),
      );

      expect(fetchMock).toHaveBeenCalledWith(uncachedBanner.gatewayUrl, expect.anything());
      expect(await zip.file("banners/uncached-banner.png")?.async("string")).toBe(
        "REMOTE_PNG_BYTES",
      );
      expect(zip.file("banners/uncached-banner.png.ipfs.txt")).toBeNull();
    });

    it("should fall back to an IPFS reference file when the gateway fetch fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

      const uncachedBanner: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[1],
        name: "offline-banner.png",
        contentDataUrl: undefined,
        textContent: undefined,
      };

      const zip = await JSZip.loadAsync(
        await createFullMediaZipBundle("Offline Pack", [uncachedBanner]),
      );

      expect(zip.file("banners/offline-banner.png")).toBeNull();
      const ref = await zip.file("banners/offline-banner.png.ipfs.txt")?.async("string");
      expect(ref).toContain(uncachedBanner.cid);
    });

    it("should keep both files when two assets share a file name", async () => {
      const first: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[0],
        id: "dup_a",
        name: "banner.svg",
      };
      const second: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[0],
        id: "dup_b",
        name: "banner.svg",
      };

      const zip = await JSZip.loadAsync(
        await createFullMediaZipBundle("Dup Pack", [first, second]),
      );

      expect(zip.file("banners/banner.svg")).not.toBeNull();
      expect(zip.file("banners/banner-dup_b.svg")).not.toBeNull();
    });

    it("should package bundles and encoded data URLs in zip archive", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      const bundleAsset: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[4],
        category: "bundle",
        contentDataUrl: "data:application/octet-stream;base64,QUJDRA==",
      };
      const rawTextAsset: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[0],
        contentDataUrl: "plain-text-data-url",
      };
      const remoteFallbackAsset: PromotionAsset = {
        ...INITIAL_PROMOTION_ASSETS[0],
        category: "logo",
        contentDataUrl: undefined,
        textContent: undefined,
      };

      const zipBlob = await createFullMediaZipBundle("Mixed Bundle", [
        bundleAsset,
        rawTextAsset,
        remoteFallbackAsset,
      ]);
      expect(zipBlob.size).toBeGreaterThan(0);
    });
  });

  describe("IPFS Provider Pinning & Storage Fallbacks", () => {
    it("should pin asset using web3.storage provider configuration", async () => {
      saveIpfsProviderConfig({
        activeProvider: "web3.storage",
        pinataJwt: "",
        web3StorageToken: "test_web3_token",
        customGatewayUrl: "https://w3s.link/ipfs/",
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ cid: "bafybeihmockweb3cid" }),
        }),
      );

      const file = new File(["<svg viewBox='0 0 100 100'></svg>"], "media.svg", {
        type: "image/svg+xml",
      });
      const asset = await pinAssetToIpfs(file, {
        campaignId: "1",
        campaignName: "Test Web3 Campaign",
        category: "banner",
      });

      expect(asset.provider).toBe("web3.storage");
      expect(asset.cid).toBe("bafybeihmockweb3cid");
    });

    it("should handle pinFileToPinata network response failure by falling back to local CID", async () => {
      saveIpfsProviderConfig({
        activeProvider: "pinata",
        pinataJwt: "mock_jwt_fail",
        web3StorageToken: "",
        customGatewayUrl: "https://custom.gateway/ipfs/",
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          statusText: "Unauthorized",
        }),
      );

      const file = new File(["<svg viewBox='0 0 100 100'></svg>"], "banner.svg", {
        type: "image/svg+xml",
      });
      const asset = await pinAssetToIpfs(file, {
        campaignId: "1",
        campaignName: "Fallback Campaign",
      });

      expect(asset.cid.startsWith("bafybei")).toBe(true);
      expect(asset.provider).toBe("simulated");
      expect(asset.gatewayUrl).toBe(`https://custom.gateway/ipfs/${asset.cid}`);
    });

    it("should throw when an asset cannot be persisted", () => {
      vi.stubGlobal("localStorage", {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {},
      });

      expect(() => savePromotionAsset({ ...INITIAL_PROMOTION_ASSETS[0], id: "too_big" })).toThrow(
        /Failed to save asset.*QuotaExceededError/,
      );
    });

    it("should safely handle deletePromotionAsset and incrementDownloadCount failures", () => {
      const notFound = deletePromotionAsset("non_existent_id");
      expect(notFound).toBe(true);

      incrementDownloadCount("non_existent_id");

      // Corrupt localStorage to test try/catch branches
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("Quota exceeded");
        },
        setItem: () => {
          throw new Error("Quota exceeded");
        },
        removeItem: () => {},
      });

      expect(deletePromotionAsset("asset_1")).toBe(false);
      expect(() => incrementDownloadCount("asset_1")).not.toThrow();
      expect(getIpfsProviderConfig().activeProvider).toBe("pinata");
      expect(() =>
        saveIpfsProviderConfig({
          activeProvider: "pinata",
          pinataJwt: "",
          web3StorageToken: "",
          customGatewayUrl: "",
        }),
      ).not.toThrow();
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
