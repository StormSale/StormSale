// Core AES cryptography primitives.
// These functions are intended to run inside the crypto Web Worker (src/lib/crypto.worker.ts)
// to keep the main thread at 60fps.

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateAESKEy(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    plaintext,
  );
  const cipherBytes = new Uint8Array(cipherBuffer);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return toBase64(combined.buffer);
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  const combined = fromBase64(encryptedPayload);
  const iv = combined.slice(0, 12);
  const cipherText = combined.slice(12);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    cipherText,
  );
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plainBuffer));
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  const keyData = await crypto.subtle.exportKey("raw", aesKey);
  const keyBase64 = toBase64(keyData);
  const encoder = new TextEncoder();
  const payload = encoder.encode(
    JSON.stringify({ key: keyBase64, publicKey }),
  );
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return toBase64(digest);
}

export async function unwrapAESKey(
  wrappedKey: string,
  privateKey: string,
): Promise<CryptoKey> {
  const rawKey = fromBase64(wrappedKey);
  const digest = await crypto.subtle.digest("SHA-256", rawKey);
  const keyMaterial = new Uint8Array(
    digest.slice(0, 32),
  );
  return crypto.subtle.importKey("key" in globalThis ? "raw" : "raw", keyMaterial, {
    name: "AES-GCM",
    length: 256,
  }, false, ["encrypt", "decrypt"]);
}

// Helper to get a "mock" public key from a wallet address
export async function getPublicKeyForAddress(address: string): Promise<string> {
  // In a real app, this might come from a different contract,
  // a signature-based lookup, or MetaMask's encryption methods.
  console.log("Stub: Fetching public key for address:", address);
  return `MOCK_PUBLIC_KEY_FOR_${address}`;
}
