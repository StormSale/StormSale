/**
 * src/lib/slaMonitoring.ts
 *
 * Enterprise SLA Monitoring & Real-time RPC Latency Engine (Issue #441)
 *
 * Implements:
 * 1. High-resolution latency ping measurements to Soroban RPC and Horizon endpoints.
 * 2. Rolling latency statistics calculation (Min, Max, Avg, P50, P95).
 * 3. SLA tier classification: Green (<200ms), Amber (200-800ms), Red (>800ms / offline).
 * 4. 30-day historical uptime tracker and SLA compliance calculator.
 */

export type SlaStatusTier = "green" | "amber" | "red";
export type EndpointType = "soroban" | "horizon";

export interface LatencyPingSample {
  id: string;
  endpoint: string;
  endpointType: EndpointType;
  latencyMs: number;
  timestamp: number;
  success: boolean;
  blockHeight?: number;
  error?: string;
}

export interface LatencyMetrics {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
}

export interface DailyUptimeRecord {
  date: string; // YYYY-MM-DD
  uptimePercent: number; // e.g. 99.98
  totalChecks: number;
  successfulChecks: number;
  incidentCount: number;
}

export interface SlaTierConfig {
  tier: SlaStatusTier;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  dotClass: string;
  description: string;
}

export interface SlaInfrastructureState {
  currentLatencyMs: number | null;
  blockHeight: number;
  statusTier: SlaStatusTier;
  statusLabel: string;
  p50: number;
  p95: number;
  sampleCount: number;
  isOffline: boolean;
  uptime30DaysPercent: number;
  dailyUptimeHistory: DailyUptimeRecord[];
  activeEndpoint: string;
  lastCheckedAt: number | null;
}

/**
 * Computes arbitrary percentile (e.g. 50 for P50, 95 for P95) from latency values.
 * Uses linear interpolation between closest ranks for precision.
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (!values || values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const p = Math.max(0, Math.min(100, percentile));
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  const interpolated = sorted[lower] * (1 - weight) + sorted[upper] * weight;
  return Math.round(interpolated * 100) / 100;
}

/**
 * Calculates rolling statistics (min, max, avg, P50, P95) for a collection of latencies.
 */
export function calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
  if (!latencies || latencies.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  }

  const valid = latencies.filter((l) => typeof l === "number" && !isNaN(l) && l >= 0);
  if (valid.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const sum = valid.reduce((acc, v) => acc + v, 0);
  const avg = Math.round((sum / valid.length) * 100) / 100;
  const p50 = calculatePercentile(valid, 50);
  const p95 = calculatePercentile(valid, 95);

  return {
    count: valid.length,
    min,
    max,
    avg,
    p50,
    p95,
  };
}

/**
 * Determines SLA status tier based on criteria:
 * - Green: < 200ms
 * - Amber: 200ms - 800ms
 * - Red: > 800ms or offline
 */
export function determineSlaStatusTier(
  latencyMs: number | null,
  isOffline: boolean = false,
): SlaTierConfig {
  if (isOffline || latencyMs === null || latencyMs < 0 || latencyMs > 800) {
    return {
      tier: "red",
      label: isOffline ? "Offline" : "Critical Latency",
      colorClass: "text-rose-600 dark:text-rose-400",
      bgClass: "bg-rose-500/10 dark:bg-rose-950/30",
      borderClass: "border-rose-500/30",
      dotClass: "bg-rose-500",
      description: isOffline
        ? "Endpoint unreachable or RPC connection dropped"
        : `Severe latency (${latencyMs}ms exceeds 800ms SLA threshold)`,
    };
  }

  if (latencyMs >= 200 && latencyMs <= 800) {
    return {
      tier: "amber",
      label: "Elevated Latency",
      colorClass: "text-amber-600 dark:text-amber-400",
      bgClass: "bg-amber-500/10 dark:bg-amber-950/30",
      borderClass: "border-amber-500/30",
      dotClass: "bg-amber-500",
      description: `Degraded response time (${latencyMs}ms is within 200ms-800ms warning window)`,
    };
  }

  return {
    tier: "green",
    label: "Optimal",
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 dark:bg-emerald-950/30",
    borderClass: "border-emerald-500/30",
    dotClass: "bg-emerald-500",
    description: `Healthy performance (${latencyMs}ms is below 200ms target)`,
  };
}

/**
 * Calculates aggregate uptime percentage from an array of daily uptime records.
 */
export function calculate30DayUptime(dailyHistory: DailyUptimeRecord[]): number {
  if (!dailyHistory || dailyHistory.length === 0) return 100;
  const recent30 = dailyHistory.slice(-30);
  const total = recent30.reduce((acc, d) => acc + d.uptimePercent, 0);
  return Math.round((total / recent30.length) * 1000) / 1000;
}

/**
 * Generates synthetic or seeded historical uptime records for the last 30 days.
 */
export function generate30DayUptimeHistory(
  baseUptimePercent: number = 99.98,
  incidentDays: number[] = [],
): DailyUptimeRecord[] {
  const records: DailyUptimeRecord[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 29; i >= 0; i--) {
    const dayTimestamp = now - i * dayMs;
    const dateStr = new Date(dayTimestamp).toISOString().split("T")[0];
    const isIncidentDay = incidentDays.includes(30 - i);

    let uptime = baseUptimePercent;
    let incidents = 0;

    if (isIncidentDay) {
      uptime = Math.round((baseUptimePercent - 1.5 - Math.random()) * 100) / 100;
      incidents = 2;
    }

    records.push({
      date: dateStr,
      uptimePercent: Math.min(100, Math.max(0, uptime)),
      totalChecks: 1440,
      successfulChecks: Math.round(1440 * (uptime / 100)),
      incidentCount: incidents,
    });
  }

  return records;
}

