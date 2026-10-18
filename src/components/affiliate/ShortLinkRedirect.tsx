import { useEffect, useState, useMemo, useRef } from "react";
import {
  buildDestinationRedirectUrl,
  buildTrackingHeaders,
  dispatchTrackingBeacon,
  getCustomLinkBySlug,
  isHttpDestination,
  recordShortLinkClick,
  resolveShortLinkRedirectAsync,
} from "../../lib/customLinks";
import type { ShortLinkRedirectResult } from "../../types/affiliateLink";
import { Button } from "../ui/button";
import {
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Code2,
  ChevronDown,
  ChevronUp,
  Globe,
} from "lucide-react";

interface ShortLinkRedirectProps {
  customSlug?: string;
  autoRedirect?: boolean;
}

export const ShortLinkRedirect: React.FC<ShortLinkRedirectProps> = ({
  customSlug,
  autoRedirect = true,
}) => {
  // Extract slug from prop or window pathname /c/:slug
  const slug = useMemo(() => {
    if (customSlug) return customSlug;
    if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/\/c\/([^/?#]+)/);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1]);
        } catch {
          return "";
        }
      }
    }
    return "";
  }, [customSlug]);

  const inboundQuery = typeof window !== "undefined" ? window.location.search : "";

  // Check synchronous session cache first
  const syncRedirectData = useMemo<ShortLinkRedirectResult | null>(() => {
    if (!slug) return null;
    const link = getCustomLinkBySlug(slug);
    if (!link || !isHttpDestination(link.destinationUrl)) return null;

    return {
      slug: link.slug,
      targetUrl: buildDestinationRedirectUrl(link, inboundQuery),
      affiliateWallet: link.affiliateWallet,
      walletFingerprint: link.walletFingerprint,
      campaignId: link.campaignId,
      trackingHeaders: buildTrackingHeaders(link),
      trackingParams: link.trackingParams,
      clickCount: link.clickCount,
    };
  }, [slug, inboundQuery]);

  const [asyncData, setAsyncData] = useState<ShortLinkRedirectResult | null>(null);
  const [showHeaders, setShowHeaders] = useState(false);
  const clickTracked = useRef(false);

  // If not found in session cache, resolve asynchronously from shared store
  useEffect(() => {
    if (!slug || syncRedirectData) return;
    resolveShortLinkRedirectAsync(slug, inboundQuery)
      .then((result) => {
        if (result) setAsyncData(result);
      })
      .catch(() => {});
  }, [slug, inboundQuery, syncRedirectData]);

  const redirectData = syncRedirectData || asyncData;
  const notFound = !slug || !redirectData;

  // Side-effect: dispatch tracking beacon and execute redirect once data arrives
  useEffect(() => {
    if (!redirectData || !autoRedirect) return;

    if (!clickTracked.current) {
      clickTracked.current = true;
      recordShortLinkClick(redirectData.slug);
      dispatchTrackingBeacon(redirectData);
    }

    const timer = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.location.replace(redirectData.targetUrl);
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [redirectData, autoRedirect]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 text-center shadow-xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">
              Short Link Not Found
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
              The custom referral link{" "}
              <code className="font-mono text-indigo-500 font-bold">/c/{slug || "unknown"}</code>{" "}
              does not exist, has expired, or is unassigned.
            </p>
          </div>
          <div className="pt-2">
            <a href="/">
              <Button className="w-full h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-bold">
                Return to StormSale Home
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-zinc-950 text-white flex flex-col items-center justify-center p-4 selection:bg-indigo-500/30">
      <div className="max-w-lg w-full bg-zinc-900/90 border border-zinc-800 backdrop-blur-xl rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
        {/* Animated Brand Pulse */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-3xl bg-indigo-500/20 motion-safe:animate-ping opacity-75" />
          <div className="relative w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Globe className="w-8 h-8 text-white motion-safe:animate-pulse" />
          </div>
        </div>

        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            StormSale Cloaked Redirect
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Routing to Merchant
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Verifying cryptographic attribution and preserving referral tracking parameters...
          </p>
        </div>

        {/* Redirect Summary Box */}
        {redirectData && (
          <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 text-left space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <span className="text-[11px] uppercase font-bold text-zinc-400">Custom Slug</span>
              <span className="font-mono text-sm font-bold text-indigo-400">
                /c/{redirectData.slug}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <span className="text-[11px] uppercase font-bold text-zinc-400">
                Attributed Wallet
              </span>
              <span className="font-mono text-xs text-zinc-300 font-semibold">
                {redirectData.affiliateWallet.slice(0, 6)}...
                {redirectData.affiliateWallet.slice(-6)}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] uppercase font-bold text-zinc-400">Destination</span>
              <div
                className="font-mono text-xs text-zinc-400 truncate"
                title={redirectData.targetUrl}
              >
                {redirectData.targetUrl}
              </div>
            </div>
          </div>
        )}

        {/* Preserved Tracking Headers Inspector */}
        {redirectData && (
          <div className="border border-zinc-800/80 rounded-2xl overflow-hidden text-left">
            <button
              type="button"
              onClick={() => setShowHeaders(!showHeaders)}
              className="w-full px-4 py-2.5 bg-zinc-950/50 flex items-center justify-between text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                Tracking Metadata & URL Params ({Object.keys(redirectData.trackingHeaders).length})
              </span>
              {showHeaders ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showHeaders && (
              <div className="p-3 bg-black/60 border-t border-zinc-800/80 font-mono text-[11px] space-y-1.5 text-zinc-300">
                {Object.entries(redirectData.trackingHeaders).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 overflow-hidden">
                    <span className="text-indigo-400 truncate">{k}:</span>
                    <span className="text-zinc-400 truncate">{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Action Button & Timer */}
        <div className="space-y-3 pt-2">
          {redirectData ? (
            <a href={redirectData.targetUrl} target="_blank" rel="noopener">
              <Button className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2">
                Continue to Destination
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          ) : (
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 py-3">
              <RefreshCw className="w-4 h-4 motion-safe:animate-spin text-indigo-400" />
              Resolving destination...
            </div>
          )}

          <p className="text-[11px] text-zinc-500">
            Powered by StormSale Decentralized Affiliate Protocol on Stellar
          </p>
        </div>
      </div>
    </div>
  );
};
