import { describe, it, expect } from "vitest";
import {
  formatBipPath,
  getBipPathForAccount,
  parseLedgerError,
  extractLedgerVerificationDetails,
  DEFAULT_STELLAR_BIP_PATH,
} from "../lib/ledgerBridge";
import { Keypair, TransactionBuilder, Account, BASE_FEE, Networks } from "@stellar/stellar-sdk";

describe("Ledger Hardware Wallet Bridge (#121)", () => {
  describe("Derivation Path Formatting", () => {
    it("should return the default BIP-44 path if empty or undefined", () => {
      expect(formatBipPath()).toBe(DEFAULT_STELLAR_BIP_PATH);
      expect(formatBipPath("")).toBe(DEFAULT_STELLAR_BIP_PATH);
      expect(formatBipPath("   ")).toBe(DEFAULT_STELLAR_BIP_PATH);
    });

    it("should strip leading m/ from BIP-44 path", () => {
      expect(formatBipPath("m/44'/148'/0'")).toBe("44'/148'/0'");
      expect(formatBipPath("m/44'/148'/2'")).toBe("44'/148'/2'");
    });

    it("should generate correct BIP-44 path for account indexes", () => {
      expect(getBipPathForAccount(0)).toBe("44'/148'/0'");
      expect(getBipPathForAccount(1)).toBe("44'/148'/1'");
      expect(getBipPathForAccount(5)).toBe("44'/148'/5'");
    });
  });

  describe("Error Parsing & Catching", () => {
    it("should catch device locked error (0x6b0c)", () => {
      const err = { statusCode: 0x6b0c, message: "Ledger device: Locked device" };
      const parsed = parseLedgerError(err);
      expect(parsed.code).toBe("DEVICE_LOCKED");
      expect(parsed.friendlyMessage).toContain("locked");
      expect(parsed.friendlyMessage).toContain("PIN code");
    });

    it("should catch user / app rejection error (0x6985)", () => {
      const err = { statusCode: 0x6985, message: "Condition of use not satisfied" };
      const parsed = parseLedgerError(err);
      expect(parsed.code).toBe("USER_REJECTED");
      expect(parsed.friendlyMessage).toContain("declined");
    });

    it("should catch Stellar app not open error (0x6d00)", () => {
      const err = { statusCode: 0x6d00, message: "App not open" };
      const parsed = parseLedgerError(err);
      expect(parsed.code).toBe("APP_NOT_OPEN");
      expect(parsed.friendlyMessage).toContain("official Stellar application");
    });

    it("should catch transport disconnect / no device selected error", () => {
      const err = new Error("The device was disconnected");
      const parsed = parseLedgerError(err);
      expect(parsed.code).toBe("TRANSPORT_DISCONNECT");
      expect(parsed.friendlyMessage).toContain("disconnected");
    });

    it("should provide fallback for unknown errors", () => {
      const err = new Error("Hardware communication timeout");
      const parsed = parseLedgerError(err);
      expect(parsed.code).toBe("UNKNOWN_LEDGER_ERROR");
      expect(parsed.friendlyMessage).toBe("Hardware communication timeout");
    });
  });

  describe("Soroban Verification Details", () => {
    it("should extract transaction hash and contract ID from prepared transaction", () => {
      const source = Keypair.random();
      const account = new Account(source.publicKey(), "100");
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .setTimeout(30)
        .build();

      const details = extractLedgerVerificationDetails(tx.toXDR(), Networks.TESTNET);
      expect(details.txHash).toBeDefined();
      expect(details.txHash.length).toBe(64); // 32-byte hex
      expect(details.contractId).toBeDefined();
    });
  });
});
