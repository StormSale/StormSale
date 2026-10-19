import { describe, expect, it } from "vitest";
import { analyzeTransactionFlows, parseTransactionFlows } from "../lib/networkAnalysis";

describe("transaction network analysis", () => {
  it("parses normalized and common ledger transaction field names", () => {
    expect(
      parseTransactionFlows({
        transactions: [
          { from: "advertiser", to: "escrow", amount: "12000", created_at: "2026-10-18T10:00:00Z" },
        ],
      }),
    ).toEqual([
      {
        source: "advertiser",
        destination: "escrow",
        amountXlm: 12000,
        timestamp: "2026-10-18T10:00:00.000Z",
        sourceRole: undefined,
        destinationRole: undefined,
        transactionHash: undefined,
      },
    ]);
  });

  it("rejects malformed transactions instead of silently omitting them", () => {
    expect(() => parseTransactionFlows([{ source: "a", destination: "b", amount: -1 }])).toThrow(
      "invalid XLM amount",
    );
  });

  it("flags directed circular flows and shared funding", () => {
    const analysis = analyzeTransactionFlows([
      {
        source: "advertiser",
        destination: "escrow",
        amountXlm: 100,
        timestamp: "2026-01-01T00:00:00Z",
      },
      {
        source: "escrow",
        destination: "affiliate",
        amountXlm: 90,
        timestamp: "2026-01-02T00:00:00Z",
      },
      {
        source: "affiliate",
        destination: "advertiser",
        amountXlm: 80,
        timestamp: "2026-01-03T00:00:00Z",
      },
      {
        source: "funding-wallet",
        destination: "merchant-a",
        amountXlm: 10,
        timestamp: "2026-02-01T00:00:00Z",
      },
      {
        source: "funding-wallet",
        destination: "merchant-b",
        amountXlm: 10,
        timestamp: "2026-02-05T00:00:00Z",
      },
    ]);

    expect(analysis.circularFlows).toContainEqual([
      "advertiser",
      "escrow",
      "affiliate",
      "advertiser",
    ]);
    expect(analysis.edges.slice(0, 3).every((edge) => edge.circular)).toBe(true);
    expect(analysis.sharedFundingGroups).toContainEqual([
      "funding-wallet",
      "merchant-a",
      "merchant-b",
    ]);
    expect(analysis.edges[3].sharedFunding).toBe(true);
    expect(analysis.edges[4].sharedFunding).toBe(true);
    expect(analysis.nodes.find((node) => node.address === "funding-wallet")?.suspicious).toBe(
      false,
    );
    expect(analysis.nodes.find((node) => node.address === "merchant-a")?.suspicious).toBe(true);
  });

  it("flags distinct accounts transacting in the same two-minute window", () => {
    const result = analyzeTransactionFlows([
      {
        source: "wallet-a",
        destination: "escrow",
        amountXlm: 1,
        timestamp: "2026-01-01T00:00:10Z",
      },
      {
        source: "wallet-b",
        destination: "escrow",
        amountXlm: 1,
        timestamp: "2026-01-01T00:00:50Z",
      },
      {
        source: "wallet-c",
        destination: "escrow",
        amountXlm: 1,
        timestamp: "2026-01-01T00:05:00Z",
      },
    ]);

    expect(result.correlatedTimingGroups).toEqual([[0, 1]]);
    expect(result.edges.map((edge) => edge.correlatedTiming)).toEqual([true, true, false]);
  });

  it("finds correlated transfers across a clock-bucket boundary", () => {
    const result = analyzeTransactionFlows([
      {
        source: "wallet-a",
        destination: "escrow",
        amountXlm: 1,
        timestamp: "2026-01-01T00:01:59Z",
      },
      {
        source: "wallet-b",
        destination: "escrow",
        amountXlm: 1,
        timestamp: "2026-01-01T00:02:01Z",
      },
    ]);

    expect(result.correlatedTimingGroups).toEqual([[0, 1]]);
  });
});
