import { describe, it, expect } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import {
  appendAuditAccessEvent,
  readAuditLedger,
  verifyAuditChain,
  revokeAuditorKey,
  isAuditorRevoked,
  getAccessLogsForCampaign,
  getAccessLogsForAuditor,
  getAuditorsForCampaigns,
  computeEventHash,
  resetAuditLedgerForDev,
  canonicalizeEvent,
  GENESIS_HASH,
  AUDIT_LEDGER_STORAGE_KEY,
  type AuditAccessEvent,
} from "../lib/auditLedger";

function makeStorage() {
  const map: Record<string, string> = {};
  return {
    getItem: (key: string) => map[key] ?? null,
    setItem: (key: string, value: string) => {
      map[key] = value;
    },
    removeItem: (key: string) => {
      delete map[key];
    },
    _dump: () => map,
  };
}

const AUDITOR_1 = Keypair.random().publicKey();
const AUDITOR_2 = Keypair.random().publicKey();
const CAMPAIGN_A = "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1";
const CAMPAIGN_B = "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2";

async function seedThreeEvents(storage = makeStorage()) {
  await appendAuditAccessEvent(
    {
      action: "access_granted",
      auditorPublicKey: AUDITOR_1,
      saleId: "1042",
      campaignAddress: CAMPAIGN_A,
      timestamp: "2026-10-01T10:00:00.000Z",
    },
    storage,
  );
  await appendAuditAccessEvent(
    {
      action: "payload_decrypted",
      auditorPublicKey: AUDITOR_1,
      saleId: "1042",
      campaignAddress: CAMPAIGN_A,
      timestamp: "2026-10-01T10:05:00.000Z",
    },
    storage,
  );
  await appendAuditAccessEvent(
    {
      action: "access_denied",
      auditorPublicKey: AUDITOR_2,
      saleId: "1100",
      campaignAddress: CAMPAIGN_B,
      timestamp: "2026-10-02T09:30:00.000Z",
    },
    storage,
  );
  return storage;
}

describe("Append-Only Cryptographic Access Ledger (#182)", () => {
  it("anchors the first entry to the genesis hash and chains subsequent digests", async () => {
    const storage = await seedThreeEvents();
    const ledger = readAuditLedger(storage);

    expect(ledger).toHaveLength(3);
    expect(ledger[0].sequence).toBe(0);
    expect(ledger[0].prevHash).toBe(GENESIS_HASH);
    expect(ledger[1].prevHash).toBe(ledger[0].eventHash);
    expect(ledger[2].prevHash).toBe(ledger[1].eventHash);
    expect(new Set(ledger.map((e) => e.eventHash)).size).toBe(3);
  });

  it("records auditor public key, decrypted record id and timestamp on every event", async () => {
    const storage = makeStorage();
    const event = await appendAuditAccessEvent(
      {
        action: "payload_decrypted",
        auditorPublicKey: AUDITOR_1,
        saleId: "988",
        campaignAddress: CAMPAIGN_A,
        timestamp: "2026-10-03T12:00:00.000Z",
      },
      storage,
    );
    expect(event.auditorPublicKey).toBe(AUDITOR_1);
    expect(event.saleId).toBe("988");
    expect(event.timestamp).toBe("2026-10-03T12:00:00.000Z");
    expect(event.action).toBe("payload_decrypted");
  });

  it("verifies an untouched chain end-to-end", async () => {
    const storage = await seedThreeEvents();
    const check = await verifyAuditChain(readAuditLedger(storage));
    expect(check.valid).toBe(true);
    expect(check.length).toBe(3);
    expect(check.headHash).toHaveLength(64);
  });

  it("detects a silently edited historical entry (tamper evidence)", async () => {
    const storage = await seedThreeEvents();
    const ledger = readAuditLedger(storage);
    // Attacker rewrites saleId on entry #1 to cover their tracks
    const forged: AuditAccessEvent[] = ledger.map((e) =>
      e.sequence === 1 ? { ...e, saleId: "999999" } : e,
    );
    storage.setItem(AUDIT_LEDGER_STORAGE_KEY, JSON.stringify(forged));

    const check = await verifyAuditChain(readAuditLedger(storage));
    expect(check.valid).toBe(false);
    expect(check.brokenAtSequence).toBe(1);
    expect(check.reason).toMatch(/digest/i);
  });

  it("detects removal of a middle entry via broken prev-hash links", async () => {
    const storage = await seedThreeEvents();
    const ledger = readAuditLedger(storage);
    storage.setItem(
      AUDIT_LEDGER_STORAGE_KEY,
      JSON.stringify(ledger.filter((e) => e.sequence !== 1)),
    );

    const check = await verifyAuditChain(readAuditLedger(storage));
    expect(check.valid).toBe(false);
    expect(check.brokenAtSequence).toBeDefined();
  });

  it("refuses to append onto a ledger that already fails verification", async () => {
    const storage = await seedThreeEvents();
    const ledger = readAuditLedger(storage);
    const forged = ledger.map((e) =>
      e.sequence === 0 ? { ...e, auditorPublicKey: Keypair.random().publicKey() } : e,
    );
    storage.setItem(AUDIT_LEDGER_STORAGE_KEY, JSON.stringify(forged));

    await expect(
      appendAuditAccessEvent(
        {
          action: "access_granted",
          auditorPublicKey: AUDITOR_2,
          saleId: "1200",
          campaignAddress: CAMPAIGN_A,
        },
        storage,
      ),
    ).rejects.toThrow(/chain integrity/i);
  });

  it("produces stable digests for identical canonical content", async () => {
    const base = {
      sequence: 0,
      action: "access_granted" as const,
      auditorPublicKey: AUDITOR_1,
      saleId: "1",
      campaignAddress: CAMPAIGN_A,
      timestamp: "2026-01-01T00:00:00.000Z",
      prevHash: GENESIS_HASH,
    };
    expect(await computeEventHash(base)).toBe(await computeEventHash({ ...base }));
    expect(canonicalizeEvent(base)).toEqual(canonicalizeEvent({ ...base }));
    expect(await computeEventHash({ ...base, timestamp: "2026-01-02T00:00:00.000Z" })).not.toBe(
      await computeEventHash(base),
    );
  });
});

