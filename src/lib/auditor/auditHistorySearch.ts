import type { SettlementBatch } from "../../utils/merkle";

export interface SettlementBatchIndex {
  bySequence: SettlementBatch[];
  byTimestamp: SettlementBatch[];
}

export function createSettlementBatchIndex(batches: SettlementBatch[]): SettlementBatchIndex {
  return {
    bySequence: [...batches].sort((left, right) => left.ledgerSequence - right.ledgerSequence),
    byTimestamp: [...batches].sort(
      (left, right) => Date.parse(left.settledAt) - Date.parse(right.settledAt),
    ),
  };
}

function lowerBoundBySequence(batches: SettlementBatch[], sequence: number): number {
  let low = 0;
  let high = batches.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (batches[middle].ledgerSequence < sequence) low = middle + 1;
    else high = middle;
  }

  return low;
}

export function getSettlementBatchesInRange(
  index: SettlementBatchIndex,
  startSequence: number,
  endSequence: number,
): SettlementBatch[] {
  if (
    !Number.isFinite(startSequence) ||
    !Number.isFinite(endSequence) ||
    startSequence > endSequence
  ) {
    return [];
  }

  const start = lowerBoundBySequence(index.bySequence, startSequence);
  const end = lowerBoundBySequence(index.bySequence, endSequence + 1);
  return index.bySequence.slice(start, end);
}

export function findFirstSettlementBatchOnOrAfterDate(
  index: SettlementBatchIndex,
  date: string,
): SettlementBatch | undefined {
  const target = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(target)) return undefined;

  let low = 0;
  let high = index.byTimestamp.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (Date.parse(index.byTimestamp[middle].settledAt) < target) low = middle + 1;
    else high = middle;
  }

  return index.byTimestamp[low];
}
