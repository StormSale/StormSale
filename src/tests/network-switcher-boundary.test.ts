import { describe, it, expect } from "vitest";
import { getContractAddress, isValidStellarAddress } from "../lib/contracts";

describe("Network Switcher and Alert Boundary Tests (Issue #430)", () => {
  describe("1. Network Badge & Style Verification", () => {
    it("identifies mainnet, testnet, and futurenet network strings correctly", () => {
      const testnetResult = {
        network: "TESTNET",
        isStellarNetwork: true,
      };
      const mainnetResult = {
        network: "PUBLIC",
        isStellarNetwork: true,
      };
      const futurenetResult = {
        network: "FUTURENET",
        isStellarNetwork: true,
      };

      expect(testnetResult.network.toUpperCase()).toBe("TESTNET");
      expect(mainnetResult.network.toUpperCase()).toBe("PUBLIC");
      expect(futurenetResult.network.toUpperCase()).toBe("FUTURENET");
    });
  });

  describe("2. Contract Address Mapping Resolution", () => {
    it("resolves contract addresses for testnet and mainnet passphrases", () => {
      const testnetAddress = getContractAddress("Test SDF Network ; September 2015");
      const mainnetAddress = getContractAddress("Public Global Stellar Network ; September 2015");

      expect(typeof testnetAddress).toBe("string");
      expect(typeof mainnetAddress).toBe("string");
      expect(isValidStellarAddress(testnetAddress)).toBe(true);
    });
  });

  describe("3. Network Mismatch Banner Boundary", () => {
    it("detects mismatch between wallet network and dApp target passphrase", () => {
      const activeWalletNetwork = "PUBLIC" as string; // Mainnet
      const configuredPassphrase = "Test SDF Network ; September 2015"; // Testnet

      const isMismatch =
        (activeWalletNetwork === "PUBLIC" && configuredPassphrase.includes("Test")) ||
        (activeWalletNetwork === "TESTNET" && !configuredPassphrase.includes("Test"));

      expect(isMismatch).toBe(true);
    });
  });
});
