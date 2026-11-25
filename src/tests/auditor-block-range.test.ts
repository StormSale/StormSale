import { beforeEach, describe, expect, it, vi } from "vitest";
import type { rpc } from "@stellar/stellar-sdk";

const mocks = vi.hoisted(() => ({
  executeWithFallback: vi.fn(),
  executeHorizonFetchWithFallback: vi.fn(),
  getEvents: vi.fn(),
}));

vi.mock("../lib/rpcFallback", () => ({
  rpcFallbackManager: {
    executeWithFallback: mocks.executeWithFallback,
    executeHorizonFetchWithFallback: mocks.executeHorizonFetchWithFallback,
  },
}));

import {
  BlockRangeError,
  LEDGER_PAGE_SIZE,
  MAX_LEDGER_RANGE,
  normalizeLedgerRange,
  queryContractEventsInRange,
  recordInLedgerRange,
  resolveDateToLedger,
} from "../lib/auditor/blockRange";
import { CONTRACT_ADDRESSES } from "../config/contracts";

const server = { getEvents: mocks.getEvents } as unknown as rpc.Server;

function event(id: string, ledger: number) {
  return {
    id,
    ledger,
    ledgerClosedAt: "2026-11-24T12:00:00.000Z",
    txHash: `tx-${id}`,
    type: "contract",
    contractId: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
  };
}

