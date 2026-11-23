import React, { useState, useEffect, useId, useCallback } from "react";
import {
  validateCustomSlug,
  generateDynamicReferralUrl,
  generateBrandedQRCodeSVG,
  generateBrandedQRCodePNG,
  downloadQRCodeFile,
  copyReferralLinkWithFeedback,
  type SlugValidationResult,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
} from "../../lib/referralLinkGenerator";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Copy, Check, Download, QrCode, Sparkles, AlertCircle, Link as LinkIcon } from "lucide-react";

export interface B2CReferralLinkGeneratorProps {
  affiliateAddress?: string;
  referralCode?: string;
  defaultSlug?: string;
  campaignId?: string;
  onSlugChange?: (slug: string, validation: SlugValidationResult) => void;
  onCopySuccess?: (url: string) => void;
  resetDelay?: number;
}

export const B2CReferralLinkGenerator: React.FC<B2CReferralLinkGeneratorProps> = ({
  affiliateAddress = "",
  referralCode = "",
  defaultSlug = "summer-sale",
  campaignId,
  onSlugChange,
  onCopySuccess,
  resetDelay = 2000,
}) => {
  const baseId = useId();
  const [slug, setSlug] = useState(defaultSlug);
  const [isCopied, setIsCopied] = useState(false);
  const [qrCodeSvg, setQrCodeSvg] = useState<string>("");
  const [qrCodePng, setQrCodePng] = useState<string>("");
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  // Validate custom slug
  const validation = validateCustomSlug(slug);

  // Generate dynamic referral URL
  const referralUrl = validation.isValid
    ? generateDynamicReferralUrl({
        slug: validation.normalizedSlug,
        affiliateAddress,
        referralCode,
        campaignId,
      })
    : "";

  // Propagate slug changes
  useEffect(() => {
    if (onSlugChange) {
      onSlugChange(slug, validation);
    }
  }, [slug, validation, onSlugChange]);

  // Generate branded QR codes when URL is valid
  useEffect(() => {
    if (!referralUrl) {
      setQrCodeSvg("");
      setQrCodePng("");
      return;
    }

    let isMounted = true;
    setIsGeneratingQr(true);

    Promise.all([
      generateBrandedQRCodeSVG(referralUrl, { width: 512 }),
      generateBrandedQRCodePNG(referralUrl, { width: 512 }),
    ])
      .then(([svg, png]) => {
        if (isMounted) {
          setQrCodeSvg(svg);
          setQrCodePng(png);
        }
      })
      .catch((err) => {
        console.error("Failed to generate branded QR code:", err);
      })
      .finally(() => {
        if (isMounted) setIsGeneratingQr(false);
      });

    return () => {
      isMounted = false;
    };
  }, [referralUrl]);

  // One-click copy with audio/haptic feedback & temporary checkmark
  const handleCopy = useCallback(async () => {
    if (!referralUrl) return;

    const result = await copyReferralLinkWithFeedback(referralUrl);
    if (result.success) {
      setIsCopied(true);
      if (onCopySuccess) onCopySuccess(referralUrl);

      setTimeout(() => {
        setIsCopied(false);
      }, resetDelay);
    }
  }, [referralUrl, resetDelay, onCopySuccess]);

  // Download handlers
  const handleDownloadPNG = () => {
    if (!qrCodePng) return;
    const filename = `stormsale-referral-${validation.normalizedSlug || "qr"}.png`;
    downloadQRCodeFile(qrCodePng, filename, "image/png");
  };

  const handleDownloadSVG = () => {
    if (!qrCodeSvg) return;
    const filename = `stormsale-referral-${validation.normalizedSlug || "qr"}.svg`;
    downloadQRCodeFile(qrCodeSvg, filename, "image/svg+xml");
  };

  return (
    <div
      data-testid="b2c-referral-generator"
      className="p-6 rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800/40">
            <LinkIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white">
              Dynamic Referral Link & Branded QR Code
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Customize social campaign slugs and download high-resolution QR codes.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-xs font-bold border border-indigo-200 dark:border-indigo-800/50">
          <Sparkles className="w-3.5 h-3.5" />
          <span>B2C Viral Growth</span>
        </div>
      </div>

      {/* Slug Input Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label
            htmlFor={`${baseId}-slug-input`}
            className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
          >
            Custom Campaign Slug
          </Label>
          <span
            data-testid="slug-char-counter"
            className={`text-xs font-mono font-medium ${
              validation.charCount < SLUG_MIN_LENGTH || validation.charCount > SLUG_MAX_LENGTH
                ? "text-amber-500"
                : "text-zinc-400"
            }`}
          >
            {validation.charCount}/{SLUG_MAX_LENGTH} chars (min {SLUG_MIN_LENGTH})
          </span>
        </div>

        <div className="relative flex rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-all bg-slate-50 dark:bg-zinc-950">
          <span className="inline-flex items-center px-3.5 bg-slate-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm font-mono border-r border-slate-200 dark:border-zinc-800 select-none">
            stormsale.xyz/c/
          </span>
          <Input
            id={`${baseId}-slug-input`}
            data-testid="input-custom-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="summer-promo-2026"
            className="border-0 bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:ring-offset-0 px-3.5"
          />
          <div className="flex items-center pr-3">
            {validation.isValid ? (
              <span data-testid="slug-valid-badge" className="text-emerald-500 flex items-center">
                <Check className="w-4 h-4" />
              </span>
            ) : (
              <span data-testid="slug-invalid-badge" className="text-rose-500 flex items-center">
                <AlertCircle className="w-4 h-4" />
              </span>
            )}
          </div>
        </div>

        {/* Validation Error Message */}
        {!validation.isValid && (
          <p data-testid="slug-validation-error" className="text-xs text-rose-500 font-medium flex items-center gap-1.5 mt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{validation.reason}</span>
          </p>
        )}
      </div>

      {/* Generated Referral Link & One-Click Copy */}
      <div className="space-y-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          Generated Referral Link
        </Label>
        <div className="flex items-center gap-2">
          <Input
            data-testid="input-generated-url"
            readOnly
            value={referralUrl || "Enter a valid custom slug above"}
            className="font-mono text-xs bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 select-all"
          />
          <Button
            data-testid="btn-copy-link"
            onClick={handleCopy}
            disabled={!validation.isValid}
            className={`h-10 px-4 rounded-xl font-bold transition-all shrink-0 flex items-center gap-2 ${
              isCopied
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20"
            }`}
          >
            {isCopied ? (
              <>
                <Check data-testid="icon-check" className="w-4 h-4" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy data-testid="icon-copy" className="w-4 h-4" />
                <span>Copy Link</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Branded QR Code Preview & Download Card */}
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center gap-6">
        {/* QR Code Container */}
        <div className="relative w-44 h-44 rounded-2xl bg-white p-2 border border-slate-200 dark:border-zinc-700/60 shadow-md flex items-center justify-center shrink-0 overflow-hidden">
          {qrCodeSvg ? (
            <div
              data-testid="qr-code-svg-container"
              className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-zinc-400 gap-2">
              <QrCode className="w-10 h-10 stroke-[1.5]" />
              <span className="text-[10px] font-medium text-center">
                {isGeneratingQr ? "Generating QR..." : "QR Preview"}
              </span>
            </div>
          )}
        </div>

        {/* QR Code Details and Download Buttons */}
        <div className="flex-1 space-y-3 text-center sm:text-left w-full">
          <div>
            <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white flex items-center justify-center sm:justify-start gap-1.5">
              <span>High-Resolution Branded QR Code</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Level H (30%)
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Engineered with 30% error correction and an embedded StormSale center logo plate for
              reliable offline and print scanning.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1 justify-center sm:justify-start">
            <Button
              data-testid="btn-download-png"
              onClick={handleDownloadPNG}
              disabled={!qrCodePng}
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 dark:border-zinc-800 font-semibold gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>Download PNG</span>
            </Button>

            <Button
              data-testid="btn-download-svg"
              onClick={handleDownloadSVG}
              disabled={!qrCodeSvg}
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200 dark:border-zinc-800 font-semibold gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-indigo-500" />
              <span>Download SVG</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
