import { describe, it, expect } from "vitest";
import { getStellarExplorerLink } from "./network";

describe("Network Utilities", () => {
  it("generates correct Stellar Expert link for an account", () => {
    const pubKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    const link = getStellarExplorerLink("account", pubKey);
    expect(link).toBe(`https://stellar.expert/explorer/testnet/account/${pubKey}`);
  });

  it("generates correct Stellar Expert link for a transaction", () => {
    const txHash = "8f2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b";
    const link = getStellarExplorerLink("tx", txHash);
    expect(link).toBe(`https://stellar.expert/explorer/testnet/tx/${txHash}`);
  });

  it("generates correct Stellar Expert link for a contract", () => {
    const contractId = "CA7QW5KXGPTR4N2K9J2V8B4RN8XJLP8M1K3V6P7QW5KXGPTR4N2K9J2V";
    const link = getStellarExplorerLink("contract", contractId);
    expect(link).toBe(`https://stellar.expert/explorer/testnet/contract/${contractId}`);
  });
});
