import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Calendar, Link2, MapPin, TrendingUp, Loader2 } from "lucide-react";
import { API_URL } from "../../utils/api";

export interface ClickEvent {
  countryIso: string;
  countryName?: string;
  clicks: number;
  conversions: number;
}

export interface ClickHeatmapProps {
  campaignId?: string;
  dateRange?: { start: string; end: string };
  onRangeChange?: (r: { start: string; end: string }) => void;
}

const COUNTRY_CODES: Record<string, { code: string; name: string; x: number; y: number }> = {
  US: { code: "USS", name: "United States", x: 22, y: 38 },
  CA: { code: "CAN", name: "Canada", x: 22, y: 26 },
  MX: { code: "MEX", name: "Mexico", x: 20, y: 50 },
  BR: { code: "BRA", name: "Brazil", x: 32, y: 66 },
  AR: { code: "ARG", name: "Argentina", x: 30, y: 76 },
  GB: { code: "GBR", name: "United Kingdom", x: 47, y: 30 },
  FR: { code: "FRA", name: "France", x: 48, y: 35 },
  DG: { code: "DEU", name: "Germany", x: 51, y: 33 },
  ND: { code: "NLD", name: "Netherlands", x: 49, y: 30 },
  ES: { code: "ESP", name: "Spain", x: 46, y: 38 },
  IT: { code: "ITA", name: "Italy", x: 51, y: 39 },
  PL: { code: "POL", name: "Poland", x: 54, y: 31 },
  RU: { code: "RUS", name: "Russia", x: 65, y: 28 },
  CN: { code: "CHN", name: "China", x: 76, y: 40 },
  JP: { code: "JPN", name: "Japan", x: 85, y: 39 },
  IN: { code: "IND", name: "India", x: 70, y: 48 },
  AU: { code: "AUS", name: "Australia", x: 85, y: 70 },
  ZA: { code: "ZAF", name: "South Africa", x: 54, y: 72 },
  NG: { code: "NGA", name: "Nigeria", x: 48, y: 55 },
  KE: { code: "KEN", name: "Kenya", x: 56, y: 59 },
};

const defaultRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

function colorForDensity(ratio: number): string {
  if (ratio > 0.75) return "#ef4444";
  if (ratio > 0.5) return "#f97306";
  if (ratio > 0.25) return "#f59e0b";
  return "#6366f1";
}

function radiusForDensity(ratio: number): number {
  return 4 + ratio * 18;
}

