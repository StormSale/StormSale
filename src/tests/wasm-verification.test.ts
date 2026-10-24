import { describe, it, expect } from "vitest";
import {
  computeSha256,
  getSampleSorobanWasm,
  disassembleWasm,
  verifyContractBytecode,
} from "../lib/wasmVerification";

describe("Soroban Contract Bytecode & Disassembly Verification Suite (#185)", () => {
  describe("computeSha256", () => {
    it("should compute valid 64-character hex SHA-256 hash", async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const hash = await computeSha256(data);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should be deterministic for identical byte inputs", async () => {
      const bytes1 = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
      const bytes2 = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
      const hash1 = await computeSha256(bytes1);
      const hash2 = await computeSha256(bytes2);
      expect(hash1).toBe(hash2);
    });

    it("should compute SHA-256 via pure JS fallback when crypto.subtle is unavailable", async () => {
      const originalSubtle = crypto.subtle;
      try {
        Object.defineProperty(crypto, "subtle", { value: undefined, configurable: true });
        const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
        const hash = await computeSha256(data);
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
      } finally {
        Object.defineProperty(crypto, "subtle", { value: originalSubtle, configurable: true });
      }
    });
  });

  describe("disassembleWasm", () => {
    it("should parse valid WASM and produce readable WAT format", () => {
      const wasm = getSampleSorobanWasm();
      const { wat, exportedFunctions } = disassembleWasm(wasm);

      expect(wat).toContain("(module");
      expect(wat).toContain("(memory (;0;) 1 64)");
      expect(wat).toContain('(export "initialize" (func $initialize))');
      expect(wat).toContain('(export "log_sale" (func $log_sale))');
      expect(wat).toContain('(export "claim_payout" (func $claim_payout))');
      expect(wat).toContain('(export "verify_access" (func $verify_access))');
      expect(exportedFunctions).toEqual([
        "initialize",
        "log_sale",
        "claim_payout",
        "verify_access",
      ]);
    });

    it("should reject corrupted or non-WASM binaries missing magic header", () => {
      const invalid = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x00, 0x00, 0x00]);
      expect(() => disassembleWasm(invalid)).toThrow("missing '\\0asm' magic header");
    });

    it("should reject binaries smaller than 8 bytes", () => {
      const tooSmall = new Uint8Array([0x00, 0x61, 0x73]);
      expect(() => disassembleWasm(tooSmall)).toThrow("file is too small");
    });

    it("should fallback to main function when no exports exist", () => {
      const minimalWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const { wat, exportedFunctions } = disassembleWasm(minimalWasm);
      expect(exportedFunctions).toEqual(["main"]);
      expect(wat).toContain('(func $main (export "main")');
    });
  });

  describe("verifyContractBytecode", () => {
    it("should confirm match when target commit corresponds to release build", async () => {
      const result = await verifyContractBytecode(
        "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
        "f904fa9146e1d06d25acf8cdd0e814ba00839808",
      );

      expect(result.isMatch).toBe(true);
      expect(result.onChainHash).toBe(result.repoBuildHash);
      expect(result.exportedFunctions).toContain("initialize");
      expect(result.wat).toContain("(module");
      expect(result.bytecodeSizeBytes).toBeGreaterThan(0);
    });

    it("should report mismatch when commit artifact hash differs", async () => {
      const result = await verifyContractBytecode(
        "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
        "mismatch_unverified_hash_commit",
      );

      expect(result.isMatch).toBe(false);
      expect(result.onChainHash).not.toBe(result.repoBuildHash);
    });

    it("should support custom WASM bytes and handle short commit tags", async () => {
      const minimalWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
      const result = await verifyContractBytecode(
        "C_CUSTOM_CONTRACT",
        "short",
        minimalWasm
      );

      expect(result.isMatch).toBe(false);
      expect(result.bytecodeSizeBytes).toBe(8);
      expect(result.exportedFunctions).toEqual(["main"]);
    });
  });
});

