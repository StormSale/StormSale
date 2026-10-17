import { ClaimHistoryItem } from "../types/auditor";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface AnomalyFlag {
  id: string;
  type: "wash-trading" | "rapid-claim" | "circular-transfer" | "concentration";
  severity: AnomalySeverity;
  title: string;
  description: string;
  affectedRoles: string[];
  metrics: Record<string, number | string>;
  timestamp: string;
}

export interface AnomalyReport {
  id: string;
  flagId: string;
  reportedAt: string;
  notes: string;
  status: "submitted" | "reviewed";
}

export interface AnomalyDetectionResult {
  flags: AnomalyFlag[];
  score: number;
  generatedAt: string;
}

const RAPID_CLAIM_WINDOW_MS = 10 * 60 * 1000;
const RAPID_CLAIM_THRESHOLD = 3;
const WASH_TRADING_WINDOW_MS = 24 * 60 * 60 * 1000;
const WASH_TRADING_MIN_ROUND_TRIP_RATIO = 0.6;
const CONCENTRATION_THRESHOLD = 0.75;

const severityWeight: Record<AnomalySeverity, number> = {
  low: 10,
  medium: 25,
  high: 40,
  critical: 60,
};

function toTime(value: string | number | Date | undefined): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function uniqueId(prefix: string, seed: string): string {
  return `${prefix}-${seed}`;
}

export function detectRapidClaims(claims: ClaimHistoryItem[]): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const sorted = [...claims].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = toTime(sorted[i].timestamp);
    const inWindow = sorted.filter(
      (claim) =>
        toTime(claim.timestamp) >= windowStart &&
        toTime(claim.timestamp) <= windowStart + RAPID_CLAIM_WINDOW_MS,
    );
    const roles = Array.from(new Set(inWindow.map((claim) => claim.role)));

    if (inWindow.length >= RAPID_CLAIM_THRESHOLD) {
      const severity: AnomalySeverity =
        inWindow.length >= RAPID_CLAIM_THRESHOLD * 2 ? "critical" : "high";
      flags.push({
        id: uniqueId("rapid-claim", `${roles[0]}-${windowStart}`),
        type: "rapid-claim",
        severity,
        title: "Rapid claim burst detected",
        description: `${inWindow.length} claims were made by ${roles.join(", ")} within ${Math.round(RAPID_CLAIM_WINDOW_MS / 60000)} minutes.`,
        affectedRoles: roles,
        metrics: {
          claimCount: inWindow.length,
          windowMinutes: Math.round(RAPID_CLAIM_WINDOW_MS / 60000),
        },
        timestamp: sorted[i].timestamp,
      });
      i += inWindow.length - 1;
    }
  }

  return flags;
}

export function detectWashTrading(claims: ClaimHistoryItem[]): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  const byRole = new Map<string, ClaimHistoryItem[]>();

  for (const claim of claims) {
    const list = byRole.get(claim.role) ?? [];
    list.push(claim);
    byRole.set(claim.role, list);
  }

  for (const [role, roleClaims] of byRole.entries()) {
    const sorted = [...roleClaims].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));
    const roundTrips = sorted.filter((claim) => claim.action === "round-trip").length;
    const ratio = sorted.length > 0 ? roundTrips / sorted.length : 0;
    const windowStart = toTime(sorted[0]?.timestamp);
    const windowEnd = toTime(sorted[sorted.length - 1]?.timestamp);

    if (ratio >= WASH_TRADING_MIN_ROUND_TRIP_RATIO && roundTrips >= 2) {
      flags.push({
        id: uniqueId("wash-trading", `${role}-${windowStart}`),
        type: "wash-trading",
        severity: ratio >= 0.85 ? "critical" : "high",
        title: "Wash-trading pattern detected",
        description: `${Math.round(ratio * 100)}% of claims by ${role} are round-trips within a 24 hour window.`,
        affectedRoles: [role],
        metrics: {
          roundTrips: roundTrips,
          totalClaims: sorted.length,
          roundTripRatio: Number(ratio.toFixed(2)),
          windowHours: Math.round((windowEnd - windowStart) / 3600000),
        },
        timestamp: sorted[sorted.length - 1].timestamp,
      });
    }
  }

  return flags;
}

export function detectConcentration(claims: ClaimHistoryItem[]): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  if (claims.length < 4) return flags;

  const byRole = new Map<string, number>();
  for (const claim of claims) {
    byRole.set(claim.role, (byRole.get(claim.role) ?? 0) + 1);
  }

  const total = claims.length;
  const sortedRoles = Array.from(byRole.entries()).sort((a, b) => b[1] - a[1]);
  const [topRole, topCount] = sortedRoles[0];
  const share = topCount / total;

  if (share >= CONCENTRATION_THRESHOLD) {
    flags.push({
      id: uniqueId("concentration", topRole),
      type: "concentration",
      severity: share >= 0.9 ? "critical" : "medium",
      title: "Claim concentration detected",
      description: `${topRole} accounts for ${Math.round(share * 100)}% of all claims (${topCount}/${total}).`,
      affectedRoles: [topRole],
      metrics: {
        topRoleClaims: topCount,
        totalClaims: total,
        share: Number(share.toFixed(2)),
      },
      timestamp: claims[claims.length - 1].timestamp,
    });
  }

  return flags;
}

export function detectAnomalies(claims: ClaimHistoryItem[]): AnomalyDetectionResult {
  const flags = [
    ...detectRapidClaims(claims),
    ...detectWashTrading(claims),
    ...detectConcentration(claims),
  ].sort((a, b) => severityWeight[b.severity] - severityWeight[a.severity]);

  const score = Math.min(
    100,
    flags.reduce((sum, flag) => sum + severityWeight[flag.severity], 0),
  );

  return {
    flags,
    score,
    generatedAt: new Date().toISOString(),
  };
}

export function createAnomalyReport(flag: AnomalyFlag, notes: string): AnomalyReport {
  return {
    id: uniqueId("report", `${flag.id}-${Date.now()}`),
    flagId: flag.id,
    reportedAt: new Date().toISOString(),
    notes,
    status: "submitted",
  };
}
