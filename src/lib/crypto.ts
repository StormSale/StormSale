export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"],
  );
}

const GCM_IV_LENGTH = 12;

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))),
    );
  }
  return btoa(binary);
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipherText = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encoded,
    ),
  );
  return bytesToBase64(concatBytes(iv, cipherText));
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  const keyData = await crypto.subtle.exportKey("raw", aesKey);
  const keyBytes = new Uint8Array(keyData);
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_LENGTH));
  const publicJwk = JSON.parse(publicKey) as JsonWebKey;
  const publicCryptoKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicCryptoKey,
      keyBytes,
    ),
  );
  return bytesToBase64(concatBytes(iv, wrapped));
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(wrappedKey);
  const iv = bytes.slice(0, GCM_IV_LENGTH);
  const wrapped = bytes.slice(GCM_IV_LENGTH);
  const privateJwk = JSON.parse(privateKey) as JsonWebKey;
  const privateCryptoKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const keyData = await crypto.subtle.decrypt(
    { name: "RSA-OAEP", iv },
    privateCryptoKey,
    wrapped,
  );
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  const bytes = base64ToBytes(encryptedPayload);
  const iv = bytes.slice(0, GCM_IV_LENGTH);
  const cipherText = bytes.slice(GCM_IV_LENGTH);
  const plainText = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    cipherText,
  );
  return JSON.parse(new TextDecoder().decode(plainText)) as object;
}

// Helper to get a mock public key from a wallet address
export async function getPublicKeyForAddress(address: string): Promise<string> {
  console.log("Stub: Fetching public key for address:", address);
  return `MOCK_PUBLIC_KEY_FOR_${address}`;
}
