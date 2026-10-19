#!/usr/bin/env node
/**
 * StormSale SOC 2 Type II Evidence Pack Independent Verifier CLI
 * Usage: node scripts/verify-evidence-pack.mjs <path-to-evidence-pack.zip>
 */

import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { Keypair } from "@stellar/stellar-sdk";
import crypto from "crypto";

const targetZipPath = process.argv[2];
const expectedKeyId = process.argv[3];

if (!targetZipPath || !expectedKeyId) {
  console.error(
    "Usage: node scripts/verify-evidence-pack.mjs <path-to-evidence-pack.zip> <expected-auditor-public-key>",
  );
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), targetZipPath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: File not found at ${resolvedPath}`);
  process.exit(1);
}

console.log("\n========================================================");
console.log("🛡️  STORMSALE SOC 2 TYPE II EVIDENCE PACK INDEPENDENT VERIFIER");
console.log("========================================================");
console.log(`Inspecting archive: ${path.basename(resolvedPath)}`);

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function computeRootDigest(fileHashes) {
  const sortedKeys = Object.keys(fileHashes).sort();
  const canonicalString = sortedKeys.map((p) => `${p}:${fileHashes[p]}`).join("\n");
  return sha256Hex(Buffer.from(canonicalString));
}

async function verify() {
  const zipBuffer = fs.readFileSync(resolvedPath);
  const jszip = new JSZip();
  const zip = await jszip.loadAsync(zipBuffer);

  const filesMap = {};
  const entries = [];
  zip.forEach((relPath, entry) => {
    if (!entry.dir) {
      entries.push({ relPath, entry });
    }
  });

  for (const { relPath, entry } of entries) {
    const data = await entry.async("nodebuffer");
    filesMap[normalizePath(relPath)] = data;
  }

  // 1. Locate signature.json & hashes.json with proper path boundary check
  const sigKey = Object.keys(filesMap).find((k) => {
    const p = normalizePath(k);
    return p === "signature.json" || p.endsWith("/signature.json");
  });
  const hashKey = Object.keys(filesMap).find((k) => {
    const p = normalizePath(k);
    return p === "hashes.json" || p.endsWith("/hashes.json");
  });

  if (!sigKey || !hashKey) {
    console.error("❌ Verification failed: Archive is missing signature.json or hashes.json.");
    process.exit(1);
  }

  const sigRecord = JSON.parse(filesMap[sigKey].toString("utf8"));
  const hashesManifest = JSON.parse(filesMap[hashKey].toString("utf8"));

  console.log(`\n• Auditor Key ID:         ${sigRecord.keyId}`);
  console.log(`• Expected Key ID:        ${expectedKeyId}`);
  console.log(`• Signature Algorithm:    ${sigRecord.algorithm}`);
  console.log(`• Auditor Organization:   ${sigRecord.auditorOrganization}`);
  console.log(`• Package Root Digest:    ${sigRecord.signedRootDigest}`);
  console.log(`• Generation Timestamp:   ${sigRecord.timestamp}`);

  // Validate Key Pinning
  if (sigRecord.keyId !== expectedKeyId) {
    console.error(
      `\n[FAIL] ❌ Key pinning failed! Auditor Key ID ${sigRecord.keyId} does not match expected authorized key ${expectedKeyId}.`,
    );
    process.exit(1);
  }

  // 2. Verify Cryptographic Signature
  let sigValid = false;
  try {
    const keypair = Keypair.fromPublicKey(sigRecord.keyId);
    const dataToVerify = Buffer.from(sigRecord.signedRootDigest);
    const sigBuffer = Buffer.from(sigRecord.signatureHex, "hex");
    sigValid = keypair.verify(dataToVerify, sigBuffer);
  } catch (err) {
    console.error(`❌ Signature verification error: ${err.message}`);
  }

  if (sigValid) {
    console.log("\n[PASS] ✅ Auditor Ed25519 digital signature is VALID.");
  } else {
    console.error("\n[FAIL] ❌ Auditor Ed25519 digital signature is INVALID!");
  }

  // 3. Verify Root Digest from file hashes
  const recomputedRoot = computeRootDigest(hashesManifest.files);
  const rootDigestMatches =
    recomputedRoot === hashesManifest.rootDigest && recomputedRoot === sigRecord.signedRootDigest;

  if (rootDigestMatches) {
    console.log("[PASS] ✅ Manifest Root Digest matches signed digest.");
  } else {
    console.error(
      `[FAIL] ❌ Root digest mismatch! Recomputed: ${recomputedRoot}, Expected: ${hashesManifest.rootDigest}`,
    );
  }

  // 4. Verify all individual file SHA-256 hashes
  const prefix = sigKey.includes("/") ? sigKey.slice(0, sigKey.lastIndexOf("/") + 1) : "";
  let checkedCount = 0;
  let mismatchCount = 0;

  console.log("\nVerifying individual evidence file digests:");
  for (const [relPath, expectedHash] of Object.entries(hashesManifest.files)) {
    const fullKey = prefix + relPath;
    const fileBuf = filesMap[fullKey] || filesMap[relPath];

    if (!fileBuf) {
      console.error(`  ❌ Missing file in archive: ${relPath}`);
      mismatchCount++;
      continue;
    }

    const actualHash = sha256Hex(fileBuf);
    if (actualHash === expectedHash) {
      console.log(`  ✓ ${relPath} [${actualHash.slice(0, 12)}...]`);
      checkedCount++;
    } else {
      console.error(
        `  ❌ TAMPER DETECTED in ${relPath}! Expected ${expectedHash}, got ${actualHash}`,
      );
      mismatchCount++;
    }
  }

  // 5. Reject any archive entries not listed in hashes.json
  for (const rawKey of Object.keys(filesMap)) {
    const normalizedKey = normalizePath(rawKey);
    const relKey =
      prefix && normalizedKey.startsWith(prefix)
        ? normalizedKey.slice(prefix.length)
        : normalizedKey;
    if (relKey === "hashes.json" || relKey === "signature.json") continue;
    if (!hashesManifest.files[relKey]) {
      console.error(`  ❌ TAMPER DETECTED: Archive entry not listed in hashes.json: ${relKey}`);
      mismatchCount++;
    }
  }

  console.log("========================================================");
  if (sigValid && rootDigestMatches && mismatchCount === 0) {
    console.log(
      `🎉 VERIFICATION SUCCESSFUL: ${checkedCount} files validated. Integrity and authenticity confirmed.`,
    );
    console.log("========================================================\n");
    process.exit(0);
  } else {
    console.error(
      `🚨 VERIFICATION FAILED: ${mismatchCount} tampered/missing files, signature valid: ${sigValid}`,
    );
    console.log("========================================================\n");
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error("Fatal verification error:", err);
  process.exit(1);
});
