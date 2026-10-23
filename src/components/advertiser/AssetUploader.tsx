import React, { useState, useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Card, CardContent } from "../ui/card";
import {
  UploadCloud,
  FileCheck2,
  AlertCircle,
  FileArchive,
  Image as ImageIcon,
  FileText,
  Key,
  ShieldCheck,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  validateAssetFile,
  formatBytes,
  pinAssetToIpfs,
  pinSwipeCopyToIpfs,
  savePromotionAsset,
  getIpfsProviderConfig,
  saveIpfsProviderConfig,
  generateEmbedCodes,
} from "../../lib/ipfsAssetService";
import type {
  PromotionAsset,
  AssetCategory,
  AssetFileFormat,
  SwipeCopyData,
  PinProvider,
} from "../../types/asset";
import { useNotification } from "../../context/NotificationContext";
import { initialMockCampaigns } from "./MyCampaignsList";

/**
 * Only small images get an inline base64 preview cached in localStorage. Base64 adds ~33%,
 * so larger previews would quickly exhaust the ~5 MB storage quota.
 */
const MAX_INLINE_PREVIEW_BYTES = 512 * 1024;

/** Campaigns the advertiser can attach assets to (shared with the My Campaigns list). */
const campaignOptions = initialMockCampaigns.map((c) => ({ id: c.id, name: c.name }));

interface AssetUploaderProps {
  campaignId?: string;
  campaignName?: string;
  onAssetUploaded?: (asset: PromotionAsset) => void;
}

