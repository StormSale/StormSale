import { describe, it, expect } from "vitest";
import { formatStellarAddress, isValidStellarAddress, getSorobanRpcServer, generateSep7TxUri, pollForTransactionInclusion } from "./stellar";

describe("Stellar Helpers", () => {
  it("formats Stellar public key with middle truncation", () => {
    const pubKey = "GBBD47IF6LWK7P7MDEVMCWR7DPUWV3NY3DTQEVFL4NAT4AQH3LLFLA5";
    expect(formatStellarAddress(pubKey)).toBe("GBBD...FLA5");
  });

  it("handles short or empty address gracefully", () => {
    expect(formatStellarAddress("")).toBe("");
    expect(formatStellarAddress("GBBD")).toBe("GBBD");
  });

  it("validates valid Stellar public keys (G...)", () => {
    const validG = "GBDD47IF6LWK7P7MDEVMSWR7DPUWV3NY3DDTQEVFL4OAT4AQH3LLFLA5";
    expect(isValidStellarAddress(validG)).toBe(true);
  });

  it("validates valid Soroban contract IDs (C...)", () => {
    const validC = "CDLZFC3SYJYDZT7K67Z75HPJVIEUVNIXF47ZG2FB2RMPQVU2HHGCYSC";
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

  it("generates a SEP-0007 tx URI with base64 XDR and replace=false", () => {
    const xdr = "AAAAAgAAAAB...mockXdr==";
    const uri = generateSep7TxUri(xdr);
    expect(uri.startsWith("web+stellar:tx?")).toBe(true);
    expect(uri).toContain(`xdr=${encodeURIComponent(xdr)}`);
    expect(uri).toContain("replace=false");
  });

  it("polls Horizon until the transaction is included on the ledger", async () => {
    let calls = 0;
    const fakeFetch = async () => {
      calls += 1;
      if (calls < 3) {
        return { ok: true, json: async () => ({ _embedded: { records: [] } }) } as any;
      }
      return {
        ok: true,
        json: async () => ({
          _embedded: { records: [{ hash: "abc123", successful: true, ledger: 42 }] },
        }),
      } as any;
    };
    const result = await pollForTransactionInclusion("GADC", "abc123", {
      fetchImpl: fakeFetch as any,
      intervalMs: 1,
      timeoutMs: 1000,
    });
    expect(result.confirmed).toBe(true);
    expect(result.ledger).toBe(42);
    expect(calls).toBeGreaterThanOrEqual(3);
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
    const testOwner = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";

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
