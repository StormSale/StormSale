/*
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
  securityChecksEnforced: string;
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

// --------------------------------------------------------------------------
// Secure External Auditor Sharing
// --------------------------------------------------------------------------

/**
 * PGP-style encryption algorithms supported for external auditor sharing.
 * The encryption is performed client-side using the auditor's public key;
 * the private key never leaves the auditor's possession.
 */
export type AuditorEncryptionAlgorithm = "AES-256-GCM" | "ChaCha20-Poly1305";

/**
 * Key encapsulation method used to wrap the symmetric content key.
 * "X25519" is the PGP-style curve25519 ECDH + HKDF + AES-KeyWrap construction.
 */
export type KeyEncapsulationMethod = "X25519" | "RSA-OAEP-SHA-256";
export type AuditorKeyEncapsulationMethod = KeyEncapsulationMethod;

export interface AuditorPublicKey {
  keyId: string;
  organization: string;
  algorithm: "Ed25519" | "X-25519" | "RSA-2048";
  publicKeyPem: string;
  fingerprint: string; // SHA-256 of the canonical public key bytes
  expiresAt?: string;
}

export interface EncryptedSharingPayload {
  /** Version of the encrypted payload envelope format. */
  envelopeVersion: "1.0.0";
  /** Unique sharing link IDentifier (also the capability token seed). */
  sharingId: string;
  /** Auditor public key identifier used to encrypt the content key. */
  recipientKeyId: string;
  /** Algorithm used for symmetric content encryption. */
  contentAlgorithm: AuditorEncryptionAlgorithm;
  /** Key encapsulation method used to wrap the content key. */
  keyEncapsulationMethod: KeyEncapsulationMethod;
  /** Base64 encoded wrapped content key (ECDH/AES-KeyWrap output). */
  wrappedContentKeyBase64: string;
  /** Base64 encoded initialization vector / nonce. */
  ivBase64: string;
  /** Base64 encoded ciphertext of the bundle archive. */
  ciphertextBase64: string;
  /** Base64 encoded authentication tag (AES-GCM). */
  authTagBase64?: string;
  /** SHA-256 of the plaintext bundle for integrity verification after decryption. */
  plaintextSha256: string;
  /** Size of the plaintext bundle in bytes. */
  plaintextSizeBytes: number;
  /** ISO timestamp when the payload was created. */
  createdAt: string;
  /** ISO timestamp at which the sharing link expires. */
  expiresAt: string;
  /** ISO timestamp after which the payload is purged from storage. */
  purgeAt: string;
  /** Maximum number of downloads allowed (optional). */
  maxDownloads?: number;
  /** Number of downloads remaining. */
  remainingDownloads?: number;
  /** Auditor organization label for display. */
  auditorOrganization: string;
  /** Signature over the canonical envelope header by the sharing service. */
  signatureHex: string;
}

export interface SharingLinkPolicy {
  /** Absolute expiry timestamp (ISO 8601). */
  expiresAt: string;
  /** Maximum lifetime in seconds from creation. */
  maxLifetimeSeconds: number;
  /** Maximum number of downloads. */
  maxDownloads: number;
  /** Whether the link is single-use. */
  singleUse: boolean;
  /** Optional IP allowlist for download attempts. */
  allowedIps?: string[];
  /** Required auditor email address for access confirmation. */
  recipientEmail?: string;
}

export interface SharingLinkRecord {
  sharingId: string;
  packTitle: string;
  auditorOrganization: string;
  recipientKeyId: string;
  createdAt: string;
  expiresAt: string;
  purgeAt: string;
  maxDownloads: number;
  downloadsUsed: number;
  status: "active" | "expired" | "revoked" | "exhausted";
  lastAccessedAt?: string;
  lastAccessedIp?: string;
  shareUrl: string;
}

export interface SharingAccessEvent {
  sharingId: string;
  eventType: "created" | "downloaded" | "expired" | "revoked" | "denied";
  timestamp: string;
  ipV4?: string;
  userAgent?: string;
  reason?: string;
}

export interface ExternalSharingRequest {
  packTitle: string;
  auditorPublicKey: AuditorPublicKey;
  policy: SharingLinkPolicy;
  bundleArchiveBytes: Uint8Array;
  onProgress?: (step: string) => void;
}

export interface ExternalSharingResult {
  payload: EncryptedSharingPayload;
  record: SharingLinkRecord;
  shareUrl: string;
  expiresAt: string;
  purgeAt: string;
}

/**
 * Anomaly Detection - Suspicious Activity & Wash-Trading Detection
 * Supports the AuditorOverview "Red Flag" indicators and one-click anomaly reporting.
 */

export type AnomalySeverity = "critical" | "high" | "medium" | "low";

export type AnomalyType =
  | "wash_trading"
  | "rapid_claim"
  | "circular_transfer"
  | "self_trading"
  | "burst_activity"
  | "collusion_ring";

export type RedFlagStatus = "none" | "watch" | "flagged" | "confirmed";

export interface AnomalySignal {
  /** Stable identifier for this signal instance. */
  signalId: string;
  /** Category of anomaly detected. */
  type: AnomalyType;
  /** Severity level driving the Red Flag indicator color. */
  severity: AnomalySeverity;
  /** Current review status of the flag. */
  status: RedFlagStatus;
  /** Human-readable summary of the detected pattern. */
  description: string;
  /** Normalized confidence score in [0, 1]. */
  confidence: number;
  /** Accounts involved in the suspicious pattern. */
  involvedAccounts: string[];
  /** Transaction hashes that support the signal. */
  evidenceTxHashes: string[];
  /** ISO timestamp of when the signal was first detected. */
  detectedAt: string;
  /** Optional metric value that tripped the threshold (e.g. velocity in tx/min). */
  metricValue?: number;
  /** Optional threshold that was exceeded. */
  threshold?: number;
}

export interface AnomalyDetectionSummary {
  totalSignals: number;
  confirmed: number;
  flagged: number;
  watch: number;
  bySeverity: Record<AnomalySeverity, number>;
  byType: Record<AnomalyType, number>;
  lastScannedAt: string;
  overallRedFlagStatus: RedFlagStatus;
}

export interface AnomalyReportPayload {
  /** Signal being reported. */
  signalId: string;
  /** Severity at time of reporting. */
  severity: AnomalySeverity;
  /** Type of anomaly being reported. */
  type: AnomalyType;
  /** Optional free-form notes from the auditor. */
  notes?: string;
  /** Auditor identity submitting the report. */
  reportedBy: string;
  /** ISO timestamp of report submission. */
  reportedAt: string;
}

export interface AnomalyReportReceipt {
  reportId: string;
  signalId: string;
  status: "submitted" | "duplicate" | "failed";
  submittedAt: string;
  message: string;
}