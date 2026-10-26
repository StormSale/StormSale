import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, Globe2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import {
  aggregateClickStreamByCountry,
  type ClickStreamEvent,
  type CountryAggregate,
} from "../../lib/clickStreamAggregation";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  WORLD_LAND_PATHS,
  getCountryCentroid,
  projectToMap,
} from "../../lib/geo";
import { fetchClickStreamEvents } from "../../lib/clickStreamApi";
import { useWeb3 } from "../../hooks/useWeb3";

/**
 * Real-time click stream heatmap (issue #162).
 *
 * Renders an SVG world map with one density cluster per country, a tooltip with
 * click volume, and the top five countries ranked by conversion rate. All
 * aggregation happens on country ISO codes only: events carry no IP, user
 * agent, wallet or other PII, and nothing is persisted client-side.
 */

const DATE_RANGES = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null },
] as const;
type DateRangeId = (typeof DATE_RANGES)[number]["id"];

const ALL_LINKS = "all";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClickStreamHeatmapProps {
  /** Events to render. When omitted, `loadEvents` is called on mount. */
  events?: ClickStreamEvent[];
  /**
   * Affiliate wallet whose short-link click stream is loaded from the API
   * when neither `events` nor `loadEvents` is supplied.
   */
  walletAddress?: string | null;
  /** Loader used when `events` is not supplied. Defaults to the API. */
  loadEvents?: () => Promise<ClickStreamEvent[]>;
  /** Clock override for deterministic date filtering in tests. */
  now?: () => number;
  /** Initial date range. Defaults to the last 30 days. */
  initialRange?: "7d" | "30d" | "90d" | "all";
}

function clusterRadius(intensity: number): number {
  return 6 + Math.sqrt(Math.max(0, Math.min(intensity, 1))) * 26;
}

interface LoadResult {
  /** Which source the result belongs to, so a wallet switch never shows stale data. */
  source: string;
  events: ClickStreamEvent[];
  error: string | null;
}

/**
 * Identify where events come from: supplied events need no load, a custom
 * loader wins, otherwise the API is called for the connected wallet. `null`
 * means there is nothing to load.
 */
function loadSource(hasEvents: boolean, hasLoader: boolean, wallet: string | null): string | null {
  if (hasEvents) return null;
  if (hasLoader) return "loader";
  return wallet ? `wallet:${wallet}` : null;
}

