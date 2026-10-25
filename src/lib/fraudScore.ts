import type { NetworkAnalysis } from "./networkAnalysis";

/**
 * Real-time Platform Fraud / Health Score (Issue #108).
 *
 * Turns the raw anomaly-detection output of the transaction-network engine
 * (see {@link ./networkAnalysis}) into a single aggregate "Health Score" for
 * the platform, plus a weighted per-signal breakdown auditors can inspect.
 *
 * The score is intentionally pure & deterministic: given the same signal
 * inputs it always yields the same score, so the value shown in the live
 * dashboard is reproducible and unit-testable. The dashboard layers a real-time
 * sampling loop on top of these primitives.
 */

export type HealthBand = "healthy" | "guarded" | "critical";

export interface FraudSignalInput {
  /** Stable identifier used for keys + breakdown ordering. */
  key: string;
  /** Human label surfaced in the dashboard. */
  label: string;
  /** Relative importance as an integer percentage. All weights must sum to 100. */
  weight: number;
  /** Number of anomalies detected in this signal's population. */
  anomalies: number;
  /** Size of the population the signal was measured against. */
  total: number;
  /** Short description of what the signal measures. */
  description?: string;
}

export interface HealthScoreBreakdown extends FraudSignalInput {
  /** Anomaly density in the [0..1] range. */
  riskRatio: number;
  /** Density expressed on a 0..100 scale (before weighting). */
  riskPoints: number;
  /** Contribution to the total penalty: `riskPoints * weight / 100`. */
  penalty: number;
}

export interface HealthScoreSnapshot {
  /** Unix epoch (ms) of the sample. */
  timestamp: number;
  /** Aggregate platform health in [0..100] — higher is healthier. */
  score: number;
  /** Coarse band derived from the score. */
  band: HealthBand;
  /** Weighted per-signal breakdown, ordered by descending penalty. */
  breakdown: HealthScoreBreakdown[];
  /** Total anomalies across every signal in this sample. */
  totalAnomalies: number;
}

const HEALTHY_THRESHOLD = 80;
const GUARDED_THRESHOLD = 60;

