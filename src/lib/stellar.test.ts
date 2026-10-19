import { describe, it, expect } from "vitest";
import {
  formatStellarAddress,
  isValidStellarAddress,
  getSorobanRpcServer,
  buildSep0007TxUri,
  buildSep0007QrFallback,
  streamTransactionInclusion,
} from "./stellar";

describe("Stellar Helpers", () => {
  it("formats Stellar public key with middle truncation", () => {
    const pubKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3LLFLA5";
    expect(formatStellarAddress(pubKey)).toBe("GBBD...FLA5");
  });

  it("handles short or empty address gracefully", () => {
    expect(formatStellarAddress("")).toBe("");
    expect(formatStellarAddress("GBBD")).toBe("GBBD");
  });

  it("validates valid Stellar public keys (G...)", () => {
    const validG = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DDQEVFL4NAT4AQH3ZLLFLA5";
    expect(isValidStellarAddress(validG)).toBe(true);
  });

  it("validates valid Soroban contract IDs (C...)", () => {
    const validC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMPQVU2HHGCYSC";
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

  it("generates SEP-0007 tx URI with base64 XDR and replace=false", () => {
    const xdr = "AAAAAgAAAABtestXdrPayload==";
    const uri = buildSep0007TxUri(xdr);
    expect(uri).toBe(`web+stellar:tx?xdr=${encodeURIComponent(xdr)}&replace=false`);
    expect(uri.startsWith("web+stellar:tx?")).toBe(true);
    expect(uri).toContain("replace=false");
  });

  it("encodes XDR safely in SEP-0007 URI", () => {
    const xdr = "abc+def/ghi==";
    const uri = buildSep0007TxUri(xdr);
    expect(uri).toContain(`xdr=${encodeURIComponent(xdr)}`);
    expect(uri).not.toContain("xdr=abc+def/ghi==");
  });

  it("builds QR fallback payload for SEP-0007 URI", () => {
    const xdr = "AAAAAgAAAABtestXdrPayload==";
    const fallback = buildSep0007QrFallback(xdr);
    expect(fallback.uri).toBe(buildSep0007TxUri(xdr));
    expect(fallback.qrData).toBe(fallback.uri);
    expect(fallback.qrData.length).toBeGreaterThan(0);
  });

  it("streams Horizon transactions until inclusion is confirmed", async () => {
    const txHash = "abc123hash";
    const events: string[] = [];
    const stop = streamTransactionInclusion(txHash, {
      onPending: () => events.push("pending"),
      onConfirmed: (hash) => events.push(`confirmed:${hash}`),
      onError: (err) => events.push(`error:${err.message}`),
      pollIntervalMs: 5,
      maxAttempts: 3,
      fetchTransaction: async (hash) =>
        hash === txHash ? { hash, successful: true } : null,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    stop();
    expect(events).toContain("pending");
    expect(events).toContain(`confirmed:${txHash}`);
  });

  it("reports error when transaction inclusion polling fails", async () => {
    const events: string[] = [];
    const stop = streamTransactionInclusion("missinghash", {
      onPending: () => events.push("pending"),
      onConfirmed: (hash) => events.push(`confirmed:${hash}`),
      onError: (err) => events.push(`error:${err.message}`),
      pollIntervalMs: 5,
      maxAttempts: 2,
      fetchTransaction: async () => {
        throw new Error("horizon unavailable");
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    stop();
    expect(events.some((e) => e.startsWith("error:"))).toBe(true);
  });

  it("handles token allowance query and approval flow with mock storage", async () => {
    const mockStorage: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (key: string) => mockStorage[key] || null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k in mockStorage) delete mockStorage[k];
      },
      length: 0,
      key: () => null,
    };
    (globalThis as any).window = { localStorage: mockLocalStorage };
    (globalThis as any).localStorage = mockLocalStorage;

    const { getTokenAllowanceQuery, approveTokenContractCall } = await import("./stellar");
    const testOwner = "GASTORMSALY7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

    // Initially allowance should be 0
    const initialAllowance = await getTokenAllowanceQuery(testOwner);
    expect(initialAllowance).toBe(0);

    // Approve 1500 XLM
    const approveResult = await approveTokenContractCall(testOwner, 1500, undefined, "mock");
    expect(approveResult.success).toBe(true);
    expect(approveResult.allowance).toBe(1500);
    expect(approveResult.txHash).toBeDefined();

    // Query allowance again in real-time
    const updatedAllowance = await getTokenAllowanceQuery(testOwner);
    expect(updatedAllowance).toBe(1500);
  });
});
