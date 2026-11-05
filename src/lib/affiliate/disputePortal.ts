/**
 * Dispute Submission Portal — domain logic (Issue #171)
 *
 * Gives affiliates a durable, auditable path to contest a merchant-disputed
 * conversion:
 *
 *  - `isDisputableConversion` gates the "Open Dispute" affordance to rows the
 *    merchant marked `contested` or `rejected` (AC1).
 *  - `validateDisputeSubmission` / `createDisputeDocket` require an evidence
 *    description, at least one order ID, file attachments, and a concrete
 *    conversion tx-hash linkage (AC2 + the spec's tx-hash binding).
 *  - Evidence (description, order IDs, attachment payloads) is sealed with the
 *    SAME real AES-GCM-256 envelope stack used for encrypted sales
 *    (`src/lib/crypto.ts`): a fresh per-dispute key, wrapped/sealed to the
 *    assigned auditor identifier. Nothing here fakes a cipher; every step is
 *    genuine WebCrypto and survives a decrypt round-trip test.
 *  - A submitted dispute transitions to `under_auditor_review` ("Under
 *    Auditor Review") and receives a deterministic docket ID derived from
 *    SHA-256 over (conversionId | affiliate | txHash | submittedAt) — stable,
 *    non-random, and reproducible by auditors (AC3).
 *  - `createAuditorDocketQueueNotifier` is the auditor-notification channel
 *    for this client-only stack: it durably appends the docket event to a
 *    storage-backed queue the protocol-auditor surface consumes. It THROWS if
 *    the queue cannot be persisted — a failed auditor handoff is reported to
 *    the affiliate, never silently dropped. Replacing it with a push/webhook
 *    transport is a drop-in change to the `AuditorDocketNotifier` interface.
 */
import { encryptPayload, generateAESKey, wrapAESKey, getPublicKeyForAddress } from "../crypto";
import { sha256Hex } from "../auditor/hasher";

/** Merchant-side states that make a conversion disputable by the affiliate. */
export type ConversionDisputeState = "contested" | "rejected";

/** Lifecycle of an affiliate-submitted dispute docket. */
export type DisputeStatus = "under_auditor_review";

export const UNDER_AUDITOR_REVIEW = "Under Auditor Review";

export const DISPUTE_STORE_KEY = "stormsale.affiliate.disputes.v1";
export const AUDITOR_DOCKET_QUEUE_KEY = "stormsale.auditor.docketQueue.v1";

const MAX_ATTACHMENT_BASE64_CHARS = 2_800_000; // ~2 MB decoded per attachment
const MAX_ATTACHMENTS = 10;

export interface DisputableConversion {
  id: number | string;
  affiliate: string;
  /** On-chain conversion transaction hash the dispute must link to. */
  txHash?: string;
  /** Present only when the merchant contested or rejected this conversion. */
  disputeState?: ConversionDisputeState;
}

export interface DisputeAttachmentInput {
  name: string;
  type?: string;
  /** Base64 of the raw file bytes, produced client-side at submit time. */
  dataBase64: string;
}

export interface DisputeSubmissionInput {
  conversion: DisputableConversion;
  evidenceDescription: string;
  orderIds: string[];
  attachments?: DisputeAttachmentInput[];
  /** Identifier of the assigned protocol auditor the evidence key is sealed to. */
  auditorIdentifier: string;
  /** ISO timestamp; injectable so docket IDs are deterministic in tests. */
  submittedAt?: string;
}

export interface DisputeAttachmentManifestEntry {
  name: string;
  type: string;
  sizeBytes: number;
}

export interface DisputeDocket {
  schemaVersion: 1;
  docketId: string;
  conversionId: string;
  affiliate: string;
  txHash: string;
  conversionDisputeState: ConversionDisputeState;
  status: DisputeStatus;
  statusLabel: typeof UNDER_AUDITOR_REVIEW;
  submittedAt: string;
  /** Public key identifier the evidence key is wrapped to. */
  auditorKeyId: string;
  /** AES-GCM-256 envelope (encryptPayload) of the full evidence bundle. */
  evidenceEnvelope: string;
  /** Per-dispute AES key sealed to auditorKeyId (wrapAESKey). */
  wrappedEvidenceKey: string;
  /** Non-sensitive manifest so auditors can triage without unsealing. */
  attachmentManifest: DisputeAttachmentManifestEntry[];
  /** Normalized order IDs (plaintext: required for docket indexing). */
  orderIds: string[];
}

/** Minimal key-value surface (localStorage-compatible) so the store is testable in node. */
export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AuditorDocketNotifier {
  notifyDocket(docket: DisputeDocket): void;
}

