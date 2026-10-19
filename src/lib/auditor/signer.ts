/**
 * Cryptographic Signing Engine for SOC 2 Type II Evidence Packaging
 * Signs evidence manifests and root digests using an authorized platform auditor Ed25519 key.
 */

import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import type { AuditorSignatureRecord } from "./types";

export class AuditorSigningError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "AuditorSigningError";
  }
}

/**
 * Encodes a 32-byte Ed25519 public key as standard ASN.1 DER SubjectPublicKeyInfo (SPKI) PEM (RFC 8410).
 */
export function formatEd25519PublicKeyPem(rawPublicKey: Uint8Array): string {
  // ASN.1 DER prefix for Ed25519 (OID 1.3.101.112)
  const spkiHeader = new Uint8Array([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);

  const combined = new Uint8Array(spkiHeader.length + rawPublicKey.length);
  combined.set(spkiHeader, 0);
  combined.set(rawPublicKey, spkiHeader.length);

  // Convert to base64
  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  const base64 = btoa(binary);
  const formattedLines = base64.match(/.{1,64}/g)?.join("\n") || base64;

  return `-----BEGIN PUBLIC KEY-----\n${formattedLines}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Resolves an active Keypair instance from various input formats:
 * - Stellar Secret Seed starting with 'S' (e.g. S...)
 * - 64-character hexadecimal raw seed string
 * - Raw 32-byte Uint8Array
 */
export function resolveAuditorKeypair(privateKeyInput?: string | Uint8Array): Keypair {
  const envKey =
    typeof process !== "undefined" && process.env ? process.env.AUDITOR_PRIVATE_KEY : undefined;

  const resolved = (privateKeyInput || envKey || "").toString().trim();

  if (!resolved) {
    throw new AuditorSigningError(
      "Platform auditor private key is missing. An unsigned SOC 2 evidence pack cannot be generated. Please configure AUDITOR_PRIVATE_KEY in your server/CI environment or supply an authorized auditor key.",
    );
  }

  try {
    if (resolved.startsWith("S") && resolved.length === 56) {
      // Stellar Secret Seed format
      return Keypair.fromSecret(resolved);
    }

    if (/^[0-9a-fA-F]{64}$/.test(resolved)) {
      // 32-byte raw hex seed
      const match = resolved.match(/.{1,2}/g);
      if (match) {
        const seedBytes = new Uint8Array(match.map((byte) => parseInt(byte, 16)));
        return Keypair.fromRawEd25519Seed(Buffer.from(seedBytes));
      }
    }

    // Try standard secret parsing
    return Keypair.fromSecret(resolved);
  } catch (err: unknown) {
    throw new AuditorSigningError(
      `Invalid auditor private key format: ${err instanceof Error ? err.message : String(err)}. Key must be a valid Stellar secret seed (S...) or 64-char hex string.`,
      err,
    );
  }
}

/**
 * Signs the root digest of an evidence pack using the platform auditor key.
 */
export function signRootDigest(
  rootDigest: string,
  privateKeyInput?: string | Uint8Array,
  auditorOrganization: string = "StormSale Enterprise Compliance Board",
): AuditorSignatureRecord {
  const keypair = resolveAuditorKeypair(privateKeyInput);
  const dataToSign = new TextEncoder().encode(rootDigest);

  // Sign data using Ed25519
  const signatureBytes = keypair.sign(Buffer.from(dataToSign));
  const signatureHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  let binary = "";
  for (let i = 0; i < signatureBytes.length; i++) {
    binary += String.fromCharCode(signatureBytes[i]);
  }
  const signatureBase64 = btoa(binary);

  const rawPublicKey = keypair.rawPublicKey();
  const publicKeyPem = formatEd25519PublicKeyPem(rawPublicKey);

  return {
    algorithm: "Ed25519",
    keyId: keypair.publicKey(),
    publicKeyPem,
    signedRootDigest: rootDigest,
    signatureHex,
    signatureBase64,
    timestamp: new Date().toISOString(),
    auditorOrganization,
  };
}

/**
 * Verifies an Ed25519 signature against the root digest and auditor public key.
 */
export function verifyAuditorSignature(
  rootDigest: string,
  signatureHex: string,
  publicKeyOrKeyId: string,
): boolean {
  try {
    let keypair: Keypair;

    if (publicKeyOrKeyId.startsWith("G") && publicKeyOrKeyId.length === 56) {
      keypair = Keypair.fromPublicKey(publicKeyOrKeyId);
    } else {
      // Attempt to parse PEM or address
      const base64Match = publicKeyOrKeyId.replace(/-----[^-]+-----|\s/g, "");
      const binary = atob(base64Match);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      // If SPKI format (44 bytes total, 12 bytes header + 32 bytes raw pub key)
      const rawPub = bytes.length === 44 ? bytes.slice(12) : bytes.slice(-32);
      const stellarPublicKey = StrKey.encodeEd25519PublicKey(Buffer.from(rawPub));
      keypair = Keypair.fromPublicKey(stellarPublicKey);
    }

    const dataToVerify = Buffer.from(new TextEncoder().encode(rootDigest));
    const match = signatureHex.match(/.{1,2}/g);
    if (!match) return false;
    const signatureBytes = Buffer.from(new Uint8Array(match.map((b) => parseInt(b, 16))));

    return keypair.verify(dataToVerify, signatureBytes);
  } catch {
    return false;
  }
}
