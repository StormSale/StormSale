import JSZip from "jszip";
import type { PromotionAsset } from "../types/asset";
import { incrementDownloadCount } from "./ipfsAssetService";

/**
 * Triggers a browser file download using a Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Converts a Data URL or Text to Blob.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  if (dataUrl.startsWith("data:image/svg+xml;utf8,")) {
    const raw = dataUrl.replace("data:image/svg+xml;utf8,", "");
    let svgContent: string;
    try {
      svgContent = decodeURIComponent(raw);
    } catch {
      svgContent = raw;
    }
    return new Blob([svgContent], { type: "image/svg+xml" });
  }

  if (dataUrl.startsWith("data:")) {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    const byteString = atob(parts[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mime });
  }

  return new Blob([dataUrl], { type: "text/plain" });
}

/**
 * Downloads a single creative promotion asset.
 */
export async function downloadSingleAsset(asset: PromotionAsset): Promise<void> {
  incrementDownloadCount(asset.id);

  // If text content or swipe copy
  if (asset.textContent || asset.fileFormat === "txt" || asset.fileFormat === "md") {
    const content = asset.textContent || asset.swipeCopy?.bodyCopy || asset.title;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    triggerBlobDownload(
      blob,
      asset.name || `${asset.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.md`,
    );
    return;
  }

  // If cached data URL exists
  if (asset.contentDataUrl) {
    const blob = dataUrlToBlob(asset.contentDataUrl);
    triggerBlobDownload(blob, asset.name);
    return;
  }

  // Fallback: Fetch from IPFS Gateway
  try {
    const res = await fetch(asset.gatewayUrl);
    if (res.ok) {
      const blob = await res.blob();
      triggerBlobDownload(blob, asset.name);
      return;
    }
  } catch {
    // If fetch fails (CORS or offline), create a verified link descriptor file
  }

  // Offline / fallback descriptor with IPFS CID link
  const descriptor = `StormSale Verified Decentralized Creative Asset
==================================================
Title:       ${asset.title}
File Name:   ${asset.name}
Campaign:    ${asset.campaignName}
IPFS CID:    ${asset.cid}
IPFS URI:    ${asset.ipfsUri}
Gateway URL: ${asset.gatewayUrl}
SHA-256:     ${asset.checksumSha256}
Dimensions:  ${asset.dimensions ? `${asset.dimensions.width}x${asset.dimensions.height}` : "N/A"}
Pinned Date: ${asset.pinnedAt}
==================================================
To view or download this raw media file, open the Gateway URL or fetch via any IPFS node:
ipfs get ${asset.cid}
`;
  const blob = new Blob([descriptor], { type: "text/plain;charset=utf-8" });
  triggerBlobDownload(blob, `${asset.name}.ipfs-link.txt`);
}

/**
 * Bundles multiple assets into a unified ZIP archive with README and verification manifest.
 */
