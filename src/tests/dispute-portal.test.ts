/**
 * Dispute Submission Portal — domain logic suite (Issue #171)
 *
 * Covers: disputable-convention detection, form validation (empty evidence
 * description / missing order IDs / missing tx-hash linkage), deterministic
 * docket IDs, "Under Auditor Review" status transition, real AES-GCM evidence
 * sealing (never a fake cipher), durable store persistence, and the auditor
 * docket queue handoff (which fails loudly, never silently no-ops).
 */
import { describe, it, expect } from "vitest";
import {
  isDisputableConversion,
  validateDisputeSubmission,
  generateDocketId,
  createDisputeDocket,
  submitDispute,
  loadDisputes,
  appendDisputeToStore,
  createAuditorDocketQueueNotifier,
  readAuditorDocketQueue,
  attachmentByteLength,
  UNDER_AUDITOR_REVIEW,
  DISPUTE_STORE_KEY,
  AUDITOR_DOCKET_QUEUE_KEY,
  type DisputeSubmissionInput,
  type KvStore,
} from "../lib/affiliate/disputePortal";
import { decryptPayload, unwrapAESKey, getPublicKeyForAddress } from "../lib/crypto";

function makeMemoryKv(): KvStore & { dump: () => Record<string, string> } {
  const map: Record<string, string> = {};
  return {
    getItem: (key) => (key in map ? map[key] : null),
    setItem: (key, value) => {
      map[key] = String(value);
    },
    dump: () => ({ ...map }),
  };
}

const AUDITOR_ID = "AUDITOR_PROTOCOL_1";
const CONVERSION_TX = "3f9c1e77a0b5d2448c1e3a05f6b7d8c9e0f1a2b3c4d5e6f708192a3b4c5d6e7f";

