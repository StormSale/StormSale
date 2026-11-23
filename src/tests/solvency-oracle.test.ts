import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeSolvencyRatio,
  generateSolvencyProofHash,
  fetchProtocolSolvencyProof,
  subscribeToLedgerSolvencyUpdates,
  type CampaignReserveEntry,
} from "../lib/solvencyOracle";

describe("Protocol Solvency Proof & TVL Oracle (#81)", () => {
  describe("Solvency Ratio Calculation", () => {
    it("returns 100% when outstanding liabilities/claims are zero", () => {
      expect(computeSolvencyRatio(50000, 0)).toBe(100);
      expect(computeSolvencyRatio(0, 0)).toBe(100);
    });

    it("correctly calculates ratio when reserves exceed liabilities (>= 100%)", () => {
      // 200,000 reserves vs 100,000 claims = 200%
      expect(computeSolvencyRatio(200000, 100000)).toBe(200);

      // 125,000 reserves vs 100,000 claims = 125%
      expect(computeSolvencyRatio(125000, 100000)).toBe(125);
    });

    it("identifies undercollateralized ratio (< 100%)", () => {
      // 80,000 reserves vs 100,000 claims = 80%
      expect(computeSolvencyRatio(80000, 100000)).toBe(80);
    });
  });

  describe("Cryptographic Proof Hash", () => {
    it("generates deterministic proof hash incorporating reserves, liabilities and ledger", () => {
      const hash1 = generateSolvencyProofHash(645000, 166000, 52894100);
      const hash2 = generateSolvencyProofHash(645000, 166000, 52894100);
      expect(hash1).toBe(hash2);
      expect(hash1.startsWith("0x")).toBe(true);

      const differentLedger = generateSolvencyProofHash(645000, 166000, 52894101);
      expect(differentLedger).not.toBe(hash1);
    });
  });

  describe("Reserves Aggregation & TVL Oracle", () => {
    it("aggregates active campaign vaults and calculates TVL in XLM and USD", () => {
      const mockCampaigns: CampaignReserveEntry[] = [
        {
          campaignId: "c1",
          campaignName: "Camp 1",
          escrowAddress: "E1",
          escrowReserveXlm: 300000,
          pendingClaimsXlm: 100000,
          clearingWindowDays: 14,
          status: "Active",
        },
        {
          campaignId: "c2",
          campaignName: "Camp 2",
          escrowAddress: "E2",
          escrowReserveXlm: 200000,
          pendingClaimsXlm: 50000,
          clearingWindowDays: 30,
          status: "Active",
        },
        {
          campaignId: "c3",
          campaignName: "Camp 3",
          escrowAddress: "E3",
          escrowReserveXlm: 10000,
          pendingClaimsXlm: 5000,
          clearingWindowDays: 7,
          status: "Completed", // Completed campaigns are skipped
        },
      ];

      const xlmUsdPrice = 0.15; // $0.15 / XLM
      const result = fetchProtocolSolvencyProof(xlmUsdPrice, mockCampaigns);

      // Active reserves = 300,000 + 200,000 = 500,000 XLM
      expect(result.totalEscrowReservesXlm).toBe(500000);
      expect(result.tvlXlm).toBe(500000);

      // TVL in USD = 500,000 * 0.15 = $75,000
      expect(result.tvlUsd).toBe(75000);

      // Pending claims = 100,000 + 50,000 = 150,000 XLM
      expect(result.totalOutstandingClaimsXlm).toBe(150000);

      // Net reserve surplus buffer = 500,000 - 150,000 = 350,000 XLM
      expect(result.netSurplusXlm).toBe(350000);

      // Solvency ratio = (500,000 / 150,000) * 100 = 333.33%
      expect(result.solvencyRatioPercentage).toBe(333.33);
      expect(result.isSolvent).toBe(true);
      expect(result.campaignBreakdown).toHaveLength(2);
    });
  });

  describe("Real-time Ledger Subscription", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("publishes solvency proof on ledger close interval", () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToLedgerSolvencyUpdates(listener, 1000);

      expect(listener).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(listener).toHaveBeenCalledTimes(3);

      unsubscribe();
      vi.advanceTimersByTime(2000);
      expect(listener).toHaveBeenCalledTimes(3);
    });
  });
});

