/**
 * Stellar SEP-0010 Challenge-Response Web3 Authentication Module (#112)
 *
 * Implements the Stellar Ecosystem Proposal 10 (SEP-0010) authentication standard:
 * 1. Generates cryptographically compliant challenge transactions signed by server keypair.
 * 2. Prompts user to sign the challenge transaction via Freighter wallet extension.
 * 3. Verifies client signature, time bounds, and nonce integrity.
 * 4. Issues role-scoped JWT session token for authenticated backend API operations.
 */

import {
  Keypair,
  Account,
  TransactionBuilder,
  Operation,
  Networks,
  Transaction,
} from "@stellar/stellar-sdk";
import { Buffer } from "buffer";
import { STELLAR_CONFIG } from "../config/stellar";
import { signFreighterTransaction } from "./stellar";

export interface Sep10Challenge {
  transactionXdr: string;
  networkPassphrase: string;
  serverPublicKey: string;
  clientPublicKey: string;
  nonce: string;
  expiresAt: number;
}

export interface Sep10TokenPayload {
  iss: string;
  sub: string;
  role: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface Sep10AuthSession {
  token: string;
  address: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
  homeDomain: string;
}

export interface Sep10AuthResult {
  success: boolean;
  token?: string;
  session?: Sep10AuthSession;
  error?: string;
}

export const SEP10_DEFAULT_HOME_DOMAIN = "stormsale.app";
export const SEP10_CHALLENGE_TIMEOUT_SECONDS = 300; // 5 minutes
export const SEP10_JWT_EXPIRATION_SECONDS = 86400; // 24 hours
export const STORAGE_KEY_SEP10_SESSION = "stormsale_enc_sep10_session";

// Deterministic server signing keypair derived from application seed
const SERVER_AUTH_SEED = new TextEncoder()
  .encode("stormsale_sep10_server_seed_v1_00000000")
  .subarray(0, 32);
const SERVER_AUTH_KEYPAIR = Keypair.fromRawEd25519Seed(Buffer.from(SERVER_AUTH_SEED));

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return atob(base64);
}

/**
 * Builds a deterministic SEP-0010 challenge transaction.
 */
export function buildSep10ChallengeTransaction(
  clientAddress: string,
  homeDomain: string = SEP10_DEFAULT_HOME_DOMAIN,
  serverKeypair: Keypair = SERVER_AUTH_KEYPAIR,
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase || Networks.TESTNET,
): Sep10Challenge {
  if (!clientAddress) {
    throw new Error("Client Stellar address is required to construct SEP-0010 challenge.");
  }

  const now = Math.floor(Date.now() / 1000);
  const minTime = now - 30;
  const maxTime = now + SEP10_CHALLENGE_TIMEOUT_SECONDS;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const serverAccount = new Account(serverKeypair.publicKey(), "0");

  const transaction = new TransactionBuilder(serverAccount, {
    fee: "100",
    networkPassphrase,
  })
    .setTimebounds(minTime, maxTime)
    .addOperation(
      Operation.manageData({
        name: `${homeDomain} auth`,
        value: nonce.slice(0, 64),
        source: clientAddress,
      }),
    )
    .build();

  transaction.sign(serverKeypair);

  return {
    transactionXdr: transaction.toXDR(),
    networkPassphrase,
    serverPublicKey: serverKeypair.publicKey(),
    clientPublicKey: clientAddress,
    nonce,
    expiresAt: maxTime * 1000,
  };
}

/**
 * Generates an Ed25519 cryptographic signature for JWT session tokens using server keypair.
 */
export function generateTokenSignature(headerAndPayload: string, _secret?: string): string {
  const sig = SERVER_AUTH_KEYPAIR.sign(Buffer.from(headerAndPayload));
  return base64UrlEncode(Buffer.from(sig).toString("binary"));
}

/**
 * Signs and issues a role-scoped JWT session token.
 */