export function bandForScore(score: number): HealthBand {
  if (score >= HEALTHY_THRESHOLD) return "healthy";
  if (score >= GUARDED_THRESHOLD) return "guarded";
  return "critical";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Validates a signal set. Returns the list of human-readable problems; an empty
 * array means the set is safe to score. Enforces unique keys, non-negative
 * counts and — critically — that weights sum to exactly 100 so the weighted
 * penalty is well defined against the 0..100 score scale.
 */
export function validateSignals(signals: FraudSignalInput[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(signals) || signals.length === 0) {
    return ["At least one fraud signal is required."];
  }

  const seen = new Set<string>();
  let totalWeight = 0;
  signals.forEach((signal, i) => {
    const position = i + 1;
    if (!signal.key || seen.has(signal.key)) {
      errors.push(`Signal ${position} has a missing or duplicate key.`);
    }
    seen.add(signal.key);

    if (!(signal.weight > 0) || signal.weight > 100) {
      errors.push(`Signal "${signal.key}" weight must be between 1 and 100.`);
    }
    if (!Number.isFinite(signal.anomalies) || signal.anomalies < 0) {
      errors.push(`Signal "${signal.key}" anomaly count must be a non-negative number.`);
    }
    if (!Number.isFinite(signal.total) || signal.total < 0) {
      errors.push(`Signal "${signal.key}" population total must be a non-negative number.`);
    }
    totalWeight += signal.weight;
  });

  if (totalWeight !== 100) {
    errors.push(`Signal weights must sum to 100% but total ${totalWeight}%.`);
  }

  return errors;
}

/**
 * Computes the aggregate platform Health Score from a set of weighted anomaly
 * signals. Each signal's density (anomalies / total) becomes a 0..100 risk
 * figure, scaled by its weight; the platform score is 100 minus the summed
 * penalties, clamped to the [0..100] range.
 */
export function computeHealthScore(
  signals: FraudSignalInput[],
  timestamp: number = Date.now(),
): HealthScoreSnapshot {
  const errors = validateSignals(signals);
  if (errors.length > 0) {
    throw new Error(`Invalid fraud signal set: ${errors.join(" ")}`);
  }

  let totalPenalty = 0;
  let totalAnomalies = 0;

  const breakdown: HealthScoreBreakdown[] = signals.map((signal) => {
    totalAnomalies += signal.anomalies;
    const riskRatio = signal.total > 0 ? clamp(signal.anomalies / signal.total, 0, 1) : 0;
    const riskPoints = riskRatio * 100;
    const penalty = (riskPoints * signal.weight) / 100;
    totalPenalty += penalty;
    return { ...signal, riskRatio, riskPoints, penalty };
  });

  const score = round2(clamp(100 - totalPenalty, 0, 100));

  return {
    timestamp,
    score,
    band: bandForScore(score),
    breakdown: breakdown.sort((a, b) => b.penalty - a.penalty),
    totalAnomalies,
  };
}

/**
 * Bridges the anomaly-detection engine into fraud signals so the health score
 * is genuinely driven by on-chain transaction-graph analysis rather than static
 * numbers. Counts that the analyzer does not emit (disputes, sanctions) are
 * supplied by the caller as platform-wide aggregates.
 */
export function deriveSignalsFromAnalysis(
  analysis: NetworkAnalysis,
  extra?: {
    disputedConversions?: number;
    totalConversions?: number;
    sanctionHits?: number;
    totalAccountsScreened?: number;
    anomalousRefunds?: number;
    totalRefunds?: number;
  },
): FraudSignalInput[] {
  const totalAccounts = Math.max(analysis.nodes.length, 1);
  const totalEdges = Math.max(analysis.edges.length, 1);

  return [
    {
      key: "circular_flow",
      label: "Circular fund flows",
      description: "Closed loops where value returns to its origin across the ledger graph.",
      weight: 25,
      anomalies: analysis.circularFlows.length,
      total: totalEdges,
    },
    {
      key: "shared_funding",
      label: "Shared funding clusters",
      description: "Multiple merchants capitalised from a single source wallet.",
      weight: 20,
      anomalies: analysis.sharedFundingGroups.length,
      total: totalAccounts,
    },
    {
      key: "correlated_timing",
      label: "Correlated timing bursts",
      description: "Distinct accounts transacting inside the same two-minute window.",
      weight: 20,
      anomalies: analysis.correlatedTimingGroups.reduce((acc, group) => acc + group.length, 0),
      total: totalEdges,
    },
    {
      key: "dispute_rate",
      label: "Conversion disputes",
      description: "Logged sales contested during the clearing window.",
      weight: 15,
      anomalies: Math.max(0, Math.round(extra?.disputedConversions ?? 0)),
      total: Math.max(1, Math.round(extra?.totalConversions ?? 1)),
    },
    {
      key: "sanction_hits",
      label: "Sanctions screening",
      description: "Counterparties matching OFAC / EU denied-party lists.",
      weight: 10,
      anomalies: Math.max(0, Math.round(extra?.sanctionHits ?? 0)),
      total: Math.max(1, Math.round(extra?.totalAccountsScreened ?? totalAccounts)),
    },
    {
      key: "refund_anomaly",
      label: "Escrow refund anomalies",
      description: "Irregular escrow refund patterns flagged by the payout monitor.",
      weight: 10,
      anomalies: Math.max(0, Math.round(extra?.anomalousRefunds ?? 0)),
      total: Math.max(1, Math.round(extra?.totalRefunds ?? 1)),
    },
  ];
}

/**
 * Produces a smoothed moving average over a chronological snapshot list so the
 * historical trend chart can render a baseline alongside the raw samples.
 */
export function movingAverage(scores: number[], window: number): number[] {
  if (window <= 0) throw new Error("Moving-average window must be positive.");
  const size = Math.min(window, scores.length);
  return scores.map((_, index) => {
    const start = Math.max(0, index - size + 1);
    const slice = scores.slice(start, index + 1);
    const sum = slice.reduce((acc, value) => acc + value, 0);
    return round2(sum / slice.length);
  });
}

/**
 * Trims a growing real-time history buffer down to the most recent `limit`
 * samples, keeping the oldest discarded. Guards the dashboard against unbounded
 * memory growth while it streams live scores.
 */
export function trimHistory(history: HealthScoreSnapshot[], limit: number): HealthScoreSnapshot[] {
  if (limit <= 0) return [];
  return history.length <= limit ? history : history.slice(history.length - limit);
}
