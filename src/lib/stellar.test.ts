import { describe, it, expect } from "vitest";
import { formatStellarAddress, isValidStellarAddress, getSorobanRpcServer, buildSep0007TxUri } from "./stellar";

describe("Stellar Helpers", () => {
  it("formats Stellar public key with middle truncation", () => {
    const pubKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    expect(formatStellarAddress(pubKey)).toBe("GBBD...FLA5");
  });

  it("handles short or empty address gracefully", () => {
    expect(formatStellarAddress("")).toBe("");
    expect(formatStellarAddress("GBBD")).toBe("GBBD");
  });

  it("validates valid Stellar public keys (G...)", () => {
    const validG = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    expect(isValidStellarAddress(validG)).toBe(true);
  });

  it("validates valid Soroban contract IDs (C...)", () => {
    const validC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    expect(isValidStellarAddress(validC)).toBe(true);
  });

  it("rejects invalid addresses like EVM 0x or wrong lengths", () => {
    expect(isValidStellarAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe(false);
    expect(isValidStellarAddress("GBBD123")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
  });

  it("initializes Soroban RPC client with configured endpoint", () => {
    const server = getSorobanRpcServer();
    expect(server).toBeDefined();
  });

  it("builds a SEP-0007 tx URI with base64 XDR and replace=false", () => {
    const xdr = "AAAAAgAAAAB=";
    const uri = buildSep0007TxUri(xdr);
    expect(uri).toBe(`web+stellar:tx?xdr=${encodeURIComponent(xdr)}&replace=false`);
  });

  it("encodes XDR containing reserved URI characters", () => {
    const xdr = "AAA+/A==&?";
    const uri = buildSep0007TxUri(xdr);
    expect(uri.startsWith("web+stellar:tx?xdr=")).toBe(true);
    expect(uri.endsWith("&replace=false")).toBe(true);
    expect(uri).not.toContain("?xdr=AAA+/A==&?");
  });

  it("rejects empty XDR when building a SEP-0007 tx URI", () => {
    expect(() => buildSep0007TxUri("")).toThrow();
  });
});
