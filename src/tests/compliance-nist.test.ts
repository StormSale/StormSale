import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStandardNistControls,
  calculateScorecardSummary,
  computeSha256,
  generateCompliancePackJson,
  generateCompliancePdf,
  exportFullCompliancePack,
  downloadFile,
  fetchLiveOnChainTelemetry,
  fetchLiveNistControls,
} from "../utils/complianceNist";
import { CONTRACT_ADDRESSES } from "../config/contracts";
import type { NistControl } from "../types/compliance";

describe("NIST SP 800-53 Automated Security Control Scorecard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getStandardNistControls", () => {
    it("should return standard NIST controls covering AC, AU, and SC control families", () => {
      const controls = getStandardNistControls();
      expect(controls.length).toBeGreaterThanOrEqual(8);

      const families = new Set(controls.map((c) => c.family));
      expect(families.has("AC")).toBe(true);
      expect(families.has("AU")).toBe(true);
      expect(families.has("SC")).toBe(true);
    });

    it("should map Access Control (AC-3, AC-6) standards to platform RBAC and smart contracts", () => {
      const controls = getStandardNistControls();

      const ac3 = controls.find((c) => c.id === "AC-3");
      expect(ac3).toBeDefined();
      expect(ac3?.title).toBe("Access Enforcement");
      expect(ac3?.family).toBe("AC");
      // Without telemetry, status is REVIEW (unverified missing telemetry)
      expect(ac3?.status).toBe("REVIEW");
      expect(ac3?.platformImplementation).toContain("Soroban smart contract");
      expect(ac3?.platformImplementation).toContain("cryptographic key verification");

      // Verify embedded evidence links
      expect(ac3?.evidenceLinks.length).toBeGreaterThan(0);
      const contractLink = ac3?.evidenceLinks.find((l) => l.type === "contract");
      expect(contractLink).toBeDefined();
      expect(contractLink?.url).toContain("/contract/");

      const ac6 = controls.find((c) => c.id === "AC-6");
      expect(ac6).toBeDefined();
      expect(ac6?.title).toBe("Least Privilege");
      expect(ac6?.platformImplementation).toContain("Role-Based Access Control (RBAC)");
      expect(ac6?.status).toBe("PASS");

      // With live telemetry, ac3 passes
      const verifiedControls = getStandardNistControls("TESTNET", {
        isOnline: true,
        recentTransactions: ["a".repeat(64)],
        contractVerified: true,
      });
      const verifiedAc3 = verifiedControls.find((c) => c.id === "AC-3");
      expect(verifiedAc3?.status).toBe("PASS");
    });

    it("should map Audit and Accountability (AU-3) to ledger immutable audit trail", () => {
      const controls = getStandardNistControls();

      const au3 = controls.find((c) => c.id === "AU-3");
      expect(au3).toBeDefined();
      expect(au3?.title).toBe("Content of Audit Records");
      expect(au3?.platformImplementation.toLowerCase()).toContain("immutabl");
      expect(au3?.platformImplementation).toContain("Stellar");
      expect(au3?.status).toBe("REVIEW");

      // Verify on-chain transaction evidence link
      const txLink = au3?.evidenceLinks.find((l) => l.type === "transaction");
      expect(txLink).toBeDefined();
      expect(txLink?.url).toContain("/tx/");

      // With live telemetry, AU-3 is PASS with 8 of 8 fields
      const verifiedControls = getStandardNistControls("TESTNET", {
        isOnline: true,
        recentTransactions: ["a".repeat(64), "b".repeat(64)],
        contractVerified: true,
      });
      const verifiedAu3 = verifiedControls.find((c) => c.id === "AU-3");
      expect(verifiedAu3?.status).toBe("PASS");
      const fieldMetric = verifiedAu3?.metrics.find((m) =>
        m.name.includes("Mandatory Audit Fields Captured"),
      );
      expect(fieldMetric).toBeDefined();
      expect(fieldMetric?.value).toBe("8 of 8 Fields");
      expect(fieldMetric?.status).toBe("PASS");
    });

    it("should map System and Communications Protection (SC-8, SC-13, SC-28) to AES-GCM encryption", () => {
      const controls = getStandardNistControls();

      const sc8 = controls.find((c) => c.id === "SC-8");
      expect(sc8).toBeDefined();
      expect(sc8?.title).toBe("Transmission Confidentiality and Integrity");
      expect(sc8?.platformImplementation).toContain("AES-256-GCM");

      const sc13 = controls.find((c) => c.id === "SC-13");
      expect(sc13).toBeDefined();
      expect(sc13?.title).toBe("Cryptographic Protection");

      const sc28 = controls.find((c) => c.id === "SC-28");
      expect(sc28).toBeDefined();
      expect(sc28?.title).toBe("Protection of Information at Rest");
    });

    it("should respect networkOverride when specified", () => {
      const customControls = getStandardNistControls("PUBLIC");
      const ac17 = customControls.find((c) => c.id === "AC-17");
      const networkLink = ac17?.evidenceLinks.find((l) => l.type === "ledger");
      expect(networkLink?.identifier).toBe("PUBLIC");
    });
  });

  describe("calculateScorecardSummary", () => {
    it("should calculate correct percentage score and family breakdowns", () => {
      const verifiedTelemetry = {
        isOnline: true,
        recentTransactions: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
        contractVerified: true,
      };
      const controls = getStandardNistControls("TESTNET", verifiedTelemetry);
      const summary = calculateScorecardSummary(controls);

      expect(summary.totalControls).toBe(controls.length);
      expect(summary.passedControls).toBe(controls.length);
      expect(summary.failedControls).toBe(0);
      expect(summary.complianceScorePercent).toBe(100);

      expect(summary.familyScores.AC.percent).toBe(100);
      expect(summary.familyScores.AU.percent).toBe(100);
      expect(summary.familyScores.SC.percent).toBe(100);
      expect(summary.evaluationId).toMatch(/^EVAL-NIST-/);
    });

    it("should calculate mixed status percentages accurately", () => {
      const mockControls: NistControl[] = [
        {
          id: "AC-1",
          title: "Test 1",
          family: "AC",
          familyName: "Access Control",
          nistDescription: "Desc",
          platformImplementation: "Impl",
          status: "PASS",
          verificationMethod: "Method",
          lastEvaluated: "2026-10-16",
          metrics: [],
          evidenceLinks: [],
        },
        {
          id: "AC-2",
          title: "Test 2",
          family: "AC",
          familyName: "Access Control",
          nistDescription: "Desc",
          platformImplementation: "Impl",
          status: "FAIL",
          verificationMethod: "Method",
          lastEvaluated: "2026-10-16",
          metrics: [],
          evidenceLinks: [],
        },
        {
          id: "AU-1",
          title: "Test 3",
          family: "AU",
          familyName: "Audit",
          nistDescription: "Desc",
          platformImplementation: "Impl",
          status: "PASS",
          verificationMethod: "Method",
          lastEvaluated: "2026-10-16",
          metrics: [],
          evidenceLinks: [],
        },
        {
          id: "SC-1",
          title: "Test 4",
          family: "SC",
          familyName: "System",
          nistDescription: "Desc",
          platformImplementation: "Impl",
          status: "REVIEW",
          verificationMethod: "Method",
          lastEvaluated: "2026-10-16",
          metrics: [],
          evidenceLinks: [],
        },
      ];

      const summary = calculateScorecardSummary(mockControls, "CUSTOM-EVAL-ID");
      expect(summary.totalControls).toBe(4);
      expect(summary.passedControls).toBe(2);
      expect(summary.failedControls).toBe(1);
      expect(summary.reviewControls).toBe(1);
      expect(summary.complianceScorePercent).toBe(50);
      expect(summary.evaluationId).toBe("CUSTOM-EVAL-ID");

      expect(summary.familyScores.AC.passed).toBe(1);
      expect(summary.familyScores.AC.total).toBe(2);
      expect(summary.familyScores.AC.percent).toBe(50);

      expect(summary.familyScores.AU.passed).toBe(1);
      expect(summary.familyScores.AU.total).toBe(1);
      expect(summary.familyScores.AU.percent).toBe(100);

      expect(summary.familyScores.SC.passed).toBe(0);
      expect(summary.familyScores.SC.total).toBe(1);
      expect(summary.familyScores.SC.percent).toBe(0);
    });
  });

  describe("computeSha256", () => {
    it("should generate a 64-character hexadecimal SHA-256 seal", async () => {
      const hash = await computeSha256("StormSale-NIST-Audit-Pack-Test");
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("should be deterministic for identical input data", async () => {
      const hash1 = await computeSha256("deterministic-test-data");
      const hash2 = await computeSha256("deterministic-test-data");
      expect(hash1).toBe(hash2);
    });

    it("should throw an Error if SubtleCrypto is unavailable", async () => {
      const originalSubtle = globalThis.crypto?.subtle;
      try {
        Object.defineProperty(globalThis.crypto, "subtle", {
          value: undefined,
          configurable: true,
        });
        await expect(computeSha256("test-data")).rejects.toThrow(
          "Cryptographic SHA-256 primitive (SubtleCrypto) is unavailable in this environment.",
        );
      } finally {
        Object.defineProperty(globalThis.crypto, "subtle", {
          value: originalSubtle,
          configurable: true,
        });
      }
    });
  });

  describe("generateCompliancePackJson", () => {
    it("should default to Unattributed (Wallet Not Connected) when no auditor address is passed", async () => {
      const pack = await generateCompliancePackJson();
      expect(pack.auditorAddress).toBe("Unattributed (Wallet Not Connected)");
    });

    it("should generate a complete, valid NIST compliance pack JSON structure", async () => {
      const auditor = "GB1234567890TESTAUDITORSTORMKEY99999999999999999999999999";
      const verifiedControls = getStandardNistControls("TESTNET", {
        isOnline: true,
        recentTransactions: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
        contractVerified: true,
      });
      const pack = await generateCompliancePackJson(auditor, verifiedControls);

      expect(pack.formatVersion).toBe("1.0.0");
      expect(pack.framework).toBe("NIST SP 800-53 Rev. 5");
      expect(pack.systemName).toContain("StormSale");
      expect(pack.auditorAddress).toBe(auditor);
      expect(pack.controls.length).toBeGreaterThan(0);
      expect(pack.summary.complianceScorePercent).toBe(100);
      expect(pack.complianceSeal.sha256).toHaveLength(64);
      expect(pack.complianceSeal.algorithm).toBe("SHA-256");
      expect(pack.complianceSeal.verified).toBe(true);
      expect(pack.contracts.campaignEscrow).toBeDefined();
    });
  });

  describe("generateCompliancePdf", () => {
    it("should generate a valid jsPDF document without errors", async () => {
      const pack = await generateCompliancePackJson();
      const pdfDoc = generateCompliancePdf(pack);

      expect(pdfDoc).toBeDefined();
      expect(pdfDoc.internal.pages.length).toBeGreaterThan(1);
    });

    it("should handle mixed control statuses (PASS, REVIEW, FAIL) with dynamic colors", async () => {
      const mockControls: NistControl[] = [
        {
          id: "AC-1",
          title: "Access Policy",
          family: "AC",
          familyName: "Access Control",
          nistDescription: "Policy description",
          platformImplementation: "Role based control",
          status: "PASS",
          verificationMethod: "Smart Contract RBAC",
          lastEvaluated: "2026-10-16",
          metrics: [
            {
              name: "Metric 1",
              value: "100%",
              status: "PASS",
              threshold: "100%",
              description: "Full enforcement",
            },
          ],
          evidenceLinks: [],
        },
        {
          id: "AU-1",
          title: "Audit Logging",
          family: "AU",
          familyName: "Audit and Accountability",
          nistDescription: "Audit description",
          platformImplementation: "Horizon records",
          status: "REVIEW",
          verificationMethod: "Manual Review",
          lastEvaluated: "2026-10-16",
          metrics: [
            {
              name: "Audit Trail",
              value: "Partial",
              status: "WARN",
              threshold: "Complete",
              description: "Partial audit records",
            },
          ],
          evidenceLinks: [],
        },
        {
          id: "SC-1",
          title: "Encryption Policy",
          family: "SC",
          familyName: "System and Communications Protection",
          nistDescription: "Encryption standard",
          platformImplementation: "AES-256-GCM",
          status: "FAIL",
          verificationMethod: "Protocol Spec",
          lastEvaluated: "2026-10-16",
          metrics: [
            {
              name: "Key Rotation",
              value: "Expired",
              status: "FAIL",
              threshold: "30 Days",
              description: "Key expired",
            },
          ],
          evidenceLinks: [],
        },
      ];

      const pack = await generateCompliancePackJson(undefined, mockControls);
      const pdfDoc = generateCompliancePdf(pack);
      expect(pdfDoc).toBeDefined();
      expect(pdfDoc.internal.pages.length).toBeGreaterThan(0);

      // Inspect the generated drawing commands to verify distinct colors for PASS, REVIEW, and FAIL:
      // PASS (Emerald [16, 185, 129]) -> '0.06 0.73 0.51 rg'
      // REVIEW (Amber [245, 158, 11]) -> '0.96 0.62 0.04 rg'
      // FAIL (Rose [239, 68, 68]) -> '0.94 0.27 0.27 rg'
      const pdfContent = pdfDoc.output();
      expect(pdfContent).toContain("0.06 0.73 0.51 rg");
      expect(pdfContent).toContain("0.96 0.62 0.04 rg");
      expect(pdfContent).toContain("0.94 0.27 0.27 rg");
    });
  });

  describe("exportFullCompliancePack", () => {
    it("should execute 1-click export generating both JSON and PDF", async () => {
      const mockAnchor = {
        href: "",
        download: "",
        click: vi.fn(),
      };

      interface GlobalWithDom {
        document?: unknown;
        window?: unknown;
        URL?: unknown;
      }
      const g = globalThis as unknown as GlobalWithDom;
      const originalDoc = g.document;
      const originalWindow = g.window;
      const originalUrl = g.URL;

      g.window = globalThis;
      g.document = {
        createElement: vi.fn().mockImplementation((tag: string) => {
          if (tag === "a") return mockAnchor as unknown as HTMLAnchorElement;
          return {} as unknown as HTMLElement;
        }),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      };
      g.URL = {
        createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
        revokeObjectURL: vi.fn(),
      };

      try {
        const verifiedControls = getStandardNistControls("TESTNET", {
          isOnline: true,
          recentTransactions: ["a".repeat(64), "b".repeat(64), "c".repeat(64)],
          contractVerified: true,
        });
        const result = await exportFullCompliancePack(
          "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
          verifiedControls,
        );

        expect(result.success).toBe(true);
        expect(result.pack).toBeDefined();
        expect(result.pack.summary.complianceScorePercent).toBe(100);
        expect(mockAnchor.click).toHaveBeenCalled();
      } finally {
        g.document = originalDoc;
        g.window = originalWindow;
        g.URL = originalUrl;
      }
    });
  });

  describe("downloadFile", () => {
    it("should handle Blob and string downloads gracefully", () => {
      const mockAnchor = {
        href: "",
        download: "",
        click: vi.fn(),
      };

      interface GlobalWithDom {
        document?: unknown;
        window?: unknown;
        URL?: unknown;
      }
      const g = globalThis as unknown as GlobalWithDom;
      const originalDoc = g.document;
      const originalWindow = g.window;
      const originalUrl = g.URL;

      g.window = globalThis;
      g.document = {
        createElement: vi.fn().mockReturnValue(mockAnchor as unknown as HTMLAnchorElement),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      };
      g.URL = {
        createObjectURL: vi.fn().mockReturnValue("blob:test"),
        revokeObjectURL: vi.fn(),
      };

      try {
        downloadFile('{"test": true}', "test.json", "application/json");
        expect(mockAnchor.download).toBe("test.json");
        expect(mockAnchor.click).toHaveBeenCalled();
      } finally {
        g.document = originalDoc;
        g.window = originalWindow;
        g.URL = originalUrl;
      }
    });
  });

  describe("fetchLiveOnChainTelemetry and fetchLiveNistControls", () => {
    it("should handle live Soroban RPC fetch success and populate recent transactions in descending order", async () => {
      const mockEvents = [
        { txHash: "a".repeat(64), ledger: 123455 },
        { txHash: "b".repeat(64), ledger: 123456 },
      ];
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { sequence: 123456 },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 2,
            result: { events: mockEvents, latestLedger: 123456 },
          }),
        } as Response);

      const telemetry = await fetchLiveOnChainTelemetry();
      expect(telemetry.isOnline).toBe(true);
      expect(telemetry.latestLedger).toBe(123456);
      expect(telemetry.recentTransactions).toHaveLength(2);
      expect(telemetry.recentTransactions?.[0]).toBe("b".repeat(64));
      expect(telemetry.recentTransactions?.[1]).toBe("a".repeat(64));

      fetchSpy.mockRestore();
    });

    it("should select the Soroban RPC endpoint, resolve startLedger within retention window, and set pagination limit", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "healthy", latestLedger: 200000, oldestLedger: 185000 },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 2,
            result: { events: [], latestLedger: 200000 },
          }),
        } as Response);

      await fetchLiveOnChainTelemetry("PUBLIC");

      // Verify call 1: getHealth
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "https://soroban-rpc.mainnet.stellar.org",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getHealth",
          }),
        }),
      );

      // Verify call 2: getEvents with retention window startLedger & pagination.limit
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "https://soroban-rpc.mainnet.stellar.org",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
        }),
      );

      const secondCallBody = JSON.parse(fetchSpy.mock.calls[1][1]?.body as string);
      expect(secondCallBody.method).toBe("getEvents");
      // 200000 - 10000 = 190000 (bounded by oldestLedger 185000)
      expect(secondCallBody.params.startLedger).toBe(190000);
      expect(secondCallBody.params.pagination.limit).toBe(100);
      expect(secondCallBody.params.filters[0].contractIds).toEqual([
        CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
      ]);

      fetchSpy.mockRestore();
    });

    it("should handle JSON-RPC errors and reject or fallback based on throwOnError", async () => {
      // 1. getHealth error with throwOnError = true
      const fetchSpyError1 = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32600, message: "Node syncing" },
        }),
      } as Response);

      await expect(fetchLiveOnChainTelemetry("TESTNET", { throwOnError: true })).rejects.toThrow(
        "Soroban RPC getHealth error (-32600): Node syncing",
      );
      fetchSpyError1.mockRestore();

      // 2. getHealth error with throwOnError = false
      const fetchSpyError2 = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32600, message: "Node syncing" },
        }),
      } as Response);

      const offlineResult = await fetchLiveOnChainTelemetry("TESTNET", { throwOnError: false });
      expect(offlineResult.isOnline).toBe(false);
      fetchSpyError2.mockRestore();

      // 3. getEvents error with throwOnError = true
      const fetchSpyError3 = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { sequence: 1000 },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 2,
            error: { code: -32602, message: "startLedger out of bounds" },
          }),
        } as Response);

      await expect(fetchLiveOnChainTelemetry("TESTNET", { throwOnError: true })).rejects.toThrow(
        "Soroban RPC getEvents error (-32602): startLedger out of bounds",
      );
      fetchSpyError3.mockRestore();
    });

    it("should handle live RPC fetch HTTP failure gracefully with fallback when throwOnError is false", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("Network offline"));

      const telemetry = await fetchLiveOnChainTelemetry("TESTNET", { throwOnError: false });
      expect(telemetry.isOnline).toBe(false);
      expect(telemetry.recentTransactions).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it("fetchLiveNistControls should propagate Soroban RPC query failures instead of falsely passing", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValueOnce(new Error("Connection refused by Soroban RPC"));

      await expect(fetchLiveNistControls("TESTNET")).rejects.toThrow(
        "Connection refused by Soroban RPC",
      );

      fetchSpy.mockRestore();
    });

    it("fetchLiveNistControls should abort the fetch and throw on timeout", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);

      await expect(fetchLiveNistControls("TESTNET", { timeoutMs: 100 })).rejects.toThrow(
        /Soroban RPC telemetry query timed out after 100ms/,
      );

      fetchSpy.mockRestore();
    });

    it("fetchLiveNistControls should combine live telemetry with controls on specified network", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 1,
            result: { latestLedger: 99999, oldestLedger: 90000 },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            id: 2,
            result: {
              events: [
                { txHash: "1".repeat(64), ledger: 99997 },
                { txHash: "2".repeat(64), ledger: 99998 },
                { txHash: "3".repeat(64), ledger: 99999 },
              ],
              latestLedger: 99999,
            },
          }),
        } as Response);

      const { controls, telemetry } = await fetchLiveNistControls("PUBLIC");
      expect(telemetry.isOnline).toBe(true);
      expect(controls.length).toBeGreaterThan(0);

      const ac3 = controls.find((c) => c.id === "AC-3");
      expect(ac3?.status).toBe("PASS");
      const txEvidence = ac3?.evidenceLinks.find((l) => l.type === "transaction");
      expect(txEvidence?.identifier).toBe("3".repeat(64));
      // Confirms explorer URL uses public for PUBLIC network
      expect(txEvidence?.url).toContain("explorer/public");

      // Verify AU-3 uses explorer contract link rather than broken Horizon accounts link
      const au3 = controls.find((c) => c.id === "AU-3");
      const contractLink = au3?.evidenceLinks.find((l) => l.type === "contract");
      expect(contractLink).toBeDefined();
      expect(contractLink?.url).toContain("/contract/");
      expect(contractLink?.url).not.toContain("/accounts/");

      fetchSpy.mockRestore();
    });

    it("should treat missing telemetry as unverified and require live contract transactions for PASS", () => {
      // 1. Missing telemetry (no telemetry argument): AC-3, AU-3, SC-8, AC-17 are REVIEW
      const defaultControls = getStandardNistControls();
      const defAc3 = defaultControls.find((c) => c.id === "AC-3");
      const defAu3 = defaultControls.find((c) => c.id === "AU-3");
      const defSc8 = defaultControls.find((c) => c.id === "SC-8");
      const defAc17 = defaultControls.find((c) => c.id === "AC-17");
      expect(defAc3?.status).toBe("REVIEW");
      expect(defAu3?.status).toBe("REVIEW");
      expect(defSc8?.status).toBe("REVIEW");
      expect(defAc17?.status).toBe("REVIEW");
      // On TESTNET without telemetry, static fallback links are labeled as examples
      expect(defAc3?.evidenceLinks.some((l) => l.label.includes("Static Example"))).toBe(true);
      expect(defAc3?.metrics.some((m) => m.status === "WARN")).toBe(true);

      // 2. PUBLIC network without live telemetry: no testnet fake hashes, status is REVIEW
      const publicControls = getStandardNistControls("PUBLIC");
      const pubAc3 = publicControls.find((c) => c.id === "AC-3");
      expect(pubAc3?.status).toBe("REVIEW");
      expect(pubAc3?.evidenceLinks.some((l) => l.type === "transaction")).toBe(false);

      // 3. Offline telemetry: marks dependent controls REVIEW with WARN metrics
      const offlineControls = getStandardNistControls("TESTNET", { isOnline: false });
      const offAc3 = offlineControls.find((c) => c.id === "AC-3");
      expect(offAc3?.status).toBe("REVIEW");
      expect(offAc3?.metrics.some((m) => m.status === "WARN")).toBe(true);

      // 4. Live audit with 0 contract transactions: marks AC-3, AU-3, SC-8 as REVIEW
      const emptyLiveControls = getStandardNistControls("TESTNET", {
        isOnline: true,
        recentTransactions: [],
      });
      const emptyAc3 = emptyLiveControls.find((c) => c.id === "AC-3");
      const emptyAu3 = emptyLiveControls.find((c) => c.id === "AU-3");
      const emptySc8 = emptyLiveControls.find((c) => c.id === "SC-8");
      expect(emptyAc3?.status).toBe("REVIEW");
      expect(emptyAu3?.status).toBe("REVIEW");
      expect(emptySc8?.status).toBe("REVIEW");

      // 5. Live audit with verified contract transactions: marks AC-3, AU-3, SC-8, AC-17 as PASS
      const verifiedLiveControls = getStandardNistControls("TESTNET", {
        isOnline: true,
        recentTransactions: ["1".repeat(64), "2".repeat(64), "3".repeat(64)],
        contractVerified: true,
      });
      const verAc3 = verifiedLiveControls.find((c) => c.id === "AC-3");
      const verAu3 = verifiedLiveControls.find((c) => c.id === "AU-3");
      const verSc8 = verifiedLiveControls.find((c) => c.id === "SC-8");
      const verAc17 = verifiedLiveControls.find((c) => c.id === "AC-17");
      expect(verAc3?.status).toBe("PASS");
      expect(verAu3?.status).toBe("PASS");
      expect(verSc8?.status).toBe("PASS");
      expect(verAc17?.status).toBe("PASS");
      expect(verAc3?.metrics.every((m) => m.status === "PASS")).toBe(true);
    });
  });
});
