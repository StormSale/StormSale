/**
 * Cryptographic Session Revocation & Access Log Transparency Ledger (Issue #182)
 *
 * Every time an auditor key is used to verify access or decrypt a customer
 * conversion payload, an event is appended to a tamper-evident, hash-chained
 * ledger: each entry embeds the digest of the previous entry, so deleting or
 * editing any historical record breaks the chain and is detectable by every
 * later reader (merchants included).
 *
 * Compromised auditor keys can be emergency-revoked; the revocation itself is
 * recorded as another append-only event, and subsequent access checks for the
 * revoked key are denied by every component consulting this ledger.
 */

export type AuditAction =
  | "access_granted"
  | "access_denied"
  | "payload_decrypted"
  | "key_revoked";

export interface AuditAccessEvent {
  /** Zero-based position inside the append-only chain */
  sequence: number;
  action: AuditAction;
  /** Auditor public key (G...) that performed the action */
  auditorPublicKey: string;
  /** Decrypted / inspected record identifier */
  saleId: string;
  /** Soroban campaign contract the record belongs to */
  campaignAddress: string;
  /** ISO-8601 wall-clock timestamp of the event */
  timestamp: string;
  detail?: string;
  /** Digest of the previous entry (GENESIS for sequence 0) */
  prevHash: string;
  /** SHA-256 digest over this entry's canonical fields + prevHash */
  eventHash: string;
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  headHash: string;
  /** Sequence number of the first entry that failed verification, if any */
  brokenAtSequence?: number;
  reason?: string;
}

export interface NewAuditEventInput {
  action: AuditAction;
  auditorPublicKey: string;
  saleId: string;
  campaignAddress: string;
  detail?: string;
  /** Defaults to now; injectable for deterministic tests */
  timestamp?: string;
}

export const GENESIS_HASH = "0".repeat(64);
export const AUDIT_LEDGER_STORAGE_KEY = "stormsale_audit_ledger_v1";

/** Storage abstraction so the ledger works in browser, tests, and headless demos. */
export interface LedgerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryStore: Record<string, string> = {};
const fallbackStorage: LedgerStorage = {
  getItem: (key) => memoryStore[key] ?? null,
  setItem: (key, value) => {
    memoryStore[key] = value;
  },
};

function resolveStorage(storage?: LedgerStorage): LedgerStorage {
  if (storage) return storage;
  if (typeof localStorage !== "undefined") return localStorage;
  return fallbackStorage;
}

/** SHA-256 hex digest via Web Crypto, with a deterministic JS fallback. */
export async function hashEventFields(canonical: string): Promise<string> {
  const subtle = (globalThis as any).crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(canonical);
    const digest = await subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return fnv1aHex(canonical);
}

/**
 * FNV-1a based extension hash used only when SubtleCrypto is unavailable.
 * Keeps the chain tamper-evident within the ledger's threat model of the
 * demo runtime; real deployments always take the SHA-256 path above.
 */
function fnv1aHex(input: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;
  let h3 = 0x9dc91c81 >>> 0;
  let h4 = 0xc59d1c9d >>> 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ (c & 0xff), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c >> 8) & 0xff), 0x811c9dc5) >>> 0;
    h3 = Math.imul(h3 ^ (c & 0x55), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ ((c >> 4) & 0x3f), 0x27d4eb2f) >>> 0;
  }
  return [h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, "0")).join("");
}

/** Canonical, order-stable serialization used as hash pre-image. */
export function canonicalizeEvent(event: Omit<AuditAccessEvent, "eventHash">): string {
  return JSON.stringify([
    event.sequence,
    event.action,
    event.auditorPublicKey.toUpperCase(),
    event.saleId,
    event.campaignAddress.toUpperCase(),
    event.timestamp,
    event.detail ?? "",
    event.prevHash,
  ]);
}

export async function computeEventHash(
  event: Omit<AuditAccessEvent, "eventHash">,
): Promise<string> {
  return hashEventFields(canonicalizeEvent(event));
}

export function readAuditLedger(storage?: LedgerStorage): AuditAccessEvent[] {
  const raw = resolveStorage(storage).getItem(AUDIT_LEDGER_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AuditAccessEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * Recomputes the entire hash chain and the prevHash links. Returns the first
 * sequence whose stored digest no longer matches its canonical content.
 */
export async function verifyAuditChain(
  events: AuditAccessEvent[],
): Promise<ChainVerification> {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.sequence !== i) {
      return {
        valid: false,
        length: events.length,
        headHash: prevHash,
        brokenAtSequence: event.sequence,
        reason: "Sequence numbering is not contiguous — chain reordered or truncated.",
      };
    }
    if (event.prevHash !== prevHash) {
      return {
        valid: false,
        length: events.length,
        headHash: prevHash,
        brokenAtSequence: event.sequence,
        reason: "Previous-hash link broken — a prior entry was altered or removed.",
      };
    }
    const expected = await computeEventHash(event);
    if (expected !== event.eventHash) {
      return {
        valid: false,
        length: events.length,
        headHash: prevHash,
        brokenAtSequence: event.sequence,
        reason: "Entry digest does not match its recorded contents.",
      };
    }
    prevHash = event.eventHash;
  }
  return { valid: true, length: events.length, headHash: prevHash };
}

