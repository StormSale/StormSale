import { describe, it, expect } from "vitest";
import {
  buildSignedAuditReport,
  exportComplianceToCSV,
  generateBrandedPDFHtml,
  filterByDateRange,
  generateAuditDigest,
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
    expect(html).toContain("@page { size: A4 portrait;");
  });
});
