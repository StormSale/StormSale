import { describe, it, expect } from "vitest";
import {
  analyzeTransactionFlows,
  createAnomalyReport,
  type TransactionFlow,
} from "../lib/networkAnalysis";

const flow = (
  _id: number,
  source: string,
  destination: string,
  minute: number,
): TransactionFlow => ({
  source,
  destination,
  amountXlm: 10,
  timestamp: new Date(Date.UTC(2026, 4, 1, 12, minute)).toISOString(),
});

describe("network analysis red flags (#60)", () => {
  it("flags high-velocity sources and counts red flags", () => {
    const flows = [0, 1, 2, 3, 4].map((m, i) => flow(i + 1, "GSPAM", `GDEST${i}`, m * 2));
    const result = analyzeTransactionFlows(flows);
    const spammer = result.nodes.find((n) => n.address === "GSPAM");
    expect(spammer?.suspicious).toBe(true);
    expect(spammer?.redFlags.some((f) => f.type === "highVelocity")).toBe(true);
    expect(result.redFlagCount).toBeGreaterThan(0);
    expect(result.suspiciousAccountCount).toBeGreaterThan(0);
  });

  it("flags circular flows as wash trading", () => {
    const result = analyzeTransactionFlows([
      flow(1, "GA", "GB", 0),
      flow(2, "GB", "GC", 30),
      flow(3, "GC", "GA", 59),
    ]);
    const node = result.nodes.find((n) => n.address === "GA");
    expect(node?.redFlags.some((f) => f.type === "circularFlow")).toBe(true);
  });

  it("returns no flags for ordinary traffic", () => {
    const result = analyzeTransactionFlows([flow(1, "GX", "GY", 0)]);
    expect(result.redFlagCount).toBe(0);
  });

  it("creates anomaly reports and validates input", () => {
    const report = createAnomalyReport(
      "  GA  ",
      [{ type: "circularFlow", severity: "high", message: "loop" }],
      "  check  ",
    );
    expect(report.address).toBe("GA");
    expect(report.note).toBe("check");
    expect(report.flags).toHaveLength(1);
    expect(typeof report.id).toBe("string");
    expect(createAnomalyReport("GA", report.flags).note).toBeUndefined();
    expect(() => createAnomalyReport(" ", report.flags)).toThrow();
    expect(() => createAnomalyReport("GA", [])).toThrow();
  });
});
