import { describe, it, expect } from "vitest";
import { formatAddress, formatHash } from "../lib/tableFormatters";

describe("DataTable Display Formatters", () => {
  describe("formatAddress", () => {
    it("truncates a Stellar address", () => {
      const address = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      expect(formatAddress(address)).toBe("GBBD...FLA5");
    });

    it("leaves short addresses untouched", () => {
      expect(formatAddress("GABC")).toBe("GABC");
    });

    it("returns an empty string for an empty address", () => {
      expect(formatAddress("")).toBe("");
    });

    it("respects a custom lead and tail length", () => {
      const address = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      expect(formatAddress(address, 6, 4)).toBe("GBBD47...FLA5");
    });

    it("matches the AddressCell truncation boundary", () => {
      // AddressCell truncates when the value is longer than lead * 2 + 3.
      expect(formatAddress("12345678901")).toBe("12345678901");
      expect(formatAddress("123456789012")).toBe("1234...9012");
    });
  });

  describe("formatHash", () => {
    it("truncates a transaction hash", () => {
      const hash = "9f2b7c1de4a85f60b3d2c9e4a17b8d5f0c3a6e91d4b7f2a8c5e0d3b6f9a2c4e7d";
      expect(formatHash(hash)).toBe("9f2b7c...4e7d");
    });

    it("leaves short hashes untouched", () => {
      expect(formatHash("abc123")).toBe("abc123");
    });

    it("returns an empty string for an empty hash", () => {
      expect(formatHash("")).toBe("");
    });

    it("respects a custom lead and tail length", () => {
      const hash = "9f2b7c1de4a85f60b3d2c9e4a17b8d5f0c3a6e91d4b7f2a8c5e0d3b6f9a2c4e7d";
      expect(formatHash(hash, 8, 8)).toBe("9f2b7c1d...9a2c4e7d");
    });

    it("matches the TxHashCell truncation boundary", () => {
      // TxHashCell truncates when the value is longer than lead + tail.
      expect(formatHash("1234567890")).toBe("1234567890");
      expect(formatHash("12345678901")).toBe("123456...8901");
    });
  });
});
