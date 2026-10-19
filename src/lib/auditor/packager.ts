/**
 * Automated SOC 2 Type II Evidence Packager
 * Compiles contract state, CI logs, and test runs, calculates deterministic SHA-256 hashes,
 * signs with authorized auditor key, and bundles into a structured ZIP archive.
 */

import JSZip from "jszip";
import { generateHashesManifest } from "./hasher";
import {
  collectContractControlState,
  collectCiAuditLogs,
  collectTestRunResults,
  buildBundleManifest,
} from "./evidenceCollector";
import { createEvidenceReceipt, createBundleReceipt } from "./receipts";
import { signRootDigest, resolveAuditorKeypair, formatEd25519PublicKeyPem } from "./signer";
import type {
  EvidencePackGenerationOptions,
  EvidenceReceipt,
  CodebaseHashesManifest,
  AuditorSignatureRecord,
  Soc2BundleManifest,
} from "./types";

export interface EvidencePackBundleResult {
  zipBlob: Blob;
  zipBuffer: Uint8Array;
  filename: string;
  folderName: string;
  manifest: Soc2BundleManifest;
  hashesManifest: CodebaseHashesManifest;
  signature: AuditorSignatureRecord;
  rootDigest: string;
  totalFiles: number;
}

/**
 * Builds the verification instructions text file included in every pack.
 */
function buildReadmeText(keyId: string, timestamp: string): string {
  return `================================================================================
STORMSALE PROTOCOL - SOC 2 TYPE II AUDIT EVIDENCE PACK
================================================================================
Generated At:      ${timestamp}
Auditor Key ID:    ${keyId}
Algorithm:         Ed25519 with SHA-256 Digest
Trust Criteria:    Confidentiality, Processing Integrity, Availability
Standards:         AICPA TSC 2017 / NIST SP 800-53 / ISO/IEC 27001
================================================================================

PACKAGE CONTENTS:
  manifest.json               Control-to-evidence matrix mapping SOC 2 controls
  hashes.json                 Deterministic SHA-256 digests for all files & root digest
  signature.json              Cryptographic digital signature from authorized auditor
  public-key.pem              Auditor Ed25519 public key in standard SPKI PEM format
  receipts/                   Individual cryptographic verification receipts
    bundle-receipt.json       Root aggregated bundle receipt
    receipts-manifest.json    Index of all evidence file receipts
  contracts/                  Smart contract state snapshots and control specifications
    contract-state.json       Live Soroban contract state, network parameters, addresses
    deployment-manifest.json  Deployed contract addresses and network configuration
    escrow-controls.json      On-chain commission escrow locking and budget rules
  ci/                         Continuous integration security definitions and logs
    ci-audit-summary.json     Automated quality gate verification summary
    workflow-definitions.json CI/CD pipeline security controls and branch guards
  tests/                      Automated test execution results and audit trails
    test-results.json         Complete Vitest execution records
    test-summary.json         High-level test pass/fail metrics and suite breakdown

HOW TO VERIFY THIS EVIDENCE PACK:
--------------------------------------------------------------------------------
Method 1: Automated In-Browser Verification
  1. Navigate to the StormSale Auditor Enterprise Portal -> Compliance Report.
  2. Click "Verify Evidence Pack" and upload this ZIP file.
  3. The portal will verify the Ed25519 signature and re-compute all SHA-256 hashes.

Method 2: Standalone Node.js CLI Script
  Run the bundled verification tool with the expected auditor public key:
    node scripts/verify-evidence-pack.mjs path/to/this-bundle.zip <expected-auditor-public-key>

Method 3: Manual Cryptographic Verification (OpenSSL & sha256sum)
  1. Verify file integrity against hashes.json:
     sha256sum -c <(jq -r '.files | to_entries[] | "\\(.value)  \\(.key)"' hashes.json)
  2. Verify the Ed25519 digital signature:
     The rootDigest in hashes.json is signed by the auditor key in public-key.pem.
     openssl pkeyutl -verify -pubin -inkey public-key.pem \\
       -sigfile <(xxd -r -p <(jq -r .signatureHex signature.json)) \\
       -in <(jq -j .signedRootDigest signature.json)

For inquiries contact: compliance@stormsale.io
================================================================================
`;
}

