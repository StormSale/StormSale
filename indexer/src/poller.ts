import { rpc } from "@stellar/stellar-sdk";
import { applyEvent } from "./events.js";
import type { Store } from "./store.js";

export interface PollerOptions {
  rpcUrl: string;
  contractId: string;
  intervalMs?: number;
  /** Ledger to start from on first run. Defaults to ~ the last 24h of retained history. */
  startLedger?: number;
}

/** Polls Soroban RPC getEvents for the contract and feeds the store. */
export async function pollOnce(store: Store, server: rpc.Server, opts: PollerOptions) {
  const filters = [{ type: "contract" as const, contractIds: [opts.contractId] }];
  let cursor = store.state.cursor;
  let handled = 0;

  for (;;) {
    let res: rpc.Api.GetEventsResponse;
    if (cursor) {
      res = await server.getEvents({ filters, cursor, limit: 200 });
    } else {
      const latest = await server.getLatestLedger();
      const start =
        store.state.lastIndexedLedger || opts.startLedger || Math.max(latest.sequence - 17000, 1);
      res = await server.getEvents({ filters, startLedger: start, limit: 200 });
    }

    res.events.forEach((ev, i) => {
      if (applyEvent(store, ev, i)) handled++;
      store.state.eventCount++;
      store.state.lastIndexedLedger = Math.max(store.state.lastIndexedLedger, ev.ledger);
    });

    cursor = res.cursor ?? cursor;
    store.state.cursor = cursor ?? null;
    if (res.events.length < 200) break;
  }

  store.state.lastPollAt = new Date().toISOString();
  store.save();
  return handled;
}

export function startPoller(store: Store, opts: PollerOptions) {
  const server = new rpc.Server(opts.rpcUrl);
  let stopped = false;
  const loop = async () => {
    while (!stopped) {
      try {
        await pollOnce(store, server, opts);
      } catch (err) {
        console.error("[indexer] poll failed:", (err as Error).message);
      }
      await new Promise((r) => setTimeout(r, opts.intervalMs ?? 5000));
    }
  };
  void loop();
  return () => {
    stopped = true;
  };
}
