import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useNotification } from "../../context/NotificationContext";
import { useWeb3 } from "../../hooks/useWeb3";
import {
  getAllCustomLinks,
  fetchAllCustomLinks,
  deleteCustomShortLink,
  getShortLinkUrl,
} from "../../lib/customLinks";
import type { CustomShortLink } from "../../types/affiliateLink";
import type { CustomerConversion } from "../../lib/cohortAnalysis";
import {
  computeAggregateConversionAnalytics,
  computeLinkConversionMetrics,
  syncBackendConversions,
} from "../../lib/conversionAnalytics";
import { LinkGeneratorModal } from "./LinkGeneratorModal";
import {
  Link2,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Search,
  MousePointerClick,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  DollarSign,
  Activity,
  Award,
} from "lucide-react";

export const CustomLinksManager = () => {
  const [links, setLinks] = useState<CustomShortLink[]>(() => getAllCustomLinks());
  const [conversions, setConversions] = useState<CustomerConversion[]>([]);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncSource, setSyncSource] = useState<"backend" | "mock">("mock");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const { userAddress } = useWeb3();

  // Sync conversion data from backend / analytics engine
  const handleSyncConversions = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const result = await syncBackendConversions();
      setConversions(result.conversions);
      setSyncStatus("synced");
      setSyncSource(result.source);
      setLastSyncedAt(result.syncedAt);

      showNotification({
        type: "success",
        title: "Conversion Data Synced",
        message: `Synced ${result.conversions.length} conversion(s) from ${
          result.source === "backend" ? "backend API" : "real-time analytics engine"
        }.`,
      });
    } catch (err: unknown) {
      setSyncStatus("error");
      showNotification({
        type: "error",
        title: "Conversion Sync Failed",
        message: err instanceof Error ? err.message : "Unable to sync backend conversion data.",
      });
    }
  }, [showNotification]);

  useEffect(() => {
    let isMounted = true;
    syncBackendConversions()
      .then((result) => {
        if (isMounted) {
          setConversions(result.conversions);
          setSyncStatus("synced");
          setSyncSource(result.source);
          setLastSyncedAt(result.syncedAt);
        }
      })
      .catch(() => {
        if (isMounted) setSyncStatus("error");
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (userAddress && typeof fetchAllCustomLinks === "function") {
      fetchAllCustomLinks(userAddress)
        .then((fetched) => {
          if (Array.isArray(fetched) && fetched.length > 0) {
            setLinks(fetched);
          }
        })
        .catch(() => {});
    }
  }, [userAddress]);

  // Reload links whenever modal adds one
  const handleLinkCreated = (newLink: CustomShortLink) => {
    setLinks((prev) => [newLink, ...prev.filter((l) => l.id !== newLink.id)]);
  };

  const handleCopy = async (slug: string) => {
    const fullUrl = getShortLinkUrl(slug);
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedSlug(slug);
      showNotification({
        type: "success",
        title: "Short Link Copied!",
        message: `${fullUrl} copied to clipboard.`,
      });
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch (error) {
      showNotification({
        type: "error",
        title: "Unable to Copy Short Link",
        message: error instanceof Error ? error.message : "Clipboard access was denied.",
      });
    }
  };

  const handleDelete = async (id: string, slug: string) => {
    try {
      const deleted = await deleteCustomShortLink(id, userAddress ?? undefined);
      if (deleted) {
        setLinks((prev) => prev.filter((l) => l.id !== id));
        showNotification({
          type: "info",
          title: "Short Link Removed",
          message: `Custom slug '/c/${slug}' was deleted.`,
        });
      }
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Failed to Remove Short Link",
        message: err instanceof Error ? err.message : "Deletion failed due to a server error.",
      });
    }
  };

  // Comprehensive analytics calculation
  const analytics = useMemo(() => {
    return computeAggregateConversionAnalytics(links, conversions);
  }, [links, conversions]);

  const totalLinks = links.length;
  const totalClicks = analytics.totalClicks;
  const topLink =
    links.length > 0
      ? [...links].sort((a, b) => (b.clickCount || 0) - (a.clickCount || 0))[0]
      : null;

  const filteredLinks = links.filter((link) => {
    const q = search.toLowerCase();
    return (
      link.slug.toLowerCase().includes(q) ||
      link.campaignName.toLowerCase().includes(q) ||
      link.destinationUrl.toLowerCase().includes(q) ||
      link.affiliateWallet.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <Link2 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
              Custom Short-Links & CVR Analytics
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Activity className="w-3 h-3 animate-pulse" />
              Real-Time
            </span>
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Track live click-to-sale ratios (CVR %), monitor performance trends, and manage branded
            cloaked redirect URLs synced with on-chain conversion events.
          </p>
        </div>
        <div className="mt-6 lg:mt-0 flex flex-wrap items-center gap-3">
          {/* Real-time backend sync status and action */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSyncConversions()}
            disabled={syncStatus === "syncing"}
            data-testid="sync-conversions-btn"
            title="Synchronize conversions with backend API"
            className="rounded-full h-11 px-4 font-semibold text-xs border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex items-center gap-2 hover:border-indigo-400"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 ${
                syncStatus === "syncing" ? "animate-spin" : ""
              }`}
            />
            <span>
              {syncStatus === "syncing"
                ? "Syncing Data..."
                : syncSource === "backend"
                  ? "Backend Synced"
                  : "Sync Conversions"}
            </span>
          </Button>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white rounded-full px-6 h-11 font-semibold shadow-md transition-all flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Generate New Short Link
          </Button>
        </div>
      </div>

      {/* Metrics Row (Bento Cards with CVR and Trend Indicators) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Total Custom Links",
            value: String(totalLinks),
            icon: Link2,
            sub: "Branded referral slugs",
          },
          {
            label: "Total Redirect Clicks",
            value: totalClicks.toLocaleString(),
            icon: MousePointerClick,
            sub: "Preserved tracking hits",
          },
          {
            label: "Verified Sales",
            value: `${analytics.totalSales} sales`,
            icon: DollarSign,
            sub:
              analytics.totalSalesVolume > 0
                ? `$${analytics.totalSalesVolume.toLocaleString()} gross volume`
                : "Awaiting first sale",
          },
          {
            label: "Real-time CVR",
            value: analytics.formattedOverallCvr,
            icon: TrendingUp,
            sub:
              analytics.overallTrend.direction === "up"
                ? `↑ ${analytics.overallTrend.formattedDelta} vs baseline`
                : analytics.overallTrend.direction === "down"
                  ? `↓ ${analytics.overallTrend.formattedDelta} vs baseline`
                  : `${analytics.overallTrend.formattedDelta} baseline`,
            trend: analytics.overallTrend,
          },
          {
            label: "Top Converting Slug",
            value: analytics.topConvertingSlug
              ? `/c/${analytics.topConvertingSlug}`
              : topLink
                ? `/c/${topLink.slug}`
                : "None yet",
            icon: Award,
            sub: analytics.topConvertingSlug
              ? "Highest click-to-sale"
              : topLink
                ? `${topLink.clickCount} clicks`
                : "Create your first slug",
          },
        ].map((m, i) => {
          const Icon = m.icon;
          return (
            <Card
              key={i}
              className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="overflow-hidden">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {m.label}
                    </p>
                    <p className="text-xl font-extrabold text-zinc-900 dark:text-white mt-1 truncate">
                      {m.value}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {m.trend ? (
                        <span
                          className={`text-[11px] font-bold flex items-center gap-0.5 ${
                            m.trend.direction === "up"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : m.trend.direction === "down"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {m.trend.direction === "up" && <TrendingUp className="w-3 h-3" />}
                          {m.trend.direction === "down" && <TrendingDown className="w-3 h-3" />}
                          {m.trend.direction === "neutral" && <Minus className="w-3 h-3" />}
                          {m.sub}
                        </span>
                      ) : (
                        <p className="text-[11px] text-indigo-600 dark:text-indigo-400 truncate">
                          {m.sub}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="w-9 h-9 bg-slate-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center border border-slate-200 dark:border-zinc-700 shrink-0">
                    <Icon className="w-4 h-4 text-zinc-900 dark:text-indigo-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search custom slugs, campaigns, wallets..."
            className="h-11 pl-10 rounded-xl border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-3 self-center sm:self-auto text-xs text-zinc-500 font-medium">
          {lastSyncedAt && (
            <span className="hidden md:inline text-zinc-400 font-mono text-[11px]">
              Synced {new Date(lastSyncedAt).toLocaleTimeString()}
            </span>
          )}
          <div>
            Showing{" "}
            <span className="font-bold text-zinc-900 dark:text-white">{filteredLinks.length}</span>{" "}
            active short links
          </div>
        </div>
      </div>

      {/* Links Table with CVR & Trend Indicators */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
        {filteredLinks.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
              <Link2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                No custom short links found
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {search
                  ? "Try adjusting your search criteria."
                  : "Generate your first branded referral short link to start cloaking URLs and tracking real-time click-to-sale ratios."}
              </p>
            </div>
            {!search && (
              <Button
                onClick={() => setIsModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-5 h-10"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Generate Short Link
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/50">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pl-6">
                    Custom Slug & Short URL
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Target Campaign
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Merchant Destination
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4">
                    Cryptographic Wallet
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 text-center">
                    Clicks
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 text-center">
                    Sales
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 text-center">
                    CVR %
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 text-center">
                    Trend
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 py-4 pr-6 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.map((link) => {
                  const linkMetrics =
                    analytics.linkMetrics.get(link.id) ||
                    computeLinkConversionMetrics(link, conversions);

                  return (
                    <TableRow
                      key={link.id}
                      className="border-b border-slate-50 dark:border-zinc-900 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                    >
                      {/* Slug & Copy */}
                      <TableCell className="py-4 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400">
                            /c/{link.slug}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(link.slug)}
                            className="h-7 w-7 p-0 rounded-md text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                            title="Copy full short link"
                          >
                            {copiedSlug === link.slug ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400 truncate max-w-[200px]">
                          {getShortLinkUrl(link.slug)}
                        </div>
                      </TableCell>

                      {/* Campaign */}
                      <TableCell className="py-4 font-semibold text-zinc-800 dark:text-zinc-200 text-sm">
                        <div>{link.campaignName}</div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400">
                          ID: #{link.campaignId}
                        </span>
                      </TableCell>

                      {/* Destination */}
                      <TableCell className="py-4 max-w-[200px]">
                        <div
                          className="text-xs text-zinc-600 dark:text-zinc-300 truncate font-mono"
                          title={link.destinationUrl}
                        >
                          {link.destinationUrl}
                        </div>
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5 font-semibold">
                          <ShieldCheck className="w-3 h-3" />
                          UTM preserved
                        </div>
                      </TableCell>

                      {/* Wallet ID */}
                      <TableCell className="py-4">
                        <div className="font-mono text-xs text-zinc-700 dark:text-zinc-300 font-bold">
                          {link.affiliateWallet.slice(0, 4)}...{link.affiliateWallet.slice(-4)}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 truncate max-w-[130px]">
                          {link.walletFingerprint}
                        </div>
                      </TableCell>

                      {/* Clicks */}
                      <TableCell className="py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200">
                          <MousePointerClick className="w-3 h-3 text-indigo-500" />
                          {link.clickCount || 0}
                        </span>
                      </TableCell>

                      {/* Sales (Conversions) */}
                      <TableCell
                        className="py-4 text-center"
                        data-testid={`sales-count-${link.slug}`}
                      >
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40">
                          <DollarSign className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                          {linkMetrics.salesCount}
                        </span>
                        {linkMetrics.salesVolume > 0 && (
                          <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                            ${linkMetrics.salesVolume.toLocaleString()}
                          </div>
                        )}
                      </TableCell>

                      {/* Click-to-Sale Ratio (CVR %) */}
                      <TableCell
                        className="py-4 text-center"
                        data-testid={`cvr-percentage-${link.slug}`}
                      >
                        <div className="font-mono font-bold text-sm text-zinc-900 dark:text-white">
                          {linkMetrics.formattedCvr}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-medium">
                          {linkMetrics.salesCount} / {linkMetrics.clicks}
                        </div>
                      </TableCell>

                      {/* Trend Indicator */}
                      <TableCell
                        className="py-4 text-center"
                        data-testid={`cvr-trend-${link.slug}`}
                      >
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            linkMetrics.trend.direction === "up"
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                              : linkMetrics.trend.direction === "down"
                                ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                                : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700"
                          }`}
                        >
                          {linkMetrics.trend.direction === "up" ? (
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : linkMetrics.trend.direction === "down" ? (
                            <TrendingDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <Minus className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                          <span>{linkMetrics.trend.formattedDelta}</span>
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/c/${link.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Test Redirect"
                          >
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 rounded-lg border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs font-semibold"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              Test
                            </Button>
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(link.id, link.slug)}
                            className="h-8 w-8 p-0 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            title="Delete link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Link Generator Modal */}
      <LinkGeneratorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLinkCreated={handleLinkCreated}
      />
    </div>
  );
};
