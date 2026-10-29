/**
 * NIST SP 800-53 Automated Security Control Scorecard Types
 * Covers Access Control (AC), Audit and Accountability (AU),
 * and System and Communications Protection (SC) control families.
 */

export type NistControlFamily = "AC" | "AU" | "SC";

export type ComplianceStatus = "PASS" | "FAIL" | "REVIEW";

export interface EvidenceMetric {
  name: string;
  value: string | number;
  threshold?: string;
  status: "PASS" | "FAIL" | "WARN";
  description: string;
}

export interface VerifiableEvidenceLink {
  label: string;
  type: "contract" | "transaction" | "ledger" | "source";
  identifier: string;
  url: string;
  description: string;
}

export interface NistControl {
  id: string; // e.g. "AC-3", "AC-6", "AU-3", "AU-6", "AU-12", "SC-8", "SC-13", "SC-28"
  title: string;
  family: NistControlFamily;
  familyName: string;
  nistDescription: string;
  platformImplementation: string;
  status: ComplianceStatus;
  verificationMethod: string;
  lastEvaluated: string;
  metrics: EvidenceMetric[];
  evidenceLinks: VerifiableEvidenceLink[];
  notes?: string;
}

export interface NistScorecardSummary {
  totalControls: number;
  passedControls: number;
  failedControls: number;
  reviewControls: number;
  complianceScorePercent: number;
  lastEvaluatedAt: string;
  evaluationId: string;
  familyScores: Record<
    NistControlFamily,
    {
      familyName: string;
      total: number;
      passed: number;
      percent: number;
    }
  >;
  integrityHash: string;
}

export interface ComplianceAuditPack {
  formatVersion: string;
  framework: "NIST SP 800-53 Rev. 5";
  systemName: string;
  auditorAddress: string;
  network: string;
  generatedAt: string;
  summary: NistScorecardSummary;
  controls: NistControl[];
  contracts: {
    campaignEscrow: string;
    nativeXlmSac: string;
    networkPassphrase: string;
    explorerUrl: string;
  };
  complianceSeal: {
    sha256: string;
    algorithm: "SHA-256";
    verified: boolean;
  };
}