export async function createFullMediaZipBundle(
  bundleName: string,
  assets: PromotionAsset[],
  affiliateRefUrl?: string,
): Promise<Blob> {
  const zip = new JSZip();

  const bannersFolder = zip.folder("banners");
  const logosFolder = zip.folder("logos");
  const swipeFolder = zip.folder("swipe-copy");
  const bundlesFolder = zip.folder("archives");

  const manifestEntries: Array<Record<string, unknown>> = [];

  for (const asset of assets) {
    incrementDownloadCount(asset.id);

    manifestEntries.push({
      id: asset.id,
      title: asset.title,
      name: asset.name,
      category: asset.category,
      dimensions: asset.dimensions,
      ipfsUri: asset.ipfsUri,
      cid: asset.cid,
      gatewayUrl: asset.gatewayUrl,
      sha256: asset.checksumSha256,
      sizeBytes: asset.sizeBytes,
    });

    let targetFolder = bannersFolder;
    if (asset.category === "logo") targetFolder = logosFolder;
    else if (asset.category === "swipe_copy") targetFolder = swipeFolder;
    else if (asset.category === "bundle") targetFolder = bundlesFolder;

    if (targetFolder) {
      if (asset.textContent) {
        targetFolder.file(asset.name, asset.textContent);
      } else if (asset.contentDataUrl) {
        if (asset.contentDataUrl.startsWith("data:image/svg+xml;utf8,")) {
          const raw = asset.contentDataUrl.replace("data:image/svg+xml;utf8,", "");
          let rawSvg: string;
          try {
            rawSvg = decodeURIComponent(raw);
          } catch {
            rawSvg = raw;
          }
          targetFolder.file(asset.name, rawSvg);
        } else if (asset.contentDataUrl.startsWith("data:")) {
          const base64Data = asset.contentDataUrl.split(",")[1];
          targetFolder.file(asset.name, base64Data, { base64: true });
        } else {
          targetFolder.file(asset.name, asset.contentDataUrl);
        }
      } else {
        // Descriptive reference file for remote IPFS pinned files
        const refContent = `Decentralized Asset: ${asset.title}\nIPFS CID: ${asset.cid}\nURI: ${asset.ipfsUri}\nGateway: ${asset.gatewayUrl}\nSHA-256: ${asset.checksumSha256}\n`;
        targetFolder.file(`${asset.name}.ipfs.txt`, refContent);
      }
    }
  }

  // 1. Add README.md with instructions and embed guidance
  const refUrl = affiliateRefUrl || "https://stormsale.io/ref/YOUR_AFFILIATE_ID";
  const readmeContent = `# ${bundleName} — Verified Creative Asset Pack
Generated by StormSale Decentralized Affiliate Protocol

## Included Assets (${assets.length} items)
${assets
  .map(
    (a) =>
      `- **${a.title}** (${a.category.toUpperCase()})
  - File: \`${a.name}\`
  - Dimensions: ${a.dimensions ? `${a.dimensions.width}×${a.dimensions.height}px` : "N/A"}
  - IPFS CID: \`${a.cid}\`
  - Decentralized URI: \`${a.ipfsUri}\``,
  )
  .join("\n\n")}

## How to Use These Assets
1. **Banners**: Upload to your website, blog, or ad network.
2. **Affiliate Link Integration**:
   Replace \`YOUR_AFFILIATE_ID\` with your registered Stellar affiliate key:
   \`${refUrl}\`
3. **Embed Code Example**:
\`\`\`html
<a href="${refUrl}" target="_blank" rel="noopener noreferrer">
  <img src="https://gateway.pinata.cloud/ipfs/${assets[0]?.cid || "CID"}" alt="${assets[0]?.title || "StormSale"}" />
</a>
\`\`\`

## Cryptographic Verification
All assets in this archive are pinned to decentralized IPFS storage.
Refer to \`VERIFICATION_MANIFEST.json\` for SHA-256 checksums and proofs.
`;
  zip.file("README.md", readmeContent);

  // 2. Add VERIFICATION_MANIFEST.json
  const manifestContent = JSON.stringify(
    {
      protocol: "StormSale Decentralized Affiliate Protocol",
      version: "1.0.0",
      bundleName,
      generatedAt: new Date().toISOString(),
      totalAssets: assets.length,
      assets: manifestEntries,
    },
    null,
    2,
  );
  zip.file("VERIFICATION_MANIFEST.json", manifestContent);

  // 3. Add aggregated SWIPE_COPY.md
  const swipeAssets = assets.filter((a) => a.category === "swipe_copy" || a.swipeCopy);
  if (swipeAssets.length > 0) {
    const swipeAggregated = `# ${bundleName} — High Converting Swipe Copy

${swipeAssets
  .map(
    (a, idx) => `## Template ${idx + 1}: ${a.title}
**Subject / Headline:** ${a.swipeCopy?.headline || a.title}
**Call to Action:** ${a.swipeCopy?.callToAction || "Sign up today"}
**Target Audience:** ${a.swipeCopy?.targetAudience || "All Audiences"}

### Copy Body:
${a.textContent || a.swipeCopy?.bodyCopy || ""}

---`,
  )
  .join("\n\n")}`;
    zip.file("SWIPE_COPY.md", swipeAggregated);
  }

  return await zip.generateAsync({ type: "blob" });
}

/**
 * Generates and downloads the full media ZIP bundle for a campaign or all assets.
 */
export async function downloadFullMediaZipBundle(
  campaignName: string,
  assets: PromotionAsset[],
  affiliateRefUrl?: string,
): Promise<void> {
  const safeName = campaignName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const filename = `${safeName}_creative_media_bundle.zip`;
  const blob = await createFullMediaZipBundle(
    `${campaignName} Media Pack`,
    assets,
    affiliateRefUrl,
  );
  triggerBlobDownload(blob, filename);
}
