import { useEffect, useMemo, useRef, useState } from "react";

export type VolumePoint = {
  timestamp: string;
  escrowVolume: number;
  payoutVolume: number;
};

export interface PlatformVolumeWidgetProps {
  /** Optional external data source. When omitted, the widget fetches from the configured endpoint. */
  data?: VolumePoint[];
  /** Polling interval in ms for real-time updates. Defaults to 30000. */
  refreshIntervalMs?: number;
  /** Endpoint that returns the volume series. */
  endpoint?: string;
  /** Number of historical points to display in the trend chart. */
  historyLimit?: number;
  /** Render a compact variant for use in the overview tab. */
  compact?: boolean;
}

const DEFAULT_ENDPOINT = "/api/auditor/platform-volume";
const DEFAULT_REFRESH_MS = 30_000;
const DEFAULT_HISTORY_LIMIT = 24;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return currencyFormatter.format(value);
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "$0";
  return `$${compactFormatter.format(value)}`;
}

function computeGrowth(
  history: VolumePoint[],
  key: keyof Omit<VolumePoint, "timestamp">,
): number | null {
  if (history.length < 2) return null;
  const first = history[0][key];
  const last = history[history.length - 1][key];
  if (!first) return last > 0 ? 100 : null;
  return ((last - first) / first) * 100;
}

function isVolumePoint(value: unknown): value is VolumePoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.timestamp === "string" &&
    typeof candidate.escrowVolume === "number" &&
    typeof candidate.payoutVolume === "number"
  );
}

function normalizePayload(payload: unknown): VolumePoint[] {
  if (Array.isArray(payload)) {
    return payload.filter(isVolumePoint);
  }
  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    const series = candidate.series ?? candidate.data ?? candidate.points;
    if (Array.isArray(series)) return series.filter(isVolumePoint);
  }
  return [];
}

export default function PlatformVolumeWidget({
  data,
  refreshIntervalMs = DEFAULT_REFRESH_MS,
  endpoint = DEFAULT_ENDPOINT,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  compact = false,
}: PlatformVolumeWidgetProps) {
  const [history, setHistory] = useState<VolumePoint[]>(data ?? []);
  const [loading, setLoading] = useState(data === undefined);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (data !== undefined) {
      setHistory(data);
      setLoading(false);
      setError(null);
      setLastUpdated(new Date());
    }
  }, [data]);

  useEffect(() => {
    if (data !== undefined) return;
    mountedRef.current = true;
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch(endpoint, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Failed to load platform volume (${response.status})`);
        }
        const json: unknown = await response.json();
        const points = normalizePayload(json);
        if (!mountedRef.current) return;
        setHistory(points);
        setError(null);
        setLastUpdated(new Date());
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(load, refreshIntervalMs);

    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      controller.abort();
    };
  }, [data, endpoint, refreshIntervalMs]);

  const visibleHistory = useMemo(() => history.slice(-historyLimit), [history, historyLimit]);

  const totals = useMemo(() => {
    return visibleHistory.reduce(
      (acc, point) => ({
        escrow: acc.escrow + point.escrowVolume,
        payout: acc.payout + point.payoutVolume,
      }),
      { escrow: 0, payout: 0 },
    );
  }, [visibleHistory]);

  const escrowGrowth = useMemo(
    () => computeGrowth(visibleHistory, "escrowVolume"),
    [visibleHistory],
  );
  const payoutGrowth = useMemo(
    () => computeGrowth(visibleHistory, "payoutVolume"),
    [visibleHistory],
  );

  const maxValue = useMemo(() => {
    return visibleHistory.reduce((max, p) => Math.max(max, p.escrowVolume, p.payoutVolume), 0);
  }, [visibleHistory]);

  const trendPaths = useMemo(() => {
    if (visibleHistory.length < 2 || maxValue <= 0) {
      return { escrow: "", payout: "" };
    }
    const width = 100;
    const height = 40;
    const step = width / (visibleHistory.length - 1);
    const toPoints = (key: "escrowVolume" | "payoutVolume") =>
      visibleHistory
        .map((point, index) => {
          const x = index * step;
          const y = height - (point[key] / maxValue) * height;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ");
    return {
      escrow: toPoints("escrowVolume"),
      payout: toPoints("payoutVolume"),
    };
  }, [visibleHistory, maxValue]);

  const renderGrowth = (growth: number | null) => {
    if (growth === null) return <span className="text-xs opacity-70">no data</span>;
    const positive = growth >= 0;
    return (
      <span className={`text-xs font-medium ${positive ? "text-emerald-600" : "text-rose-600"}`}>
        {positive ? "▲" : "▼"} {Math.abs(growth).toFixed(1)}%
      </span>
    );
  };

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      aria-label="Platform financial volume"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Platform Financial Volume
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aggregated escrow and payout metrics across the entire platform.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
          {loading
            ? "Syncing…"
            : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for data"}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
        >
          Failed to refresh volume data: {error}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total Escrow Volume
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {formatCompact(totals.escrow)}
          </dd>
          <dd className="mt-1">{renderGrowth(escrowGrowth)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Total Payout Volume
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {formatCompact(totals.payout)}
          </dd>
          <dd className="mt-1">{renderGrowth(payoutGrowth)}</dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
          <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Combined Volume
          </dt>
          <dd className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {formatCurrency(totals.escrow + totals.payout)}
          </dd>
          <dd className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {visibleHistory.length} point{visibleHistory.length === 1 ? "" : "s"} in window
          </dd>
        </div>
      </dl>

      {!compact && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Volume growth trend
            </h3>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                Escrow
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Payout
              </span>
            </div>
          </div>
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="mt-3 h-32 w-full"
            role="img"
            aria-label="Volume growth trend chart"
          >
            {trendPaths.escrow && (
              <polyline
                points={trendPaths.escrow}
                fill="none"
                stroke="#6366f1"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {trendPaths.payout && (
              <polyline
                points={trendPaths.payout}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
        </div>
      )}
    </section>
  );
}
