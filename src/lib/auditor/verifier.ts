/**
 * Cryptographic Verifier for SOC 2 Type II Evidence Packs
 * Validates digital signatures, recomputes SHA-256 digests, and detects tampering.
 */

import JSZip from "jszip";
import { sha256Hex, computeRootDigest, normalizePath } from "./hasher";
import { verifyAuditorSignature } from "./signer";
import type {
  PackVerificationResult,
  CodebaseHashesManifest,
  AuditorSignatureRecord,
} from "./types";

export interface VerificationOptions {
  authorizedKeys?: string[];
  allowUnpinnedKeys?: boolean;
}

let configuredAuthorizedKeys: string[] = [];

export function setAuthorizedAuditorKeys(keys: string[]): void {
  configuredAuthorizedKeys = [...keys];
}

export function getAuthorizedAuditorKeys(): string[] {
  if (configuredAuthorizedKeys.length > 0) {
    return [...configuredAuthorizedKeys];
  }
  const envKeys =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_AUTHORIZED_AUDITOR_KEYS
      ? (import.meta.env.VITE_AUTHORIZED_AUDITOR_KEYS as string)
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : [];
  return envKeys;
}

/**
 * Verifies an in-memory evidence pack file map (path -> content).
 */
export async function verifyEvidenceFiles(
  files: Record<string, string | Uint8Array>,
  options?: VerificationOptions,
): Promise<PackVerificationResult> {
  const errors: string[] = [];
  const tamperedFiles: string[] = [];
  let verifiedFilesCount = 0;

  // 1. Locate essential verification artifacts
  const signatureKey = Object.keys(files).find((k) => {
    const p = normalizePath(k);
    return p === "signature.json" || p.endsWith("/signature.json");
  });
  const hashesKey = Object.keys(files).find((k) => {
    const p = normalizePath(k);
    return p === "hashes.json" || p.endsWith("/hashes.json");
  });
  const manifestKey = Object.keys(files).find((k) => {
    const p = normalizePath(k);
    return p === "manifest.json" || p.endsWith("/manifest.json");
  });

  if (!signatureKey || !files[signatureKey]) {
    errors.push("Missing signature.json in evidence bundle.");
  }
  if (!hashesKey || !files[hashesKey]) {
    errors.push("Missing hashes.json in evidence bundle.");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      signatureValid: false,
      manifestHashValid: false,
      tamperedFiles,
      verifiedFilesCount: 0,
      errors,
      auditorKeyId: "UNKNOWN",
      generatedAt: new Date().toISOString(),
    };
  }

  // Parse signature & hashes
  let signatureRecord: AuditorSignatureRecord;
  let hashesManifest: CodebaseHashesManifest;

  try {
    const rawSig =
      typeof files[signatureKey!] === "string"
        ? (files[signatureKey!] as string)
        : new TextDecoder().decode(files[signatureKey!] as Uint8Array);
    signatureRecord = JSON.parse(rawSig);
  } catch (err: unknown) {
    errors.push(
      `Failed to parse signature.json: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      valid: false,
      signatureValid: false,
      manifestHashValid: false,
      tamperedFiles,
      verifiedFilesCount: 0,
      errors,
      auditorKeyId: "UNKNOWN",
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const rawHashes =
      typeof files[hashesKey!] === "string"
        ? (files[hashesKey!] as string)
        : new TextDecoder().decode(files[hashesKey!] as Uint8Array);
    hashesManifest = JSON.parse(rawHashes);
  } catch (err: unknown) {
    errors.push(`Failed to parse hashes.json: ${err instanceof Error ? err.message : String(err)}`);
    return {
      valid: false,
      signatureValid: false,
      manifestHashValid: false,
      tamperedFiles,
      verifiedFilesCount: 0,
      errors,
      auditorKeyId: signatureRecord.keyId,
      generatedAt: signatureRecord.timestamp,
    };
  }

  // 2. Cryptographic signature & key authorization check
  const allowlist =
    options?.authorizedKeys && options.authorizedKeys.length > 0
      ? options.authorizedKeys
      : getAuthorizedAuditorKeys();

  let signatureValid = false;

  if (allowlist.length === 0 && !options?.allowUnpinnedKeys) {
    errors.push(
      "No authorized auditor keys configured. Key pinning is required to prevent unverified signer keys.",
    );
  } else if (allowlist.length > 0 && !allowlist.includes(signatureRecord.keyId)) {
    errors.push(
      `Auditor Key ID ${signatureRecord.keyId} is not in the authorized auditor key allowlist.`,
    );
  } else {
    signatureValid = verifyAuditorSignature(
      signatureRecord.signedRootDigest,
      signatureRecord.signatureHex,
      signatureRecord.keyId,
    );
    if (!signatureValid) {
      errors.push(`Auditor Ed25519 signature is INVALID for Key ID ${signatureRecord.keyId}.`);
    }
  }

  // 3. Root digest consistency check
  const recomputedRoot = await computeRootDigest(hashesManifest.files);
  const manifestHashValid =
    recomputedRoot === hashesManifest.rootDigest &&
    recomputedRoot === signatureRecord.signedRootDigest;

  if (!manifestHashValid) {
    errors.push(
      `Root digest mismatch. Recorded: ${hashesManifest.rootDigest}, Computed: ${recomputedRoot}, Signed: ${signatureRecord.signedRootDigest}`,
    );
  }

  // 4. File-by-file integrity re-computation
  const prefix = signatureKey!.includes("/")
    ? signatureKey!.slice(0, signatureKey!.lastIndexOf("/") + 1)
    : "";

  for (const recordedRelativePath of Object.keys(hashesManifest.files)) {
    const expectedHash = hashesManifest.files[recordedRelativePath];
    const fullPathKey = prefix + recordedRelativePath;
    const content = files[fullPathKey] || files[recordedRelativePath];

    if (!content) {
      errors.push(`File recorded in hashes.json is missing in pack: ${recordedRelativePath}`);
      tamperedFiles.push(recordedRelativePath);
      continue;
    }

    const actualHash = await sha256Hex(content);
    if (actualHash !== expectedHash) {
      errors.push(
        `File hash mismatch for ${recordedRelativePath}. Expected ${expectedHash}, got ${actualHash}`,
      );
      tamperedFiles.push(recordedRelativePath);
    } else {
      verifiedFilesCount++;
    }
  }

  // 5. Reject archive entries not listed in hashes.json
  for (const rawKey of Object.keys(files)) {
    const normalizedKey = normalizePath(rawKey);
    const relPath =
      prefix && normalizedKey.startsWith(prefix)
        ? normalizedKey.slice(prefix.length)
        : normalizedKey;

    if (relPath === "hashes.json" || relPath === "signature.json") continue;
    if (!hashesManifest.files[relPath]) {
      errors.push(`Archive entry is not listed in hashes.json: ${relPath}`);
      tamperedFiles.push(relPath);
    }
  }

  // Verify manifest.json itself if present
  if (manifestKey && files[manifestKey]) {
    try {
      const rawManifest =
        typeof files[manifestKey] === "string"
          ? (files[manifestKey] as string)
          : new TextDecoder().decode(files[manifestKey] as Uint8Array);
      const parsedManifest = JSON.parse(rawManifest);
      if (parsedManifest.rootDigest && parsedManifest.rootDigest !== hashesManifest.rootDigest) {
        errors.push("manifest.json rootDigest differs from hashes.json rootDigest.");
      }
    } catch {
      errors.push("Failed to parse manifest.json.");
    }
  }

  const valid =
    signatureValid && manifestHashValid && tamperedFiles.length === 0 && errors.length === 0;

  return {
    valid,
    signatureValid,
    manifestHashValid,
    tamperedFiles,
    verifiedFilesCount,
    errors,
    auditorKeyId: signatureRecord.keyId,
    generatedAt: signatureRecord.timestamp,
  };
}

/**
 * Verifies a zipped evidence pack archive (ArrayBuffer, Uint8Array, or Blob).
 */
export async function verifyEvidenceZip(
  zipData: ArrayBuffer | Uint8Array | Blob,
  options?: VerificationOptions,
): Promise<PackVerificationResult> {
  const jszip = new JSZip();
  const loadedZip = await jszip.loadAsync(zipData);

  const filesMap: Record<string, Uint8Array> = {};

  const filePromises: Promise<void>[] = [];
  loadedZip.forEach((relativePath, fileEntry) => {
    if (!fileEntry.dir) {
      filePromises.push(
        fileEntry.async("uint8array").then((data) => {
          filesMap[relativePath] = data;
        }),
      );
    }
  });

  await Promise.all(filePromises);
  return await verifyEvidenceFiles(filesMap, options);
}
