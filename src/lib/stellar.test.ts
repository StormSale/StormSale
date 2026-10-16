import { describe, it, expect } from "vitest";
import {
  formatStellarAddress,
  isValidStellarAddress,
  getSorobanRpcServer,
  parseSimulationResponse,
  formatResourceDiagnostic,
  assessResourceBudget,
} from "./stellar";

describe("Stellar Helpers", () => {
  it("formats Stellar public key with middle truncation", () => {
    const pubKey = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT44QH3ZLLFLA5";
    expect(formatStellarAddress(pubKey)).toBe("GBBD...FLA5");
  });

  it("handles short or empty address gracefully", () => {
    expect(formatStellarAddress("")).toBe("");
    expect(formatStellarAddress("GBBD")).toBe("GBBD");
  });

  it("validates valid Stellar public keys (G...)", () => {
    const validG = "GBBD47IF6LWK7P7MDEVSCWR7DP-UWV3NY3DTQEVFL4NAT44QH3ZLLFLA5";
    expect(isValidStellarAddress(validG)).toBe(true);
  });

  it("validates valid Soroban contract IDs (C...)", () => {
    const validC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMPQVV2HHGCYSC";
    expect(isValidStellarAddress(validC)).toBe((true));
  });

  it("rejects invalid addresses like EVM 0x or wrong lengths", () => {
    expect(isValidStellarAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e")).toBe((false));
    expect(isValidStellarAddress("GBBD123")).toBe(false);
    expect(isValidStellarAddress("")).toBe(false);
  });

  it("initializes Soroban RPC client with configured endpoint", () => {
    const server = getSorobanRpcServer();
    expect(server).toBeDefined();
  });
});

describe("Soroban Resource Diagnostic Profiler", () => {
  const sampleSimulation = {
    minResourceFee: "123456",
    transactionData: {
      resources: {
        cpuInstructions: "1000000",
        memoryBytes: "524288",
        readBytes: "2048",
        writeBytes: "1024",
      },
    },
  };

  it("parses minResourceFee, cpuInstructions, and memoryBytes from simulateTransaction response", () => {
    const diagnostic = parseSimulationResponse(sampleSimulation);
    expect(diagnostic.minResourceFee).toBe(123456);
    expect(diagnostic.cpuInstructions).toBe(1000000);
    expect(diagnostic.memoryBytes).toBe(524288);
    expect(diagnostic.readBytes).toBe(2048);
    expect(diagnostic.writeBytes).toBe(1024);
  });

  it("tolerates missing optional resource fields", () => {
    const diagnostic = parseSimulationResponse({
      minResourceFee: "100",
      transactionData: { resources: { cpuInstructions: "500" } },
    });
    expect(diagnostic.minResourceFee).toBe(100);
    expect(diagnostic.cpuInstructions).toBe(500);
    expect(diagnostic.memoryBytes).toBe(0);
  });

  it("returns a formatted resource diagnostic breakdown", () => {
    const diagnostic = parseSimulationResponse(sampleSimulation);
    const formatted = formatResourceDiagnostic(diagnostic);
    expect(formatted.minResourceFee).toBeTruthy();
    expect(formatted.cpuInstructions).toContain("1,000,000");
    expect(formatted.memoryBytes).toContain("524,288");
  });

  it("flags unoptimized contract footprints with warnings", () => {
    const diagnostic = parseSimulationResponse({
      minResourceFee: "100000000",
      transactionData: {
        resources: {
          cpuInstructions: "100000000",
          memoryBytes: "50000000",
          readBytes: "1000000",
          writeBytes: "500000",
        },
      },
    });
    const assessment = assessResourceBudget(diagnostic);
    expect(assessment.warnings.length).toBeGreaterThan(0);
    expect(assessment.warnings.some((w) => /cpu/i.test(w))).toBe((true));
  });

  it("does not warn for optimized contract footprints", () => {
    const diagnostic = parseSimulationResponse({
      minResourceFee: "100",
      transactionData: {
        resources: {
          cpuInstructions: "1000",
          memoryBytes: "2048",
          readBytes: "512",
          writeBytes: "256",
        },
      },
    });
    const assessment = assessResourceBudget(diagnostic);
    expect(assessment.warnings.length).toBe(0);
  });
});
