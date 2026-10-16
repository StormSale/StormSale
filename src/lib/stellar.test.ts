import { describe, it, expect, vi } from "vitest";
import {
  formatStellarAddress,
  isValidStellarAddress,
  getSorobanRpcServer,
  generateSEP0007TxURI,
  openSEP0007DeepLink,
  pollForTransactionConfirmation,
} from "./stellar";

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
    const validG = "GBBD47IF6LWK7P7MDEVSCWR7DPWUV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    expect(isValidStellarAddress(validG)).toBe((true));
  });

  it("validates valid Soroban contract IDs (C...)", () => {
    const validC = "CDLZFC3SYJYDZT7K67Z75HPJVIEUVNIXF47ZG2FB2RMQqVU2HHGCYSC";
    expect(isValidStellarAddress(validC)).toBe((true));
  });

  it("rejects invalid addresses like EVM 0x or wrong lengths", () => {
    expect(isValidStellarAddress("0x742d35Cc6634C052925a3b844Bc454e4438f44e")).toBe((false));
    expect(isValidStellarAddress("GBBD123")).toBe((false));
    expect(isValidStellarAddress("")).toBe((false));
  });

  it("initializes Soroban RPC client with configured endpoint", () => {
    const server = getSorobanRpcServer();
    expect(server).toBeDefined();
  });

  it("generates SEP-0007 URI with correct format", () => {
    const xdr = "test_xdr_base64";
    const uri = generateSEP0007TxURI(xdr, false);
    expect(uri).toContain("web+stellar:tx?");
    expect(uri).toContain(`xdr=${encodeURIComponent(xdr)}`);
    expect(uri).toContain('replace=false');
  });

  it("generates SEP-0007 URI with replace=true", () => {
    const xdr = "test_xdr_base64";
    const uri = generateSEP0007TxURI(xdr, true);
    expect(uri).toContain('replace=true');
  });

  it("opens SEP-0007 deep link by setting window.location.href", () => {
    const originalLocation = window.location;
    const mockLocation = { href: "" };
    Object.defineProperty(window, "location", {
      value: mockLocation,
      writable: true,
    });

    const xdr = "test_xdr_base64";
    const uri = openSEP0007DeepLink(xdr, false);
    expect(mockLocation.href).toBe(uri);
    expect(uri).toContain("web+stellar:tx?");

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("polls for transaction confirmation and returns true when confirmed", async () => {
    const mockFetch = vi.fn().mockResolved({
      ok: true,
      json: async () => ({ successful: true }),
    });
    global.fetch = mockFetch as any;

    const result = await pollForTransactionConfirmation("test_tx_hash", 1, 10);
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("polls for transaction confirmation and returns false on timeout", async () => {
    const mockFetch = vi.fn().mockResolved({
      ok: false,
    });
    global.fetch = mockFetch as any;

    const result = await pollForTransactionConfirmation("test_tx_hash", 1, 10);
    expect(result).toBe(false);
  });
});
