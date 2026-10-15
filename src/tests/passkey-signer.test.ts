import { describe, it, expect } from "vitest";
import {
  bufferToBase64Url,
  base64UrlToBuffer,
  deriveStellarAddressFromPasskey,
  buildSponsoredFeeBumpTransaction,
  verifyWebAuthnP256Signature,
} from "../lib/passkeySigner";
import { Keypair, TransactionBuilder, Account, BASE_FEE, Networks } from "@stellar/stellar-sdk";

describe("Passkey & WebAuthn Smart Signer (#128)", () => {
  describe("Base64URL Buffer Conversions", () => {
    it("should round-trip encode and decode ArrayBuffers to Base64URL", () => {
      const data = new Uint8Array([1, 2, 3, 4, 15, 255, 128, 64]);
      const base64url = bufferToBase64Url(data.buffer);
      const decoded = base64UrlToBuffer(base64url);

      expect(Array.from(decoded)).toEqual(Array.from(data));
    });
  });

  describe("Deterministic Stellar Address Derivation", () => {
    it("should derive a valid Stellar G... public key from a passkey public key", () => {
      const mockKeyData = bufferToBase64Url(new Uint8Array(32).fill(7).buffer);
      const address = deriveStellarAddressFromPasskey(mockKeyData);

      expect(address).toBeDefined();
      expect(address.startsWith("G")).toBe(true);
      expect(address.length).toBe(56);
    });

    it("should generate the same address for the same passkey public key", () => {
      const mockDeterministicData = bufferToBase64Url(new Uint8Array(32).fill(42).buffer);
      const addr1 = deriveStellarAddressFromPasskey(mockDeterministicData);
      const addr2 = deriveStellarAddressFromPasskey(mockDeterministicData);

      expect(addr1).toBe(addr2);
    });
  });

  describe("Platform Fee-Bump Gas Sponsorship", () => {
    it("should wrap an inner transaction into a fee-bump transaction with sponsor", () => {
      const innerKey = Keypair.random();
      const sponsorKey = Keypair.random();

      const innerAccount = new Account(innerKey.publicKey(), "1");
      const innerTx = new TransactionBuilder(innerAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const feeBumpTx = buildSponsoredFeeBumpTransaction(
        innerTx,
        sponsorKey.publicKey(),
        "500",
        Networks.TESTNET,
      );

      expect(feeBumpTx).toBeDefined();
      expect(feeBumpTx.feeSource).toBe(sponsorKey.publicKey());
      expect(feeBumpTx.fee).toBe("500");
      expect(feeBumpTx.innerTransaction.toXDR()).toBe(innerTx.toXDR());
    });
  });

  describe("WebAuthn Signature Verification Helper", () => {
    it("should verify presence of WebAuthn signature parameters", async () => {
      const valid = await verifyWebAuthnP256Signature(
        "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0",
        "SZYN5YgOjGh0NBcPZHZgW4/krbrmihVWYZa+vn32Q8M",
        "MEQCIFV123",
        "dummyKey",
      );
      expect(valid).toBe(true);

      const invalid = await verifyWebAuthnP256Signature("", "", "", "");
      expect(invalid).toBe(false);
    });
  });
});
