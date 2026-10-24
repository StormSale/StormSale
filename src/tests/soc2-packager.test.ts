/**
 * SOC 2 Type II Automated Evidence Packager Test Suite
 * Validates deterministic hashing, manifest generation, Ed25519 signing,
 * tamper detection, ZIP packaging, and role-based authorization.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import JSZip from "jszip";
import {
  sha256Hex,
  computeRootDigest,
  generateHashesManifest,
  normalizePath,
  isIgnoredPath,
} from "../lib/auditor/hasher";
import {
  compileControlManifest,
  collectContractControlState,
  collectCiAuditLogs,
  collectTestRunResults,
} from "../lib/auditor/evidenceCollector";
import {
  signRootDigest,
  verifyAuditorSignature,
  resolveAuditorKeypair,
  AuditorSigningError,
} from "../lib/auditor/signer";
import { generateSoc2EvidencePack } from "../lib/auditor/packager";
import {
  verifyEvidenceFiles,
  verifyEvidenceZip,
  setAuthorizedAuditorKeys,
} from "../lib/auditor/verifier";
import {
  isAuthorizedForSoc2Export,
  exportSoc2EvidencePackAction,
  AuditorAuthorizationError,
  recordExportAuditEvent,
  getExportAuditHistory,
} from "../lib/auditor/exportService";

describe("SOC 2 Evidence Packager - Hashing Determinism", () => {
  it("normalizes paths across Windows and POSIX conventions", () => {
    expect(normalizePath("src\\lib\\auditor\\types.ts")).toBe("src/lib/auditor/types.ts");
    expect(normalizePath("./src/lib/auditor/hasher.ts")).toBe("src/lib/auditor/hasher.ts");
  });

  it("identifies and filters ignored file patterns", () => {
    expect(isIgnoredPath("node_modules/jszip/index.js")).toBe(true);
    expect(isIgnoredPath(".git/HEAD")).toBe(true);
    expect(isIgnoredPath("dist/assets/index.js")).toBe(true);
    expect(isIgnoredPath(".husky/pre-commit")).toBe(true);
    expect(isIgnoredPath("src/lib/auditor/hasher.ts")).toBe(false);
  });

  it("produces deterministic SHA-256 hashes for identical content", async () => {
    const content = JSON.stringify({ audit: "test", timestamp: 123456789 });
    const hash1 = await sha256Hex(content);
    const hash2 = await sha256Hex(content);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("computes identical root digests regardless of file insertion order", async () => {
    const fileSet1 = {
      "contracts/escrow.json": "content-a",
      "ci/audit.json": "content-b",
      "tests/results.json": "content-c",
    };

    const fileSet2 = {
      "tests/results.json": "content-c",
      "contracts/escrow.json": "content-a",
      "ci/audit.json": "content-b",
    };

    const manifest1 = await generateHashesManifest(fileSet1);
    const manifest2 = await generateHashesManifest(fileSet2);

    expect(manifest1.rootDigest).toBe(manifest2.rootDigest);
    expect(manifest1.totalFiles).toBe(3);

    const directRoot = await computeRootDigest(manifest1.files);
    expect(directRoot).toBe(manifest1.rootDigest);
  });
});

describe("SOC 2 Evidence Packager - Evidence & Control Manifest", () => {
  it("compiles controls covering Confidentiality, Processing Integrity, and Availability", () => {
    const controls = compileControlManifest();
    expect(controls.length).toBeGreaterThanOrEqual(8);

    const categories = new Set(controls.map((c) => c.category));
    expect(categories.has("Confidentiality")).toBe(true);
    expect(categories.has("Processing Integrity")).toBe(true);
    expect(categories.has("Availability")).toBe(true);

    // Verify key control IDs
    const controlIds = controls.map((c) => c.controlId);
    expect(controlIds).toContain("CC6.1"); // RBAC
    expect(controlIds).toContain("CC6.2"); // Client-Side Encryption
    expect(controlIds).toContain("PI1.1"); // Deterministic Commission
    expect(controlIds).toContain("A1.1"); // Infrastructure Uptime
  });

  it("collects live contract state with security parameters", () => {
    const state = collectContractControlState();
    expect(state.network).toBeDefined();
    expect(state.controls.confidentiality.clientSideEncryptionStandard).toContain("AES-256");
    expect(state.controls.processingIntegrity.escrowBudgetLockedOnChain).toBe(true);
    expect(state.controls.availability.uptimeTargetPercentage).toBeGreaterThanOrEqual(99.9);
  });

  it("collects CI quality gate audits and test run results", () => {
    const ciLogs = collectCiAuditLogs();
    expect(ciLogs.length).toBeGreaterThanOrEqual(3);

    // When real results are missing, status indicates Review Needed without fake pass claims
    const emptyRuns = collectTestRunResults("{}");
    expect(emptyRuns.totalTests).toBe(0);
    expect(emptyRuns.allPassed).toBe(false);

    // When real Vitest JSON execution results are supplied
    const sampleResults = JSON.stringify({
      numTotalTests: 89,
      numPassedTests: 89,
      numFailedTests: 0,
      numTotalTestSuites: 9,
      testResults: [
        { name: "src/tests/soc2-packager.test.ts", assertionResults: [{ status: "passed" }] },
      ],
    });
    const parsedRuns = collectTestRunResults(sampleResults);
    expect(parsedRuns.totalTests).toBe(89);
    expect(parsedRuns.allPassed).toBe(true);
  });
});

describe("SOC 2 Evidence Packager - Cryptographic Signing & Validation", () => {
  let testKeypair: Keypair;
  let testSecret: string;

  beforeEach(() => {
    testKeypair = Keypair.random();
    testSecret = testKeypair.secret();
  });

  it("resolves auditor keypair from secret seed", () => {
    const resolved = resolveAuditorKeypair(testSecret);
    expect(resolved.publicKey()).toBe(testKeypair.publicKey());
  });

  it("throws AuditorSigningError when auditor key is missing or invalid", () => {
    expect(() => resolveAuditorKeypair("")).toThrow(AuditorSigningError);
    expect(() => resolveAuditorKeypair("invalid-key-data")).toThrow(AuditorSigningError);
  });

  it("signs root digest and verifies signature successfully", async () => {
    const rootDigest = await sha256Hex("test-manifest-root-digest");
    const signature = signRootDigest(rootDigest, testSecret, "Test Compliance Board");

    expect(signature.algorithm).toBe("Ed25519");
    expect(signature.keyId).toBe(testKeypair.publicKey());
    expect(signature.publicKeyPem).toContain("BEGIN PUBLIC KEY");

    const isValid = verifyAuditorSignature(rootDigest, signature.signatureHex, signature.keyId);
    expect(isValid).toBe(true);
  });

  it("rejects signatures when payload is tampered", async () => {
    const rootDigest = await sha256Hex("original-root-digest");
    const tamperedDigest = await sha256Hex("tampered-root-digest");

    const signature = signRootDigest(rootDigest, testSecret);
    const isValid = verifyAuditorSignature(tamperedDigest, signature.signatureHex, signature.keyId);

    expect(isValid).toBe(false);
  });
});

describe("SOC 2 Evidence Packager - Packaging & Tamper Detection", () => {
  let testKeypair: Keypair;
  let testSecret: string;

  beforeEach(() => {
    testKeypair = Keypair.random();
    testSecret = testKeypair.secret();
    setAuthorizedAuditorKeys([testKeypair.publicKey()]);
  });

  it("fails verification when no authorized auditor keys are configured and unpinned keys are not allowed", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    // Temporarily clear authorized keys
    setAuthorizedAuditorKeys([]);

    const verification = await verifyEvidenceZip(pack.zipBuffer);
    expect(verification.valid).toBe(false);
    expect(verification.signatureValid).toBe(false);
    expect(
      verification.errors.some((e) => e.includes("No authorized auditor keys configured")),
    ).toBe(true);

    // If explicitly allowing unpinned keys, signature verification passes
    const allowedVerification = await verifyEvidenceZip(pack.zipBuffer, {
      allowUnpinnedKeys: true,
    });
    expect(allowedVerification.valid).toBe(true);
    expect(allowedVerification.signatureValid).toBe(true);

    // Restore authorized key for subsequent tests
    setAuthorizedAuditorKeys([testKeypair.publicKey()]);
  });

  it("generates a complete, structured ZIP evidence pack", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    expect(pack.filename).toMatch(/^soc2-evidence-pack-.*\.zip$/);
    expect(pack.totalFiles).toBeGreaterThanOrEqual(10);
    expect(pack.zipBuffer.length).toBeGreaterThan(0);
    expect(pack.signature.algorithm).toBe("Ed25519");

    // Inspect ZIP structure
    const jszip = new JSZip();
    const zip = await jszip.loadAsync(pack.zipBuffer);

    const fileNames: string[] = [];
    zip.forEach((relPath) => fileNames.push(relPath));

    expect(fileNames.some((f) => f.endsWith("manifest.json"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("hashes.json"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("signature.json"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("public-key.pem"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("README.txt"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("contracts/contract-state.json"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("ci/ci-audit-summary.json"))).toBe(true);
    expect(fileNames.some((f) => f.endsWith("tests/test-results.json"))).toBe(true);
  });

  it("successfully validates an untampered evidence ZIP archive", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    const verification = await verifyEvidenceZip(pack.zipBuffer);

    expect(verification.valid).toBe(true);
    expect(verification.signatureValid).toBe(true);
    expect(verification.manifestHashValid).toBe(true);
    expect(verification.tamperedFiles).toHaveLength(0);
    expect(verification.errors).toHaveLength(0);
    expect(verification.verifiedFilesCount).toBeGreaterThanOrEqual(7);
  });

  it("verifies in-memory files map directly with verifyEvidenceFiles", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    const jszip = new JSZip();
    const zip = await jszip.loadAsync(pack.zipBuffer);
    const filesMap: Record<string, Uint8Array> = {};

    for (const [relPath, entry] of Object.entries(zip.files)) {
      if (!entry.dir) {
        filesMap[relPath] = await entry.async("uint8array");
      }
    }

    const verification = await verifyEvidenceFiles(filesMap);
    expect(verification.valid).toBe(true);
    expect(verification.signatureValid).toBe(true);
  });

  it("detects file tampering when an evidence file content is modified", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    // Unpack ZIP, alter a file, repack
    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(pack.zipBuffer);

    const targetFileKey = Object.keys(loadedZip.files).find((k) =>
      k.endsWith("contracts/contract-state.json"),
    );
    expect(targetFileKey).toBeDefined();

    // Tamper with contract state
    loadedZip.file(targetFileKey!, JSON.stringify({ tampered: true, evilData: 999 }));

    const tamperedBuffer = await loadedZip.generateAsync({ type: "uint8array" });
    const verification = await verifyEvidenceZip(tamperedBuffer);

    expect(verification.valid).toBe(false);
    expect(verification.tamperedFiles.some((f) => f.includes("contract-state.json"))).toBe(true);
    expect(verification.errors.length).toBeGreaterThan(0);
  });

  it("detects signature tampering when signature.json is altered", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(pack.zipBuffer);

    const sigKey = Object.keys(loadedZip.files).find((k) => k.endsWith("signature.json"));
    const rawSig = await loadedZip.file(sigKey!)?.async("string");
    const sigObj = JSON.parse(rawSig!);

    // Flip bits in signature
    sigObj.signatureHex = "00".repeat(64);
    loadedZip.file(sigKey!, JSON.stringify(sigObj, null, 2));

    const tamperedBuffer = await loadedZip.generateAsync({ type: "uint8array" });
    const verification = await verifyEvidenceZip(tamperedBuffer);

    expect(verification.valid).toBe(false);
    expect(verification.signatureValid).toBe(false);
  });

  it("rejects an evidence pack re-signed by an unauthorized attacker key (key pinning)", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(pack.zipBuffer);

    // Tamper with contract state
    const targetFileKey = Object.keys(loadedZip.files).find((k) =>
      k.endsWith("contracts/contract-state.json"),
    );
    loadedZip.file(targetFileKey!, JSON.stringify({ tampered: true, evilData: 999 }));

    // Recompute hashes
    const updatedFiles: Record<string, Uint8Array> = {};
    for (const [relPath, entry] of Object.entries(loadedZip.files)) {
      if (!entry.dir && !relPath.endsWith("hashes.json") && !relPath.endsWith("signature.json")) {
        updatedFiles[relPath] = await entry.async("uint8array");
      }
    }
    const newHashes = await generateHashesManifest(updatedFiles);

    // Attacker signs with their own key
    const attackerKeypair = Keypair.random();
    const attackerSig = signRootDigest(newHashes.rootDigest, attackerKeypair.secret());

    const hashKey = Object.keys(loadedZip.files).find((k) => k.endsWith("hashes.json"))!;
    const sigKey = Object.keys(loadedZip.files).find((k) => k.endsWith("signature.json"))!;
    const pemKey = Object.keys(loadedZip.files).find((k) => k.endsWith("public-key.pem"))!;

    loadedZip.file(hashKey, JSON.stringify(newHashes, null, 2));
    loadedZip.file(sigKey, JSON.stringify(attackerSig, null, 2));
    loadedZip.file(pemKey, attackerSig.publicKeyPem);

    const tamperedBuffer = await loadedZip.generateAsync({ type: "uint8array" });

    // Validate with legitimate key pinned
    const verification = await verifyEvidenceZip(tamperedBuffer, {
      authorizedKeys: [testKeypair.publicKey()],
    });

    expect(verification.valid).toBe(false);
    expect(verification.signatureValid).toBe(false);
    expect(
      verification.errors.some((e) => e.includes("not in the authorized auditor key allowlist")),
    ).toBe(true);
  });

  it("rejects archive entries not listed in hashes.json", async () => {
    const pack = await generateSoc2EvidencePack({
      auditorPrivateKey: testSecret,
    });

    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(pack.zipBuffer);

    // Inject extra unauthorized payload
    loadedZip.file("unauthorized-file.txt", "untracked payload");

    const tamperedBuffer = await loadedZip.generateAsync({ type: "uint8array" });
    const verification = await verifyEvidenceZip(tamperedBuffer);

    expect(verification.valid).toBe(false);
    expect(verification.tamperedFiles.some((f) => f.includes("unauthorized-file.txt"))).toBe(true);
    expect(verification.errors.some((e) => e.includes("not listed in hashes.json"))).toBe(true);
  });
});

describe("SOC 2 Evidence Packager - RBAC Authorization & Audit Logging", () => {
  it("enforces role-based authorization for evidence pack export", async () => {
    const testSecret = Keypair.random().secret();

    // 1. Unauthenticated user
    expect(
      isAuthorizedForSoc2Export({
        userAddress: null,
        userRole: null,
      }),
    ).toBe(false);

    // 2. Non-auditor role (e.g. Affiliate)
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "AFFILIATE",
      }),
    ).toBe(false);

    // 3. Advertiser role
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "ADVERTISER",
      }),
    ).toBe(false);

    // 4. Auditor role (Authorized)
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "AUDITOR",
      }),
    ).toBe(true);

    // 5. Admin role (Authorized)
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "ADMIN",
      }),
    ).toBe(true);

    // 6. Explicit trusted on-chain grant with valid grant proof
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "NONE",
        isAuditorGranted: true,
        auditorGrantProof: "proof-verified-onchain-grant-0x12345678",
      }),
    ).toBe(true);

    // 6b. Reject unverified client-asserted grant (without valid proof)
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "NONE",
        isAuditorGranted: true,
      }),
    ).toBe(false);

    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "NONE",
        isAuditorGranted: true,
        auditorGrantProof: "fake-proof",
      }),
    ).toBe(false);

    // 7. Revoked on-chain grant (denied even if role string says AUDITOR)
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "AUDITOR",
        isAuditorGranted: false,
      }),
    ).toBe(false);

    // 8. Verified server session token
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "NONE",
        sessionToken: "verified-session-jwt.header.payload.signature",
      }),
    ).toBe(true);

    // 8b. Reject forged or invalid session tokens
    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "NONE",
        sessionToken: "forged-session-token",
      }),
    ).toBe(false);

    expect(
      isAuthorizedForSoc2Export({
        userAddress: "GB1234567890",
        userRole: "NONE",
        sessionToken: "invalid-token",
      }),
    ).toBe(false);

    // Calling exportSoc2EvidencePackAction with unauthorized context throws AuditorAuthorizationError
    await expect(
      exportSoc2EvidencePackAction(
        { userAddress: "GB123", userRole: "AFFILIATE" },
        { auditorPrivateKey: testSecret },
      ),
    ).rejects.toThrow(AuditorAuthorizationError);
  });

  it("records and retrieves export events in audit history", () => {
    const event = {
      id: "soc2-test-id",
      timestamp: new Date().toISOString(),
      exporterAddress: "GAUDITOR123456789",
      role: "AUDITOR",
      filename: "soc2-evidence-pack-test.zip",
      rootDigest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      totalFiles: 12,
      status: "Exported" as const,
    };

    recordExportAuditEvent(event);
    const history = getExportAuditHistory();

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].id).toBe("soc2-test-id");
    expect(history[0].exporterAddress).toBe("GAUDITOR123456789");
  });

  it("executes standalone verify-evidence-pack.mjs CLI script and confirms exit code 0", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const { execSync } = await import("child_process");

    const testSecret = Keypair.random().secret();
    const pack = await generateSoc2EvidencePack({ auditorPrivateKey: testSecret });

    const tempZipPath = path.join(process.cwd(), "temp-ci-test-pack.zip");
    fs.writeFileSync(tempZipPath, pack.zipBuffer);

    try {
      const output = execSync(
        `node scripts/verify-evidence-pack.mjs "${tempZipPath}" "${pack.signature.keyId}"`,
        {
          encoding: "utf8",
        },
      );
      expect(output).toContain("VERIFICATION SUCCESSFUL");
      expect(output).toContain("Auditor Ed25519 digital signature is VALID");

      // Confirm rejection when unexpected key is supplied
      expect(() => {
        execSync(
          `node scripts/verify-evidence-pack.mjs "${tempZipPath}" "GDW4F2QWM3H5T4CDWAFANWAZL24XJDG3HYS22A27RATNQ6MQNE7CE5VW"`,
          {
            stdio: "pipe",
          },
        );
      }).toThrow();
    } finally {
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
    }
  }, 30000);
});
