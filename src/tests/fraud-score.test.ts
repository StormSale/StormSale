import { describe, expect, it } from "vitest";
import {
  bandForScore,
  computeHealthScore,
  deriveSignalsFromAnalysis,
  movingAverage,
  trimHistory,
  validateSignals,
  type FraudSignalInput,
} from "../lib/fraudScore";
import { analyzeTransactionFlows } from "../lib/networkAnalysis";

const SIGNALS: FraudSignalInput[] = [
  { key: "circular", label: "Circular flows", weight: 50, anomalies: 10, total: 100 },
  { key: "dispute", label: "Disputes", weight: 50, anomalies: 5, total: 100 },
];

describe("Platform Fraud / Health Score engine (#108)", () => {
  it("computes a weighted score of 100 minus summed penalties", () => {
    // circular density 0.10 -> 10pts * 0.5 weight = 5 penalty
    // dispute  density 0.05 ->  5pts * 0.5 weight = 2.5 penalty  => 92.5
    const snapshot = computeHealthScore(SIGNALS, 1000);
    expect(snapshot.score).toBe(92.5);
    expect(snapshot.band).toBe("healthy");
    expect(snapshot.totalAnomalies).toBe(15);
    expect(snapshot.timestamp).toBe(1000);
  });

  it("orders the breakdown by descending penalty contribution", () => {
    const snapshot = computeHealthScore(SIGNALS);
    expect(snapshot.breakdown[0].key).toBe("circular");
    expect(snapshot.breakdown[0].penalty).toBeCloseTo(5, 5);
    expect(snapshot.breakdown[1].penalty).toBeCloseTo(2.5, 5);
  });

  it("clamps catastrophic anomaly density to a floor of 0", () => {
    const snapshot = computeHealthScore([
      { key: "a", label: "A", weight: 100, anomalies: 500, total: 100 },
    ]);
    expect(snapshot.score).toBe(0);
    expect(snapshot.band).toBe("critical");
  });

  it("maps scores onto the correct integrity bands", () => {
    expect(bandForScore(80)).toBe("healthy");
    expect(bandForScore(79.9)).toBe("guarded");
    expect(bandForScore(60)).toBe("guarded");
    expect(bandForScore(59)).toBe("critical");
  });

  it("rejects signal sets whose weights do not sum to 100", () => {
    expect(() =>
      computeHealthScore([
        { key: "a", label: "A", weight: 40, anomalies: 1, total: 10 },
      ]),
    ).toThrow(/sum to 100%/);
  });

  it("surfaces duplicate keys and negative counts during validation", () => {
    const errors = validateSignals([
      { key: "dup", label: "A", weight: 50, anomalies: -1, total: 10 },
      { key: "dup", label: "B", weight: 50, anomalies: 1, total: 10 },
    ]);
    expect(errors.some((e) => /duplicate key/i.test(e))).toBe(true);
    expect(errors.some((e) => /non-negative/i.test(e))).toBe(true);
  });

  it("treats an empty population as zero risk rather than dividing by zero", () => {
    const snapshot = computeHealthScore([
      { key: "a", label: "A", weight: 100, anomalies: 0, total: 0 },
    ]);
    expect(snapshot.score).toBe(100);
  });

  it("derives weighted signals from a real transaction-network analysis", () => {
    const analysis = analyzeTransactionFlows([
      { source: "adv", destination: "escrow", amountXlm: 100, timestamp: "2026-01-01T00:00:00Z" },
      { source: "escrow", destination: "aff", amountXlm: 90, timestamp: "2026-01-02T00:00:00Z" },
      { source: "aff", destination: "adv", amountXlm: 80, timestamp: "2026-01-03T00:00:00Z" },
    ]);
    const signals = deriveSignalsFromAnalysis(analysis, {
      disputedConversions: 4,
      totalConversions: 200,
    });
    // Weights must always be a valid, scoreable set.
    expect(validateSignals(signals)).toEqual([]);
    const circular = signals.find((s) => s.key === "circular_flow");
    expect(circular?.anomalies).toBe(1);
    const snapshot = computeHealthScore(signals);
    expect(snapshot.score).toBeGreaterThan(0);
    expect(snapshot.score).toBeLessThanOrEqual(100);
  });

  it("computes a trailing moving average over a rolling window", () => {
    expect(movingAverage([100, 80, 60], 2)).toEqual([100, 90, 70]);
  });

  it("trims the real-time history buffer to the most recent samples", () => {
    const snapshots = [1, 2, 3, 4, 5].map((n) => computeHealthScore(SIGNALS, n));
    const trimmed = trimHistory(snapshots, 3);
    expect(trimmed).toHaveLength(3);
    expect(trimmed[0].timestamp).toBe(3);
    expect(trimHistory(snapshots, 0)).toEqual([]);
  });
});
