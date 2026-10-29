// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildSignedAuditReport,
  exportComplianceToCSV,
  generateBrandedPDFHtml,
  filterByDateRange,
  generateAuditDigest,
  printOrSavePDF,
  downloadFile,
  DEFAULT_COMPLIANCE_STANDARDS,
  DEFAULT_AUDIT_RECORDS,
} from "../lib/complianceExport";

describe("Regulatory Compliance & Export Suite", () => {
  const options = {
    startDate: "2026-05-01",
    endDate: "2026-05-15",
    statusFilter: "ALL" as const,
    auditorName: "CertiK Independent Auditor",
    auditorAddress: "GAUDITOR_TEST_ADDRESS",
  };

  it("filters items within specified date range", () => {
    const filtered = filterByDateRange(DEFAULT_COMPLIANCE_STANDARDS, "2026-05-10", "2026-05-14");
    // Should include 2026-05-14 (ISO) and 2026-05-10 (GDPR) and 2026-05-12 (SOC2)
    expect(filtered.length).toBe(3);
    expect(filtered.map((s) => s.standard)).toContain("ISO/IEC 27001");
    expect(filtered.map((s) => s.standard)).toContain("GDPR Article 32");
    expect(filtered.map((s) => s.standard)).toContain("SOC 2 Type II");
  });

  it("handles items without timestamp or lastChecked", () => {
    const items: Array<{ standard?: string; timestamp?: string; lastChecked?: string }> = [
      { standard: "No date" },
      { standard: "Has date", timestamp: "2026-05-12" },
    ];
    const filtered = filterByDateRange(items, "2026-05-10", "2026-05-15");
    expect(filtered.length).toBe(2);
  });

  it("generates deterministic audit digest hash", () => {
    const hash1 = generateAuditDigest("audit-payload-1");
    const hash2 = generateAuditDigest("audit-payload-1");
    const hash3 = generateAuditDigest("audit-payload-2");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBeGreaterThan(16);
  });

  it("builds a signed audit report with metrics and cryptographic certificate", () => {
    const report = buildSignedAuditReport(
      options,
      DEFAULT_COMPLIANCE_STANDARDS,
      DEFAULT_AUDIT_RECORDS,
    );

    expect(report.reportId).toMatch(/^AUD-\d{6}-\d{4}$/);
    expect(report.auditor.name).toBe("CertiK Independent Auditor");
    expect(report.auditor.address).toBe("GAUDITOR_TEST_ADDRESS");
    expect(report.cryptoSignature.algorithm).toBe("SHA-256");
    expect(report.cryptoSignature.digestHash).toBeDefined();
    expect(report.cryptoSignature.signatureCert).toContain("SIG_ED25519_");
    expect(report.metrics.complianceScore).toBeGreaterThanOrEqual(0);
    expect(report.metrics.totalStandards).toBeGreaterThan(0);
  });

  it("uses default auditor and handles zero standards", () => {
    const minimalReport = buildSignedAuditReport(
      { startDate: "2026-05-01", endDate: "2026-05-15" },
      [],
      [],
    );
    expect(minimalReport.auditor.name).toBe("Independent Compliance Auditor");
    expect(minimalReport.auditor.address).toBe("GAUDITOR_COMPLIANCE_OFFICER_STELLAR_KEY");
    expect(minimalReport.metrics.complianceScore).toBe(0);
    expect(minimalReport.metrics.totalStandards).toBe(0);
  });

  it("supports status filtering in signed report", () => {
    const compliantOnly = buildSignedAuditReport(
      { ...options, statusFilter: "Compliant" },
      DEFAULT_COMPLIANCE_STANDARDS,
      DEFAULT_AUDIT_RECORDS,
    );

    expect(compliantOnly.standards.every((s) => s.status === "Compliant")).toBe(true);
    expect(compliantOnly.metrics.reviewNeededCount).toBe(0);
    expect(compliantOnly.metrics.complianceScore).toBe(100);
  });

  it("filters by Review Needed status", () => {
    const reviewOnly = buildSignedAuditReport(
      { ...options, statusFilter: "Review Needed" },
      DEFAULT_COMPLIANCE_STANDARDS,
      DEFAULT_AUDIT_RECORDS,
    );
    expect(reviewOnly.standards.every((s) => s.status === "Review Needed")).toBe(true);
    expect(reviewOnly.metrics.reviewNeededCount).toBe(reviewOnly.standards.length);
  });

  it("exports batch audit report to RFC-4180 CSV", () => {
    const report = buildSignedAuditReport(options);
    const csv = exportComplianceToCSV(report);

    expect(csv).toContain("=== STORMSALE REGULATORY COMPLIANCE AUDIT EXPORT ===");
    expect(csv).toContain(`Report ID,"${report.reportId}"`);
    expect(csv).toContain("=== REGULATORY STANDARDS AUDIT ===");
    expect(csv).toContain("Standard,Category,Status,Last Checked,Details");
    expect(csv).toContain("=== AUDITED SALE ACCESS LEDGER ===");
    expect(csv).toContain(
      "Sale ID,Campaign,Contract Address,Verification Status,Timestamp,Auditor Notes",
    );
  });

  it("generates branded printable PDF HTML with security seal and branding", () => {
    const report = buildSignedAuditReport(options);
    const html = generateBrandedPDFHtml(report);

    expect(html).toContain("StormSale Protocol");
    expect(html).toContain("Regulatory Compliance & Verification Report");
    expect(html).toContain(report.reportId);
    expect(html).toContain("Cryptographic Auditor Signature & Tamper-Evident Seal");
    expect(html).toContain(report.cryptoSignature.digestHash);
    expect(html).toContain('<link rel="stylesheet" href="/compliance-report.css">');
    expect(html).not.toContain("<style>");
    expect(html).not.toContain("style=");
  });

  it("renders status badges for Verified, Denied, and Pending records", () => {
    const report = buildSignedAuditReport(options);
    const html = generateBrandedPDFHtml(report);
    expect(html).toContain("badge-verified");
    expect(html).toContain("badge-denied");
    expect(html).toContain("badge-pending");
  });

  describe("printOrSavePDF", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("triggers print on stylesheet onload and guards against duplicate print", () => {
      const mockPrint = vi.fn();
      const mockLink: {
        onload: (() => void) | null;
        onerror: (() => void) | null;
      } = {
        onload: null,
        onerror: null,
      };

      const mockWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
          querySelector: vi.fn().mockImplementation((selector: string) => {
            if (selector === 'link[rel="stylesheet"]') return mockLink;
            return null;
          }),
        },
        focus: vi.fn(),
        print: mockPrint,
        onload: null as (() => void) | null,
      };

      vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);

      printOrSavePDF("<html><body>Report</body></html>");

      expect(mockWindow.document.write).toHaveBeenCalledWith("<html><body>Report</body></html>");
      expect(mockWindow.document.close).toHaveBeenCalled();
      expect(mockWindow.focus).toHaveBeenCalled();
      expect(typeof mockLink.onload).toBe("function");

      // Trigger stylesheet onload
      mockLink.onload!();
      expect(mockPrint).toHaveBeenCalledTimes(1);

      // Fast-forward timeout to ensure printed guard stops duplicate print
      vi.advanceTimersByTime(1000);
      expect(mockPrint).toHaveBeenCalledTimes(1);
    });

    it("logs error on stylesheet load failure and prints via fallback timer", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockPrint = vi.fn();
      const mockLink: {
        onload: (() => void) | null;
        onerror: (() => void) | null;
      } = {
        onload: null,
        onerror: null,
      };

      const mockWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
          querySelector: vi.fn().mockReturnValue(mockLink),
        },
        focus: vi.fn(),
        print: mockPrint,
        onload: null,
      };

      vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);

      printOrSavePDF("<html><body>Report</body></html>");

      expect(typeof mockLink.onerror).toBe("function");
      mockLink.onerror!();

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to load compliance report stylesheet.");
      expect(mockPrint).not.toHaveBeenCalled();

      // Trigger fallback timer
      vi.advanceTimersByTime(500);
      expect(mockPrint).toHaveBeenCalledTimes(1);
    });

    it("falls back to printWindow.onload when no stylesheet link is found", () => {
      const mockPrint = vi.fn();
      const mockWindow = {
        document: {
          write: vi.fn(),
          close: vi.fn(),
          querySelector: vi.fn().mockReturnValue(null),
        },
        focus: vi.fn(),
        print: mockPrint,
        onload: null as (() => void) | null,
      };

      vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);

      printOrSavePDF("<html><body>Report</body></html>");

      expect(typeof mockWindow.onload).toBe("function");
      mockWindow.onload!();
      expect(mockPrint).toHaveBeenCalledTimes(1);
    });

    it("returns safely when window.open returns null (popup blocked)", () => {
      vi.spyOn(window, "open").mockReturnValue(null);
      expect(() => printOrSavePDF("<html></html>")).not.toThrow();
    });
  });

  describe("downloadFile", () => {
    it("creates an object URL, clicks an anchor element, and revokes the URL", () => {
      const mockCreateObjectURL = vi.fn().mockReturnValue("blob:http://localhost/test-uuid");
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      const mockClick = vi.fn();
      const appendSpy = vi.spyOn(document.body, "appendChild");
      const removeSpy = vi.spyOn(document.body, "removeChild");
      // Capture the real factory before spying, so the mock doesn't recurse into itself.
      const realCreateElement = document.createElement.bind(document);
      const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        if (tag === "a") {
          // Must be a real Node: jsdom's appendChild rejects plain objects.
          const anchor = realCreateElement("a");
          anchor.click = mockClick;
          return anchor;
        }
        return realCreateElement(tag);
      });

      downloadFile("test csv content", "audit-report.csv", "text/csv");

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/test-uuid");

      createElementSpy.mockRestore();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  it("returns early when window is undefined", () => {
    const originalWindow = globalThis.window;
    try {
      // @ts-expect-error test undefined window
      delete globalThis.window;
      expect(() => printOrSavePDF("<html></html>")).not.toThrow();
      expect(() => downloadFile("content", "name.csv", "text/csv")).not.toThrow();
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
