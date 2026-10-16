import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  Download,
  Clock,
  Lock,
  TrendingUp,
  TrendingDown,
  Activity,
} from "lucide-react";

const complianceItems = [
  {
    standard: "NIST SP 800-53",
    category: "Access Control (AC)",
    status: "Compliant",
    lastChecked: "2026-05-16",
    details:
      "All audit access operations use cryptographic key verification before granting data access.",
  },
  {
    standard: "ISO/IEC 27001",
    category: "Information Security Management",
    status: "Compliant",
    lastChecked: "2026-05-14",
    details: "Sale data encryption meets AES-256 standard. Wrapped keys are stored on-chain.",
  },
  {
    standard: "GDPR Article 32",
    category: "Security of Processing",
    status: "Review Needed",
    lastChecked: "2026-05-10",
    details:
      "Customer PII handling policy pending review. Encryption is implemented but documented controls need update.",
  },
  {
    standard: "SOC 2 Type II",
    category: "Availability & Confidentiality",
    status: "Compliant",
    lastChecked: "2026-05-12",
    details: "Platform uptime 99.9%. All sensitive data flows through encrypted channels.",
  },
  {
    standard: "FIPS 140-2",
    category: "Cryptographic Module Validation",
    status: "Compliant",
    lastChecked: "2026-05-15",
    details:
      "AES-GCM encryption with validated key derivation functions in use across all campaigns.",
  },
];

const statusMap: Record<string, { badge: string; icon: ComponentType<{ className?: string }> }> = {
  Compliant: {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  "Review Needed": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
    icon: AlertTriangle,
  },
};

// -----------------------------------------------------------------------------
// Platform Financial Volume Widget
// -----------------------------------------------------------------------------

export interface VolumeSample {
  /** ISO timestamp of the sample bucket */
  timestamp: string;
  /** Aggregated escrow volume in XLM */
  escrow: number;
  /** Aggregated payout volume in XLM */
  payouts: number;
}

export interface PlatformVolumeSnapshot {
  totalEscrow: number;
  totalPayouts: number;
  totalVolume: number;
  activeEscrows: number;
  updatedAt: string;
  history: VolumeSample[];
}

export type VolumeSource = () => Promise<PlatformVolumeSnapshot>;

export interface PlatformFinancialVolumeWidgetProps {
  /** Poll interval in milliseconds. Defaults to 5000. */
  pollIntervalMs?: number;
  /** Optional data source override (for testing or embedding). */
  source?: VolumeSource;
  /** Optional className for the outer container. */
  className?: string;
}

