// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Account } from "@stellar/stellar-sdk";
import {
  calculateTTLHealth,
  formatLedgerDuration,
  simulateExtendContractTTL,
  checkAndAutoExtendTTL,
  WARNING_TTL_THRESHOLD_LEDGERS,
  CRITICAL_TTL_THRESHOLD_LEDGERS,
  DEFAULT_EXTEND_LEDGERS,
} from "../lib/contractTTL";
import * as contractTTLModule from "../lib/contractTTL";
import {
  simulateSacAllowanceApproval,
  executeEscrowTopUpWithAllowanceCheck,
  saveAutoTopUpConfig,
  getStoredAutoTopUpConfig,
  evaluateAutoTopUpTrigger,
} from "../lib/escrowTopUp";
import * as stellarModule from "../lib/stellar";
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

    it("persists and loads auto top-up configuration in storage", () => {
      const cfg = {
        campaignId: "test-campaign-119",
        enabled: true,
        thresholdType: "percentage" as const,
        thresholdValue: 25,
        topUpAmount: 500,
        maxTopUpsPerDay: 4,
        topUpCountToday: 0,
      };
      saveAutoTopUpConfig(cfg);
      const loaded = getStoredAutoTopUpConfig("test-campaign-119");
      expect(loaded.campaignId).toBe("test-campaign-119");
      expect(loaded.enabled).toBe(true);
      expect(loaded.thresholdValue).toBe(25);
    });

    it("evaluates auto top-up trigger with fixed threshold type", () => {
      const campaign = {
        status: "Active",
        escrowInitial: 2000,
        escrowBalance: 300,
      };
      const config = {
        campaignId: "test-camp-fixed",
        enabled: true,
        thresholdType: "fixed" as const,
        thresholdValue: 500,
        topUpAmount: 1000,
        maxTopUpsPerDay: 5,
        topUpCountToday: 0,
      };
      const evalResult = evaluateAutoTopUpTrigger(campaign, config, 2000);
      expect(evalResult.shouldTrigger).toBe(true);
      expect(evalResult.allowanceDeficit).toBe(0);
    });

    it("handles simulation failure gracefully when token allowance query fails", async () => {
      const spy = vi
        .spyOn(stellarModule, "getTokenAllowanceQuery")
        .mockRejectedValueOnce(new Error("RPC query timeout"));
      const sim = await simulateSacAllowanceApproval(
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        1500,
        "USDC",
      );
      expect(sim.success).toBe(false);
      expect(sim.simulationStatus).toBe("Simulation Failed");
      expect(sim.error).toBe("RPC query timeout");
      spy.mockRestore();
    });

    it("queries allowance on-chain when currentAllowance is omitted", async () => {
      const spy = vi
        .spyOn(stellarModule, "getTokenAllowanceQuery")
        .mockResolvedValueOnce(5000);
      const res = await executeEscrowTopUpWithAllowanceCheck({
        advertiserAddress: testAdvertiser,
        campaignId: 45,
        amount: 1000,
        assetCode: "USDC",
        walletType: "mock",
      });
      expect(res.success).toBe(true);
      expect(res.toppedUpAmount).toBe(1000);
      spy.mockRestore();
    });

    it("throws error when approveTokenContractCall returns success false", async () => {
      const spy = vi
        .spyOn(stellarModule, "approveTokenContractCall")
        .mockResolvedValueOnce({
          success: false,
          txHash: "",
          allowance: 0,
        });
      await expect(
        executeEscrowTopUpWithAllowanceCheck({
          advertiserAddress: testAdvertiser,
          campaignId: 46,
          amount: 2500,
          assetCode: "USDC",
          walletType: "mock",
          currentAllowance: 0,
          autoApproveDeficit: true,
        }),
      ).rejects.toThrow("Failed to delegate SAC token allowance before escrow top-up.");
      spy.mockRestore();
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

    it("simulates extendFootprintTtl via Soroban RPC server when non-mock caller is provided", async () => {
      const mockServer = {
        getAccount: vi.fn().mockResolvedValue(
          new Account("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", "100"),
        ),
        simulateTransaction: vi.fn().mockResolvedValue({
          minResourceFee: "2500",
          latestLedger: 1250000,
        }),
      };
      const spy = vi.spyOn(stellarModule, "getSorobanRpcServer").mockReturnValue(mockServer as any);
      const res = await simulateExtendContractTTL(
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        DEFAULT_EXTEND_LEDGERS,
      );
      expect(res.canExtend).toBe(true);
      expect(res.minResourceFeeStroops).toBe("2500");
      expect(res.simulatedLiveUntil).toBe(1250000 + DEFAULT_EXTEND_LEDGERS);
      spy.mockRestore();
    });

    it("returns canExtend false when Soroban simulation encounters an error", async () => {
      const mockServer = {
        getAccount: vi.fn().mockResolvedValue(
          new Account("GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", "100"),
        ),
        simulateTransaction: vi.fn().mockResolvedValue({
          error: "Footprint exceeds live window",
        }),
      };
      const spy = vi.spyOn(stellarModule, "getSorobanRpcServer").mockReturnValue(mockServer as any);
      const res = await simulateExtendContractTTL(
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
      expect(res.canExtend).toBe(false);
      expect(res.error).toBe("Footprint exceeds live window");
      spy.mockRestore();
    });

    it("handles RPC exception during simulateExtendContractTTL", async () => {
      const mockServer = {
        getAccount: vi.fn().mockRejectedValue(new Error("RPC node timeout")),
      };
      const spy = vi.spyOn(stellarModule, "getSorobanRpcServer").mockReturnValue(mockServer as any);
      const res = await simulateExtendContractTTL(
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
        "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      );
      expect(res.canExtend).toBe(false);
      expect(res.error).toContain("RPC node timeout");
      spy.mockRestore();
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

    it("updates target ledgers and triggers refresh in ContractTTLRestorer", async () => {
      render(
        <ContractTTLRestorer
          contractAddress="C_MOCK_ESCROW_REFRESH_CONTRACT"
          campaignName="Refresh Test Campaign"
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText(/Extension duration/i)).toBeTruthy();
      });

      const select = screen.getByLabelText(/Extension duration/i);
      fireEvent.change(select, { target: { value: "250000" } });
      expect((select as HTMLSelectElement).value).toBe("250000");

      const refreshBtn = screen.getByTitle("Refresh TTL");
      fireEvent.click(refreshBtn);
    });

    it("handles simulation error failure during extend in ContractTTLRestorer", async () => {
      const spy = vi
        .spyOn(contractTTLModule, "simulateExtendContractTTL")
        .mockResolvedValueOnce({
          canExtend: false,
          minResourceFeeStroops: "0",
          estimatedFeeXlm: "0",
          costLedgers: 500000,
          simulatedLiveUntil: 0,
          error: "Insufficient reserve for footprint",
        });

      render(
        <ContractTTLRestorer
          contractAddress="C_MOCK_ESCROW_ERROR_CONTRACT"
          campaignName="Failing Extend Campaign"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("btn-1click-extend")).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId("btn-1click-extend"));

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "error",
            title: "Extension Failed",
          }),
        );
      });

      spy.mockRestore();
    });
  });
});
