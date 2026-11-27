import type { rpc } from "@stellar/stellar-sdk";
import { CONTRACT_ADDRESSES } from "../../config/contracts";
import { rpcFallbackManager } from "../rpcFallback";

export const MAX_LEDGER_RANGE = 10_000;
export const LEDGER_PAGE_SIZE = 1000;

export interface LedgerRange {
  fromBlock: number;
  toBlock: number;
}

export interface ContractAuditEvent {
  id: string;
  ledger: number;
  closedAt: string;
  transactionHash: string;
  type: string;
  contractId?: string;
}

export class BlockRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockRangeError";
  }
}

export function normalizeLedgerRange(fromBlock: number, toBlock: number): LedgerRange {
  if (
    !Number.isSafeInteger(fromBlock) ||
    !Number.isSafeInteger(toBlock) ||
    fromBlock < 1 ||
    toBlock < fromBlock
  ) {
    throw new BlockRangeError("Enter whole block numbers with the start no later than the end.");
  }
  if (toBlock - fromBlock + 1 > MAX_LEDGER_RANGE) {
    throw new BlockRangeError(
      `A range can contain at most ${MAX_LEDGER_RANGE.toLocaleString()} blocks.`,
    );
  }
  return { fromBlock, toBlock };
}

export function recordInLedgerRange(blockNumber: number, range?: LedgerRange | null): boolean {
  return !range || (blockNumber >= range.fromBlock && blockNumber <= range.toBlock);
}

export async function queryContractEventsInRange(
  range: LedgerRange,
): Promise<ContractAuditEvent[]> {
  const normalized = normalizeLedgerRange(range.fromBlock, range.toBlock);
  const filters = [
    { type: "contract" as const, contractIds: [CONTRACT_ADDRESSES.CAMPAIGN_ESCROW] },
  ];

  return rpcFallbackManager.executeWithFallback(async (server: rpc.Server) => {
    const eventsById = new Map<string, ContractAuditEvent>();
    let nextLedger = normalized.fromBlock;

    while (nextLedger <= normalized.toBlock) {
      const chunkEnd = Math.min(nextLedger + LEDGER_PAGE_SIZE - 1, normalized.toBlock);
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      let chunkComplete = false;

      while (!chunkComplete) {
        const page = cursor
          ? await server.getEvents({ filters, cursor, limit: LEDGER_PAGE_SIZE })
          : await server.getEvents({
              filters,
              startLedger: nextLedger,
              endLedger: chunkEnd,
              limit: LEDGER_PAGE_SIZE,
            });

        if (page.cursor && seenCursors.has(page.cursor)) {
          throw new Error("The RPC node repeated an event pagination cursor.");
        }
        if (page.cursor) seenCursors.add(page.cursor);

        const chunkEvents = page.events.filter(
          (event) => event.ledger >= nextLedger && event.ledger <= chunkEnd,
        );
        for (const event of chunkEvents) {
          eventsById.set(event.id, {
            id: event.id,
            ledger: event.ledger,
            closedAt: event.ledgerClosedAt,
            transactionHash: event.txHash,
            type: event.type,
            contractId: event.contractId ? String(event.contractId) : undefined,
          });
        }

        const lastLedger = chunkEvents.at(-1)?.ledger;
        chunkComplete =
          page.events.length < LEDGER_PAGE_SIZE ||
          (lastLedger !== undefined && lastLedger > chunkEnd);
        if (!chunkComplete && !page.cursor) {
          throw new Error("The RPC node returned a full page without a pagination cursor.");
        }
        cursor = page.cursor;
      }
      nextLedger = chunkEnd + 1;
    }

    return [...eventsById.values()].sort(
      (a, b) => a.ledger - b.ledger || a.transactionHash.localeCompare(b.transactionHash),
    );
  });
}

interface HorizonLedger {
  sequence: string;
  closed_at: string;
}

async function fetchLedger(sequence: number): Promise<HorizonLedger> {
  const response = await rpcFallbackManager.executeHorizonFetchWithFallback(
    (base) => `${base}/ledgers?order=asc&limit=1&cursor=${sequence}`,
  );
  if (!response.ok) throw new Error(`Horizon returned HTTP ${response.status}.`);
  const data = (await response.json()) as { _embedded?: { records?: HorizonLedger[] } };
  const ledger = data._embedded?.records?.[0];
  if (!ledger || Number(ledger.sequence) !== sequence) {
    throw new Error(`Ledger ${sequence} is unavailable.`);
  }
  return ledger;
}

export async function resolveDateToLedger(date: string): Promise<number> {
  const targetTime = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(targetTime) ||
    new Date(targetTime).toISOString().slice(0, 10) !== date
  ) {
    throw new BlockRangeError("Choose a valid date.");
  }

  const response = await rpcFallbackManager.executeHorizonFetchWithFallback(
    (base) => `${base}/ledgers?order=desc&limit=1`,
  );
  if (!response.ok) throw new Error(`Horizon returned HTTP ${response.status}.`);
  const data = (await response.json()) as { _embedded?: { records?: HorizonLedger[] } };
  const latest = data._embedded?.records?.[0];
  if (!latest) throw new Error("No ledgers are available.");
  const latestSequence = Number(latest.sequence);
  if (targetTime >= Date.parse(latest.closed_at)) return latestSequence;

  let low = 1;
  let high = latestSequence;
  let best = 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const ledger = await fetchLedger(middle);
    if (Date.parse(ledger.closed_at) <= targetTime) {
      best = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}