export const defaultVolumeSource: VolumeSource = async () => {
  const response = await fetch("/api/auditor/platform-volume", {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to load platform volume (${response.status})`);
  }
  const data = (await response.json()) as PlatformVolumeSnapshot;
  return data;
};

const formatXLM = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const formatCompact = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const calculateGrowth = (history: VolumeSample[], key: "escrow" | "payouts"): number => {
  if (history.length < 2) return 0;
  const latest = history[history.length - 1][key];
  const previous = history[history.length - 2][key];
  if (previous === 0) return latest > 0 ? 100 : 0;
  return ((latest - previous) / previous) * 100;
};

const buildSparklinePath = (values: number[], width: number, height: number): string => {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
};

const Sparkline = ({
  values,
  color,
  label,
}: {
  values: number[];
  color: string;
  label: string;
}) => {
  const width = 160;
  const height = 48;
  const path = buildSparklinePath(values, width, height);
  const areaPath = path
    ? `${path} L ${width} ${height} L 0 ${height} Z`
    : "";
  const gradientId = `sparkline-${label.replace(/\W/g, "-").toLowerCase()}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-12"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} trend`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const GrowthBadge = ({ value }: { value: number }) => {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`
        inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full
        ${
          positive
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
            : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
        }
      `}
    >
      <Icon className="w-3 h-3" />
      {`${positive ? "+" : ""}${value.toFixed(1)}%`}
    </span>
  );
};

export const PlatformFinancialVolumeWidget = ({
  pollIntervalMs = 5000,
  source = defaultVolumeSource,
  className,
}: PlatformFinancialVolumeWidgetProps) => {
  const [snapshot, setSnapshot] = useState<PlatformVolumeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const load = async () => {
      try {
        const next = await source();
        if (!cancelled) {
          setSnapshot(next);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    };

    void load();
    timer = setInterval(load, pollIntervalMs);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [pollIntervalMs, source]);

  const escrowGrowth = useMemo(
    () => (snapshot ? calculateGrowth(snapshot.history, "escrow") : 0),
    [snapshot],
  );
  const payoutGrowth = useMemo(
    () => (snapshot ? calculateGrowth(snapshot.history, "payouts") : 0),
    [snapshot],
  );

  const escrowSeries = useMemo(
    () => snapshot?.history.map((s) => s.escrow) ?? [],
    [snapshot],
  );
  const payoutSeries = useMemo(
    () => snapshot?.history.map((s) => s.payouts) ?? [],
    [snapshot],
  );

  if (loading && !snapshot) {
    return (
      <Card
        className={`border border-slate-200 dark:border-zinc-800 rounded-2 to bg-white dark:bg-zinc-900/80 ${className ?? ""}`}
      >
        <CardContent className="p-6">
          <div className="animate-pulse space-3">
            <div class="h-4 w-40 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div class="h-10 w-56 bg-slate-200 dark:bg-zinc-800 rounded" />
            <div class="h-12 w-full bg-slate-200 dark:bg-zinc-800 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !snapshot) {
    return (
      <Card
        className={`border border-rose-200 dark:border-rose-500/30 rounded-2 to bg-white dark:bg-zinc-900/80 ${className ?? ""}`}
      >
        <CardContent className="p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-sm text-zinc-900 dark:text-white">
              Unable to load platform volume
            </p>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
              {error}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalEscrow = snapshot?.totalEscrow ?? 0;
  const totalPayouts = snapshot?.totalPayouts ?? 0;
  const totalVolume = snapshot?.totalVolume ?? totalEscrow + totalPayouts;
  const activeEscrows = snapshot?.activeEscrows ?? 0;

  return (
    <Card
      className={`border border-slate-200 dark:border-zinc-800 rounded-3 to shadow-sm bg-white dark:bg-zinc-900/50 ${className ?? ""}`}
    >
      <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Platform Financial Volume
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Aggregated escrow and payout metrics across the entire platform
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
            <span
              className={`w-2 h-2 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500 animate-pulse"}`}
              aria-hidden="true"
            />
            {error ? "Reconnecting" : "Live"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 p-5">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Total Volume
              </div>
              <GrowthBadge value={escrowGrowth} />
            </div>
            <div className="text-3 xl font-extrabold text-zinc-900 dark:text-white mt-2 tab-numeric">
              {formatXLM(totalVolume)} <span className="text-sm font-bold text-zinc-400">XLM</span>
            </div>
            <div className="mt-3">
              <Sparkline values={escrowSeries} color="#6366f1" label="Total volume" />
            </div>
            <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-2">
              {activeEscrows} active escrows
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 p-5">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Total Escrow
              </div>
              <GrowthBadge value={escrowGrowth} />
            </div>
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-2 tab-numeric">
              {formatXLM(totalEscrow)} <span className="text-sm font-bold text-zinc-400">XLM</span>
            </div>
            <div className="mt-3">
              <Sparkline values={escrowSeries} color="#10b981" label="Escrow" />
            </div>
            <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-2">
              Compact: ${formatCompact(totalEscrow)}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-zinc-800 p-5">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Total Payouts
              </div>
              <GrowthBadge value={payoutGrowth} />
            </div>
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white mt-2 tab-numeric">
              {formatXLM(totalPayouts)} <span className="text-sm font-bold text-zinc-400">XLM</span>
            </div>
            <div className="mt-3">
              <Sparkline values={payoutSeries} color="#f59e0b" label="Payouts" />
            </div>
            <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mt-2">
              Compact: ${formatCompact(totalPayouts)}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
          <span>
            Last updated: {snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : "-"}
          </span>
          <span>Polling every {Math.round(pollIntervalMs / 1000)}s</span>
        </div>
      </CardContent>
    </Card>
  );
};

export const ComplianceReport = () => {
  const compliant = complianceItems.filter((c) => c.status === "Compliant").length;
  const review = complianceItems.filter((c) => c.status === "Review Needed").length;

  return (
    <div className="space-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Compliance Report
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Security & regulatory compliance status for active campaigns
          </p>
        </div>
        <Button className="h-10 rounded-xl bg-zinc-900 dark:bg-indigo-600 text-white font-semibold shadow-sm">
          <Download className="w-4 h-4 mr-2" />
          Export PDF Report
        </Button>
      </div>

      {/* Platform Financial Volume Widget */}
      <PlatformFinancialVolumeWidget />

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">
              {compliant}/{complianceItems.length}
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Standards Compliant
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">{review}</div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Require Review
            </div>
          </CardContent>
        </Card>
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <CardContent className="p-6">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-white">AES-256</div>
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-2">
              Encryption Standard
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance items */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <FileCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                Regulatory Standards
              </CardTitle>
              <CardDescription className="texr-zinc-500 dark:text-zinc-400 mt-1">
                Compliance status for active security frameworks
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
            {complianceItems.map((item, i) => {
              const cfg = statusMap[item.status];
              const StatusIcon = cfg.icon;
              return (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-8 py-6 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.status === "Compliant" ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20" : "bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20"}`}
                    >
                      <StatusIcon
                        className={`w-5 h-5 ${item.status === "Compliant" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-zinc-900 dark:text-white">
                        {item.standard}
                      </div>
                      <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                        {item.category}
                      </div>
                      <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-lg">
                        {item.details}
                      </p>
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                    <span
                      className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${cfg.badge}`}
                    >
                      {item.status}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                      <Clock className="w-3 h-3" />
                      {item.lastChecked}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Bottom notice */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-zinc-900 dark:text-white text-sm">Audit Immutability</p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                All compliance audit actions are immutably recorded on the Stellar network.
                Timestamps, access grants and denial logs cannot be altered after they are written.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