export function ClickStreamHeatmap({
  events: suppliedEvents,
  walletAddress,
  loadEvents,
  now = Date.now,
  initialRange = "30d",
}: ClickStreamHeatmapProps) {
  const wallet = walletAddress?.trim() || null;
  const source = loadSource(suppliedEvents !== undefined, loadEvents !== undefined, wallet);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [rangeId, setRangeId] = useState<DateRangeId>(initialRange);
  const [linkId, setLinkId] = useState<string>(ALL_LINKS);
  const [activeIso, setActiveIso] = useState<string | null>(null);

  useEffect(() => {
    if (source === null) return;
    const load = loadEvents ?? (() => fetchClickStreamEvents(wallet ?? ""));
    let cancelled = false;
    load()
      .then((loaded) => {
        if (!cancelled) setResult({ source, events: loaded, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load clicks";
          setResult({ source, events: [], error: message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, loadEvents, wallet]);

  const current = result !== null && result.source === source ? result : null;
  const needsWallet = suppliedEvents === undefined && source === null;
  const loading = source !== null && current === null;
  const error = current?.error ?? null;
  const events = useMemo(() => suppliedEvents ?? current?.events ?? [], [suppliedEvents, current]);

  const campaignLinks = useMemo(() => {
    const ids = new Set<string>();
    for (const event of events) if (event.campaignLinkId) ids.add(event.campaignLinkId);
    return [...ids].sort();
  }, [events]);

  const campaignLinkId = linkId === ALL_LINKS ? null : linkId;

  const heatmap = useMemo(() => {
    const range = DATE_RANGES.find((r) => r.id === rangeId) ?? DATE_RANGES[1];
    const end = now();
    return aggregateClickStreamByCountry(events, {
      dateRange: range.days === null ? undefined : { start: end - range.days * DAY_MS },
      campaignLinkId,
    });
  }, [events, rangeId, campaignLinkId, now]);

  // Cluster size is scaled against the all-time peak for the selected link, so
  // switching date ranges visibly grows or shrinks clusters instead of
  // re-normalising every range to the same maximum.
  const densityScale = useMemo(
    () => aggregateClickStreamByCountry(events, { campaignLinkId }).maxClicks,
    [events, campaignLinkId],
  );

  type PlacedCountry = CountryAggregate & { name: string; x: number; y: number; density: number };
  const placed = heatmap.countries
    .map((country): PlacedCountry | null => {
      const centroid = getCountryCentroid(country.countryIso);
      // Countries without a known centroid stay in totals and the ranking;
      // only their map marker is omitted.
      if (!centroid) return null;
      return {
        ...country,
        name: centroid.name,
        density: densityScale === 0 ? 0 : Math.min(country.clicks / densityScale, 1),
        ...projectToMap(centroid.lat, centroid.lng),
      };
    })
    .filter((c): c is PlacedCountry => c !== null);

  const active = placed.find((c) => c.countryIso === activeIso) ?? null;
  const nameOf = (iso: string) => getCountryCentroid(iso)?.name ?? iso;

  return (
    <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
      <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Click stream heatmap
              </CardTitle>
              <CardDescription className="mt-1 text-zinc-500 dark:text-zinc-400">
                Aggregated by country ISO code. No raw PII is stored.
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-zinc-700 px-3 py-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
              <select
                aria-label="Filter heatmap by date range"
                value={rangeId}
                onChange={(e) => setRangeId(e.target.value as DateRangeId)}
                className="bg-transparent text-base sm:text-xs font-semibold text-zinc-700 dark:text-zinc-200 outline-none"
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <select
              aria-label="Filter heatmap by campaign link"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              className="rounded-full border border-slate-200 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-base sm:text-xs font-semibold text-zinc-700 dark:text-zinc-200 outline-none"
            >
              <option value={ALL_LINKS}>All campaign links</option>
              {campaignLinks.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {needsWallet ? (
          <p role="status" className="text-sm text-zinc-500">
            Connect your affiliate wallet to see where your short-link clicks come from.
          </p>
        ) : loading ? (
          <p role="status" className="text-sm text-zinc-500">
            Loading click stream…
          </p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40">
              <svg
                data-testid="click-heatmap-map"
                viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
                role="img"
                aria-label="World map of affiliate click density"
                className="w-full h-auto"
              >
                <defs>
                  <radialGradient id="click-heat" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                    <stop offset="55%" stopColor="#6366f1" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <g
                  data-testid="click-heatmap-land"
                  aria-hidden="true"
                  className="fill-slate-200 stroke-slate-300 dark:fill-zinc-800 dark:stroke-zinc-700"
                  strokeWidth={0.75}
                  strokeLinejoin="round"
                >
                  {WORLD_LAND_PATHS.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </g>
                {/* Graticule: 30° meridians and parallels. */}
                <g
                  aria-hidden="true"
                  stroke="currentColor"
                  className="text-slate-200/60 dark:text-zinc-800/60"
                  strokeWidth={1}
                >
                  {Array.from({ length: 13 }, (_, i) => (
                    <line
                      key={`m${i}`}
                      x1={(i * MAP_WIDTH) / 12}
                      y1={0}
                      x2={(i * MAP_WIDTH) / 12}
                      y2={MAP_HEIGHT}
                    />
                  ))}
                  {Array.from({ length: 7 }, (_, i) => (
                    <line
                      key={`p${i}`}
                      x1={0}
                      y1={(i * MAP_HEIGHT) / 6}
                      x2={MAP_WIDTH}
                      y2={(i * MAP_HEIGHT) / 6}
                    />
                  ))}
                </g>
                <AnimatePresence>
                  {placed.map((c) => (
                    <motion.circle
                      key={c.countryIso}
                      data-testid={`click-cluster-${c.countryIso}`}
                      data-density={c.density.toFixed(3)}
                      cx={c.x}
                      cy={c.y}
                      fill="url(#click-heat)"
                      tabIndex={0}
                      role="button"
                      aria-label={`${c.name}: ${c.clicks} clicks`}
                      initial={{ r: 0, opacity: 0 }}
                      animate={{ r: clusterRadius(c.density), opacity: 1 }}
                      exit={{ r: 0, opacity: 0 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                      onMouseEnter={() => setActiveIso(c.countryIso)}
                      onMouseLeave={() => setActiveIso(null)}
                      onFocus={() => setActiveIso(c.countryIso)}
                      onBlur={() => setActiveIso(null)}
                    >
                      <title>{`${c.name}: ${c.clicks} clicks`}</title>
                    </motion.circle>
                  ))}
                </AnimatePresence>
              </svg>
              {active && (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute rounded-lg bg-zinc-900 px-3 py-2 text-xs text-white shadow-lg"
                  style={{
                    left: `${(active.x / MAP_WIDTH) * 100}%`,
                    top: `${(active.y / MAP_HEIGHT) * 100}%`,
                    transform: "translate(-50%, calc(-100% - 12px))",
                  }}
                >
                  <p className="font-semibold">{active.name}</p>
                  <p>{active.clicks.toLocaleString()} clicks</p>
                  <p>{active.conversionRate.toFixed(2)}% conversion</p>
                </div>
              )}
              {heatmap.countries.length === 0 && (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                  No clicks in this range.
                </p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-3">
                Top countries by conversion
              </h3>
              <ol aria-label="Top 5 countries by conversion rate" className="space-y-2">
                {heatmap.topCountries.map((c, i) => (
                  <motion.li
                    layout
                    key={c.countryIso}
                    data-testid={`top-country-${c.countryIso}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-zinc-800 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-zinc-800 dark:text-zinc-100">
                      {i + 1}. {nameOf(c.countryIso)}
                    </span>
                    <span className="text-right text-xs text-zinc-500">
                      {c.conversionRate.toFixed(2)}% · {c.clicks.toLocaleString()} clicks
                    </span>
                  </motion.li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-zinc-500">
                {heatmap.totalClicks.toLocaleString()} clicks ·{" "}
                {heatmap.totalConversions.toLocaleString()} conversions
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The heatmap for the connected affiliate wallet, as shown on the Affiliate dashboard. */
export function AffiliateClickStreamHeatmap() {
  const { userAddress } = useWeb3();
  return <ClickStreamHeatmap walletAddress={userAddress} />;
}
