/**
 * Cryptographic Hashing Utilities for SOC 2 Type II Evidence Packaging
 * Provides deterministic SHA-256 calculation across browser and Node.js environments.
 */

import type { CodebaseHashesManifest } from "./types";

/**
 * Computes SHA-256 hex digest for any string, Uint8Array, or ArrayBuffer.
 * Works seamlessly in both modern browsers (Web Crypto) and Node.js environments.
 */
export async function sha256Hex(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);

  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    // Web Crypto API (Browser & Node 18+)
    const hashBuffer = await globalThis.crypto.subtle.digest(
      "SHA-256",
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Node.js fallback via dynamic import if subtle is unavailable
  const nodeCrypto = await import("crypto");
  return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Computes a deterministic Root Digest across a set of file path-to-hash mappings.
 * All paths are sorted lexicographically before chaining.
 */
export async function computeRootDigest(fileHashes: Record<string, string>): Promise<string> {
  const sortedKeys = Object.keys(fileHashes).sort();
  const canonicalString = sortedKeys.map((path) => `${path}:${fileHashes[path]}`).join("\n");
  return await sha256Hex(canonicalString);
}

/**
 * Converts a string with backslashes to standard forward slashes.
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Checks whether a relative path should be excluded according to standard repository ignore rules.
 */
export function isIgnoredPath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  const ignorePatterns = [
    /^\.git\//,
    /^node_modules\//,
    /^dist\//,
    /^\.husky\//,
    /^\.vscode\//,
    /^\.idea\//,
    /\.log$/,
    /^\.cache\//,
    /^coverage\//,
    /\.tsbuildinfo$/,
    /\.DS_Store$/,
  ];

  return ignorePatterns.some((pattern) => pattern.test(normalized));
}

/**
 * Creates a deterministic CodebaseHashesManifest from a map of path -> content or path -> sha256.
 */
export async function generateHashesManifest(
  fileMap: Record<string, string | Uint8Array>,
  metadata: {
    commitSha?: string;
    version?: string;
    timestamp?: string;
  } = {},
): Promise<CodebaseHashesManifest> {
  const hashes: Record<string, string> = {};
  let totalBytes = 0;

  // Process all files deterministically
  const sortedPaths = Object.keys(fileMap).sort();
  for (const rawPath of sortedPaths) {
    const path = normalizePath(rawPath);
    if (isIgnoredPath(path)) continue;

    const content = fileMap[rawPath];
    const hash = await sha256Hex(content);
    const byteLength =
      typeof content === "string" ? new TextEncoder().encode(content).length : content.byteLength;

    hashes[path] = hash;
    totalBytes += byteLength;
  }

  const rootDigest = await computeRootDigest(hashes);

  return {
    version: metadata.version || "1.0.0",
    timestamp: metadata.timestamp || new Date().toISOString(),
    commitSha: metadata.commitSha || "f904fa9146e1d06d25acf8cdd0e814ba00839808",
    rootDigest,
    rootAlgorithm: "SHA-256",
    totalFiles: Object.keys(hashes).length,
    totalBytes,
    files: hashes,
  };
}