function baseInput(overrides: Partial<DisputeSubmissionInput> = {}): DisputeSubmissionInput {
  return {
    conversion: {
      id: 4,
      affiliate: "GBBD...5678",
      txHash: CONVERSION_TX,
      disputeState: "contested",
    },
    evidenceDescription:
      "Merchant marked this conversion rejected, but the customer completed checkout twice; click log attached proves the referral order.",
    orderIds: ["ORD-10239"],
    attachments: [
      {
        name: "click-log.csv",
        type: "text/csv",
        dataBase64: btoa("ref,ts\nr1,123456"),
      },
    ],
    auditorIdentifier: AUDITOR_ID,
    submittedAt: "2026-10-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("isDisputableConversion (#171 AC1)", () => {
  it("treats contested and rejected conversions as disputable", () => {
    expect(isDisputableConversion({ disputeState: "contested" })).toBe(true);
    expect(isDisputableConversion({ disputeState: "rejected" })).toBe(true);
  });

  it("does not offer disputes for ordinary conversions", () => {
    expect(isDisputableConversion({})).toBe(false);
    expect(
      isDisputableConversion({ disputeState: "settled" as unknown as "contested" }),
    ).toBe(false);
  });
});

describe("validateDisputeSubmission (#171 AC2)", () => {
  it("accepts a complete submission", () => {
    expect(validateDisputeSubmission(baseInput())).toEqual([]);
  });

  it("rejects an empty evidence description", () => {
    const errors = validateDisputeSubmission(baseInput({ evidenceDescription: "   " }));
    expect(errors.some((e) => /evidence description/i.test(e))).toBe(true);
  });

  it("rejects a submission with no order IDs", () => {
    const errors = validateDisputeSubmission(baseInput({ orderIds: [] }));
    expect(errors.some((e) => /order id/i.test(e))).toBe(true);
  });

  it("ignores blank order ID entries", () => {
    const errors = validateDisputeSubmission(baseInput({ orderIds: ["  ", ""] }));
    expect(errors.some((e) => /order id/i.test(e))).toBe(true);
  });

  it("requires the dispute to be linked to a conversion transaction hash", () => {
    const input = baseInput();
    const errors = validateDisputeSubmission({
      ...input,
      conversion: { ...input.conversion, txHash: undefined },
    });
    expect(errors.some((e) => /transaction hash/i.test(e))).toBe(true);
  });

  it("requires the conversion itself to be contested or rejected", () => {
    const input = baseInput();
    const errors = validateDisputeSubmission({
      ...input,
      conversion: { ...input.conversion, disputeState: undefined },
    });
    expect(errors.some((e) => /contested or rejected/i.test(e))).toBe(true);
  });

  it("rejects oversized attachment payloads", () => {
    const errors = validateDisputeSubmission(
      baseInput({
        attachments: [{ name: "huge.png", type: "image/png", dataBase64: "A".repeat(2_800_001) }],
      }),
    );
    expect(errors.some((e) => /attachment/i.test(e) && /too large/i.test(e))).toBe(true);
  });

  it("rejects attachments without a filename or payload", () => {
    const errors = validateDisputeSubmission(
      baseInput({ attachments: [{ name: " ", type: "text/csv", dataBase64: "" }] }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("generateDocketId (#171 AC3)", () => {
  it("is deterministic for identical inputs and has a stable, non-random shape", async () => {
    const seed = {
      conversionId: "4",
      affiliate: "GBBD...5678",
      txHash: CONVERSION_TX,
      submittedAt: "2026-10-20T10:00:00.000Z",
    };
    const first = await generateDocketId(seed);
    const second = await generateDocketId(seed);
    expect(first).toBe(second);
    expect(first).toMatch(/^DSP-202610-[0-9A-F]{16}$/);
  });

  it("binds the docket identity to the conversion tx hash", async () => {
    const seed = {
      conversionId: "4",
      affiliate: "GBBD...5678",
      txHash: CONVERSION_TX,
      submittedAt: "2026-10-20T10:00:00.000Z",
    };
    const other = await generateDocketId({ ...seed, txHash: CONVERSION_TX.replace(/^3f/, "ab") });
    expect(other).not.toBe(await generateDocketId(seed));
  });
});

describe("createDisputeDocket (#171 AC2 + AC3)", () => {
  it("transitions a valid submission to Under Auditor Review with a docket ID and tx-hash linkage", async () => {
    const docket = await createDisputeDocket(baseInput());
    expect(docket.status).toBe("under_auditor_review");
    expect(docket.statusLabel).toBe(UNDER_AUDITOR_REVIEW);
    expect(docket.statusLabel).toBe("Under Auditor Review");
    expect(docket.docketId).toMatch(/^DSP-202610-[0-9A-F]{16}$/);
    expect(docket.txHash).toBe(CONVERSION_TX);
    expect(docket.conversionId).toBe("4");
    expect(docket.submittedAt).toBe("2026-10-20T10:00:00.000Z");
  });

  it("throws a validation error for an incomplete submission", async () => {
    await expect(
      createDisputeDocket(baseInput({ evidenceDescription: "", orderIds: [] })),
    ).rejects.toThrow(/evidence description/i);
  });

  it("seals evidence with real AES-GCM: ciphertext contains no plaintext and the auditor key opens it", async () => {
    const input = baseInput();
    const docket = await createDisputeDocket(input);

    // The stored envelope is an opaque base64 blob; no plaintext leakage.
    expect(docket.evidenceEnvelope).not.toContain("checkout twice");
    expect(docket.wrappedEvidenceKey.length).toBeGreaterThan(0);

    const auditorKeyId = await getPublicKeyForAddress(AUDITOR_ID);
    const evidenceKey = await unwrapAESKey(docket.wrappedEvidenceKey, auditorKeyId);
    const plaintext = (await decryptPayload(docket.evidenceEnvelope, evidenceKey)) as {
      evidenceDescription: string;
      orderIds: string[];
      attachments: Array<{ name: string; dataBase64: string }>;
      txHash: string;
    };
    expect(plaintext.evidenceDescription).toBe(input.evidenceDescription);
    expect(plaintext.orderIds).toEqual(["ORD-10239"]);
    expect(plaintext.txHash).toBe(CONVERSION_TX);
    expect(plaintext.attachments[0].name).toBe("click-log.csv");
    expect(atob(plaintext.attachments[0].dataBase64)).toBe("ref,ts\nr1,123456");
  });

  it("evidence is not decryptable by the wrong auditor identifier", async () => {
    const docket = await createDisputeDocket(baseInput());
    await expect(
      unwrapAESKey(docket.wrappedEvidenceKey, await getPublicKeyForAddress("SOMEONE_ELSE")),
    ).rejects.toThrow();
  });

  it("keeps a non-sensitive attachment manifest for auditor triage", async () => {
    const docket = await createDisputeDocket(baseInput());
    expect(docket.attachmentManifest).toHaveLength(1);
    expect(docket.attachmentManifest[0].name).toBe("click-log.csv");
    expect(docket.attachmentManifest[0].sizeBytes).toBe(16);
    expect(docket.attachmentManifest[0]).not.toHaveProperty("dataBase64");
  });
});

describe("attachmentByteLength", () => {
  it("computes decoded size from base64 padding", () => {
    const b64 = (s: string) => btoa(s);
    expect(attachmentByteLength(b64("a"))).toBe(1);
    expect(attachmentByteLength(b64("ab"))).toBe(2);
    expect(attachmentByteLength(b64("abc"))).toBe(3);
  });
});

describe("submitDispute: durable store + auditor handoff (#171 AC3)", () => {
  it("persists the docket and enqueues a real auditor notification event", async () => {
    const store = makeMemoryKv();
    const notifier = createAuditorDocketQueueNotifier(store);
    const docket = await submitDispute(baseInput(), { store, notifier });

    const stored = loadDisputes(store);
    expect(stored.map((d) => d.docketId)).toEqual([docket.docketId]);

    const queue = readAuditorDocketQueue(store);
    expect(queue).toHaveLength(1);
    expect(queue[0].docketId).toBe(docket.docketId);
    expect(queue[0].status).toBe("under_auditor_review");
    expect(queue[0].txHash).toBe(CONVERSION_TX);
    expect(store.dump()[DISPUTE_STORE_KEY]).toBeTruthy();
    expect(store.dump()[AUDITOR_DOCKET_QUEUE_KEY]).toBeTruthy();
  });

  it("appends multiple disputes without clobbering earlier dockets and dedupes re-submission", async () => {
    const store = makeMemoryKv();
    const notifier = createAuditorDocketQueueNotifier(store);
    const a = await submitDispute(baseInput(), { store, notifier });
    const b = await submitDispute(
      baseInput({
        conversion: { ...baseInput().conversion, id: 5, txHash: CONVERSION_TX.replace(/^3f/, "99") },
        submittedAt: "2026-10-20T11:00:00.000Z",
      }),
      { store, notifier },
    );
    expect(loadDisputes(store).map((d) => d.docketId)).toEqual([a.docketId, b.docketId]);
    appendDisputeToStore(store, a);
    expect(loadDisputes(store)).toHaveLength(2);
    expect(readAuditorDocketQueue(store)).toHaveLength(2);
  });

  it("fails loudly when no auditor store is available instead of silently dropping the notification", async () => {
    const store = makeMemoryKv();
    const brokenNotifier = createAuditorDocketQueueNotifier({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage full");
      },
    });
    await expect(
      submitDispute(baseInput(), { store, notifier: brokenNotifier }),
    ).rejects.toThrow(/auditor/i);
  });
});
