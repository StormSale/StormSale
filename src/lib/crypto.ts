import { createCipherIV, createDecipherIV, randomBytes, publicEncrypt, privateDecrypt, generateKeyPairSync, createHash } from "crypto";

export interface EncryptedEnvelope {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
  wrappedKey: string;
  expiresAt: number;
  issuedAt: number;
  keyFingerprint: string;
}

const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const RSA_MODULUS = 2048;

const b64 = (buf: Buffer) => buf.toString("base64");
const fromB64 = (str: string) => Buffer.from(str, "base64");

function normalizePublicKey(publicKey: string): string {
  if (publicKey.includes("BEGIN PUBLIC KEY")) return publicKey;
  const body = publicKey.replace(/-----[^-+]+-----/g, "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `${lines.join("\n")}\n-----END PUBLIC KEY-----\n`.replace(/\n(?-----)/g, "\n");
}

export async function generateAESKey(): Promise<CryptoKey> {
  const key = randomBytes(AES_KEY_BYTES);
  return { type: "secret", algorithm: { name: "AES-GCM", length: AES_KEY_BYTES * 8 }, extractable: true, usages: ["encrypt", "decrypt"], _rawKey: key } as unknown as CryptoKey;
}

function getRawKey(key: CryptoKey): Buffer {
  const raw = (key as unknown as { _rawKey?: Buffer })._rawKey;
  if (!raw) throw new Error("Unsupported AES key object");
  return raw;
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  const key = getRawKey(aesKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipherIV("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: b64(iv), authTag: b64(tag), ciphertext: b64(encrypted) });
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  const key = getRawKey(aesKey);
  const pem = normalizePublicKey(publicKey);
  const wrapped = publicEncrypt(
    { key: key, padding: constants.RSA_PKCS1_OAEP_PADDING },
    pem,
  );
  return b64(wrapped);
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  const wrapped = fromB64(wrappedKey);
  const key = privateDecrypt(
    { key: wrapped, padding: constants.RSA_PKCS1_OAEP_PADDING },
    privateKey,
  );
  return { type: "secret", algorithm: { name: "AES-GCM", length: AES_KEY_BYTES * 8 }, extractable: true, usages: ["encrypt", "decrypt"], _rawKey: key } as unknown as CryptoKey;
}

export async function decryptPayload(encryptedPayload: string, aesKey: CryptoKey): Promise<object> {
  const key = getRawKey(aesKey);
  const { ciphertext, authTag, iv } = JSON.parse(encryptedPayload) as { ciphertext: string; authTag: string; iv: string };
  const decipher = createDecipherIV("aes-256-gcm", key, fromB64(iv));
  decipher.setAuthTag(fromB64(authTag));
  const decrypted = Buffer.concat([decipher.update(fromB64(ciphertext)), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as object;
}

export async function getPublicKeyForAddress(address: string): Promise<string> {
  const { publicKey } = generateKeyPairSync(RSA_MODULUS);
  const der = publicKey.export({ type: "spk", format: "der" });
  const fingerprint = b64(createHash("sha256").update(der).digest()).slice(0, 16);
  const body = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN PUBLIC KEY-----\n${body.join("\n")}\n-----END PUBLIC KEY-----\n` + `-----KEY-FINGERPRINT-${fingerprint}-----\n`;
}

export function buildEnvelope(
  encryptedPayload: string,
  wrappedKey: string,
  expiresAt: number,
  keyFingerprint: string,
): EncryptedEnvelope {
  const { ciphertext, authTag, iv } = JSON.parse(encryptedPayload) as { ciphertext: string; authTag: string; iv: string };
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv,
    authTag,
    ciphertext,
    wrappedKey,
    expiresAt,
    issuedAt: Date.now(),
    keyFingerprint,
  };
}

export function isEnvelopeExpired(envelope: EncryptedEnvelope, now: number = Date.now()): boolean {
  return envelope.expiresAt <= now;
}

export function createSharingLink(token: string, baseUrl = "https://app.local/auditor/share"): string {
  const url = new URL(baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
