import { describe, it, expect, vi } from "vitest";
import { Asset, Networks } from "@stellar/stellar-sdk";
import {
  safeAssetContractId,
  ISSUERS,
  NETWORK_ESCROW_ASSETS,
  getSupportedEscrowAssets,
} from "../config/stellar";

describe("safeAssetContractId fallback helper", () => {
  it("returns contractId when Asset.contractId succeeds", () => {
    const asset = new Asset("USDC", ISSUERS.TESTNET.USDC);
    const mockId = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
    vi.spyOn(asset, "contractId").mockReturnValue(mockId);

    const result = safeAssetContractId(asset, Networks.TESTNET, "FALLBACK_ADDR");
    expect(result).toBe(mockId);
    vi.restoreAllMocks();
  });

  it("returns fallback address when Asset.contractId throws for each network and asset", () => {
    const assets = [
      {
        network: "TESTNET" as const,
        passphrase: Networks.TESTNET,
        code: "USDC",
        issuer: ISSUERS.TESTNET.USDC,
        expectedFallback: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      },
      {
        network: "TESTNET" as const,
        passphrase: Networks.TESTNET,
        code: "EURC",
        issuer: ISSUERS.TESTNET.EURC,
        expectedFallback: "CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ",
      },
      {
        network: "TESTNET" as const,
        passphrase: Networks.TESTNET,
        code: "XLM",
        issuer: undefined,
        expectedFallback: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      },
      {
        network: "PUBLIC" as const,
        passphrase: Networks.PUBLIC,
        code: "USDC",
        issuer: ISSUERS.PUBLIC.USDC,
        expectedFallback: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      },
      {
        network: "PUBLIC" as const,
        passphrase: Networks.PUBLIC,
        code: "EURC",
        issuer: ISSUERS.PUBLIC.EURC,
        expectedFallback: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
      },
      {
        network: "PUBLIC" as const,
        passphrase: Networks.PUBLIC,
        code: "XLM",
        issuer: undefined,
        expectedFallback: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
      },
    ];

    for (const item of assets) {
      const asset = item.issuer ? new Asset(item.code, item.issuer) : Asset.native();
      vi.spyOn(asset, "contractId").mockImplementation(() => {
        throw new Error(`XDR serialization simulated failure for ${item.code} on ${item.network}`);
      });

      const actualFallback = safeAssetContractId(asset, item.passphrase, item.expectedFallback);
      expect(actualFallback).toBe(item.expectedFallback);
      vi.restoreAllMocks();
    }
  });

  it("exposes expected default fallback addresses in NETWORK_ESCROW_ASSETS and getSupportedEscrowAssets", () => {
    expect(NETWORK_ESCROW_ASSETS.TESTNET.USDC.contractAddress).toMatch(/^C[A-Z0-9]{55}$/);
    expect(NETWORK_ESCROW_ASSETS.TESTNET.EURC.contractAddress).toMatch(/^C[A-Z0-9]{55}$/);
    expect(NETWORK_ESCROW_ASSETS.PUBLIC.USDC.contractAddress).toMatch(/^C[A-Z0-9]{55}$/);
    expect(NETWORK_ESCROW_ASSETS.PUBLIC.EURC.contractAddress).toMatch(/^C[A-Z0-9]{55}$/);

    const testnetAssets = getSupportedEscrowAssets("TESTNET");
    expect(testnetAssets.XLM.contractAddress).toBe("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC");
    expect(testnetAssets.USDC.contractAddress).toBe("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA");
    expect(testnetAssets.EURC.contractAddress).toBe("CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ");

    const publicAssets = getSupportedEscrowAssets("PUBLIC");
    expect(publicAssets.XLM.contractAddress).toBe("CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA");
    expect(publicAssets.USDC.contractAddress).toBe("CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75");
    expect(publicAssets.EURC.contractAddress).toBe("CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV");
  });
});
