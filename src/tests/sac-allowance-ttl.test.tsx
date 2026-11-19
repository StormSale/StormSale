// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  calculateTTLHealth,
  formatLedgerDuration,
  simulateExtendContractTTL,
  checkAndAutoExtendTTL,
  WARNING_TTL_THRESHOLD_LEDGERS,
  CRITICAL_TTL_THRESHOLD_LEDGERS,
  DEFAULT_EXTEND_LEDGERS,
} from "../lib/contractTTL";
import {
  simulateSacAllowanceApproval,
  executeEscrowTopUpWithAllowanceCheck,
} from "../lib/escrowTopUp";
import { SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import { ContractTTLBadge } from "../components/advertiser/ContractTTLBadge";
import { ContractTTLRestorer } from "../components/advertiser/ContractTTLRestorer";

// Mock Web3 Context & Notifications
vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => ({
    userAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    connectorType: "mock",
    isConnected: true,
  }),
}));

const mockShowNotification = vi.fn();
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => ({
    showNotification: mockShowNotification,
  }),
}));

describe("Automated SAC Token Allowance Delegation & TTL Extension (#119)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* =========================================================================
     1. SAC TOKEN ALLOWANCE DELEGATION FOR STABLECOIN ESCROWS
     ========================================================================= */

  describe("SAC Allowance Delegation & Automated Checks", () => {
    const testAdvertiser = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

    it("evaluates SAC allowance simulation and detects required approval deficit", async () => {
      const sim = await simulateSacAllowanceApproval(testAdvertiser, 1500, "USDC");
      expect(sim.success).toBe(true);
      expect(sim.requiredAmount).toBe(1500);
      expect(sim.estimatedFee).toContain("XLM");
      expect(sim.simulationStatus).toBeDefined();
    });

    it("automatically approves SAC token allowance when deficit exists and executes top-up", async () => {
      const result = await executeEscrowTopUpWithAllowanceCheck({
        advertiserAddress: testAdvertiser,
        campaignId: 42,
        amount: 2500,
        assetCode: "USDC",
        walletType: "mock",
        currentAllowance: 0, // Zero allowance -> triggers delegation
        autoApproveDeficit: true,
      });

      expect(result.success).toBe(true);
      expect(result.toppedUpAmount).toBe(2500);
      expect(result.allowanceApproved).toBe(2500);
      expect(result.approvalTxHash).toBeDefined();
      expect(result.simulationFeedback.simulated).toBe(true);
      expect(result.simulationFeedback.status).toContain("Soroban simulation");
    });

    it("skips SAC approval step when pre-existing allowance is already sufficient", async () => {
      const result = await executeEscrowTopUpWithAllowanceCheck({
        advertiserAddress: testAdvertiser,
        campaignId: 43,
        amount: 1000,
        assetCode: "EURC",
        walletType: "mock",
        currentAllowance: 5000, // Sufficient allowance -> skips approval
        autoApproveDeficit: true,
      });

      expect(result.success).toBe(true);
      expect(result.toppedUpAmount).toBe(1000);
      expect(result.allowanceApproved).toBeUndefined();
      expect(result.approvalTxHash).toBeUndefined();
    });

    it("throws an error when allowance is insufficient and autoApproveDeficit is disabled", async () => {
      await expect(
        executeEscrowTopUpWithAllowanceCheck({
          advertiserAddress: testAdvertiser,
          campaignId: 44,
          amount: 3000,
          assetCode: "USDC",
          walletType: "mock",
          currentAllowance: 500,
          autoApproveDeficit: false,
        }),
      ).rejects.toThrow("Pre-authorized SAC allowance deficit");
    });

    it("supports all SAC stablecoin configurations (USDC and EURC)", () => {
      expect(SUPPORTED_ESCROW_ASSETS.USDC.contractAddress).toBeDefined();
      expect(SUPPORTED_ESCROW_ASSETS.EURC.contractAddress).toBeDefined();
      expect(SUPPORTED_ESCROW_ASSETS.USDC.decimals).toBe(7);
      expect(SUPPORTED_ESCROW_ASSETS.EURC.decimals).toBe(7);
    });
  });

  /* =========================================================================
     2. SOROBAN STATE TTL RESTORATION & AUTOMATED EXTENSION
     ========================================================================= */

  describe("Soroban State TTL Health & Automated Extension", () => {
    const testContractId = "C_TEST_STABLECOIN_ESCROW_CONTRACT_99999";
    const testCaller = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

    it("classifies TTL health based on 50,000 and 10,000 ledger thresholds", () => {
      expect(calculateTTLHealth(60_000)).toBe("healthy");
      expect(calculateTTLHealth(WARNING_TTL_THRESHOLD_LEDGERS - 1)).toBe("warning");
      expect(calculateTTLHealth(25_000)).toBe("warning");
      expect(calculateTTLHealth(CRITICAL_TTL_THRESHOLD_LEDGERS - 1)).toBe("critical");
      expect(calculateTTLHealth(0)).toBe("archived");
    });

    it("formats ledger duration accurately based on 5-second ledger intervals", () => {
      expect(formatLedgerDuration(50_000)).toMatch(/2d 21h/);
      expect(formatLedgerDuration(10_000)).toMatch(/13h 53m/);
      expect(formatLedgerDuration(0)).toBe("Archived / Expired");
    });

    it("simulates extendFootprintTtl transaction providing resource fee estimates", async () => {
      const sim = await simulateExtendContractTTL(
        testContractId,
        testCaller,
        DEFAULT_EXTEND_LEDGERS,
      );
      expect(sim.canExtend).toBe(true);
      expect(sim.minResourceFeeStroops).toBe("1000");
      expect(sim.estimatedFeeXlm).toBe("0.0001");
      expect(sim.costLedgers).toBe(DEFAULT_EXTEND_LEDGERS);
      expect(sim.simulatedLiveUntil).toBeGreaterThan(0);
    });

    it("triggers automated extension when remaining ledgers dip below warning threshold (50,000)", async () => {
      // Default mock TTL has ~8,500 ledgers remaining (< 50,000 warning threshold)
      const res = await checkAndAutoExtendTTL({
        contractId: testContractId,
        callerAddress: testCaller,
        thresholdLedgers: WARNING_TTL_THRESHOLD_LEDGERS,
        extendToLedgers: DEFAULT_EXTEND_LEDGERS,
        walletType: "mock",
      });

      expect(res.triggered).toBe(true);
      expect(res.result).toBeDefined();
      expect(res.result?.success).toBe(true);
      expect(res.result?.extendedByLedgers).toBe(DEFAULT_EXTEND_LEDGERS);
      expect(res.reason).toContain("Auto-extended");
    });

    it("skips automated extension when contract TTL is healthy (> 50,000 ledgers)", async () => {
      // After extension, contract has 500,000 ledgers remaining
      const res = await checkAndAutoExtendTTL({
        contractId: testContractId,
        callerAddress: testCaller,
        thresholdLedgers: WARNING_TTL_THRESHOLD_LEDGERS,
        extendToLedgers: DEFAULT_EXTEND_LEDGERS,
        walletType: "mock",
      });

      expect(res.triggered).toBe(false);
      expect(res.reason).toContain("No extension required");
    });
  });

  /* =========================================================================
     3. UI COMPONENTS: CONTRACT TTL BADGE & RESTORER
     ========================================================================= */

  describe("UI Visual Health Indicator & Restorer Component", () => {
    it("renders ContractTTLBadge with warning status and remaining ledgers", () => {
      render(<ContractTTLBadge status="warning" remainingLedgers={42000} durationText="2d 10h" />);

      expect(screen.getByRole("status")).toBeTruthy();
      expect(screen.getByText("TTL Warning")).toBeTruthy();
      expect(screen.getByText(/\(42,000 ledgers\)/)).toBeTruthy();
      expect(screen.getByRole("status").getAttribute("title")).toContain(
        "42,000 ledgers (~2d 10h)",
      );
    });

    it("renders ContractTTLRestorer with warning banner when TTL < 50,000 ledgers", async () => {
      render(
        <ContractTTLRestorer
          contractAddress="C_MOCK_ESCROW_WARNING_CONTRACT"
          campaignName="Summer Stablecoin Promo"
        />,
      );

      // Wait for TTL fetch to resolve
      await waitFor(() => {
        expect(screen.getByText(/Contract State Archival & Rent/i)).toBeTruthy();
      });

      // 1-Click Extend button should be present
      const extendBtn = screen.getByTestId("btn-1click-extend");
      expect(extendBtn).toBeTruthy();

      // Trigger extension
      fireEvent.click(extendBtn);

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalled();
      });
    });
  });
});