describe("Cryptographic Session & Key Revocation (#182)", () => {
  it("active keys pass the revocation gate until revoked", async () => {
    const storage = await seedThreeEvents();
    expect(isAuditorRevoked(AUDITOR_1, storage)).toBe(false);

    const revocation = await revokeAuditorKey(AUDITOR_1, "laptop stolen", "merchant-portal", storage);
    expect(revocation.action).toBe("key_revoked");
    expect(isAuditorRevoked(AUDITOR_1, storage)).toBe(true);
    // Other auditors are unaffected
    expect(isAuditorRevoked(AUDITOR_2, storage)).toBe(false);
  });

  it("revocation events stay inside the verified chain", async () => {
    const storage = await seedThreeEvents();
    await revokeAuditorKey(AUDITOR_2, "suspected leak", "merchant-portal", storage);
    const check = await verifyAuditChain(readAuditLedger(storage));
    expect(check.valid).toBe(true);
    expect(check.length).toBe(4);
  });

  it("revocation is case-insensitive on the key and rejects unknown keys", async () => {
    const storage = await seedThreeEvents();
    await revokeAuditorKey(AUDITOR_1, "test", "portal", storage);
    expect(isAuditorRevoked(AUDITOR_1.toLowerCase(), storage)).toBe(true);
    expect(isAuditorRevoked("", storage)).toBe(false);
    expect(isAuditorRevoked(Keypair.random().publicKey(), storage)).toBe(false);
  });
});

describe("Merchant Transparency Scoping (#182)", () => {
  it("returns only events belonging to the requested campaign", async () => {
    const storage = await seedThreeEvents();
    const logsA = getAccessLogsForCampaign(CAMPAIGN_A, storage);
    const logsB = getAccessLogsForCampaign(CAMPAIGN_B, storage);
    expect(logsA.map((l) => l.saleId)).toEqual(["1042", "1042"]);
    expect(logsB).toHaveLength(1);
    expect(logsB[0].auditorPublicKey).toBe(AUDITOR_2);
  });

  it("gives auditors their own inspection history", async () => {
    const storage = await seedThreeEvents();
    const mine = getAccessLogsForAuditor(AUDITOR_1, storage);
    expect(mine).toHaveLength(2);
    expect(mine.every((e) => e.auditorPublicKey === AUDITOR_1)).toBe(true);
  });

  it("aggregates the auditor roster with access counts and revoked flags", async () => {
    const storage = await seedThreeEvents();
    await revokeAuditorKey(AUDITOR_1, "compromised", "merchant", storage);
    const roster = getAuditorsForCampaigns([CAMPAIGN_A, CAMPAIGN_B], storage);
    expect(roster).toHaveLength(2);
    const a1 = roster.find((r) => r.auditorPublicKey === AUDITOR_1)!;
    const a2 = roster.find((r) => r.auditorPublicKey === AUDITOR_2)!;
    expect(a1.accessCount).toBe(2);
    expect(a1.revoked).toBe(true);
    expect(a2.accessCount).toBe(1);
    expect(a2.revoked).toBe(false);
  });

  it("dev reset wipes the local ledger copy without throwing", async () => {
    const storage = await seedThreeEvents();
    resetAuditLedgerForDev(storage);
    expect(readAuditLedger(storage)).toEqual([]);
  });
});
