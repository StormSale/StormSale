import { useState, useMemo, useId, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  checkSlugAvailability,
  createCustomShortLink,
  getShortLinkUrl,
  computeWalletFingerprint,
} from "../../lib/customLinks";
import { isValidStellarAddress } from "../../lib/stellar";
import type { CustomShortLink } from "../../types/affiliateLink";
import {
  Link2,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Globe,
  Sliders,
} from "lucide-react";

interface LinkGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLinkCreated?: (link: CustomShortLink) => void;
  defaultCampaignId?: string;
  defaultCampaignName?: string;
  defaultDestinationUrl?: string;
}

const PRESET_CAMPAIGNS = [
  {
    id: "1",
    name: "Tech Gadgets Pro",
    destinationUrl: "https://shop.techgadgets-demo.org/collections/stellar-exclusive",
  },
  {
    id: "2",
    name: "Web3 Masterclass",
    destinationUrl: "https://learn.stellar-web3-academy.io/enroll?plan=annual",
  },
  {
    id: "3",
    name: "Crypto Tools Suite",
    destinationUrl: "https://demo-tools.stormsale.xyz/suite",
  },
  {
    id: "4",
    name: "DeFi Starter Pack",
    destinationUrl: "https://defi-starter.stellar-demo.org/mint",
  },
];

