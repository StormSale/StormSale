import { describe, it, expect } from "vitest";
import { formatStellarAddress, isValidStellarAddress, getSorobanRpcServer, buildSep0007TxUri, parseSep0007TxUri } from "./stellar";

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
    const xdr = "AAAAAgAAAAB...";
    const uri = buildSep0007TxUri(xdr);
    expect(uri.startsWith("web+stellar:tx?")).toBe(true);
    expect(uri).toContain(`xdr=${encodeURIComponent(xdr)}`);
    expect(uri).toContain("replace=false");
  });

  it("includes optional callback and msg params in SEP-0007 URI", () => {
    const xdr = "AAAAAgAAAAB...";
    const uri = buildSep0007TxUri(xdr, {
      callback: "https://example.com/cb",
      msg: "Sign this",
    });
    expect(uri).toContain("callback=" + encodeURIComponent("https://example.com/cb"));
    expect(uri).toContain("msg=" + encodeURIComponent("Sign this"));
  });

  it("parses a SEP-0007 tx URI back into its components", () => {
    const xdr = "AAAAAgAAAAB...";
    const uri = buildSep0007TxUri(xdr, { msg: "hello world" });
    const parsed = parseSep0007TxUri(uri);
    expect(parsed).not.toBeNull();
    expect(parsed!.xdr).toBe(xdr);
    expect(parsed!.replace).toBe(false);
    expect(parsed!.msg).toBe("hello world");
  });

  it("returns null when parsing a non-SEP-0007 URI", () => {
    expect(parseSep0007TxUri("https://example.com")).toBeNull();
    expect(parseSep0007TxUri("web+stellar:pay?destination=G...")).toBeNull();
  });

  it("rejects empty XDR when building SEP-0007 URI", () => {
    expect(() => buildSep0007TxUri("")).toThrow();
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