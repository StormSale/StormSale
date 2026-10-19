/**
 * Secure Affiliate Sale Payload Crypto ( Issue #49 )
 * Real AES-GCM-256 envelope encryption via WebCrypto (`crypto.subtle`).
 * Envelope: base64(JSON { v:1, alg:"AES-GCM-256", iv:b64(12B), data:b64(ct) })
 *
 * Issue #49 (Background Crypto Web Workers):
 * The public API is worker-backed via `src/lib/crypto.worker.ts` so AES tasks
 * run off the main thread and the UI remains at 60fp during audits. When
 * workers are unavailable (SSR, tests), the functions fall back to inline
 * execution so behaviour is identical.
 */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const ENVELOPE_VERSION = 1;
const GCM_IV_BYTES = 12;
const MAX_PLAINTEXT_BYTES = 64 * 1024;
const MAX_ENVELOPE_CHARS = 200_000;

interface SecureEnvelope {
  v: number;
  alg: string;
  iv: string;
  data: string;
}

function getSubtle(): SubtleCrypto {
  const subtle =
    globalThis.crypto?.subtle ??
    (globalThis as unknown as { webcrypto?: Crypto }).webcrypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto is unavailable in this environment.");
  }
  return subtle;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(input: string): Uint8Array<ArrayBuffer> {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  if (!/^[A-Za-z0-9+/=_-]+$/.test(input)) {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error("Invalid encrypted payload: malformed envelope.");
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  const c = globalThis.crypto ?? (globalThis as unknown as { webcrypto?: Crypto }).webcrypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
    return bytes;
  }
  throw new Error("Secure random number generator is unavailable.");
}

function assertAesGcmKey(key: unknown): asserts key is CryptoKey {
  const k = key as CryptoKey | null;
  if (!k || typeof k !== "object" || (k.algorithm as Algorithm | undefined)?.name?.toUpperCase() !== "AES-GCM") {
    throw new Error("Decryption failed: invalid key.");
  }
}

async function deriveWrappingKey(identifier: string): Promise<CryptoKey> {
  if (!identifier || typeof identifier !== "string" || identifier.trim().length === 0) {
    throw new Error("Key wrap failed: recipient identifier is required.");
  }
  const subtle = getSubtle();
  const digest = await subtle.digest("SHA-256", TEXT_ENCODER.encode(identifier.trim()));
  return subtle.importKey("raw", digest, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Inline (main-thread) implementations. These are used by the worker and as a
 * fallback when a worker is unavailable. */
export async function generateAESKeyInline(): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptPayloadInline(payload: object, aesKey: CryptoKey): Promise<string> {
  assertAesGcmKey(aesKey);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Encryption failed: payload must be a JSON object.");
  }
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(payload));
  if (plaintext.byteLength === 0 || plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new Error("Encryption failed: payload size out of bounds.");
  }
  const iv = randomBytes(GCM_IV_BYTES);
  let ct: ArrayBuffer;
  try {
    ct = await getSubtle().encrypt({ name: "AES-GCM", iv }, aesKey, plaintext);
  } catch {
    throw new Error("Encryption failed.");
  }
  const env: SecureEnvelope = {
    v: ENVELOPE_VERSION,
    alg: "AES-GCM-256",
    iv: base64Encode(iv),
    data: base64Encode(new Uint8Array(ct)),
  };
  return base64Encode(TEXT_ENCODER.encode(JSON.stringify(env)));
}

export async function wrapAESKeyInline(aesKey: CryptoKey, publicKey: string): Promise<string> {
  assertAesGcmKey(aesKey);
  let raw: ArrayBuffer;
  try {
    raw = await getSubtle().exportKey("raw", aesKey);
  } catch {
    throw new Error("Key wrap failed.");
  }
  const wk = await deriveWrappingKey(publicKey);
  const iv = randomBytes(GCM_IV_BYTES);
  let ct: ArrayBuffer;
  try {
    ct = await getSubtle().encrypt({ name: "AES-GCM", iv }, wk, raw);
  } catch {
    throw new Error("Key wrap failed.");
  }
  const env: SecureEnvelope = {
    v: ENVELOPE_VERSION,
    alg: "AES-GCM-256",
    iv: base64Encode(iv),
    data: base64Encode(new Uint8Array(ct)),
  };
  return base64Encode(TEXT_ENCODER.encode(JSON.stringify(env)));
}

export async function unwrapAESKeyInline(
  wrappedKey: string,
  privateKey: string,
): Promise<CryptoKey> {
  const FAIL = new Error("Key unwrap failed: invalid wrapped key or identifier.");
  if (!wrappedKey || typeof wrappedKey !== "string" || wrappedKey.length > MAX_ENVELOPE_CHARS) {
    throw FAIL;
  }
  if (!privateKey || typeof privateKey !== "string" || privateKey.trim().length === 0) {
    throw FAIL;
  }
  let env: SecureEnvelope;
  try {
    env = JSON.parse(TEXT_DECODER.decode(base64Decode(wrappedKey))) as SecureEnvelope;
  } catch {
    throw FAIL;
  }
  if (!env || env.v !== ENVELOPE_VERSION || typeof env.iv !== "string" || typeof env.data !== "string") {
    throw FAIL;
  }
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  try {
    iv = base64Decode(env.iv);
    data = base64Decode(env.data);
  } catch {
    throw FAIL;
  }
  if (iv.byteLength !== GCM_IV_BYTES || data.byteLength === 0) throw FAIL;
  const wk = await deriveWrappingKey(privateKey);
  let raw: ArrayBuffer;
  try {
    raw = await getSubtle().decrypt({ name: "AES-GCM", iv }, wk, data);
  } catch {
    throw FAIL;
  }
  try {
    return await getSubtle().importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    throw FAIL;
  }
}

