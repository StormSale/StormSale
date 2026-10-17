import { utils as ethersUtils, wallet } from "ethers";

export interface EncryptedPackage {
  encryptedPayload: string;
  wrappedKey: string;
  shareLinkId: string;
  expiresAt: number;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const AES_GCM_PARAMS = {
  name: "AES-GCM",
  length: 256,
} as const;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function getSubtleCrypto(): SubtleCrypto {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Web Crypto API is not available in this environment");
  }
  return window.crypto.subtle;
}

function normalizePublicKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("Public key is required");
  }
  if (trimmed.includes("BEGIN PUBLIC KEY-----")) {
    return trimmed;
  }
  const body = trimmed.replace(/-----BEGIN PUBLIC KEY-----/g, "").replace(/-----END PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  if (!body) {
    throw new Error("Invalid public key");
  }
  const lines = body.match(/.{1,64}/g) ?? [];
  return ["-----BEGIN PUBLIC KEY-----", ...lines, "-----END PUBLIC KEY-----"].join("\n");
}

function normalizePrivateKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("Private key is required");
  }
  if (trimmed.includes("PRIVATE KEY-----")) {
    return trimmed;
  }
  const body = trimmed.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  if (!body) {
    throw new Error("Invalid private key");
  }
  const lines = body.match(/.{1,64}/g) ?? [];
  return ["-----BEGIN PRIVATE KEY-----", ...lines, "-----END PRIVATE KEY-----"].join("\n");
}

async function importPublicKeyForEncryption(publicKey: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const normalized = normalizePublicKey(publicKey);
  const body = normalized
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = base64ToBytes(body);
  try {
    return await subtle.importKey(
      "spki",
      toArrayBuffer(der),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
  } catch {
    throw new Error("Unable to import public key for encryption");
  }
}

async function importPrivateKeyForDecryption(privateKey: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const normalized = normalizePrivateKey(privateKey);
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = base64ToBytes(body);
  try {
    return await subtle.importKey(
      "pkcs8",
      toArrayBuffer(der),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );
  } catch {
    throw new Error("Unable to import private key for decryption");
  }
}

export async function generateAESKey(): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  return subtle.generateKey(AES_GCM_PARAMS, true, ["encrypt", "decrypt"]);
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  const subtle = getSubtleCrypto();
  const iv: Uint8Array = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  const ciphertext = await subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    toArrayBuffer(plaintext),
  );
  const cipherBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return bytesToBase64(combined);
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  const subtle = getSubtleCrypto();
  const combined = base64ToBytes(encryptedPayload);
  if (combined.length <= 12) {
    throw new Error("Encrypted payload is too short");
  }
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    aesKey,
    toArrayBuffer(ciphertext),
  );
  return JSON.parse(TEXT_DECODER.decode(plaintext)) as object;
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const rsaPublicKey = await importPublicKeyForEncryption(publicKey);
  const rawAES = await subtle.exportKey("raw", aesKey);
  const wrapped = await subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    rawAES,
  );
  return bytesToBase64(new Uint8Array(wrapped));
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const rsaPrivateKey = await importPrivateKeyForDecryption(privateKey);
  const wrappedBytes = base64ToBytes(wrappedKey);
  const rawAES = await subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    toArrayBuffer(wrappedBytes),
  );
  return subtle.importKey("raw", rawAES, AES_GCM_PARAMS, true, ["encrypt", "decrypt"]);
}

export async function getPublicKeyForAddress(address: string): Promise<string> {
  if (!ethersUtils.isAddress(address)) {
    throw new Error("Invalid wallet address");
  }
  const normalized = ethersUtils.getAddress(address);
  const provider = wallet.getDefaultProvider();
  if (!provider) {
    throw new Error("No Ethereum provider available to resolve public key");
  }
  const code = await provider.getCode(normalized);
  if (!code || code === "0x") {
    throw new Error("Address has no registered public key");
  }
  const iface = new ethersUtils.Interface([
    "function publicKeyOf(address account) view returns (string)",
  ]);
  const selector = iface.getFunction("publicKeyOf")!.selector;
  const data = selector + ethersUtils.defaultAbi("string", normalized).slice(2);
  const result = await provider.call({ to: normalized, data });
  if (!result || result === "0x") {
    throw new Error("Address did not return a public key");
  }
  const [publicKey] = iface.decodeFunctionResult("publicKeyOf", result) as [string];
  if (!publicKey) {
    throw new Error("Address did not return a public key");
  }
  return normalizePublicKey(publicKey);
}

export function createExpiryLockedShareLink(
  package: EncryptedPackage,
  baseUrl: string,
  ttlDurationMs: number,
  now: number = Date.now(),
): string {
  if (!Number.isFinite(ttlDurationMs) || ttlDurationMs <= 0) {
    throw new Error("Expiry duration must be a positive number of milliseconds");
  }
  const expiresAt = package.expiresAt || now + ttlDurationMs;
  const url = new URL(package.shareLinkId, baseUrl);
  url.searchParams.set("expiresAt", String(expiresAt));
  url.searchParams.set("shareId", package.shareLinkId);
  return url.toString();
}

export function isShareLinkExpired(expiresAt: number, now: number = Date.now()): boolean {
  return now >= expiresAt;
}

export function parseExpiryFromLink(link: string): number {
  const url = new URL(link);
  const raw = url.searchParams.get("expiresAt");
  if (!raw) {
    throw new Error("Share link is missing an expiry timestamp");
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error("Share link expiry timestamp is invalid");
  }
  return value;
}

export async function createEncryptedShare(
  payload: object,
  recipientPublicKey: string,
  ttlMs: number,
): Promise<EncryptedPackage> {
  const aesKey = await generateAESKey();
  const encryptedPayload = await encryptPayload(payload, aesKey);
  const wrappedKey = await wrapAESKey(aesKey, recipientPublicKey);
  const shareLinkId = bytesToBase64(window.crypto.getRandomValues(new Uint8Array(16)))
    .replace(/[/+=]/g, "")
    .slice(0, 22);
  return {
    encryptedPayload,
    wrappedKey,
    shareLinkId,
    expiresAt: Date.now() + ttlMs,
  };
}

export async function openEncryptedShare(
  package: EncryptedPackage,
  recipientPrivateKey: string,
): Promise<object> {
  if (isShareLinkExpired(package.expiresAt)) {
    throw new Error("Share link has expired");
  }
  const aesKey = await unwrapAESKey(package.wrappedKey, recipientPrivateKey);
  return decryptPayload(package.encryptedPayload, aesKey);
}
