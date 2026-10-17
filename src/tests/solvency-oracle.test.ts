import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  aggregateActiveCampaignReserves,
  aggregatePendingClearingClaims,
  computeProtocolSolvencyProof,
  generateSolvencyProofHash,
  fetchLatestLedgerInfo,
  subscribeToLedgerCloses,
  CANONICAL_CAMPAIGN_RESERVES,
  CANONICAL_CLEARING_LIABILITIES,
  DEFAULT_XLM_USD_PRICE,
  type LedgerInfo,
} from "../lib/solvencyOracle";

describe("[Auditor] Real-Time Protocol Solvency Proof & TVL Oracle Suite", () => {
  const testRate = 0.15; // 1 XLM = $0.15 USD for clean test calculations

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Specification 1: Aggregate active campaign budget reserves from contract storage
  // --------------------------------------------------------------------------
  describe("Active Campaign Budget Reserves Aggregation (TVL)", () => {
    it("aggregates active campaign escrow reserves from Soroban contract storage", () => {
      const mockCampaigns = [
        {
          id: "1",
          name: "Alpha Promo",
          status: "Active" as const,
          escrowBalanceXlm: 2000,
          initialBudgetXlm: 3000,
        },
        {
          id: "2",
          name: "Beta Launch",
          status: "Active" as const,
          escrowBalanceXlm: 1500,
          initialBudgetXlm: 2000,
        },
        {
          id: "3",
          name: "Gamma Paused",
          status: "Paused" as const,
          escrowBalanceXlm: 500,
          initialBudgetXlm: 1000,
        },
        {
          id: "4",
          name: "Delta Finished",
          status: "Completed" as const,
          escrowBalanceXlm: 800, // Refunded/completed; not active liability backing
          initialBudgetXlm: 1000,
        },
      ];

      const { reserves, totalEscrowReservesXlm, totalEscrowReservesUsd } =
        aggregateActiveCampaignReserves(mockCampaigns, testRate);

      // Active + Paused = 3 campaigns
      expect(reserves.length).toBe(3);
      // 2000 + 1500 + 500 = 4000 XLM
      expect(totalEscrowReservesXlm).toBe(4000);
      // 4000 XLM * $0.15 = $600.00 USD
      expect(totalEscrowReservesUsd).toBe(600);
    });

    it("accurately computes live TVL in both XLM and USD using oracle exchange rate", () => {
      const { totalEscrowReservesXlm, totalEscrowReservesUsd } = aggregateActiveCampaignReserves(
        CANONICAL_CAMPAIGN_RESERVES,
        0.2, // 1 XLM = $0.20
      );

      // 3250 + 750 + 680 = 4680 XLM
      expect(totalEscrowReservesXlm).toBe(4680);
      expect(totalEscrowReservesUsd).toBe(936); // 4680 * 0.20
    });

    it("handles zero or empty campaign list gracefully", () => {
      const { reserves, totalEscrowReservesXlm, totalEscrowReservesUsd } =
        aggregateActiveCampaignReserves([], testRate);

      expect(reserves.length).toBe(0);
      expect(totalEscrowReservesXlm).toBe(0);
      expect(totalEscrowReservesUsd).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Specification 2: Sum total pending affiliate claims across active clearing windows
  // --------------------------------------------------------------------------
  describe("Pending Affiliate Claims Summation across Clearing Windows", () => {
    it("sums total pending affiliate claims across all active clearing windows", () => {
      const mockLiabilities = [
        {
          saleId: "1",
          campaignId: "1",
          claimAmountXlm: 100,
          status: "in_clearing" as const,
          clearingWindowSecs: 604800,
        },
        {
          saleId: "2",
          campaignId: "1",
          claimAmountXlm: 250,
          status: "in_clearing" as const,
          clearingWindowSecs: 1209600,
        },
        {
          saleId: "3",
          campaignId: "2",
          claimAmountXlm: 150,
          status: "matured" as const, // Unclaimed matured is still a protocol liability
          clearingWindowSecs: 604800,
        },
        {
          saleId: "4",
          campaignId: "2",
          claimAmountXlm: 300,
          status: "claimed" as const, // Already claimed/settled; NOT an outstanding liability
          clearingWindowSecs: 604800,
          claimed: true,
        },
      ];

      const { pendingLiabilities, totalOutstandingClaimsXlm, totalOutstandingClaimsUsd } =
        aggregatePendingClearingClaims(mockLiabilities, testRate);

      // 3 pending claims (1 claimed excluded)
      expect(pendingLiabilities.length).toBe(3);
      // 100 + 250 + 150 = 500 XLM
      expect(totalOutstandingClaimsXlm).toBe(500);
      // 500 XLM * $0.15 = $75.00 USD
      expect(totalOutstandingClaimsUsd).toBe(75);
    });

    it("correctly identifies canonical clearing liabilities total", () => {
      const { pendingLiabilities, totalOutstandingClaimsXlm } = aggregatePendingClearingClaims(
        CANONICAL_CLEARING_LIABILITIES,
        DEFAULT_XLM_USD_PRICE,
      );

      // 125 + 240 + 185 + 320 + 130 = 1000 XLM
      expect(totalOutstandingClaimsXlm).toBe(1000);
      expect(pendingLiabilities.length).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Specification 3: Compute live Solvency Ratio & Prove Reserves Exceed Liabilities
  // --------------------------------------------------------------------------
  describe("Solvency Ratio & Proof of Reserve Computation (>= 100%)", () => {
    it("computes live Solvency Ratio = Total Escrow Reserves / Total Outstanding Claims", async () => {
      const mockReserves = [
        { id: "1", name: "A", status: "Active" as const, escrowBalanceXlm: 3000 },
      ];
      const mockLiabilities = [
        { saleId: "1", campaignId: "1", claimAmountXlm: 1000, status: "in_clearing" as const },
      ];

      const proof = await computeProtocolSolvencyProof({
        reserves: mockReserves,
        liabilities: mockLiabilities,
        xlmUsdRate: 0.1,
        ledgerInfo: {
          sequence: 1480000,
          closedAt: "2026-10-17T20:00:00Z",
          ledgerTimestamp: 1700000000000,
        },
      });

      // 3000 / 1000 = 3.0 (300.0%)
      expect(proof.solvencyRatio).toBe(3.0);
      expect(proof.solvencyRatioPercent).toBe(300.0);
      expect(proof.isSolvent).toBe(true);
      expect(proof.reserveSurplusXlm).toBe(2000);
      expect(proof.reserveSurplusUsd).toBe(200); // 2000 * 0.1
    });

    it("proves reserves exceed liabilities (>= 100%) under canonical protocol state", async () => {
      const proof = await computeProtocolSolvencyProof({
        xlmUsdRate: DEFAULT_XLM_USD_PRICE,
        ledgerInfo: {
          sequence: 1483250,
          closedAt: new Date().toISOString(),
          ledgerTimestamp: Date.now(),
        },
      });

      // Reserves: 4680 XLM, Claims: 1000 XLM => 4680 / 1000 = 4.68 (468.0%)
      expect(proof.totalEscrowReservesXlm).toBe(4680);
      expect(proof.totalOutstandingClaimsXlm).toBe(1000);
      expect(proof.solvencyRatio).toBe(4.68);
      expect(proof.solvencyRatioPercent).toBe(468.0);
      expect(proof.solvencyRatioPercent).toBeGreaterThanOrEqual(100.0);
      expect(proof.isSolvent).toBe(true);
      expect(proof.reserveSurplusXlm).toBe(3680);
    });

    it("handles zero outstanding claims (100%+ fully backed / no liabilities)", async () => {
      const mockReserves = [
        { id: "1", name: "Funded", status: "Active" as const, escrowBalanceXlm: 5000 },
      ];

      const proof = await computeProtocolSolvencyProof({
        reserves: mockReserves,
        liabilities: [],
        ledgerInfo: {
          sequence: 1480000,
          closedAt: "2026-10-17T20:00:00Z",
          ledgerTimestamp: 1700000000000,
        },
      });

      expect(proof.totalOutstandingClaimsXlm).toBe(0);
      expect(proof.isSolvent).toBe(true);
      expect(proof.solvencyRatioPercent).toBeGreaterThanOrEqual(100.0);
      expect(proof.reserveSurplusXlm).toBe(5000);
    });

    it("correctly identifies undercollateralized scenario if reserves fall below liabilities", async () => {
      const mockReserves = [
        { id: "1", name: "Low", status: "Active" as const, escrowBalanceXlm: 800 },
      ];
      const mockLiabilities = [
        { saleId: "1", campaignId: "1", claimAmountXlm: 1000, status: "in_clearing" as const },
      ];

      const proof = await computeProtocolSolvencyProof({
        reserves: mockReserves,
        liabilities: mockLiabilities,
        ledgerInfo: {
          sequence: 1480000,
          closedAt: "2026-10-17T20:00:00Z",
          ledgerTimestamp: 1700000000000,
        },
      });

      // 800 / 1000 = 80.0% (< 100%)
      expect(proof.solvencyRatio).toBe(0.8);
      expect(proof.solvencyRatioPercent).toBe(80.0);
      expect(proof.isSolvent).toBe(false);
      expect(proof.reserveSurplusXlm).toBe(0);
    });

    it("verifies exact 100% threshold parity when reserves exactly match liabilities", async () => {
      const mockReserves = [
        { id: "1", name: "Parity", status: "Active" as const, escrowBalanceXlm: 1500 },
      ];
      const mockLiabilities = [
        { saleId: "1", campaignId: "1", claimAmountXlm: 1500, status: "in_clearing" as const },
      ];

      const proof = await computeProtocolSolvencyProof({
        reserves: mockReserves,
        liabilities: mockLiabilities,
      });

      expect(proof.solvencyRatio).toBe(1.0);
      expect(proof.solvencyRatioPercent).toBe(100.0);
      expect(proof.isSolvent).toBe(true);
      expect(proof.reserveSurplusXlm).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Cryptographic Proof of Reserves Verification
  // --------------------------------------------------------------------------
  describe("Cryptographic SHA-256 Proof-of-Reserve State Root", () => {
    it("generates a deterministic 256-bit hexadecimal cryptographic state proof hash", async () => {
      const hash1 = await generateSolvencyProofHash(1483250, 4680, 1000, 1700000000);
      const hash2 = await generateSolvencyProofHash(1483250, 4680, 1000, 1700000000);

      expect(hash1).toBeDefined();
      expect(hash1.startsWith("0x")).toBe(true);
      expect(hash1.length).toBeGreaterThanOrEqual(66);
      expect(hash1).toBe(hash2);
    });

    it("produces a distinct proof hash when ledger sequence or reserve amounts change", async () => {
      const hashA = await generateSolvencyProofHash(1483250, 4680, 1000, 1700000000);
      const hashB = await generateSolvencyProofHash(1483251, 4680, 1000, 1700000000);
      const hashC = await generateSolvencyProofHash(1483250, 5000, 1000, 1700000000);

      expect(hashA).not.toBe(hashB);
      expect(hashA).not.toBe(hashC);
    });
  });

  // --------------------------------------------------------------------------
  // Real-Time Ledger Close Updates
  // --------------------------------------------------------------------------
  describe("Real-Time Ledger Close Updates", () => {
    it("fetches latest ledger sequence and closed_at timestamp", async () => {
      const ledger = await fetchLatestLedgerInfo();

      expect(ledger.sequence).toBeGreaterThan(0);
      expect(ledger.closedAt).toBeDefined();
      expect(typeof ledger.ledgerTimestamp).toBe("number");
    });

    it("dispatches live updates on each ledger close via subscription", async () => {
      const emittedLedgers: LedgerInfo[] = [];
      const unsubscribe = subscribeToLedgerCloses((ledger) => {
        emittedLedgers.push(ledger);
      }, 5000);

      // Initial invocation
      expect(emittedLedgers.length).toBe(1);

      // Fast-forward 5 seconds (1 ledger close)
      await vi.advanceTimersByTimeAsync(5000);
      expect(emittedLedgers.length).toBe(2);

      // Fast-forward another 5 seconds (another ledger close)
      await vi.advanceTimersByTimeAsync(5000);
      expect(emittedLedgers.length).toBe(3);

      // Sequence should advance sequentially
      expect(emittedLedgers[2].sequence).toBeGreaterThan(emittedLedgers[1].sequence);

      unsubscribe();

      // Advancing time after unsubscribe should not emit more updates
      await vi.advanceTimersByTimeAsync(5000);
      expect(emittedLedgers.length).toBe(3);
    });
  });
});
