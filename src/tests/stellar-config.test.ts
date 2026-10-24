// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ISSUERS,
  NETWORK_ESCROW_ASSETS,
  STELLAR_CONFIG,
  STELLAR_NETWORKS,
  SUPPORTED_ESCROW_ASSETS,
  getSupportedEscrowAssets,
} from "../config/stellar";

describe("stellar config", () => {
  it("exposes the active network configuration", () => {
    expect(STELLAR_CONFIG.network).toBe("TESTNET");
    expect(STELLAR_CONFIG.nativeAsset).toBe("XLM");
    expect(STELLAR_CONFIG.nativeDecimals).toBe(7);
    expect(STELLAR_CONFIG.explorerUrl).toContain("stellar.expert");
    expect(STELLAR_CONFIG.contractId).toMatch(/^C/);
  });

  it("exposes Circle issuer addresses for both networks", () => {
    expect(ISSUERS.TESTNET.USDC).toMatch(/^G/);
    expect(ISSUERS.TESTNET.EURC).toMatch(/^G/);
    expect(ISSUERS.PUBLIC.USDC).toMatch(/^G/);
    expect(ISSUERS.PUBLIC.EURC).toMatch(/^G/);
  });

  it("derives network escrow assets lazily through every proxy trap", () => {
    // ownKeys trap
    expect(Object.keys(NETWORK_ESCROW_ASSETS).sort()).toEqual(["PUBLIC", "TESTNET"]);
    // getOwnPropertyDescriptor trap
    expect(Object.getOwnPropertyDescriptor(NETWORK_ESCROW_ASSETS, "TESTNET")).toBeDefined();
    // has trap
    expect("TESTNET" in NETWORK_ESCROW_ASSETS).toBe(true);
    // get trap + deferred compute body
    expect(NETWORK_ESCROW_ASSETS.TESTNET.USDC.contractAddress).toMatch(/^C/);
    expect(NETWORK_ESCROW_ASSETS.PUBLIC.EURC.issuer).toBe(ISSUERS.PUBLIC.EURC);

    // Values are cached across repeated reads.
    expect(NETWORK_ESCROW_ASSETS.TESTNET.USDC.contractAddress).toBe(
      NETWORK_ESCROW_ASSETS.TESTNET.USDC.contractAddress,
    );
  });

  it("derives supported escrow assets for an explicit network", () => {
    const testnet = getSupportedEscrowAssets("TESTNET");
    expect(Object.keys(testnet).sort()).toEqual(["EURC", "USDC", "XLM"]);
    expect(testnet.XLM.decimals).toBe(7);
    expect(testnet.XLM.code).toBe("XLM");
    expect(testnet.USDC.issuer).toBe(ISSUERS.TESTNET.USDC);
    expect(testnet.USDC.contractAddress).toMatch(/^C/);

    const mainnet = getSupportedEscrowAssets("PUBLIC");
    expect(mainnet.USDC.issuer).toBe(ISSUERS.PUBLIC.USDC);
    expect(mainnet.EURC.issuer).toBe(ISSUERS.PUBLIC.EURC);
  });

  it("exposes the lazily-derived supported asset map and network catalogue", () => {
    expect(Object.keys(SUPPORTED_ESCROW_ASSETS).sort()).toEqual(["EURC", "USDC", "XLM"]);
    expect(SUPPORTED_ESCROW_ASSETS.USDC.code).toBe("USDC");
    expect(SUPPORTED_ESCROW_ASSETS.XLM.name).toBe("Stellar Lumens");
    expect(STELLAR_NETWORKS.TESTNET.name).toBe("Testnet");
    expect(STELLAR_NETWORKS.PUBLIC.rpcUrl).toContain("mainnet");
  });
});