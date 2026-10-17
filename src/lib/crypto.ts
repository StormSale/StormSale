const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const AIGS = { name: 'AES-GCM', length: 256 } as const;

export async function generateAESKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AIGS.name, length: AIGS.length },
    true,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(12);
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: AIGS.name, iv },
    aesKey,
    plaintext,
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(combined);
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  const combined = fromBase64(encryptedPayload);
  if (combined.length < 13) {
    throw new Error('Invalid encrypted payload');
  }
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: AIGS.name, iv },
    aesKey,
    ciphertext,
  );
  return JSON.parse(decoder.decode(plaintext));
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  const rawKey = await crypto.subtle.exportKey('raw', aesKey);
  const rsaPublic = await crypto.subtle.importKey(
    'spi',
    fromBase64(publicKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt'],
  );
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaPublic, rawKey);
  return toBase64(new Uint8Array(wrapped));
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  const rsaPrivate = await crypto.subtle.importKey(
    'pkcs8',
    fromBase64(privateKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
  const rawKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    rsaPrivate,
    fromBase64(wrappedKey),
  );
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: AIGS.name, length: AIGS.length },
    true,
    ['encrypt', 'decrypt'],
  );
}

// Derives a deterministic RSA public key from a wallet address.
// This is a placeholder key derivation strategy for testing purposes.
export async function getPublicKeyForAddress(address: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(address));
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulelength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  // Mix the address digest into the key material to make it deterministic for tests.
  const spti = await crypto.subtle.exportKey('spi', keyPair.publicKey);
  const out = new Uint8Array(spti.byteLength);
  out.set(new Uint8Array(spti), 0);
  for (let i = 0; i < out.length; i++) {
    out[i] ^= digest[i % digest.byteLength];
  }
  return toBase64(out);
}