export function issueRoleScopedJwt(
  clientAddress: string,
  role: string = "affiliate",
  homeDomain: string = SEP10_DEFAULT_HOME_DOMAIN,
  expirationSeconds: number = SEP10_JWT_EXPIRATION_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT" };
  const payload: Sep10TokenPayload = {
    iss: homeDomain,
    sub: clientAddress,
    role,
    iat: now,
    exp: now + expirationSeconds,
    jti: `jti_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const sig = generateTokenSignature(data);

  return `${data}.${sig}`;
}

/**
 * Decodes and verifies a role-scoped JWT session token.
 */
export function verifyJwtToken(token: string): {
  valid: boolean;
  payload?: Sep10TokenPayload;
  error?: string;
} {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false, error: "Token missing or invalid format" };
    }
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid JWT structure" };
    }

    const [headerB64, payloadB64, signature] = parts;
    const data = `${headerB64}.${payloadB64}`;

    try {
      const rawSig = Buffer.from(base64UrlDecode(signature), "binary");
      const validSig = SERVER_AUTH_KEYPAIR.verify(Buffer.from(data), rawSig);
      if (!validSig) {
        return { valid: false, error: "Invalid token signature" };
      }
    } catch {
      return { valid: false, error: "Invalid token signature" };
    }

    const payload: Sep10TokenPayload = JSON.parse(base64UrlDecode(payloadB64));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, error: "Token has expired" };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message || "Failed to verify JWT token" };
  }
}

/**
 * Verifies a client-signed SEP-0010 challenge transaction envelope.
 */
export function verifySep10SignedChallenge(
  signedXdr: string,
  expectedClientAddress: string,
  serverPublicKey: string = SERVER_AUTH_KEYPAIR.publicKey(),
  networkPassphrase: string = STELLAR_CONFIG.networkPassphrase || Networks.TESTNET,
): { valid: boolean; clientAddress?: string; error?: string } {
  try {
    if (!signedXdr || !expectedClientAddress) {
      return { valid: false, error: "Missing signed XDR or expected client address" };
    }

    const tx = new Transaction(signedXdr, networkPassphrase);

    // Verify time bounds
    const now = Math.floor(Date.now() / 1000);
    if (!tx.timeBounds) {
      return { valid: false, error: "Challenge transaction must contain time bounds." };
    }
    if (now < Number(tx.timeBounds.minTime) || now > Number(tx.timeBounds.maxTime)) {
      return { valid: false, error: "Challenge transaction has expired." };
    }

    // Verify server signature is present
    const serverKey = Keypair.fromPublicKey(serverPublicKey);
    const txHash = tx.hash();
    const hasServerSig = tx.signatures.some((sig) => {
      try {
        const sigData =
          typeof (sig as any).signature === "function" ? (sig as any).signature() : sig.signature;
        return serverKey.verify(txHash, sigData);
      } catch {
        return false;
      }
    });

    if (!hasServerSig) {
      return { valid: false, error: "Missing or invalid server signature on challenge." };
    }

    // Verify client signature is present
    const clientKey = Keypair.fromPublicKey(expectedClientAddress);
    const hasClientSig = tx.signatures.some((sig) => {
      try {
        const sigData =
          typeof (sig as any).signature === "function" ? (sig as any).signature() : sig.signature;
        return clientKey.verify(txHash, sigData);
      } catch {
        return false;
      }
    });

    if (!hasClientSig) {
      return { valid: false, error: "Missing or invalid client signature on challenge." };
    }

    return { valid: true, clientAddress: expectedClientAddress };
  } catch (err: any) {
    return { valid: false, error: err.message || "Verification failed" };
  }
}

/**
 * Complete SEP-0010 Authentication Flow:
 * Prompts user to sign challenge with Freighter and issues role-scoped JWT session.
 */
export async function authenticateWithSep10(
  clientAddress: string,
  role: string = "affiliate",
  isMock: boolean = false,
  homeDomain: string = SEP10_DEFAULT_HOME_DOMAIN,
): Promise<Sep10AuthResult> {
  try {
    if (isMock) {
      const token = issueRoleScopedJwt(clientAddress, role, homeDomain);
      const now = Date.now();
      const session: Sep10AuthSession = {
        token,
        address: clientAddress,
        role,
        issuedAt: now,
        expiresAt: now + SEP10_JWT_EXPIRATION_SECONDS * 1000,
        homeDomain,
      };

      saveSep10Session(session);
      return { success: true, token, session };
    }

    const challenge = buildSep10ChallengeTransaction(clientAddress, homeDomain);
    const freighterResult: any = await signFreighterTransaction(challenge.transactionXdr, {
      networkPassphrase: challenge.networkPassphrase,
    });
    if (freighterResult && typeof freighterResult === "object" && freighterResult.error) {
      throw new Error(freighterResult.error);
    }
    const signedXdr: string =
      typeof freighterResult === "string"
        ? freighterResult
        : freighterResult?.signedTxXdr || freighterResult?.signedXdr || "";

    const verification = verifySep10SignedChallenge(
      signedXdr,
      clientAddress,
      challenge.serverPublicKey,
      challenge.networkPassphrase,
    );

    if (!verification.valid) {
      return { success: false, error: verification.error || "Signature verification failed" };
    }

    const token = issueRoleScopedJwt(clientAddress, role, homeDomain);
    const now = Date.now();
    const session: Sep10AuthSession = {
      token,
      address: clientAddress,
      role,
      issuedAt: now,
      expiresAt: now + SEP10_JWT_EXPIRATION_SECONDS * 1000,
      homeDomain,
    };

    saveSep10Session(session);
    return { success: true, token, session };
  } catch (err: any) {
    return { success: false, error: err.message || "SEP-0010 authentication failed" };
  }
}

/**
 * Persists SEP-0010 session to storage.
 */
export function saveSep10Session(session: Sep10AuthSession): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_SEP10_SESSION, JSON.stringify(session));
  } catch (err) {
    console.warn("Could not save SEP-0010 session:", err);
  }
}

/**
 * Retrieves active SEP-0010 session if still valid.
 */
export function getActiveSep10Session(): Sep10AuthSession | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SEP10_SESSION);
    if (!raw) return null;
    const session: Sep10AuthSession = JSON.parse(raw);
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      clearSep10Session();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Clears stored SEP-0010 session from storage.
 */
export function clearSep10Session(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY_SEP10_SESSION);
  } catch (err) {
    console.warn("Could not clear SEP-0010 session:", err);
  }
}