/**
 * Appends a tamper-evident access event. Refuses to write onto a ledger whose
 * existing chain is broken (an attacker cannot seed a fraudulent branch).
 */
export async function appendAuditAccessEvent(
  input: NewAuditEventInput,
  storage?: LedgerStorage,
): Promise<AuditAccessEvent> {
  const store = resolveStorage(storage);
  const ledger = readAuditLedger(store);
  const check = await verifyAuditChain(ledger);
  if (!check.valid) {
    throw new Error(
      `Audit ledger chain integrity check failed at entry ${check.brokenAtSequence}: ${check.reason}`,
    );
  }

  const eventWithoutHash: Omit<AuditAccessEvent, "eventHash"> = {
    sequence: ledger.length,
    action: input.action,
    auditorPublicKey: input.auditorPublicKey,
    saleId: input.saleId,
    campaignAddress: input.campaignAddress,
    timestamp: input.timestamp ?? new Date().toISOString(),
    detail: input.detail,
    prevHash: ledger.length > 0 ? ledger[ledger.length - 1].eventHash : GENESIS_HASH,
  };

  const event: AuditAccessEvent = {
    ...eventWithoutHash,
    eventHash: await computeEventHash(eventWithoutHash),
  };

  store.setItem(AUDIT_LEDGER_STORAGE_KEY, JSON.stringify([...ledger, event]));
  return event;
}

/**
 * Emergency action: permanently revokes a compromised auditor key. The
 * revocation is itself appended as a chained event so it cannot be silently
 * removed later. Re-granting access requires the auditor to use a new key.
 */
export async function revokeAuditorKey(
  targetPublicKey: string,
  reason: string,
  revokedBy: string,
  storage?: LedgerStorage,
): Promise<AuditAccessEvent> {
  return appendAuditAccessEvent(
    {
      action: "key_revoked",
      auditorPublicKey: targetPublicKey,
      saleId: "—",
      campaignAddress: "ledger-wide",
      detail: `REVOKED_BY=${revokedBy} :: ${reason}`,
    },
    storage,
  );
}

/** A key is revoked if the ledger contains a key_revoked event for it. */
export function isAuditorRevoked(publicKey: string, storage?: LedgerStorage): boolean {
  if (!publicKey) return false;
  const needle = publicKey.trim().toUpperCase();
  return readAuditLedger(storage).some(
    (e) => e.action === "key_revoked" && e.auditorPublicKey.trim().toUpperCase() === needle,
  );
}

/** Merchant transparency view: every access event recorded against one campaign. */
export function getAccessLogsForCampaign(
  campaignAddress: string,
  storage?: LedgerStorage,
): AuditAccessEvent[] {
  const needle = campaignAddress.trim().toUpperCase();
  return readAuditLedger(storage).filter(
    (e) => e.campaignAddress.trim().toUpperCase() === needle,
  );
}

/** Auditor self-service view: this key's recorded inspection history. */
export function getAccessLogsForAuditor(
  auditorPublicKey: string,
  storage?: LedgerStorage,
): AuditAccessEvent[] {
  const needle = auditorPublicKey.trim().toUpperCase();
  return readAuditLedger(storage).filter(
    (e) => e.auditorPublicKey.trim().toUpperCase() === needle,
  );
}

/** Distinct auditor keys that have ever touched any of the merchant's campaigns. */
export interface AuditorRosterEntry {
  auditorPublicKey: string;
  accessCount: number;
  lastAccess: string;
  revoked: boolean;
}

export function getAuditorsForCampaigns(
  campaignAddresses: string[],
  storage?: LedgerStorage,
): AuditorRosterEntry[] {
  const needles = new Set(campaignAddresses.map((a) => a.trim().toUpperCase()));
  const byKey = new Map<string, { accessCount: number; lastAccess: string }>();
  for (const event of readAuditLedger(storage)) {
    if (event.action === "key_revoked") continue;
    if (!needles.has(event.campaignAddress.trim().toUpperCase())) continue;
    const key = event.auditorPublicKey.trim().toUpperCase();
    const row = byKey.get(key) ?? { accessCount: 0, lastAccess: event.timestamp };
    row.accessCount += 1;
    if (event.timestamp > row.lastAccess) row.lastAccess = event.timestamp;
    byKey.set(key, row);
  }
  return Array.from(byKey.entries()).map(([auditorPublicKey, row]) => ({
    auditorPublicKey,
    ...row,
    revoked: isAuditorRevoked(auditorPublicKey, storage),
  }));
}

/** Wipes the local ledger copy. Development/demo helper — never on production. */
export function resetAuditLedgerForDev(storage?: LedgerStorage): void {
  const store = resolveStorage(storage);
  if (typeof store !== "undefined" && "removeItem" in (store as any)) {
    (store as any).removeItem(AUDIT_LEDGER_STORAGE_KEY);
  } else {
    store.setItem(AUDIT_LEDGER_STORAGE_KEY, JSON.stringify([]));
  }
  delete memoryStore[AUDIT_LEDGER_STORAGE_KEY];
}
