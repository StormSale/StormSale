import { describe, it, expect } from "vitest";
import {
  calculateTTLHealth,
  formatLedgerDuration,
  fetchContractInstanceTTL,
  extendContractInstanceTTL,
  CRITICAL_TTL_THRESHOLD_LEDGERS,
  WARNING_TTL_THRESHOLD_LEDGERS,
  DEFAULT_EXTEND_LEDGERS,
} from "../lib/contractTTL";

describe("Soroban Contract State Archival & TTL Restorer (#132)", () => {
  describe("TTL Health Calculation & Thresholds", () => {
    it("should classify 0 or negative ledgers as archived", () => {
      expect(calculateTTLHealth(0)).toBe("archived");
      expect(calculateTTLHealth(-100)).toBe("archived");
    });

    it("should classify < 10,000 ledgers as critical (action required)", () => {
      expect(calculateTTLHealth(1)).toBe("critical");
      expect(calculateTTLHealth(5000)).toBe("critical");
      expect(calculateTTLHealth(CRITICAL_TTL_THRESHOLD_LEDGERS - 1)).toBe("critical");
    });

    it("should classify between 10,000 and 50,000 ledgers as warning", () => {
      expect(calculateTTLHealth(10000)).toBe("warning");
      expect(calculateTTLHealth(25000)).toBe("warning");
      expect(calculateTTLHealth(WARNING_TTL_THRESHOLD_LEDGERS - 1)).toBe("warning");
    });

    it("should classify >= 50,000 ledgers as healthy", () => {
      expect(calculateTTLHealth(50000)).toBe("healthy");
      expect(calculateTTLHealth(500000)).toBe("healthy");
    });
  });

  describe("Ledger Duration Formatting", () => {
    it("should format remaining ledger count into human readable time (5s per ledger)", () => {
      // 10,000 ledgers * 5s = 50,000s = 13 hours 53 minutes (~13h 53m)
      expect(formatLedgerDuration(10000)).toMatch(/13h 53m/);

      // 500,000 ledgers * 5s = 2,500,000s = ~28 days 22 hours
      expect(formatLedgerDuration(500000)).toMatch(/28d 22h/);

      // 0 ledgers = Archived
      expect(formatLedgerDuration(0)).toBe("Archived / Expired");
    });
  });

  describe("Contract State TTL Fetching & Alerting", () => {
    it("should report requiresRestoration = true when TTL is below 10,000 ledgers", async () => {
      const contractId = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
      const info = await fetchContractInstanceTTL(contractId);

      expect(info.contractId).toBe(contractId);
      expect(info.latestLedger).toBeGreaterThan(0);
      expect(info.liveUntilLedgerSeq).toBeGreaterThan(0);

      if (info.remainingLedgers < CRITICAL_TTL_THRESHOLD_LEDGERS) {
        expect(info.requiresRestoration).toBe(true);
        expect(info.status).toBe("critical");
      }
    }, 15000);
  });

  describe("1-Click TTL Extension Execution", () => {
    it("should extend state rent by up to 500,000 ledgers", async () => {
      const contractId = "C_TEST_MOCK_CONTRACT_123456789";
      const result = await extendContractInstanceTTL({
        contractId,
        callerAddress: "GBZXN7PIRZGNMHGA728R3AA7UNVYDAA677",
        extendToLedgers: DEFAULT_EXTEND_LEDGERS,
        walletType: "mock",
      });

      expect(result.success).toBe(true);
      expect(result.extendedByLedgers).toBe(500000);
      expect(result.txHash).toBeDefined();
      expect(result.txHash.startsWith("0x")).toBe(true);
      expect(result.newRemainingLedgers).toBe(500000);

      // Verify refreshed TTL status is now healthy
      const refreshed = await fetchContractInstanceTTL(contractId);
      expect(refreshed.remainingLedgers).toBe(500000);
      expect(refreshed.status).toBe("healthy");
      expect(refreshed.requiresRestoration).toBe(false);
    });
  });
});