export async function decryptPayloadInline(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  assertAesGcmKey(aesKey);
  const FAIL = new Error("Decryption failed: invalid payload or key.");
  if (!encryptedPayload || typeof encryptedPayload !== "string") throw FAIL;
  if (encryptedPayload.length > MAX_ENVELOPE_CHARS) throw FAIL;
  let env: SecureEnvelope;
  try {
    env = JSON.parse(TEXT_DECODER.decode(base64Decode(encryptedPayload))) as SecureEnvelope;
  } catch {
    throw FAIL;
  }
  if (
    !env ||
    env.v !== ENVELOPE_VERSION ||
    env.alg !== "AES-GCM-256" ||
    typeof env.iv !== "string" ||
    typeof env.data !== "string"
  ) {
    throw FAIL;
  }
  let iv: Uint8Array<ArrayBuffer>;
  let data: Uint8Array<ArrayBuffer>;
  try {
    iv = base64Decode(env.iv);
    data = base64Decode(env.data);
  } catch {
    throw FAIL;
  }
  if (iv.byteLength !== GCM_IV_BYTES || data.byteLength === 0) throw FAIL;
  let pt: ArrayBuffer;
  try {
    pt = await getSubtle().decrypt({ name: "AES-GCM", iv }, aesKey, data);
  } catch {
    throw FAIL;
  }
  try {
    const parsed: unknown = JSON.parse(TEXT_DECODER.decode(pt));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw FAIL;
    return parsed as object;
  } catch (e) {
    if (e === FAIL) throw e;
    throw FAIL;
  }
}

// ---------------------------------------------------------------------------
// Worker bridge
// ---------------------------------------------------------------------------

interface CryptoWorkerRequest {
  id: number;
  op: "generateAESKey" | "encryptPayload" | "decryptPayload" | "wrapAESKey" | "unwrapAESKey";
  payload: unknown;
}

interface CryptoWorkerResponse {
  ackId: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

class CryptoWorkerBridge {
  private worker: Worker | null = null;
  private pending = new Map<number, PendingCall>();
  private nextId = 1;
  private failed = false;

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    if (this.failed) return null;
    if (typeof Worker === "undefined") {
      this.failed = true;
      return null;
    }
    try {
      const worker = new Worker(new URL("./crypto.worker.ts", import.meta.url), {
        type: "module",
        name: "crypto-worker",
      });
      worker.onmessage = (event: MessageEvent<CryptoWorkerResponse>) => {
        const msg = event.data;
        if (!msg || typeof msg.ackId !== "number") return;
        const p = this.pending.get(msg.ackId);
        if (!p) return;
        this.pending.delete(msg.ackId);
        if (msg.ok) {
          p.resolve(msg.result);
        } else {
          p.reject(new Error(msg.error || "Crypto worker failed."));
        }
      };
      worker.onerror = () => {
        // Mark the worker as unusable and reject anything in flight so callers
        // can fall back to inline execution.
        this.failed = true;
        this.worker = null;
        for (const [, p] of this.pending) {
          p.reject(new Error("Crypto worker crashed."));
        }
        this.pending.clear();
      };
      this.worker = worker;
      return worker;
    } catch {
      this.failed = true;
      return null;
    }
  }

  async run<T>(op: CryptoWorkerRequest["op"], payload: unknown): Promise<T> {
    const worker = this.ensureWorker();
    if (!worker) {
      throw new Error("Worker unavailable");
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      const req: CryptoWorkerRequest = { id, op, payload };
      try {
        worker.postMessage(req);
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error("Crypto worker postMessage failed."));
      }
    });
  }
}

const bridge = new CryptoWorkerBridge();

// ---------------------------------------------------------------------------
// Public API (worker-backed with inline fallback)
// ---------------------------------------------------------------------------

export async function generateAESKey(): Promise<CryptoKey> {
  try {
    return await bridge.run<CryptoKey>("generateAESKey", null);
  } catch {
    return generateAESKeyInline();
  }
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  try {
    return await bridge.run<string>("encryptPayload", { payload, key: aesKey });
  } catch {
    return encryptPayloadInline(payload, aesKey);
  }
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  try {
    return await bridge.run<object>("decryptPayload", {
      envelope: encryptedPayload,
      key: aesKey,
    });
  } catch {
    return decryptPayloadInline(encryptedPayload, aesKey);
  }
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  try {
    return await bridge.run<string>("wrapAESKey", {
      key: aesKey,
      identifier: publicKey,
    });
  } catch {
    return wrapAESKeyInline(aesKey, publicKey);
  }
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  try {
    return await bridge.run<CryptoKey>("unwrapAESKey", {
      wrappedKey,
      identifier: privateKey,
    });
  } catch {
    return unwrapAESKeyInline(wrappedKey, privateKey);
  }
}

// Helper to get a "mock" public key from a wallet address
export async function getPublicKeyForAddress(address: string): Promise<string> {
  if (!address || typeof address !== "string" || address.trim().length === 0) {
    throw new Error("Unknown address: identifier is required.");
  }
  const t = address.trim();
  if (/^[GC][A-Z0-9]{55}$/.test(t)) return t;
  return `STORMSALE-PUBKEY:${t}`;
}