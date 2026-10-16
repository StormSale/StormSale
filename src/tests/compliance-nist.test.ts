import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getStandardNistControls,
  calculateScorecardSummary,
  computeSha256,
  generateCompliancePackJson,
  generateCompliancePdf,
  exportFullCompliancePack,
  downloadFile,
} from "../utils/complianceNist";
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
      expect(ac3?.status).toBe("PASS");
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
    });

    it("should map Audit and Accountability (AU-3) to ledger immutable audit trail", () => {
      const controls = getStandardNistControls();

      const au3 = controls.find((c) => c.id === "AU-3");
      expect(au3).toBeDefined();
      expect(au3?.title).toBe("Content of Audit Records");
      expect(au3?.platformImplementation.toLowerCase()).toContain("immutabl");
      expect(au3?.platformImplementation).toContain("Stellar");

      // Verify metrics have 8 of 8 fields
      const fieldMetric = au3?.metrics.find((m) =>
        m.name.includes("Mandatory Audit Fields Captured"),
      );
      expect(fieldMetric).toBeDefined();
      expect(fieldMetric?.value).toBe("8 of 8 Fields");

      // Verify on-chain transaction evidence link
      const txLink = au3?.evidenceLinks.find((l) => l.type === "transaction");
      expect(txLink).toBeDefined();
      expect(txLink?.url).toContain("/tx/");
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
      const controls = getStandardNistControls();
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
  });

  describe("generateCompliancePackJson", () => {
    it("should generate a complete, valid NIST compliance pack JSON structure", async () => {
      const auditor = "GB1234567890TESTAUDITORSTORMKEY99999999999999999999999999";
      const pack = await generateCompliancePackJson(auditor);

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
        const result = await exportFullCompliancePack(
          "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
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
});
