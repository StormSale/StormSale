import { describe, it, expect } from "vitest";
import { formatStellarAddress, isValidStellarAddress, getSorobanRpcServer, buildSep0007TxUri, buildSep0007QrFallback, streamTransactionInclusion } from "./stellar";

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
    const validG = "GBBD47IF6LWK7P7MDEVSCWR7DPWWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
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
    const xdr = "AAAAAgBAAAAB...";
    const uri = buildSep0007TxUri(xdr);
    expect(uri.startsWith("web+stellar:tx?")).toBe(true);
    expect(uri).toContain(`xdr=${encodeURIComponent(xdr)}`);
    expect(uri).toContain("replace=false");
  });

  it("builds a SEP-0007 QR fallback payload matching the deep link", () => {
    const xdr = "AAAAAgBAAAAB...";
    const uri = buildSep0007TxUri(xdr);
    const qr = buildSep0007QrFallback(uri);
    expect(qr).toBe(uri);
  });

  it("streams Horizon transactions until the target hash is included", async () => {
    const targetHash = "abc123";
    const fakeStream = {
      onmessage: undefined as ((tx: { hash: string }) => void) | undefined,
      close: () => {},
    };
    const fakeServer = {
      transactions: () => ({
        forAccount: () => ({
          cursor: () => ({
            stream: (opts: { onmessage: (tx: { hash: string }) => void }) => {
              fakeStream.onmessage = opts.onmessage;
              return () => fakeStream.close();
            },
          }),
        }),
      }),
    };
    const resultPromise = streamTransactionInclusion(fakeServer as never, "G+ABC", targetHash);
    fakeStream.onmessage?.({ hash: "other" });
    fakeStream.onmessage?.({ hash: targetHash });
    await expect(resultPromise).resolves.toBe(true);
  });
});
