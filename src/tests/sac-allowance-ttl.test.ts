import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  getSACAllowance,
  simulateSACApprove,
  approveSACDelegation,
  checkAllowanceBeforeTopUp,
  topUpCampaignEscrowContractCall,
  getCampaignStorageTTL,
  extendCampaignStorageTTL,
  signSEP0010Challenge,
  connectXbullWallet,
  _resetMockState,
  _setMockAllowance,
} from "../lib/stellar";
import { SAC_TOKENS, TTL_CONFIG, STELLAR_CONFIG } from "../config/stellar";

describe("Soroban Asset Contract (SAC) Allowance & TTL State Management Suite", { timeout: 30000 }, () => {
  const advertiserWallet = Keypair.random().publicKey();
  const escrowSpenderContract = STELLAR_CONFIG.contractId;

  beforeEach(() => {
    _resetMockState(42500, 1000000);
  });

  // --------------------------------------------------------------------------
  // 1. SAC Token Delegation & Simulation Feedback
  // --------------------------------------------------------------------------
  describe("SAC Token Delegation & Transaction Simulation", () => {
    it("returns zero allowance by default for unapproved pairs", async () => {
      const allowance = await getSACAllowance(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.USDC.contractId,
        "mock",
      );
      expect(allowance).toBe(BigInt(0));
    });

    it("simulates SAC approve transaction and provides detailed resource feedback", async () => {
      const topUpAmount = 1500; // 1,500 USDC
      const simulation = await simulateSACApprove(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.USDC.contractId,
        topUpAmount,
        undefined,
        "USDC",
      );

      expect(simulation.success).toBe(true);
      expect(simulation.minResourceFee).toBeDefined();
      expect(simulation.minResourceFee).toContain("XLM");
      expect(simulation.cpuInstructions).toBeDefined();
      expect(simulation.cpuInstructions).toContain("/ 100,000,000");
      expect(simulation.memoryBytes).toBeDefined();
      expect(simulation.memoryBytes).toContain("KB");
      expect(simulation.spenderAddress).toBe(escrowSpenderContract);
      expect(simulation.tokenContractId).toBe(SAC_TOKENS.USDC.contractId);
      expect(simulation.amountAuthorized).toBe("1500.00 USDC");
      expect(simulation.liveUntilLedger).toBeGreaterThan(1000000);
    });

    it("executes SAC approve delegation and registers approved allowance", async () => {
      const approveAmount = 2500;
      const res = await approveSACDelegation(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.USDC.contractId,
        approveAmount,
        undefined,
        "USDC",
        "mock",
      );

      expect(res.success).toBe(true);
      expect(res.txHash).toBeDefined();
      expect(res.txHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.simulationFeedback).toBeDefined();
      expect(res.simulationFeedback.amountAuthorized).toBe("2500.00 USDC");

      // Verify updated allowance
      const allowance = await getSACAllowance(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.USDC.contractId,
        "mock",
      );
      const expectedStroops = BigInt(Math.floor(approveAmount * 1e7));
      expect(allowance).toBe(expectedStroops);
    });

    it("supports EURC and custom SAC token allocations", async () => {
      const eurcAmount = 800;
      const res = await approveSACDelegation(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.EURC.contractId,
        eurcAmount,
        undefined,
        "EURC",
        "mock",
      );

      expect(res.success).toBe(true);
      expect(res.simulationFeedback.tokenSymbol).toBe("EURC");

      const check = await checkAllowanceBeforeTopUp(
        advertiserWallet,
        eurcAmount,
        "EURC",
        escrowSpenderContract,
        "mock",
      );
      expect(check.isSufficient).toBe(true);
      expect(check.currentAllowanceFormatted).toBe("800.00");
    });
  });

  // --------------------------------------------------------------------------
  // 2. Automated Allowance Checks for Escrow Top-Ups
  // --------------------------------------------------------------------------
  describe("Automated Allowance Validation on Escrow Top-Up", () => {
    it("detects insufficient allowance before executing campaign escrow top-up", async () => {
      const check = await checkAllowanceBeforeTopUp(
        advertiserWallet,
        1000,
        "USDC",
        escrowSpenderContract,
        "mock",
      );

      expect(check.isSufficient).toBe(false);
      expect(check.currentAllowanceFormatted).toBe("0.00");
      expect(check.requiredAmountFormatted).toBe("1000.00");
    });

    it("rejects escrow top-up when SAC allowance is missing or insufficient", async () => {
      await expect(
        topUpCampaignEscrowContractCall(advertiserWallet, 101, 500, "USDC", "mock"),
      ).rejects.toThrow(/Insufficient SAC allowance for USDC/);
    });

    it("permits escrow top-up once allowance delegation is approved", async () => {
      const topUpAmount = 750;

      // 1. Approve allowance delegation
      await approveSACDelegation(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.USDC.contractId,
        topUpAmount,
        undefined,
        "USDC",
        "mock",
      );

      // 2. Automated check verifies sufficient balance
      const check = await checkAllowanceBeforeTopUp(
        advertiserWallet,
        topUpAmount,
        "USDC",
        escrowSpenderContract,
        "mock",
      );
      expect(check.isSufficient).toBe(true);

      // 3. Top-up succeeds and returns valid transaction hash
      const topUpResult = await topUpCampaignEscrowContractCall(
        advertiserWallet,
        101,
        topUpAmount,
        "USDC",
        "mock",
      );
      expect(topUpResult.success).toBe(true);
      expect(topUpResult.txHash).toBeDefined();
      expect(topUpResult.txHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Soroban State Storage TTL & Automated Restoration
  // --------------------------------------------------------------------------
  describe("Soroban State TTL Health & Restoration (extend_ttl)", () => {
    it("computes remaining ledgers and detects threshold warning below 50,000 ledgers", async () => {
      // Mock initialized to 42,500 ledgers remaining
      const ttl = await getCampaignStorageTTL(escrowSpenderContract);

      expect(ttl.contractId).toBe(escrowSpenderContract);
      expect(ttl.remainingLedgers).toBe(42500);
      expect(ttl.threshold).toBe(TTL_CONFIG.WARNING_THRESHOLD_LEDGERS);
      expect(ttl.threshold).toBe(50000);
      expect(ttl.status).toBe("warning");
      expect(ttl.estimatedHoursRemaining).toBeGreaterThan(0);
      expect(ttl.liveUntilLedger).toBe(ttl.currentLedger + ttl.remainingLedgers);
    });

    it("classifies status as critical when TTL dips below critical threshold", async () => {
      _resetMockState(8500, 1000000);
      const ttl = await getCampaignStorageTTL(escrowSpenderContract);

      expect(ttl.remainingLedgers).toBe(8500);
      expect(ttl.status).toBe("critical");
    });

    it("triggers extend_ttl and restores healthy state above 50,000 ledgers", async () => {
      _resetMockState(42500, 1000000);

      // Perform extension invocation (+100,000 ledgers)
      const res = await extendCampaignStorageTTL(
        advertiserWallet,
        escrowSpenderContract,
        100000,
        "mock",
      );

      expect(res.success).toBe(true);
      expect(res.txHash).toBeDefined();
      expect(res.txHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(res.ttlInfo.remainingLedgers).toBe(142500);
      expect(res.ttlInfo.status).toBe("healthy");
      expect(res.ttlInfo.liveUntilLedger).toBe(res.ttlInfo.currentLedger + 142500);

      // Subsequent query confirms persisted healthy state
      const refreshedTTL = await getCampaignStorageTTL(escrowSpenderContract);
      expect(refreshedTTL.status).toBe("healthy");
      expect(refreshedTTL.remainingLedgers).toBe(142500);
    });

    it("handles contract invocations and state updates for allowance, top-up, and extend_ttl", async () => {
      _setMockAllowance("custom-cache-key", BigInt(12345678));

      // approveSACDelegation via mock mode
      const approveRes = await approveSACDelegation(
        advertiserWallet,
        escrowSpenderContract,
        SAC_TOKENS.USDC.contractId,
        1500,
        undefined,
        "USDC",
        "mock",
      );
      expect(approveRes.success).toBe(true);
      expect(approveRes.simulationFeedback).toBeDefined();

      // topUpCampaignEscrowContractCall via mock mode
      const topUpRes = await topUpCampaignEscrowContractCall(
        advertiserWallet,
        101,
        500,
        "USDC",
        "mock",
      );
      expect(topUpRes.success).toBe(true);

      // extendCampaignStorageTTL via mock mode
      const extendRes = await extendCampaignStorageTTL(
        advertiserWallet,
        escrowSpenderContract,
        50000,
        "mock",
      );
      expect(extendRes.success).toBe(true);
      expect(extendRes.ttlInfo).toBeDefined();
    });

    it("exercises signSEP0010Challenge and connectXbullWallet error handling", async () => {
      // Mock SEP0010 challenge sign
      const signed = await signSEP0010Challenge("AAAABBBBCCCC", "mock");
      expect(signed).toContain("AAAABBBBCCCC.signed_mock");

      // Freighter fallback challenge sign
      const signedFreighter = await signSEP0010Challenge("AAAABBBBCCCC", "freighter");
      expect(signedFreighter).toBeDefined();

      // connectXbullWallet error propagation when extension rejects
      const globalAny = globalThis as any;
      const originalXBull = globalAny.window?.xBullSDK;
      if (!globalAny.window) globalAny.window = {};
      globalAny.window.xBullSDK = {
        getPublicKey: async () => {
          throw new Error("Rejected by xBull wallet user");
        },
      };

      await expect(connectXbullWallet()).rejects.toThrow(/Rejected by xBull wallet user/);

      if (originalXBull) {
        globalAny.window.xBullSDK = originalXBull;
      } else {
        delete globalAny.window.xBullSDK;
      }
    });
  });
});