export const LinkGeneratorModal: React.FC<LinkGeneratorModalProps> = ({
  isOpen,
  onClose,
  onLinkCreated,
  defaultCampaignId = "1",
  defaultCampaignName,
  defaultDestinationUrl,
}) => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();
  const baseId = useId();

  // Form states
  const [selectedCampaignId, setSelectedCampaignId] = useState(defaultCampaignId);
  const [campaignName, setCampaignName] = useState(defaultCampaignName || PRESET_CAMPAIGNS[0].name);
  const [destinationUrl, setDestinationUrl] = useState(
    defaultDestinationUrl || PRESET_CAMPAIGNS[0].destinationUrl,
  );
  const [customSlug, setCustomSlug] = useState("");
  const affiliateWallet = userAddress || "";
  const [walletFingerprint, setWalletFingerprint] = useState("pending");

  // Real-time slug availability & collision detection derived via useMemo
  const slugStatus = useMemo<{
    checked: boolean;
    available: boolean;
    reason?: string;
    normalized?: string;
  }>(() => {
    if (!customSlug.trim()) {
      return { checked: false, available: false };
    }
    const result = checkSlugAvailability(customSlug);
    return {
      checked: true,
      available: result.isAvailable,
      reason: result.reason,
      normalized: result.normalizedSlug,
    };
  }, [customSlug]);

  // Advanced tracking params
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [utmSource, setUtmSource] = useState("stormsale");
  const [utmMedium, setUtmMedium] = useState("affiliate");
  const [utmCampaign, setUtmCampaign] = useState("");

  // Result state
  const [createdLink, setCreatedLink] = useState<CustomShortLink | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    if (!affiliateWallet) return;

    void computeWalletFingerprint(affiliateWallet).then(
      (fingerprint) => {
        if (isCurrent) setWalletFingerprint(fingerprint);
      },
      () => {
        if (isCurrent) setWalletFingerprint("unavailable");
      },
    );

    return () => {
      isCurrent = false;
    };
  }, [affiliateWallet]);

  // Handle campaign selection change
  const handleCampaignChange = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    const found = PRESET_CAMPAIGNS.find((c) => c.id === campaignId);
    if (found) {
      setCampaignName(found.name);
      setDestinationUrl(found.destinationUrl);
    }
  };

  const handleGenerate = async () => {
    if (!slugStatus.available) {
      showNotification({
        type: "error",
        title: "Slug Unavailable",
        message: slugStatus.reason || "Please select an available slug.",
      });
      return;
    }

    if (!isValidStellarAddress(affiliateWallet)) {
      showNotification({
        type: "error",
        title: "Invalid Wallet Address",
        message: "Cryptographic wallet identifier must be a valid Stellar public key.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const newLink = await createCustomShortLink({
        slug: customSlug,
        affiliateWallet,
        campaignId: selectedCampaignId,
        campaignName,
        destinationUrl,
        customUtmCampaign: utmCampaign.trim() || undefined,
        extraTrackingParams: {
          utm_source: utmSource.trim() || "stormsale",
          utm_medium: utmMedium.trim() || "affiliate",
        },
      });

      setCreatedLink(newLink);
      if (onLinkCreated) {
        onLinkCreated(newLink);
      }
      showNotification({
        type: "success",
        title: "Short Link Generated!",
        message: `Custom slug '/c/${newLink.slug}' is ready with attribution parameters.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create custom short link.";
      showNotification({
        type: "error",
        title: "Link Creation Failed",
        message: msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    const shortUrl = getShortLinkUrl(createdLink.slug);
    try {
      await navigator.clipboard.writeText(shortUrl);
      setIsCopied(true);
      showNotification({
        type: "success",
        title: "Link Copied!",
        message: "Custom referral link copied to clipboard.",
      });
      setTimeout(() => setIsCopied(false), 2500);
    } catch (error) {
      showNotification({
        type: "error",
        title: "Unable to Copy Link",
        message: error instanceof Error ? error.message : "Clipboard access was denied.",
      });
    }
  };

  const handleReset = () => {
    setCreatedLink(null);
    setCustomSlug("");
    setIsCopied(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 sm:p-8 shadow-2xl">
        <DialogHeader className="border-b border-slate-100 dark:border-zinc-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-500/30">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
                Custom Short-Link Generator
                <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                  Cloaked URL
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Customize referral slugs (e.g. stormsale.xyz/c/tech-deals) with real-time collision
                detection and cryptographic wallet attribution.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!createdLink ? (
          <div className="space-y-6 pt-2">
            {/* 1. Campaign Selection */}
            <div className="space-y-2">
              <Label
                htmlFor={`${baseId}-campaign`}
                className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
              >
                Target Campaign
              </Label>
              <select
                id={`${baseId}-campaign`}
                value={selectedCampaignId}
                onChange={(e) => handleCampaignChange(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 text-zinc-900 dark:text-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
              >
                {PRESET_CAMPAIGNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (Campaign #{c.id})
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Destination URL */}
            <div className="space-y-2">
              <Label
                htmlFor={`${baseId}-destination`}
                className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 flex items-center justify-between"
              >
                <span>Merchant Destination URL</span>
                <span className="text-[10px] font-normal text-zinc-400">
                  Target website landing page
                </span>
              </Label>
              <Input
                id={`${baseId}-destination`}
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                placeholder="https://merchant.com/product"
                className="h-11 rounded-xl border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 font-mono text-xs sm:text-sm"
              />
            </div>

            {/* 3. Custom Slug Input with Real-time Collision Checker */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor={`${baseId}-slug`}
                  className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300"
                >
                  Custom Short-Link Slug
                </Label>
                <span className="text-[10px] font-medium text-zinc-400">
                  Alphanumeric & hyphens (3–50 chars)
                </span>
              </div>

              <div className="relative">
                <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 focus-within:ring-2 focus-within:ring-indigo-500 transition-all bg-slate-50 dark:bg-zinc-900">
                  <span className="inline-flex items-center px-3.5 bg-slate-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm font-mono border-r border-slate-200 dark:border-zinc-800 select-none">
                    stormsale.xyz/c/
                  </span>
                  <input
                    id={`${baseId}-slug`}
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    placeholder="tech-deals"
                    className="flex-1 px-3 py-2.5 bg-transparent text-zinc-900 dark:text-white font-mono text-sm focus:outline-none"
                  />
                  <div className="flex items-center pr-3">
                    {customSlug.trim() && slugStatus.checked ? (
                      slugStatus.available ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Real-time Status Badge & Collision Alert */}
              {customSlug.trim() && slugStatus.checked && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all ${
                    slugStatus.available
                      ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300"
                  }`}
                >
                  {slugStatus.available ? (
                    <>
                      <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
                      <div>
                        <span className="font-bold">Available!</span> Custom slug{" "}
                        <code className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/60 font-mono text-[11px]">
                          /c/{slugStatus.normalized}
                        </code>{" "}
                        is unique and ready to route.
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-500" />
                      <div>
                        <span className="font-bold">Collision Detected:</span> {slugStatus.reason}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 4. Cryptographic Wallet Identifier */}
            <div className="space-y-2">
              <Label
                htmlFor={`${baseId}-wallet`}
                className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300 flex items-center justify-between"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  Cryptographic Wallet Identifier
                </span>
                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                  Fingerprint: {affiliateWallet ? walletFingerprint : "pending"}
                </span>
              </Label>
              <Input
                id={`${baseId}-wallet`}
                value={affiliateWallet}
                readOnly
                placeholder="Connect wallet to continue"
                className="h-11 rounded-xl border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 font-mono text-xs"
              />
              <p className="text-[11px] text-zinc-400">
                {affiliateWallet
                  ? "Attribution is cryptographically bound to your connected Stellar public key."
                  : "Connect a Stellar wallet to generate a tracked short link."}
              </p>
            </div>

            {/* 5. Advanced Tracking Settings (Collapsible) */}
            <div className="border border-slate-100 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-500" />
                  Preserved Attribution & UTM Parameters
                </span>
                {showAdvanced ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </button>

              {showAdvanced && (
                <div className="p-4 bg-slate-50/50 dark:bg-zinc-900/40 border-t border-slate-100 dark:border-zinc-800/80 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] font-bold uppercase text-zinc-500">
                        UTM Source
                      </Label>
                      <Input
                        value={utmSource}
                        onChange={(e) => setUtmSource(e.target.value)}
                        className="h-9 mt-1 text-xs bg-white dark:bg-zinc-950 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] font-bold uppercase text-zinc-500">
                        UTM Medium
                      </Label>
                      <Input
                        value={utmMedium}
                        onChange={(e) => setUtmMedium(e.target.value)}
                        className="h-9 mt-1 text-xs bg-white dark:bg-zinc-950 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold uppercase text-zinc-500">
                      Custom UTM Campaign Tag (optional)
                    </Label>
                    <Input
                      value={utmCampaign}
                      onChange={(e) => setUtmCampaign(e.target.value)}
                      placeholder={customSlug || "e.g. spring_promo"}
                      className="h-9 mt-1 text-xs bg-white dark:bg-zinc-950 rounded-lg"
                    />
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-950 p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800">
                    <span className="font-semibold text-indigo-500">
                      Tracking parameters included in the redirect URL:
                    </span>{" "}
                    <code>ref</code>, <code>campaign</code>, <code>storm_slug</code>,{" "}
                    <code>storm_fp</code>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 h-12 rounded-xl border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={isSubmitting || !slugStatus.available || !affiliateWallet}
                className="flex-1 h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold shadow-md transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    Generate Short Link
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Success / Created State with Instant Copy & Preview */
          <div className="space-y-6 pt-2">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 dark:from-indigo-950/30 dark:via-zinc-900/60 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/40 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                <Check className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white">
                  Custom Short Link Created!
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Ready for clean, social-media-friendly cloaked referral distribution.
                </p>
              </div>

              {/* Instant Copy Box */}
              <div className="bg-white dark:bg-zinc-950 p-3 sm:p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 shadow-sm flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 text-left overflow-hidden w-full">
                  <div className="text-[10px] uppercase font-bold text-zinc-400">
                    Your Cloaked Referral URL
                  </div>
                  <div className="font-mono text-sm sm:text-base font-bold text-indigo-600 dark:text-indigo-400 truncate mt-0.5">
                    {getShortLinkUrl(createdLink.slug)}
                  </div>
                </div>

                <Button
                  onClick={handleCopyLink}
                  className={`h-11 px-5 rounded-xl font-bold transition-all shrink-0 w-full sm:w-auto flex items-center justify-center gap-2 ${
                    isCopied
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-indigo-500/20"
                  }`}
                >
                  {isCopied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>

              {/* Summary Metadata Card */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-left text-xs pt-1">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/60">
                  <div className="text-[10px] uppercase font-bold text-zinc-400">Campaign</div>
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                    {createdLink.campaignName}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/60">
                  <div className="text-[10px] uppercase font-bold text-zinc-400">
                    Cryptographic ID
                  </div>
                  <div className="font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate mt-0.5">
                    {createdLink.affiliateWallet.slice(0, 4)}...
                    {createdLink.affiliateWallet.slice(-4)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/60 col-span-2 sm:col-span-1">
                  <div className="text-[10px] uppercase font-bold text-zinc-400">Routing Mode</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                    <Globe className="w-3 h-3" />
                    Tracking Preserved
                  </div>
                </div>
              </div>
            </div>

            {/* Test Redirect & Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1 h-11 rounded-xl border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold"
              >
                Create Another Link
              </Button>
              <a
                href={`/c/${createdLink.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1"
              >
                <Button className="w-full h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold flex items-center justify-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Test Live Redirect
                </Button>
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
