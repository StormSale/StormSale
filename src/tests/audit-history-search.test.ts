import { describe, expect, it } from "vitest";
import type { SettlementBatch } from "../utils/merkle";
import {
  createSettlementBatchIndex,
  findFirstSettlementBatchOnOrAfterDate,
  getSettlementBatchesInRange,
} from "../lib/auditor/auditHistorySearch";

const batches: SettlementBatch[] = [
  {
    batchId: "B3",
    campaignName: "Campaign 3",
    campaignAddress: "C3",
    ledgerSequence: 3,
    settledAt: "2026-10-03T10:00:00.000Z",
    contractRootHash: "h3",
    orders: [],
  },
  {
    batchId: "B1",
    campaignName: "Campaign 1",
    campaignAddress: "C1",
    ledgerSequence: 1,
    settledAt: "2026-10-01T10:00:00.000Z",
    contractRootHash: "h1",
    orders: [],
  },
  {
    batchId: "B2",
    campaignName: "Campaign 2",
    campaignAddress: "C2",
    ledgerSequence: 2,
    settledAt: "2026-10-02T10:00:00.000Z",
    contractRootHash: "h2",
    orders: [],
  },
];

describe("Auditor settlement block search", () => {
  const index = createSettlementBatchIndex(batches);

  it("returns inclusive block ranges in ascending order", () => {
    expect(getSettlementBatchesInRange(index, 2, 3).map((batch) => batch.ledgerSequence)).toEqual([
      2, 3,
    ]);
  });

  it("returns no entries for invalid or reversed ranges", () => {
    expect(getSettlementBatchesInRange(index, 3, 2)).toEqual([]);
    expect(getSettlementBatchesInRange(index, Number.NaN, 4)).toEqual([]);
  });

  it("jumps to the first settlement on or after the selected date", () => {
    expect(findFirstSettlementBatchOnOrAfterDate(index, "2026-10-02")?.ledgerSequence).toBe(2);
    expect(findFirstSettlementBatchOnOrAfterDate(index, "2026-10-04")).toBeUndefined();
  });
});
