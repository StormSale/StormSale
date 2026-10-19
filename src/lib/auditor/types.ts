/**
 * SOC 2 Type II Evidence Packager Types and Schemas
 * Covers Trust Services Criteria: Confidentiality, Processing Integrity, and Availability
 */

export type Soc2Category = "Confidentiality" | "Processing Integrity" | "Availability";

export interface Soc2ControlMapping {
  controlId: string;
  name: string;
  category: Soc2Category;
  criteria: string;
  description: string;
  evidenceFiles: string[];
  status: "Compliant" | "Review Needed" | "Exempt";
  verificationProcedure: string;
  automatedTestReference?: string;
}

export interface ContractControlState {
  network: string;
  rpcUrl: string;
  contractId: string;
  nativeAsset: string;
  controls: {
    confidentiality: {
      clientSideEncryptionStandard: string;
      keyEncapsulationMethod: string;
      roleBasedAccessEnforced: boolean;
      authorizedAuditorRole: string;
    };
    processingIntegrity: {
      escrowBudgetLockedOnChain: boolean;
      deterministicCommissionAccrual: boolean;
      settlementFinalitySecs: number;
      tamperEvidentLedgerTx: boolean;
    };
    availability: {
      sorobanRpcRedundancy: boolean;
      contractTtlAutoBumpStrategy: string;
      uptimeTargetPercentage: number;
      ledgerReplicationMechanism: string;
    };
  };
  deployedContractAddresses: Record<string, string>;
  snapshotTimestamp: string;
}

export interface CiAuditLogItem {
  workflowName: string;
  triggerEvent: string;
  stepsAudited: string[];
  securityChecksEnforced: string[];
  status: "Passed" | "Active" | "Configured";
}

export interface TestExecutionAudit {
  testFramework: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  testSuitesCount: number;
  executionTimestamp: string;
  allPassed: boolean;
  suiteBreakdown: Array<{
    suiteName: string;
    passed: number;
    total: number;
    durationMs: number;
  }>;
}

export interface EvidenceReceipt {
  receiptId: string;
  targetPath: string;
  sha256: string;
  algorithm: "SHA-256";
  sizeBytes: number;
  category: Soc2Category | "Bundle Root";
  timestamp: string;
  generator: string;
}

export interface CodebaseHashesManifest {
  version: string;
  timestamp: string;
  commitSha: string;
  rootDigest: string;
  rootAlgorithm: "SHA-256";
  totalFiles: number;
  totalBytes: number;
  files: Record<string, string>; // path -> sha256
}

export interface AuditorSignatureRecord {
  algorithm: "Ed25519";
  keyId: string; // Public key identifier (Stellar G... address or Key ID)
  publicKeyPem: string;
  signedRootDigest: string;
  signatureHex: string;
  signatureBase64: string;
  timestamp: string;
  auditorOrganization: string;
}

export interface Soc2BundleManifest {
  manifestVersion: "1.0.0";
  packTitle: string;
  organization: string;
  generatedAt: string;
  environment: string;
  commitSha: string;
  controlsSummary: {
    totalControls: number;
    compliantControls: number;
    categories: Record<Soc2Category, number>;
  };
  controls: Soc2ControlMapping[];
  rootDigest?: string;
  signatureInfo?: {
    algorithm: string;
    keyId: string;
    signatureHex: string;
  };
}

export interface EvidencePackGenerationOptions {
  auditorPrivateKey?: string;
  auditorKeyId?: string;
  auditorOrganization?: string;
  customCiLogsDir?: string;
  includeFullSourceTree?: boolean;
  testResultsJson?: string;
  onProgress?: (step: string) => void;
}

export interface PackVerificationResult {
  valid: boolean;
  signatureValid: boolean;
  manifestHashValid: boolean;
  tamperedFiles: string[];
  verifiedFilesCount: number;
  errors: string[];
  auditorKeyId: string;
  generatedAt: string;
}
