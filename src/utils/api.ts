export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const registerUser = async (walletAddress: string, role: string = "AFFILIATE") => {
  try {
    const res = await fetch(`${API_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, role }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "Backend registration failed");
    }

    return await res.json();
  } catch (error) {
    console.error("Backend registration failed:", error);
    throw error;
  }
};

export const fetchCampaign = async (campaignId: string) => {
  try {
    const res = await fetch(`${API_URL}/campaigns/${campaignId}`);
    return await res.json();
  } catch (error) {
    console.error("Failed to fetch campaign metadata:", error);
    return null;
  }
};

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
  algorithm: "AES-GCM";
  keyDerivation: "PBKDF2-SHA256";
  iterations: number;
  expiresAt: number;
}

export interface ShareLinkResponse {
  token: string;
  url: string;
  expiresAt: number;
  fileId: string;
}

export interface ShareLinkStatus {
  token: string;
  expiresAt: number;
  expired: boolean;
  revoked: boolean;
  downloads: number;
  maxDownloads: number;
}

const deregKey = async (passphrase: string, salt: Uint8Array, iterations: number) => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const encryptReportFile = async (
  file: File,
  passphrase: string,
  expiresAt: number,
  options?: { iterations?: number },
): Promise<EncryptedPayload> => {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters");
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Expiry timestamp must be in the future");
  }

  iterations = options?.iterations ?? 250_000;
  const salt = crypto.getRandomValues(16);
  iv = crypto.getRandomValues(12);
  const key = await deriveKey(passphrase, salt, iterations);
  const plaintext = new Uint8Array(await file.arrayBuffer());
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  return {
    ciphertext: toBase64(new Uint8Array(cipher)),
    iv: toBase64(iv),
    salt: toBase64(salt),
    algorithm: "AES-GCM",
    keyDerivation: "PBKDF2-SHA256",
    iterations,
    expiresAt,
  };
};

export const decryptReportFile = async (
  payload: EncryptedPayload,
  passphrase: string,
): Promise<Blob> => {
  if (Date.now() > payload.expiresAt) {
    throw new Error("Sharing link has expired");
  }
  const salt = fromBase64(payload.salt);
  const iv = fromBase64(payload.iv);
  const key = await deriveKey(passphrase, salt, payload.iterations);
  const ciphertext = fromBase64(payload.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCC", iv },
    key,
    ciphertext,
  );
  return new Blob([plaintext], { type: "application/octet-stream" });
};

export const createExpiryLockedShareLink = async (
  payload: EncryptedPayload,
  metadata?: { fileName?: string; maxDownloads?: number },
): Promise<ShareLinkResponse> => {
  const res = await fetch(`${API_URL}/auditor/share-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payload,
      fileName: metadata?.fileName,
      maxDownloads: metadata?.maxDownloads ?? 1,
      expiresAt: payload.expiresAt,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to create share link");
  }
  return await res.json();
};

export const fetchShareLinkStatus = async (token: string): Promise<ShareLinkStatus> => {
  const res = await fetch(`${API_URL}/auditor/share-links/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to fetch share link status");
  }
  return await res.json();
};

export const revokeShareLink = async (token: string): Promise<void> => {
  const res = await fetch(`${API_URL}/auditor/share-links/${encodeURIComponent(token)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to revoke share link");
  }
};