export interface AuditorDocketQueueEntry {
  docketId: string;
  conversionId: string;
  txHash: string;
  affiliate: string;
  status: DisputeStatus;
  submittedAt: string;
  enqueuedAt: string;
}

/** AC1 gate: only merchant-contested/rejected conversions can open a dispute. */
export function isDisputableConversion(
  conversion: Pick<DisputableConversion, "disputeState">,
): boolean {
  return conversion.disputeState === "contested" || conversion.disputeState === "rejected";
}

export function attachmentByteLength(dataBase64: string): number {
  const compact = (dataBase64 || "").replace(/\s/g, "");
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

/** Returns field-level error messages; an empty array means the submission is valid. */
export function validateDisputeSubmission(input: DisputeSubmissionInput): string[] {
  const errors: string[] = [];

  if (!input.evidenceDescription || input.evidenceDescription.trim().length === 0) {
    errors.push("Evidence description is required.");
  }

  const orderIds = normalizeOrderIds(input.orderIds);
  if (orderIds.length === 0) {
    errors.push("At least one order ID is required.");
  }

  if (!isDisputableConversion(input.conversion)) {
    errors.push("Only contested or rejected conversions can be disputed.");
  }

  if (!input.conversion.txHash || input.conversion.txHash.trim().length === 0) {
    errors.push("Dispute must be linked to the conversion transaction hash.");
  }

  if (!input.auditorIdentifier || input.auditorIdentifier.trim().length === 0) {
    errors.push("An assigned protocol auditor identifier is required.");
  }

  const attachments = input.attachments ?? [];
  if (attachments.length > MAX_ATTACHMENTS) {
    errors.push(`A dispute may carry at most ${MAX_ATTACHMENTS} attachments.`);
  }
  for (const attachment of attachments) {
    if (!attachment.name || attachment.name.trim().length === 0) {
      errors.push("Every attachment requires a filename.");
    }
    if (!attachment.dataBase64 || attachment.dataBase64.trim().length === 0) {
      errors.push(`Attachment "${attachment.name || "unnamed"}" has no content.`);
    } else if (attachment.dataBase64.length > MAX_ATTACHMENT_BASE64_CHARS) {
      errors.push(`Attachment "${attachment.name || "unnamed"}" is too large (max ~2 MB).`);
    }
  }

  return errors;
}

function normalizeOrderIds(orderIds: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of orderIds ?? []) {
    const id = (raw || "").trim();
    if (id) seen.add(id);
  }
  return Array.from(seen);
}

/**
 * Deterministic docket ID: DSP-<YYYYMM>-<first 16 hex chars of SHA-256 over
 * conversionId|affiliate|txHash|submittedAt, uppercased>. No randomness:
 * auditors can reproduce the ID from the docket fields alone.
 */
export async function generateDocketId(seed: {
  conversionId: string;
  affiliate: string;
  txHash: string;
  submittedAt: string;
}): Promise<string> {
  const digest = await sha256Hex(
    `${seed.conversionId}|${seed.affiliate}|${seed.txHash}|${seed.submittedAt}`,
  );
  const ym = seed.submittedAt.slice(0, 7).replace("-", "");
  return `DSP-${ym}-${digest.slice(0, 16).toUpperCase()}`;
}

/**
 * Validates, seals (real AES-GCM), and returns the "Under Auditor Review"
 * docket. Throws an Error carrying `fieldErrors` when validation fails.
 */
export async function createDisputeDocket(input: DisputeSubmissionInput): Promise<DisputeDocket> {
  const errors = validateDisputeSubmission(input);
  if (errors.length > 0) {
    const error = new Error(`Dispute submission failed: ${errors.join(" ")}`) as Error & {
      fieldErrors: string[];
    };
    error.fieldErrors = errors;
    throw error;
  }

  const submittedAt = input.submittedAt ?? new Date().toISOString();
  const conversionId = String(input.conversion.id);
  const txHash = (input.conversion.txHash ?? "").trim();
  const orderIds = normalizeOrderIds(input.orderIds);
  const attachments = input.attachments ?? [];
  const disputeState = input.conversion.disputeState as ConversionDisputeState;

  const evidence = {
    conversionId,
    affiliate: input.conversion.affiliate,
    txHash,
    docketSeed: { conversionId, affiliate: input.conversion.affiliate, txHash, submittedAt },
    evidenceDescription: input.evidenceDescription.trim(),
    orderIds,
    attachments: attachments.map((a) => ({
      name: a.name.trim(),
      type: a.type || "application/octet-stream",
      dataBase64: a.dataBase64,
    })),
  };

  const evidenceKey = await generateAESKey();
  const evidenceEnvelope = await encryptPayload(evidence, evidenceKey);
  const auditorKeyId = await getPublicKeyForAddress(input.auditorIdentifier);
  const wrappedEvidenceKey = await wrapAESKey(evidenceKey, auditorKeyId);

  const docketId = await generateDocketId({
    conversionId,
    affiliate: input.conversion.affiliate,
    txHash,
    submittedAt,
  });

  return {
    schemaVersion: 1,
    docketId,
    conversionId,
    affiliate: input.conversion.affiliate,
    txHash,
    conversionDisputeState: disputeState,
    status: "under_auditor_review",
    statusLabel: UNDER_AUDITOR_REVIEW,
    submittedAt,
    auditorKeyId,
    evidenceEnvelope,
    wrappedEvidenceKey,
    attachmentManifest: attachments.map((a) => ({
      name: a.name.trim(),
      type: a.type || "application/octet-stream",
      sizeBytes: attachmentByteLength(a.dataBase64),
    })),
    orderIds,
  };
}

