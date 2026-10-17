import React, { useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { FolderArchive, UploadCloud, HardDrive, Download, Layers, ShieldCheck } from "lucide-react";
import { AssetUploader } from "./AssetUploader";
import { AssetGallery } from "./AssetGallery";
import { getStoredPromotionAssets, formatBytes } from "../../lib/ipfsAssetService";
import type { PromotionAsset } from "../../types/asset";

export const CampaignAssetLibrary: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"gallery" | "upload">("gallery");
  const [assets, setAssets] = useState<PromotionAsset[]>(getStoredPromotionAssets());

  const handleAssetUploaded = (_newAsset: PromotionAsset) => {
    setAssets(getStoredPromotionAssets());
    setActiveTab("gallery");
  };

  const handleAssetDeleted = (_deletedId: string) => {
    setAssets(getStoredPromotionAssets());
  };

  const totalBytes = assets.reduce((sum, a) => sum + (a.sizeBytes || 0), 0);
  const totalDownloads = assets.reduce((sum, a) => sum + (a.downloadCount || 0), 0);

  return (
    <div className="space-y-8 pb-12">
      {/* Top Hero Banner */}
      <div className="relative overflow-hidden bg-zinc-900 rounded-[2.5rem] p-8 md:p-12 border border-zinc-800 shadow-2xl">
        <div className="absolute top-0 left-0 w-full h-full opacity-30 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/30 via-indigo-600/10 to-transparent blur-3xl rounded-full" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-full text-indigo-400 text-xs font-bold uppercase tracking-wider flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" />
                IPFS Decentralized Storage Active
              </div>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-2">
              Campaign Asset Library
            </h1>
            <p className="text-zinc-400 font-medium text-base md:text-lg max-w-xl">
              Upload marketing banners, vector logos, and swipe copy directly to IPFS so affiliates
              can download verified creative assets and bundles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setActiveTab(activeTab === "upload" ? "gallery" : "upload")}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl px-6 h-13 text-sm font-bold shadow-lg shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5"
            >
              {activeTab === "upload" ? (
                <>
                  <Layers className="w-4 h-4 mr-2" />
                  View Media Gallery
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Upload Creative Asset
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Bento Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-5 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Total Assets
              </p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{assets.length}</p>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-5 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                IPFS Pinned
              </p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">100%</p>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-5 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Total Size
              </p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">
                {formatBytes(totalBytes)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-5 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Affiliate Downloads
              </p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{totalDownloads}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Area */}
      {activeTab === "upload" ? (
        <AssetUploader onAssetUploaded={handleAssetUploaded} />
      ) : (
        <AssetGallery
          assets={assets}
          onUploadClick={() => setActiveTab("upload")}
          onAssetDeleted={handleAssetDeleted}
        />
      )}
    </div>
  );
};