export const ClickHeatmap: React.FC<ClickHeatmapProps> = ({ campaignId, dateRange, onRangeChange }) => {
  const [internalRange, setInternalRange] = useState(dateRange ?? defaultRange());
  const [data, setData] = useState<ClickEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const range = dateRange ?? internalRange;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("start", range.start);
        params.set("end", range.end);
        if (campaignId) params.set("campaignId", campaignId);
        const res = await fetch(`${API_URL}/affiliate/clicks/geo${params.toString() ? `?${params.toString()}` : ""}`);
        if (!res.ok) throw new Error(`Failed to load hitmap data (${res.status})`);
        const json = await res.json();
        const list: ClickEvent[] = Array.isArray(json) ? json : json.data ?? [];
        if (!cancelled) setData(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end, campaignId]);

  const maxClicks = useMemo(() => data.reduce((m, d) => Math.max(m, d.clicks), 0), [data]);

  const topCountries = useMemo(() => {
    return [...data]
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5)
      .map((d) => ({
        ...d,
        conversionRate: d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0,
      }));
  }, [data]);

  const updateRange = (next: { start: string; end: string }) => {
    setInternalRange(next);
    onRangeChange?.(next);
  };

  return (
    <div className="space-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Globe className="w-5 h-5" />
          <span className="font-semibold">Global Click Heatmap</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4" />
            <input
              type="date"
              value={range.start}
              onChange={(e) => updateRange({ ...range, start: e.target.value })}
              className="bg-transparent border border-slate-300 dark:border-zinc-700 rounded-md px-2 py-1 text-sm"
            />
            <span>to</span>
            <input
              type="date"
              value={range.end}
              onChange={(e) => updateRange({ ...range, end: e.target.value })}
              className="bg-transparent border border-slate-300 dark:border-zinc-700 rounded-md px-2 py-1 text-sm"
            />
          </label>
          {campaignId && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Link2 className="w-3 h-3" />
              {campaignId}
            </span>
          )}
        </div>
      </div>

      <div className="relative rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 dark:bg-zinc-950/70">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-red-600 bg-white/80 dark:bg-zinc-950/80">
            {error}
          </div>
        )}
        <svg viewBox="0 0 100 90" className="w-full h-[420px] md:h-[520p]" role="img" aria-label="World click heatmap">
          <defs>
            <radialGradient id="heat-glow">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="90" fill="transparent" />
          {/* simplified continent shapes */}
          <path
            d="M10 20 L30 15 L40 25 L35 40 L20 45 L10 35 Z"
            className="fill-slate-200 dark:fill-zinc-800"
          />
          <path
            d="M25 50 L35 55 L38 75 L30 80 L22 70 Z"
            className="fill-slate-200 dark:fill-zinc-800"
          />
          <path
            d="M42 25 L55 20 L60 30 L55 35 L45 35 Z"
            className="fill-slate-200 dark:fill-zinc-800"
          />
          <path
            d="M45 40 L58 38 L60 50 L50 58 L42 50 Z"
            className="fill-slate-200 dark:fill-zinc-800"
          />
          <path
            d="M60 25 L80 22 L90 35 L80 48 L65 45 Z"
            className="fill-slate-200 dark:fill-zinc-800"
          />
          <path
            d="M78 60 L90 62 L92 75 L80 78 Z"
            className="fill-slate-200 dark:fill-zinc-800"
          />

          <AnimatePresence>
            {data.map((d) => {
              const meta = COUNTRY_CODES[d.countryIso.toUpperCase()];
              if (!meta) return null;
              const ratio = maxClicks > 0 ? d.clicks / maxClicks : 0;
              const r = radiusForDensity(ratio);
              const color = colorForDensity(ratio);
              return (
                <motion.circle
                  key={d.countryIso}
                  initial={{ opacity: 0, r: 0 }}
                  animate={{ opacity: 0.85, r: r }}
                  exit={{ opacity: 0, r: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  cx={meta.x}
                  cy={meta.y}
                  fill={color}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(d.countryIso)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </AnimatePresence>

          {data.map((d) => {
            const meta = COUNTRY_CODES[d.countryIso.toUpperCase()];
            if (!meta) return null;
            const ratio = maxClicks > 0 ? d.clicks / maxClicks : 0;
            const r = radiusForDensity(ratio);
            return (
              <motion.circle
                key={`${d.countryIso}-glow`}
                initial={{ opacity: 0, r: 0 }}
                animate={{ opacity: 0.35, r: r * 1.6 }}
                exit={{ opacity: 0, r: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                cx={meta.x}
                cy={meta.y}
                fill="url(#heat-glow)"
                pointerEvents="none"
              />
            );
          })}

          {hovered && (() => {
            const d = data.find((x) => x.countryIso === hovered);
            const meta = COUNTRY_CODES[hovered.toUpperCase()];
            if (!d || !meta) return null;
            const width = 34;
            const height = 16;
            const x = Math.min(Math.max(meta.x - width / 2, 1), 100 - width - 1);
            const y = Math.max(meta.y - height - 6, 1);
            return (
              <g transform={`translate(${x}, ${y})`} pointerEvents="none">
                <rect width={width} height={height} rx="2" className="fill-slate-900 dark:fill-slate-100" opacity="0.9" />
                <text x={width / 2} y="11" textAnchor="middle" fontSize="6" className="fill-white dark:fill-slate-900">
                  {meta.name}: {d.clicks}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-zinc-800">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Top 5 Countries</h3>
        </div>
        <ul className="divide-y divide-slate-200 dark:divide-zinc-800">
          <AnimatePresence initial={false}>
            {topCountries.map((d, idx) => {
              const meta = COUNTRY_CODES[d.countryIso.toUpperCase()];
              return (
                <motion.li
                  key={d.countryIso}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: idx * 0.06 }}
                  className="flex items-center justify-between p-4 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-slate-400 font-mono">#{idx + 1}</span>
                    <MapPin className="w-4 h-4 text-indigo-500" />
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {meta?.name ?? d.countryIso}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-500 dark:text-slate-400">{d.clicks} clicks</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {d.conversionRate.toFixed(1)}%
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {topCountries.length === 0 && !loading && (
          <p className="p-4 text-sm text-slate-500 dark:text-slate-400">No click data for this range.</p>
        )}
      </div>
    </div>
  );
};

export default ClickHeatmap;