function horizonResponse(sequence: number, closedAt: string): Response {
  return new Response(
    JSON.stringify({
      _embedded: { records: [{ sequence: String(sequence), closed_at: closedAt }] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEvents.mockResolvedValue({ events: [], cursor: undefined, latestLedger: 10_000 });
  mocks.executeWithFallback.mockImplementation(
    (operation: (value: rpc.Server) => Promise<unknown>) => operation(server),
  );
});

describe("auditor block-range queries", () => {
  it("accepts inclusive ranges up to the configured maximum", () => {
    expect(normalizeLedgerRange(1, MAX_LEDGER_RANGE)).toEqual({
      fromBlock: 1,
      toBlock: MAX_LEDGER_RANGE,
    });
    expect(recordInLedgerRange(10, { fromBlock: 10, toBlock: 20 })).toBe(true);
    expect(recordInLedgerRange(20, { fromBlock: 10, toBlock: 20 })).toBe(true);
    expect(recordInLedgerRange(21, { fromBlock: 10, toBlock: 20 })).toBe(false);
    expect(recordInLedgerRange(1, null)).toBe(true);
  });

  it.each([
    [0, 1],
    [1.5, 2],
    [Number.MAX_SAFE_INTEGER + 1, 2],
    [20, 10],
    [1, MAX_LEDGER_RANGE + 1],
  ])("rejects invalid range %s..%s", (fromBlock, toBlock) => {
    expect(() => normalizeLedgerRange(fromBlock, toBlock)).toThrow(BlockRangeError);
  });

  it("splits large ranges into bounded ledger requests", async () => {
    await expect(queryContractEventsInRange({ fromBlock: 1, toBlock: 2001 })).resolves.toEqual([]);
    expect(mocks.getEvents).toHaveBeenCalledTimes(3);
    expect(
      mocks.getEvents.mock.calls.map(([request]) => [request.startLedger, request.endLedger]),
    ).toEqual([
      [1, 1000],
      [1001, 2000],
      [2001, 2001],
    ]);
    for (const [request] of mocks.getEvents.mock.calls) {
      expect(request.limit).toBe(LEDGER_PAGE_SIZE);
      expect(request.filters).toEqual([
        { type: "contract", contractIds: [CONTRACT_ADDRESSES.CAMPAIGN_ESCROW] },
      ]);
    }
  });

  it("follows cursors on full pages, filters chunk boundaries, and deduplicates events", async () => {
    const firstPage = Array.from({ length: LEDGER_PAGE_SIZE }, (_, index) =>
      event(`event-${index}`, 100),
    );
    mocks.getEvents
      .mockResolvedValueOnce({
        events: firstPage,
        cursor: "next-page",
        latestLedger: 50_000,
      })
      .mockResolvedValueOnce({
        events: [event("event-999", 100), event("event-final", 1099), event("outside", 1100)],
        cursor: undefined,
        latestLedger: 50_000,
      });

    const result = await queryContractEventsInRange({ fromBlock: 100, toBlock: 1099 });
    expect(mocks.getEvents).toHaveBeenCalledTimes(2);
    expect(mocks.getEvents.mock.calls[1][0]).toEqual({
      filters: [{ type: "contract", contractIds: [CONTRACT_ADDRESSES.CAMPAIGN_ESCROW] }],
      cursor: "next-page",
      limit: LEDGER_PAGE_SIZE,
    });
    expect(result).toHaveLength(LEDGER_PAGE_SIZE + 1);
    expect(result.at(-1)?.id).toBe("event-final");
    expect(result.some((item) => item.id === "outside")).toBe(false);
  });

  it("continues a full page when its final ledger is also the chunk boundary", async () => {
    const firstPage = Array.from({ length: LEDGER_PAGE_SIZE }, (_, index) =>
      event(`event-${index}`, 1099),
    );
    mocks.getEvents
      .mockResolvedValueOnce({
        events: firstPage,
        cursor: "next-page",
        latestLedger: 50_000,
      })
      .mockResolvedValueOnce({
        events: [event("event-final", 1099)],
        cursor: undefined,
        latestLedger: 50_000,
      });

    const result = await queryContractEventsInRange({ fromBlock: 100, toBlock: 1099 });
    expect(mocks.getEvents).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(LEDGER_PAGE_SIZE + 1);
    expect(result.at(-1)?.id).toBe("event-final");
  });

  it("rejects repeated pagination cursors instead of looping", async () => {
    mocks.getEvents.mockResolvedValue({
      events: Array.from({ length: LEDGER_PAGE_SIZE }, (_, index) => event(`event-${index}`, 1)),
      cursor: "repeated",
      latestLedger: 50_000,
    });
    await expect(queryContractEventsInRange({ fromBlock: 1, toBlock: 2000 })).rejects.toThrow(
      "repeated an event pagination cursor",
    );
    expect(mocks.getEvents).toHaveBeenCalledTimes(2);
  });

  it("rejects a full page without a cursor", async () => {
    mocks.getEvents.mockResolvedValue({
      events: Array.from({ length: LEDGER_PAGE_SIZE }, (_, index) => event(`event-${index}`, 1)),
      cursor: undefined,
      latestLedger: 50_000,
    });
    await expect(queryContractEventsInRange({ fromBlock: 1, toBlock: 2000 })).rejects.toThrow(
      "without a pagination cursor",
    );
  });
});

describe("date-to-ledger resolution", () => {
  it("binary-searches Horizon for the last ledger at or before UTC midnight", async () => {
    const closeTimes: Record<number, string> = {
      4: "2026-01-04T00:00:00.000Z",
      5: "2026-01-05T00:00:00.000Z",
      6: "2026-01-06T00:00:00.000Z",
    };
    mocks.executeHorizonFetchWithFallback.mockImplementation(
      async (pathBuilder: (base: string) => string) => {
        const path = pathBuilder("https://horizon-testnet.stellar.org");
        if (path.includes("order=desc")) return horizonResponse(8, "2026-01-08T00:00:00.000Z");
        const sequence = Number(path.split("cursor=")[1]);
        return horizonResponse(sequence, closeTimes[sequence]);
      },
    );

    await expect(resolveDateToLedger("2026-01-04")).resolves.toBe(4);
    expect(mocks.executeHorizonFetchWithFallback).toHaveBeenCalledTimes(4);
  });

  it("returns the latest ledger for future dates without scanning history", async () => {
    mocks.executeHorizonFetchWithFallback.mockResolvedValue(
      horizonResponse(8, "2026-01-08T00:00:00.000Z"),
    );
    await expect(resolveDateToLedger("2026-01-09")).resolves.toBe(8);
    expect(mocks.executeHorizonFetchWithFallback).toHaveBeenCalledTimes(1);
  });

  it.each(["", "2026-02-31", "01/04/2026", "2026-1-4"])(
    "rejects invalid date %j before querying Horizon",
    async (date) => {
      await expect(resolveDateToLedger(date)).rejects.toThrow("Choose a valid date.");
      expect(mocks.executeHorizonFetchWithFallback).not.toHaveBeenCalled();
    },
  );
});