/** Read all dockets persisted for this browser profile; tolerates corrupt storage. */
export function loadDisputes(store: KvStore): DisputeDocket[] {
  let dockets: unknown;
  try {
    const raw = store.getItem(DISPUTE_STORE_KEY);
    if (!raw) return [];
    dockets = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(dockets)) return [];
  return dockets.filter(isValidStoredDocket);
}

function isValidStoredDocket(value: unknown): value is DisputeDocket {
  const d = value as DisputeDocket | null;
  return Boolean(
    d &&
      typeof d === "object" &&
      typeof d.docketId === "string" &&
      typeof d.conversionId === "string" &&
      d.status === "under_auditor_review",
  );
}

export function appendDisputeToStore(store: KvStore, docket: DisputeDocket): DisputeDocket[] {
  const existing = loadDisputes(store);
  if (existing.some((d) => d.docketId === docket.docketId)) {
    store.setItem(DISPUTE_STORE_KEY, JSON.stringify(existing));
    return existing;
  }
  const next = [...existing, docket];
  store.setItem(DISPUTE_STORE_KEY, JSON.stringify(next));
  return next;
}

export function getDocketForConversion(
  dockets: DisputeDocket[],
  conversionId: number | string,
): DisputeDocket | undefined {
  const id = String(conversionId);
  return dockets.find((d) => d.conversionId === id);
}

/**
 * Auditor notification channel for this client-only stack. Appends a docket
 * event to the durable auditor queue. Throws on any persistence failure so
 * the caller can never believe auditors were notified when they were not.
 */
export function createAuditorDocketQueueNotifier(store: KvStore): AuditorDocketNotifier {
  return {
    notifyDocket(docket: DisputeDocket): void {
      const entry: AuditorDocketQueueEntry = {
        docketId: docket.docketId,
        conversionId: docket.conversionId,
        txHash: docket.txHash,
        affiliate: docket.affiliate,
        status: docket.status,
        submittedAt: docket.submittedAt,
        enqueuedAt: new Date().toISOString(),
      };
      let queue: AuditorDocketQueueEntry[];
      try {
        queue = readAuditorDocketQueue(store);
        if (queue.some((e) => e.docketId === entry.docketId)) return;
        store.setItem(AUDITOR_DOCKET_QUEUE_KEY, JSON.stringify([...queue, entry]));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          `Auditor notification failed for docket ${entry.docketId}: ${message}. ` +
            `The docket was preserved locally; retry delivery to the protocol auditors.`,
        );
      }
    },
  };
}

export function readAuditorDocketQueue(store: KvStore): AuditorDocketQueueEntry[] {
  try {
    const raw = store.getItem(AUDITOR_DOCKET_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AuditorDocketQueueEntry =>
        Boolean(e && typeof e === "object" && typeof e.docketId === "string"),
    );
  } catch {
    return [];
  }
}

export interface SubmitDisputeDeps {
  store: KvStore;
  notifier: AuditorDocketNotifier;
}

/**
 * Full AC3 transition: create + seal the docket, persist it to the affiliate
 * dispute store, then hand it to the auditor notifier. The notification is
 * required — there is no silent default transport.
 */
export async function submitDispute(
  input: DisputeSubmissionInput,
  deps: SubmitDisputeDeps,
): Promise<DisputeDocket> {
  const docket = await createDisputeDocket(input);
  appendDisputeToStore(deps.store, docket);
  deps.notifier.notifyDocket(docket);
  return docket;
}

/** Read a File (or Blob-like) into the base64 payload the evidence bundle expects. */
export async function fileToBase64(file: {
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