export const AssetUploader: React.FC<AssetUploaderProps> = ({
  campaignId = campaignOptions[0]?.id ?? "",
  campaignName = campaignOptions.find((c) => c.id === campaignId)?.name ?? "",
  onAssetUploaded,
}) => {
  const { showNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadMode, setUploadMode] = useState<"file" | "swipe">("file");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AssetCategory>("banner");
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignId);
  const [selectedCampaignName, setSelectedCampaignName] = useState(campaignName);

  // Swipe copy state
  const [swipeHeadline, setSwipeHeadline] = useState("");
  const [swipeCta, setSwipeCta] = useState("");
  const [swipeAudience, setSwipeAudience] = useState("Web3 Early Adopters & Affiliates");
  const [swipeBody, setSwipeBody] = useState("");

  // Upload progress & status
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState<string>("");
  const [fileError, setFileError] = useState<string | null>(null);

  // IPFS Settings modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [ipfsConfig, setIpfsConfig] = useState(getIpfsProviderConfig());

  const closeConfigModal = () => {
    // Discard unsaved edits so the badge and uploads keep using the saved settings
    setIpfsConfig(getIpfsProviderConfig());
    setShowConfigModal(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    setFileError(null);
    const validation = validateAssetFile(file);
    if (!validation.valid) {
      setFileError(validation.error || "Invalid file format or size.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    const friendlyName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    setTitle(friendlyName.charAt(0).toUpperCase() + friendlyName.slice(1));

    // Guess category from extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "zip") {
      setCategory("bundle");
    } else if (ext === "svg" || file.name.toLowerCase().includes("logo")) {
      setCategory("logo");
    } else {
      setCategory("banner");
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) return;

    try {
      const isTestEnv =
        (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
        (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test");
      const stepDelay = isTestEnv ? 0 : 300;

      setIsUploading(true);
      setUploadProgress(15);
      setUploadStep("Reading media file and computing SHA-256 hash...");

      if (stepDelay > 0) await new Promise((resolve) => setTimeout(resolve, stepDelay));
      setUploadProgress(40);
      setUploadStep("Extracting visual dimensions & metadata...");

      if (stepDelay > 0) await new Promise((resolve) => setTimeout(resolve, stepDelay));
      setUploadProgress(70);
      setUploadStep(
        `Pinning asset directly to IPFS (${ipfsConfig.activeProvider.toUpperCase()})...`,
      );

      const result = await pinAssetToIpfs(selectedFile, {
        campaignId: selectedCampaignId,
        campaignName: selectedCampaignName,
        category,
        title: title || selectedFile.name,
        provider: ipfsConfig.activeProvider,
        pinataJwt: ipfsConfig.pinataJwt,
        web3StorageToken: ipfsConfig.web3StorageToken,
      });

      setUploadProgress(90);
      setUploadStep("Generating embed snippets & persistent CIDv1...");

      // Cache data URL for instant in-browser previews
      let contentDataUrl: string | undefined = undefined;
      if (selectedFile.type.startsWith("image/") && selectedFile.size <= MAX_INLINE_PREVIEW_BYTES) {
        try {
          contentDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(selectedFile);
          });
        } catch {
          // Ignore
        }
      }

      const ext = (selectedFile.name.split(".").pop()?.toLowerCase() || "png") as AssetFileFormat;
      const embedCodes = generateEmbedCodes(
        result.cid,
        result.gatewayUrl,
        title || selectedFile.name,
        result.dimensions,
      );

      const newAsset: PromotionAsset = {
        id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        campaignId: selectedCampaignId,
        campaignName: selectedCampaignName,
        name: selectedFile.name,
        title: title || selectedFile.name,
        category,
        fileFormat: ext,
        mimeType: selectedFile.type || "application/octet-stream",
        sizeBytes: selectedFile.size,
        formattedSize: formatBytes(selectedFile.size),
        dimensions: result.dimensions,
        cid: result.cid,
        ipfsUri: result.ipfsUri,
        gatewayUrl: result.gatewayUrl,
        pinProvider: result.provider,
        pinnedAt: result.pinnedAt,
        checksumSha256: result.checksumSha256,
        contentDataUrl,
        embedCodes,
        downloadCount: 0,
      };

      try {
        savePromotionAsset(newAsset);
      } catch (saveErr) {
        // The inline preview is only a cache; retry without it before giving up
        if (!newAsset.contentDataUrl) throw saveErr;
        newAsset.contentDataUrl = undefined;
        savePromotionAsset(newAsset);
      }
      setUploadProgress(100);
      setUploadStep("Pinned successfully!");

      showNotification({
        type: "success",
        title: "Asset Pinned to IPFS",
        message: `Successfully pinned ${newAsset.name} (CID: ${result.cid.slice(0, 14)}...)`,
      });

      if (onAssetUploaded) {
        onAssetUploaded(newAsset);
      }

      // Reset form
      setSelectedFile(null);
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload asset to IPFS.";
      setFileError(msg);
      showNotification({
        type: "error",
        title: "IPFS Pinning Failed",
        message: msg,
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStep("");
    }
  };

  const handleUploadSwipeCopy = async () => {
    if (!swipeHeadline.trim() || !swipeBody.trim()) {
      setFileError("Headline and Body Copy are required for swipe copy.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(30);
      setUploadStep("Packaging markdown swipe copy and computing SHA-256...");

      const swipeData: SwipeCopyData = {
        headline: swipeHeadline.trim(),
        callToAction: swipeCta.trim() || "Join campaign and earn commissions",
        targetAudience: swipeAudience.trim(),
        bodyCopy: swipeBody.trim(),
        recommendedChannels: ["Email Newsletter", "Social Media", "Community Chat"],
      };

      const isTestEnv =
        (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
        (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test");
      const stepDelay = isTestEnv ? 0 : 300;
      if (stepDelay > 0) await new Promise((resolve) => setTimeout(resolve, stepDelay));
      setUploadProgress(75);
      setUploadStep("Pinning verified swipe copy to IPFS...");

      const asset = await pinSwipeCopyToIpfs(swipeData, {
        campaignId: selectedCampaignId,
        campaignName: selectedCampaignName,
        title: swipeHeadline,
        provider: ipfsConfig.activeProvider,
        pinataJwt: ipfsConfig.pinataJwt,
        web3StorageToken: ipfsConfig.web3StorageToken,
      });

      setUploadProgress(100);
      showNotification({
        type: "success",
        title: "Swipe Copy Pinned to IPFS",
        message: `Verified copy asset published: ${asset.title}`,
      });

      if (onAssetUploaded) {
        onAssetUploaded(asset);
      }

      setSwipeHeadline("");
      setSwipeCta("");
      setSwipeBody("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to pin swipe copy to IPFS.";
      setFileError(msg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStep("");
    }
  };

  const handleSaveConfig = () => {
    saveIpfsProviderConfig(ipfsConfig);
    setShowConfigModal(false);
    showNotification({
      type: "success",
      title: "IPFS Settings Saved",
      message: `Active provider: ${ipfsConfig.activeProvider.toUpperCase()}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
            <UploadCloud className="w-7 h-7 text-indigo-500" />
            IPFS Media Upload & Creative Library
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Pin marketing banners, logos, and swipe copy directly to decentralized storage for
            affiliates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* IPFS Provider Badge & Config Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConfigModal(true)}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center gap-2 h-9"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>
              Node: <strong className="uppercase">{ipfsConfig.activeProvider}</strong>
            </span>
            <Key className="w-3.5 h-3.5 text-zinc-400" />
          </Button>

          {/* Mode Switcher */}
          <div className="inline-flex bg-slate-100 dark:bg-zinc-800/80 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setUploadMode("file");
                setFileError(null);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                uploadMode === "file"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Media Files
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadMode("swipe");
                setFileError(null);
              }}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                uploadMode === "swipe"
                  ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Swipe Copy Studio
            </button>
          </div>
        </div>
      </div>

      {fileError && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-2xl flex items-start gap-3 text-rose-800 dark:text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0 text-rose-500" />
          <div className="flex-1">
            <p className="font-bold">Upload Warning</p>
            <p className="text-xs mt-0.5">{fileError}</p>
          </div>
        </div>
      )}

      {/* Target Campaign Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 block">
            Target Campaign
          </Label>
          <select
            aria-label="Target Campaign"
            value={selectedCampaignId}
            onChange={(e) => {
              setSelectedCampaignId(e.target.value);
              setSelectedCampaignName(
                campaignOptions.find((c) => c.id === e.target.value)?.name ?? "",
              );
            }}
            className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} (ID: {c.id})
              </option>
            ))}
          </select>
        </div>

        {uploadMode === "file" && (
          <div>
            <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5 block">
              Asset Category
            </Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
              className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="banner">Marketing Banner (Leaderboard, Rectangle, Skyscraper)</option>
              <option value="logo">Brand Logo / Vector SVG</option>
              <option value="bundle">Full Media ZIP Bundle</option>
              <option value="badge">Affiliate Trust Badge</option>
              <option value="other">General Creative Media</option>
            </select>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODE 1: DRAG & DROP MEDIA FILE UPLOADER
         ========================================================================= */}
      {uploadMode === "file" && (
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md overflow-hidden shadow-xs">
          <CardContent className="p-6 md:p-8 space-y-6">
            {/* Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-indigo-500 bg-indigo-500/10 scale-[1.01]"
                  : "border-slate-300 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-slate-50/50 dark:hover:bg-zinc-800/30"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpeg,.jpg,.svg,.zip"
                className="hidden"
                onChange={handleFileInputChange}
              />

              <div className="flex flex-col items-center justify-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-xs">
                  <UploadCloud className="w-8 h-8" />
                </div>

                <div>
                  <p className="text-base font-bold text-zinc-900 dark:text-white">
                    Drop your marketing banner, logo, or ZIP bundle here
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Supports <strong>PNG, JPEG, SVG, and ZIP</strong> formats (up to{" "}
                    <strong>10MB</strong> per file)
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold px-4"
                >
                  Browse Local Files
                </Button>
              </div>
            </div>

            {/* Selected File Details & Title Customization */}
            {selectedFile && (
              <div className="p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-700/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    {selectedFile.name.endsWith(".zip") ? (
                      <FileArchive className="w-6 h-6" />
                    ) : (
                      <ImageIcon className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate max-w-xs md:max-w-md">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2 mt-0.5">
                      <span>{formatBytes(selectedFile.size)}</span>
                      <span>•</span>
                      <span className="uppercase text-[11px] font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                        {selectedFile.name.split(".").pop()}
                      </span>
                      <span>•</span>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5" /> Validated &lt; 10MB
                      </span>
                    </p>
                  </div>
                </div>

                <div className="w-full md:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Input
                    placeholder="Asset Title (e.g. 728x90 Header Banner)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-10 text-xs md:w-64 rounded-xl"
                  />
                  <Button
                    onClick={handleUploadFile}
                    disabled={isUploading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-10 px-6 rounded-xl shadow-md shadow-indigo-500/20"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Pinning to IPFS...
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-4 h-4 mr-2" />
                        Pin to IPFS
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {isUploading && (
              <div className="space-y-2 p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {uploadStep}
                  </span>
                  <span className="font-mono text-zinc-500">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-indigo-200 dark:bg-indigo-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* =========================================================================
          MODE 2: SWIPE COPY STUDIO
         ========================================================================= */}
      {uploadMode === "swipe" && (
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md overflow-hidden shadow-xs">
          <CardContent className="p-6 md:p-8 space-y-5">
            <div className="flex items-center space-x-2 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="w-5 h-5" />
              <h3 className="font-bold text-base text-zinc-900 dark:text-white">
                Decentralized Swipe Copy Publisher
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Provide affiliates with verified sales copy, email blast templates, and headlines
              pinned cryptographically to IPFS.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                  Headline / Subject Line *
                </Label>
                <Input
                  placeholder="e.g. The #1 Stellar Affiliate Protocol of 2026"
                  value={swipeHeadline}
                  onChange={(e) => setSwipeHeadline(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                  Target Call-to-Action (CTA)
                </Label>
                <Input
                  placeholder="e.g. Click here to claim your 15% discount [AFFILIATE_LINK]"
                  value={swipeCta}
                  onChange={(e) => setSwipeCta(e.target.value)}
                  className="rounded-xl h-11"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                Target Audience / Channel
              </Label>
              <Input
                placeholder="e.g. Crypto Traders, Remote Workers, Email Subscribers"
                value={swipeAudience}
                onChange={(e) => setSwipeAudience(e.target.value)}
                className="rounded-xl h-11"
              />
            </div>

            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                Swipe Copy Body (Markdown Supported) *
              </Label>
              <textarea
                rows={6}
                placeholder={`Hey [First Name],\n\nCheck out the newest campaign from ${selectedCampaignName}...\n\nUse my link below:\n👉 [AFFILIATE_LINK]\n\nKey Benefits:\n- Instant on-chain escrow settlements\n- Verified creative assets`}
                value={swipeBody}
                onChange={(e) => setSwipeBody(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-white font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleUploadSwipeCopy}
                disabled={isUploading || !swipeHeadline || !swipeBody}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold h-11 px-8 rounded-xl shadow-md shadow-indigo-500/20"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Pinning Swipe Copy...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Pin Swipe Copy to IPFS
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* =========================================================================
          IPFS CREDENTIALS & PROVIDER MODAL
         ========================================================================= */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Key className="w-4 h-4" />
                </div>
                <h3 className="font-black text-lg text-zinc-900 dark:text-white">
                  IPFS Decentralized Storage Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={closeConfigModal}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                  Active IPFS Provider
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["pinata", "web3.storage", "simulated"] as PinProvider[]).map((prov) => (
                    <button
                      key={prov}
                      type="button"
                      onClick={() => setIpfsConfig({ ...ipfsConfig, activeProvider: prov })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition-all ${
                        ipfsConfig.activeProvider === prov
                          ? "border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-slate-300"
                      }`}
                    >
                      {prov === "simulated" ? "Decentralized Auto" : prov}
                    </button>
                  ))}
                </div>
              </div>

              {ipfsConfig.activeProvider === "pinata" && (
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                    Pinata JWT (Optional)
                  </Label>
                  <Input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    value={ipfsConfig.pinataJwt || ""}
                    onChange={(e) => setIpfsConfig({ ...ipfsConfig, pinataJwt: e.target.value })}
                    className="font-mono text-xs rounded-xl"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    If empty, falls back to deterministic SHA-256 IPFS CIDv1 pinning.
                  </p>
                </div>
              )}

              {ipfsConfig.activeProvider === "web3.storage" && (
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                    Web3.Storage API Token (Optional)
                  </Label>
                  <Input
                    type="password"
                    placeholder="did:key:z6Mku..."
                    value={ipfsConfig.web3StorageToken || ""}
                    onChange={(e) =>
                      setIpfsConfig({ ...ipfsConfig, web3StorageToken: e.target.value })
                    }
                    className="font-mono text-xs rounded-xl"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-1 block">
                  Public IPFS Gateway
                </Label>
                <Input
                  value={ipfsConfig.customGatewayUrl || "https://gateway.pinata.cloud/ipfs/"}
                  onChange={(e) =>
                    setIpfsConfig({ ...ipfsConfig, customGatewayUrl: e.target.value })
                  }
                  className="text-xs font-mono rounded-xl"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                onClick={closeConfigModal}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveConfig}
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
