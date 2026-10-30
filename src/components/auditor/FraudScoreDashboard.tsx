import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Pause,
  Play,
  RefreshCw,
  Radio,
} from "lucide-react";
import {
  computeHealthScore,
  trimHistory,
  type FraudSignalInput,
  type HealthBand,
  type HealthScoreSnapshot,
} from "../../lib/fraudScore";

/**
 * Real-time Platform Fraud / Health Score dashboard (Issue #108).
 *
 * Streams a live anomaly-detection feed, recomputes the aggregate platform
 * Health Score every tick via the pure {@link computeHealthScore} engine, and
 * renders both the current reading (radial gauge + weighted signal breakdown)
 * and a historical trend chart so auditors can watch platform integrity evolve.
 */

const MAX_HISTORY = 40;
const TICK_MS = 3000;

const BAND_META: Record<
  HealthBand,
  { label: string; stroke: string; text: string; ring: string; chip: string }
> = {
  healthy: {
    label: "Healthy",
    stroke: "#10b981",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "stroke-emerald-500",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  guarded: {
    label: "Guarded",
    stroke: "#f59e0b",
    text: "text-amber-600 dark:text-amber-400",
    ring: "stroke-amber-500",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
  critical: {
    label: "Critical",
    stroke: "#ef4444",
    text: "text-red-600 dark:text-red-400",
    ring: "stroke-red-500",
    chip: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  },
};

interface BaselineSignal extends FraudSignalInput {
  /** Typical anomaly count the live feed oscillates around. */
  volatility: number;
}

const BASELINE_SIGNALS: BaselineSignal[] = [
  {
    key: "circular_flow",
    label: "Circular fund flows",
    description: "Closed loops where value returns to its origin across the ledger graph.",
    weight: 25,
    anomalies: 2,
    total: 640,
    volatility: 4,
  },
  {
    key: "shared_funding",
    label: "Shared funding clusters",
    description: "Multiple merchants capitalised from a single source wallet.",
    weight: 20,
    anomalies: 3,
    total: 210,
    volatility: 5,
  },
  {
    key: "correlated_timing",
    label: "Correlated timing bursts",
    description: "Distinct accounts transacting inside the same two-minute window.",
    weight: 20,
    anomalies: 9,
    total: 640,
    volatility: 12,
  },
  {
    key: "dispute_rate",
    label: "Conversion disputes",
    description: "Logged sales contested during the clearing window.",
    weight: 15,
    anomalies: 6,
    total: 1200,
    volatility: 8,
  },
  {
    key: "sanction_hits",
    label: "Sanctions screening",
    description: "Counterparties matching OFAC / EU denied-party lists.",
    weight: 10,
    anomalies: 0,
    total: 480,
    volatility: 1,
  },
  {
    key: "refund_anomaly",
    label: "Escrow refund anomalies",
    description: "Irregular escrow refund patterns flagged by the payout monitor.",
    weight: 10,
    anomalies: 4,
    total: 300,
    volatility: 6,
  },
];

/**
 * Deterministic-ish pseudo-random walk so the demo feed drifts realistically
 * between samples instead of jumping around with Math.random alone.
 */
function sampleSignals(tick: number): FraudSignalInput[] {
  return BASELINE_SIGNALS.map((signal) => {
    const wave = Math.sin((tick + signal.weight) / 3) * (signal.volatility / 2);
    const noise = (Math.random() - 0.5) * signal.volatility;
    const anomalies = Math.max(0, Math.round(signal.anomalies + wave + noise));
    return {
      key: signal.key,
      label: signal.label,
      description: signal.description,
      weight: signal.weight,
      anomalies,
      total: signal.total,
    };
  });
}

function buildSeriesPath(history: HealthScoreSnapshot[], width: number, height: number) {
  if (history.length === 0) return { line: "", area: "" };
  const points = history.map((snapshot, index) => {
    const x = history.length === 1 ? width : (index / (history.length - 1)) * width;
    const y = height - (snapshot.score / 100) * height;
    return { x, y };
  });
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;
  return { line, area };
}

const RadialGauge: React.FC<{ score: number; band: HealthBand }> = ({ score, band }) => {
  const meta = BAND_META[band];
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  return (
    <div className="relative w-36 h-36 shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" strokeWidth="12" className="stroke-slate-100 dark:stroke-zinc-800" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          stroke={meta.stroke}
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-black ${meta.text}`}>{Math.round(score)}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">/ 100</span>
      </div>
    </div>
  );
};

export const FraudScoreDashboard: React.FC = () => {
  const tickRef = useRef(0);
  const [isLive, setIsLive] = useState(true);
  const [history, setHistory] = useState<HealthScoreSnapshot[]>([]);

  const pushSample = () => {
    tickRef.current += 1;
    const snapshot = computeHealthScore(sampleSignals(tickRef.current));
    setHistory((prev) => trimHistory([...prev, snapshot], MAX_HISTORY));
  };

  // Seed the chart with a short back-history so the trend is meaningful on load.
  useEffect(() => {
    const seeded: HealthScoreSnapshot[] = [];
    for (let i = 0; i < 16; i++) {
      tickRef.current += 1;
      seeded.push(computeHealthScore(sampleSignals(tickRef.current), Date.now() - (16 - i) * TICK_MS));
    }
    setHistory(trimHistory(seeded, MAX_HISTORY));
  }, []);

  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(pushSample, TICK_MS);
    return () => window.clearInterval(id);
  }, [isLive]);

  const current = history[history.length - 1];
  const meta = BAND_META[current?.band ?? "healthy"];
  const trend = useMemo(() => {
    if (history.length < 2) return 0;
    const previous = history[history.length - 2].score;
    return Math.round(((current.score - previous) / 1) * 100) / 100;
  }, [history, current]);

  const { line, area } = buildSeriesPath(history, 600, 160);
  const lastUpdated = current ? new Date(current.timestamp).toLocaleTimeString() : "—";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Platform Health Score
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Aggregate fraud-risk index derived from real-time anomaly detection across the
            transaction network.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${meta.chip}`}
          >
            <Radio className={`w-3.5 h-3.5 ${isLive ? "animate-pulse" : "opacity-50"}`} />
            {isLive ? "Live feed" : "Paused"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsLive((v) => !v)}
            className="h-9 rounded-xl text-xs font-semibold"
          >
            {isLive ? <Pause className="w-4 h-4 mr-1.5" /> : <Play className="w-4 h-4 mr-1.5" />}
            {isLive ? "Pause" : "Resume"}
          </Button>
          <Button size="sm" onClick={pushSample} className="h-9 rounded-xl text-xs font-semibold">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Sample now
          </Button>
        </div>
      </div>

      {/* Current score + breakdown */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardContent className="p-6 flex flex-col items-center text-center gap-4">
            <RadialGauge score={current?.score ?? 100} band={current?.band ?? "healthy"} />
            <div>
              <div className={`flex items-center justify-center gap-2 text-sm font-black ${meta.text}`}>
                {current?.band === "healthy" ? (
                  <ShieldCheck className="w-4 h-4" />
                ) : current?.band === "guarded" ? (
                  <ShieldAlert className="w-4 h-4" />
                ) : (
                  <AlertTriangle className="w-4 h-4" />
                )}
                {meta.label} integrity
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Last updated {lastUpdated}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full pt-2 border-t border-slate-100 dark:border-zinc-800">
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                  24h Signals
                </div>
                <div className="text-lg font-black text-zinc-900 dark:text-white">
                  {current?.totalAnomalies ?? 0}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">
                  Trend Δ
                </div>
                <div
                  className={`text-lg font-black ${
                    trend > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : trend < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-500"
                  }`}
                >
                  {trend > 0 ? "+" : ""}
                  {trend}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Weighted risk contributions
            </CardTitle>
            <CardDescription className="text-xs">
              Each anomaly signal's share of the current penalty against a perfect 100 score.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {(current?.breakdown ?? []).map((signal) => {
              const share = Math.min(100, signal.penalty * 4);
              return (
                <div key={signal.key} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-bold text-zinc-900 dark:text-white">
                      {signal.label}
                      <span className="ml-2 font-normal text-zinc-400">
                        weight {signal.weight}% · {signal.anomalies}/{signal.total}
                      </span>
                    </div>
                    <div className="font-mono font-black text-rose-600 dark:text-rose-400">
                      −{signal.penalty.toFixed(2)}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-500"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  {signal.description && (
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-snug">
                      {signal.description}
                    </p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Historical trend */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-4">
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
            Historical health trend
          </CardTitle>
          <CardDescription className="text-xs">
            Rolling platform Health Score over the last {history.length} samples · band thresholds
            at 60 and 80.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="w-full overflow-hidden">
            <svg
              viewBox="0 0 600 160"
              preserveAspectRatio="none"
              role="img"
              aria-label="Historical platform health score trend"
              className="w-full h-48"
            >
              {/* Band reference lines */}
              <line x1="0" y1={160 - 0.8 * 160} x2="600" y2={160 - 0.8 * 160} stroke="#10b981" strokeDasharray="4 4" strokeWidth="1" opacity="0.4" />
              <line x1="0" y1={160 - 0.6 * 160} x2="600" y2={160 - 0.6 * 160} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth="1" opacity="0.4" />
              <defs>
                <linearGradient id="healthArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.stroke} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={meta.stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              {area && <path d={area} fill="url(#healthArea)" />}
              {line && (
                <path d={line} fill="none" stroke={meta.stroke} strokeWidth="2.5" strokeLinejoin="round" />
              )}
              {current && (
                <circle
                  cx={600}
                  cy={160 - (current.score / 100) * 160}
                  r="4"
                  fill={meta.stroke}
                />
              )}
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap gap-5 text-xs text-zinc-500">
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Healthy ≥ 80
            </span>
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-500" />
              Guarded ≥ 60
            </span>
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500" />
              Critical &lt; 60
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