/**
 * Compiles and generates a complete, signed SOC 2 Type II Evidence Pack ZIP archive.
 */
export async function generateSoc2EvidencePack(
  options: EvidencePackGenerationOptions = {},
): Promise<EvidencePackBundleResult> {
  const timestamp = new Date().toISOString();
  const dateFormatted = timestamp.replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const folderName = `soc2-evidence-pack-${dateFormatted}`;
  const filename = `${folderName}.zip`;

  // Pre-validate auditor key
  const keypair = resolveAuditorKeypair(options.auditorPrivateKey);
  const keyId = keypair.publicKey();
  const publicKeyPem = formatEd25519PublicKeyPem(keypair.rawPublicKey());

  // 1. Collect evidence artifacts
  options.onProgress?.("Snapshotting Soroban smart contract state & security controls...");
  const contractState = collectContractControlState();

  options.onProgress?.("Aggregating CI test runs and quality gate logs...");
  const ciAuditLogs = collectCiAuditLogs();
  const testResults = collectTestRunResults(options.testResultsJson);

  const escrowControls = {
    escrowModel: "Soroban Persistent Storage Multi-Party Escrow",
    commissionRules: {
      basisPointsFactor: 10000,
      clearingPeriodSecsMin: 60,
      clearingPeriodSecsMax: 2592000, // 30 days
      reentrancyGuards: "Native Soroban call-stack isolation",
    },
    solvencyVerification: {
      budgetLockedPreExecution: true,
      sacAllowanceRequired: true,
      disbursementAuthorization: "Cryptographic signature from affiliate or automated timer",
    },
  };

  const testSummary = {
    framework: testResults.testFramework,
    totalTests: testResults.totalTests,
    passedTests: testResults.passedTests,
    failedTests: testResults.failedTests,
    testSuitesCount: testResults.testSuitesCount,
    allPassed: testResults.allPassed,
    executionTimestamp: testResults.executionTimestamp,
  };

  const workflowDefinitions = {
    workflows: ciAuditLogs.map((log) => ({
      name: log.workflowName,
      triggers: log.triggerEvent,
      steps: log.stepsAudited,
      securityPolicies: log.securityChecksEnforced,
      status: log.status,
    })),
  };

  // 2. Prepare in-memory file representations for hashing
  const internalFiles: Record<string, string> = {
    "contracts/contract-state.json": JSON.stringify(contractState, null, 2),
    "contracts/escrow-controls.json": JSON.stringify(escrowControls, null, 2),
    "contracts/deployment-manifest.json": JSON.stringify(
      {
        deployedContracts: contractState.deployedContractAddresses,
        network: contractState.network,
        rpcUrl: contractState.rpcUrl,
        snapshotTimestamp: timestamp,
      },
      null,
      2,
    ),
    "ci/ci-audit-summary.json": JSON.stringify(ciAuditLogs, null, 2),
    "ci/workflow-definitions.json": JSON.stringify(workflowDefinitions, null, 2),
    "tests/test-results.json": JSON.stringify(testResults, null, 2),
    "tests/test-summary.json": JSON.stringify(testSummary, null, 2),
  };

  // 3. Generate individual verification receipts for evidence files
  const receipts: EvidenceReceipt[] = [];
  receipts.push(
    await createEvidenceReceipt(
      "contracts/contract-state.json",
      internalFiles["contracts/contract-state.json"],
      "Confidentiality",
      timestamp,
    ),
  );
  receipts.push(
    await createEvidenceReceipt(
      "contracts/deployment-manifest.json",
      internalFiles["contracts/deployment-manifest.json"],
      "Confidentiality",
      timestamp,
    ),
  );
  receipts.push(
    await createEvidenceReceipt(
      "contracts/escrow-controls.json",
      internalFiles["contracts/escrow-controls.json"],
      "Processing Integrity",
      timestamp,
    ),
  );
  receipts.push(
    await createEvidenceReceipt(
      "ci/ci-audit-summary.json",
      internalFiles["ci/ci-audit-summary.json"],
      "Availability",
      timestamp,
    ),
  );
  receipts.push(
    await createEvidenceReceipt(
      "ci/workflow-definitions.json",
      internalFiles["ci/workflow-definitions.json"],
      "Availability",
      timestamp,
    ),
  );
  receipts.push(
    await createEvidenceReceipt(
      "tests/test-results.json",
      internalFiles["tests/test-results.json"],
      "Processing Integrity",
      timestamp,
    ),
  );
  receipts.push(
    await createEvidenceReceipt(
      "tests/test-summary.json",
      internalFiles["tests/test-summary.json"],
      "Processing Integrity",
      timestamp,
    ),
  );

  // Write receipts to file records
  internalFiles["receipts/receipts-manifest.json"] = JSON.stringify(receipts, null, 2);

  // Construct root-independent artifacts and include them in the hashed set
  const bundleReceipt = createBundleReceipt({
    fileReceipts: receipts,
    signerKeyId: keyId,
    timestamp,
  });
  internalFiles["receipts/bundle-receipt.json"] = JSON.stringify(bundleReceipt, null, 2);

  const readme = buildReadmeText(keyId, timestamp);
  internalFiles["README.txt"] = readme;

  internalFiles["public-key.pem"] = publicKeyPem;

  const manifest = buildBundleManifest({
    testAudit: testResults,
  });
  internalFiles["manifest.json"] = JSON.stringify(manifest, null, 2);

  // 4. Compute deterministic Codebase & Evidence Hashes Manifest
  options.onProgress?.("Calculating deterministic SHA-256 codebase hashes and Merkle root...");
  const hashesManifest = await generateHashesManifest(internalFiles, {
    timestamp,
    version: "1.0.0",
    commitSha: manifest.commitSha,
    includeFullSourceTree: options.includeFullSourceTree,
  });

  // 5. Sign the root digest with the platform auditor Ed25519 key
  options.onProgress?.("Signing package root digest with platform auditor Ed25519 key...");
  const signature = signRootDigest(
    hashesManifest.rootDigest,
    options.auditorPrivateKey,
    options.auditorOrganization,
  );

  // 6. Create distinct signed manifest containing root digest and signature metadata
  const signedManifest: Soc2BundleManifest = {
    ...manifest,
    rootDigest: hashesManifest.rootDigest,
    signatureInfo: {
      algorithm: signature.algorithm,
      keyId: signature.keyId,
      signatureHex: signature.signatureHex,
    },
  };

  // Add metadata verification files
  internalFiles["hashes.json"] = JSON.stringify(hashesManifest, null, 2);
  internalFiles["signature.json"] = JSON.stringify(signature, null, 2);

  // 7. Assemble ZIP archive with folder structure
  options.onProgress?.("Packaging verification receipts and compiling ZIP archive...");
  const zip = new JSZip();
  const rootFolder = zip.folder(folderName) || zip;

  for (const relativePath of Object.keys(internalFiles)) {
    rootFolder.file(relativePath, internalFiles[relativePath]);
  }

  // Generate binary output
  const zipBuffer = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipBlob = new Blob([zipBuffer.buffer as ArrayBuffer], { type: "application/zip" });

  return {
    zipBlob,
    zipBuffer,
    filename,
    folderName,
    manifest: signedManifest,
    hashesManifest,
    signature,
    rootDigest: hashesManifest.rootDigest,
    totalFiles: Object.keys(internalFiles).length,
  };
}
