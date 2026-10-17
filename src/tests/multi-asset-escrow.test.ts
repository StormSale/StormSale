import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, Address, scValToNative } from "@stellar/stellar-sdk";
import { SUPPORTED_ESCROW_ASSETS, getSupportedEscrowAssets } from "../config/stellar";
import * as stellarModule from "../lib/stellar";
import {
  createCampaignContractCall,
  claimPayoutContractCall,
  approveTokenAllowance,
  fetchAssetBalances,
  parseUnitsToBigInt,
} from "../lib/stellar";

describe("Multi-Asset Escrow Support for Stellar USDC & EURC Suite", () => {
  const advertiserWallet = Keypair.random().publicKey();
  const affiliateWallet = Keypair.random().publicKey();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("registers supported escrow assets (XLM, USDC, EURC) with valid metadata", () => {
    expect(SUPPORTED_ESCROW_ASSETS.XLM).toBeDefined();
    expect(SUPPORTED_ESCROW_ASSETS.USDC).toBeDefined();
    expect(SUPPORTED_ESCROW_ASSETS.EURC).toBeDefined();

    expect(SUPPORTED_ESCROW_ASSETS.XLM.contractAddress).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
    expect(SUPPORTED_ESCROW_ASSETS.USDC.name).toContain("Circle SAC");
    expect(SUPPORTED_ESCROW_ASSETS.EURC.name).toContain("Circle SAC");

    // Verify all contract addresses are RFC 4648 Base32 56-character Stellar StrKey addresses
    expect(SUPPORTED_ESCROW_ASSETS.USDC.contractAddress).toBe(
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    );
    expect(SUPPORTED_ESCROW_ASSETS.EURC.contractAddress).toBe(
      "CDOIV56NSBNVNZN4XPTOT7JVRK6AW4RUISEPYUZYIIKMVIY7X3OH4S5X",
    );
  });

  it("provides network-specific stablecoin configurations for TESTNET and PUBLIC", () => {
    const testnetAssets = getSupportedEscrowAssets("TESTNET");
    const publicAssets = getSupportedEscrowAssets("PUBLIC");

    // XLM address is consistent across environments
    expect(testnetAssets.XLM.contractAddress).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
    expect(publicAssets.XLM.contractAddress).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );

    // Testnet SAC addresses
    expect(testnetAssets.USDC.contractAddress).toBe(
      "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
    );
    expect(testnetAssets.EURC.contractAddress).toBe(
      "CDOIV56NSBNVNZN4XPTOT7JVRK6AW4RUISEPYUZYIIKMVIY7X3OH4S5X",
    );
    expect(testnetAssets.USDC.issuer).toBe(
      "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    );

    // Public SAC addresses
    expect(publicAssets.USDC.contractAddress).toBe(
      "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    );
    expect(publicAssets.EURC.contractAddress).toBe(
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    );
    expect(publicAssets.USDC.issuer).toBe(
      "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    );
    expect(publicAssets.EURC.issuer).toBe(
      "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDZXBS3QGNOAQBPKVGF",
    );
  });

  it("converts decimal budget strings to BigInt units precisely without floating point inaccuracy", () => {
    expect(parseUnitsToBigInt(500, 7)).toBe(5000000000n);
    expect(parseUnitsToBigInt("10.5", 7)).toBe(105000000n);
    expect(parseUnitsToBigInt("100.1234567", 7)).toBe(1001234567n);
    expect(parseUnitsToBigInt(0, 7)).toBe(0n);
  });

  it("deploys campaign escrow with USDC Circle SAC token", async () => {
    const res = await createCampaignContractCall(
      advertiserWallet,
      10, // 10% commission
      604800, // 7 days
      500, // 500 USDC
      "mock",
      "USDC",
    );

    expect(res.success).toBe(true);
    expect(res.campaignId).toBeGreaterThan(0);
    expect(res.asset).toBe("USDC");
    expect(res.assetAddress).toBe(SUPPORTED_ESCROW_ASSETS.USDC.contractAddress);
  });

  it("deploys campaign escrow with EURC Circle SAC token", async () => {
    const res = await createCampaignContractCall(
      advertiserWallet,
      15, // 15% commission
      1209600, // 14 days
      750, // 750 EURC
      "mock",
      "EURC",
    );

    expect(res.success).toBe(true);
    expect(res.asset).toBe("EURC");
    expect(res.assetAddress).toBe(SUPPORTED_ESCROW_ASSETS.EURC.contractAddress);
  });

  it("disburses commission payouts in the exact specified asset", async () => {
    const usdcPayout = await claimPayoutContractCall(affiliateWallet, 101, "mock", "USDC");
    expect(usdcPayout.success).toBe(true);
    expect(usdcPayout.asset).toBe("USDC");
    expect(usdcPayout.assetAddress).toBe(SUPPORTED_ESCROW_ASSETS.USDC.contractAddress);

    const eurcPayout = await claimPayoutContractCall(affiliateWallet, 102, "mock", "EURC");
    expect(eurcPayout.success).toBe(true);
    expect(eurcPayout.asset).toBe("EURC");
    expect(eurcPayout.assetAddress).toBe(SUPPORTED_ESCROW_ASSETS.EURC.contractAddress);
  });

  it("handles token allowance delegation for SAC stablecoins on non-mock path", async () => {
    const spenderEscrow = Keypair.random().publicKey();

    // Mock RPC server's getLatestLedger to return current sequence 500000
    const mockRpcServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500000 }),
    };
    vi.spyOn(stellarModule.stellarOperations, "getSorobanRpcServer").mockReturnValue(mockRpcServer as any);

    // Mock invokeSorobanMethod
    const invokeSpy = vi.spyOn(stellarModule.stellarOperations, "invokeSorobanMethod").mockResolvedValue({
      success: true,
      txHash: "TX_SAC_ALLOWANCE_APPROVAL_HASH",
    });

    const approval = await approveTokenAllowance(
      advertiserWallet,
      SUPPORTED_ESCROW_ASSETS.USDC.contractAddress,
      spenderEscrow,
      1000,
      "freighter",
      7,
    );

    expect(approval.success).toBe(true);
    expect(approval.txHash).toBe("TX_SAC_ALLOWANCE_APPROVAL_HASH");
    expect(mockRpcServer.getLatestLedger).toHaveBeenCalled();

    // Assert invokeSorobanMethod arguments
    expect(invokeSpy).toHaveBeenCalledWith(
      advertiserWallet,
      "approve",
      expect.any(Array),
      "freighter",
      SUPPORTED_ESCROW_ASSETS.USDC.contractAddress,
    );

    const callArgs = invokeSpy.mock.calls[0][2];
    expect(callArgs).toHaveLength(4);
    // Expiration ledger should be current sequence (500000) + allowance offset (100000) = 600000
    const expirationScVal = callArgs[3];
    expect(scValToNative(expirationScVal)).toBe(600000);
    // Amount should be exactly 1000 * 10^7 = 10000000000n
    const amountScVal = callArgs[2];
    expect(scValToNative(amountScVal)).toBe(10000000000n);
  });

  it("handles simulated mock wallet allowance approval", async () => {
    const mockRpcServer = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 500000 }),
    };
    vi.spyOn(stellarModule.stellarOperations, "getSorobanRpcServer").mockReturnValue(mockRpcServer as any);

    const spenderEscrow = Keypair.random().publicKey();
    const approval = await approveTokenAllowance(
      advertiserWallet,
      SUPPORTED_ESCROW_ASSETS.USDC.contractAddress,
      spenderEscrow,
      1000,
      "mock",
    );

    expect(approval.success).toBe(true);
    expect(approval.txHash).toContain("SIM_ALLOWANCE_");
  });

  it("fetches multi-asset balances matching both asset_code and asset_issuer", async () => {
    const mockHorizonResponse = {
      balances: [
        { asset_type: "native", balance: "1234.5678" },
        // Foreign/unauthorized USDC from another issuer
        { asset_code: "USDC", asset_issuer: "FAKEISSUER12345", balance: "9999.00" },
        // Authentic Circle SAC USDC matching SUPPORTED_ESCROW_ASSETS.USDC.issuer
        {
          asset_code: "USDC",
          asset_issuer: SUPPORTED_ESCROW_ASSETS.USDC.issuer,
          balance: "250.00",
        },
        // Authentic EURC
        {
          asset_code: "EURC",
          asset_issuer: SUPPORTED_ESCROW_ASSETS.EURC.issuer,
          balance: "180.50",
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockHorizonResponse,
      }),
    );

    const balances = await fetchAssetBalances(advertiserWallet);
    expect(balances.XLM).toBe("1234.5678");
    expect(balances.USDC).toBe("250.00");
    expect(balances.EURC).toBe("180.50");
  });

  it("converts all SAC contract addresses into valid Soroban Address ScVals", () => {
    const assets = ["XLM", "USDC", "EURC"] as const;
    for (const code of assets) {
      const config = SUPPORTED_ESCROW_ASSETS[code];
      const addr = new Address(config.contractAddress);
      expect(addr.toString()).toBe(config.contractAddress);
      const scVal = addr.toScVal();
      expect(scVal).toBeDefined();
    }
  });
});