/**
 * Performs a network ping measurement against an RPC or Horizon URL.
 */
export async function executeRpcPing(
  endpointUrl: string,
  endpointType: EndpointType = "soroban",
  customFetch: typeof fetch = globalThis.fetch,
): Promise<{ latencyMs: number; success: boolean; blockHeight?: number; error?: string }> {
  const startTime = performance.now();
  try {
    const url = endpointUrl.endsWith("/") ? endpointUrl.slice(0, -1) : endpointUrl;
    let target = url;
    let method = "GET";
    let body: string | undefined = undefined;
    let headers: Record<string, string> = {};

    if (endpointType === "soroban") {
      target = url;
      method = "POST";
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        jsonrpc: "2.0",
        id: `ping_${Date.now()}`,
        method: "getLatestLedger",
        params: [],
      });
    } else {
      target = `${url}/fee_stats`;
    }

    const response = await customFetch(target, {
      method,
      headers,
      body,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return {
        latencyMs,
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    let blockHeight: number | undefined;
    try {
      const data = await response.json();
      if (endpointType === "soroban" && data?.result?.sequence) {
        blockHeight = Number(data.result.sequence);
      } else if (endpointType === "horizon" && data?.last_ledger) {
        blockHeight = Number(data.last_ledger);
      }
    } catch {
      // JSON parse non-fatal for pure latency measurement
    }

    return {
      latencyMs,
      success: true,
      blockHeight,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      latencyMs,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * SlaMonitorManager handles periodic ping scheduling, sample retention, and state broadcasts.
 */
export class SlaMonitorManager {
  private samples: LatencyPingSample[] = [];
  private maxSamples: number;
  private currentBlockHeight: number = 0;
  private dailyHistory: DailyUptimeRecord[];
  private activeEndpoint: string;
  private listeners: Set<(state: SlaInfrastructureState) => void> = new Set();
  private timer: NodeJS.Timeout | null = null;
  private isOffline: boolean = false;

  constructor(options?: {
    maxSamples?: number;
    initialBlockHeight?: number;
    initialEndpoint?: string;
    initialUptimeHistory?: DailyUptimeRecord[];
  }) {
    this.maxSamples = options?.maxSamples ?? 50;
    this.currentBlockHeight = options?.initialBlockHeight ?? 1284560;
    this.activeEndpoint = options?.initialEndpoint ?? "https://soroban-testnet.stellar.org";
    this.dailyHistory = options?.initialUptimeHistory ?? generate30DayUptimeHistory(99.98);
  }

  public recordSample(sample: LatencyPingSample): SlaInfrastructureState {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    if (sample.blockHeight && sample.blockHeight > this.currentBlockHeight) {
      this.currentBlockHeight = sample.blockHeight;
    }

    this.isOffline = !sample.success;
    const state = this.getState();
    this.notify(state);
    return state;
  }

  public setOffline(offline: boolean) {
    this.isOffline = offline;
    this.notify(this.getState());
  }

  public setBlockHeight(height: number) {
    this.currentBlockHeight = height;
    this.notify(this.getState());
  }

  public setEndpoint(endpoint: string) {
    this.activeEndpoint = endpoint;
    this.notify(this.getState());
  }

  public getSamples(): LatencyPingSample[] {
    return [...this.samples];
  }

  public clearSamples() {
    this.samples = [];
    this.notify(this.getState());
  }

  public getState(): SlaInfrastructureState {
    const latencies = this.samples.map((s) => s.latencyMs);
    const metrics = calculateLatencyMetrics(latencies);
    const latestSample = this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
    const currentLatency = latestSample && latestSample.success ? latestSample.latencyMs : null;

    const tierConfig = determineSlaStatusTier(currentLatency, this.isOffline);
    const uptime30Days = calculate30DayUptime(this.dailyHistory);

    return {
      currentLatencyMs: currentLatency,
      blockHeight: this.currentBlockHeight,
      statusTier: tierConfig.tier,
      statusLabel: tierConfig.label,
      p50: metrics.p50,
      p95: metrics.p95,
      sampleCount: this.samples.length,
      isOffline: this.isOffline,
      uptime30DaysPercent: uptime30Days,
      dailyUptimeHistory: this.dailyHistory,
      activeEndpoint: this.activeEndpoint,
      lastCheckedAt: latestSample ? latestSample.timestamp : null,
    };
  }

  public subscribe(listener: (state: SlaInfrastructureState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(state: SlaInfrastructureState) {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error("[SlaMonitorManager] Listener error:", err);
      }
    }
  }

  public startPeriodicPing(
    endpoints: { url: string; type: EndpointType }[],
    intervalMs: number = 5000,
    customFetch?: typeof fetch,
  ) {
    this.stopPeriodicPing();

    const doPing = async () => {
      for (const ep of endpoints) {
        const result = await executeRpcPing(ep.url, ep.type, customFetch);
        this.recordSample({
          id: `ping_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
          endpoint: ep.url,
          endpointType: ep.type,
          latencyMs: result.latencyMs,
          timestamp: Date.now(),
          success: result.success,
          blockHeight: result.blockHeight,
          error: result.error,
        });
      }
    };

    void doPing();
    this.timer = setInterval(doPing, intervalMs);
  }

  public stopPeriodicPing() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
