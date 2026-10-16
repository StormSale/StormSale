import { useMemo, useState } from "react";
import { BlockNavigator } from "./BlockNavigator";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  PLATFORM_LEDGER,
  PLATFORM_LEDGER_BOUNDS,
  LATEST_LEDGER,
  type LedgerEventStatus,
} from "../../data/platformLedger";
import {
  DEFAULT_BLOCK_WINDOW,
  filterByBlockRange,
  formatBlockNumber,
  getLatestBlockRange,
  type BlockRange,
} from "../../utils/blocks";
import { getStellarExplorerLink } from "../../utils/network";
import { Blocks, ExternalLink, SearchX, Hash } from "lucide-react";

const statusBadge: Record<LedgerEventStatus, string> = {
  Confirmed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400",
  Settled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
};

/**
 * Platform-wide on-chain activity explorer.
 *
 * Renders every indexed ledger event and lets the user narrow that data set to
 * a block (ledger number) range using the {@link BlockNavigator} tool.
 */
export const LedgerExplorer = () => {
  const [range, setRange] = useState<BlockRange>(() =>
    getLatestBlockRange(LATEST_LEDGER, DEFAULT_BLOCK_WINDOW, PLATFORM_LEDGER_BOUNDS),
  );

  const filtered = useMemo(
    () =>
      filterByBlockRange(PLATFORM_LEDGER, range, (entry) => entry.blockNumber).sort(
        (a, b) => b.blockNumber - a.blockNumber,
      ),
    [range],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Ledger Explorer
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Navigate the platform's on-chain data by Stellar block (ledger) number
        </p>
      </div>

      <BlockNavigator
        bounds={PLATFORM_LEDGER_BOUNDS}
        range={range}
        onRangeChange={setRange}
        matchedCount={filtered.length}
        totalCount={PLATFORM_LEDGER.length}
      />

      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Blocks className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                Indexed Block Events
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                {filtered.length} of {PLATFORM_LEDGER.length} events in the selected block range
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <SearchX className="w-10 h-10 text-zinc-400 dark:text-zinc-500" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                No events in this block range
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400">
                Try widening the range or jumping to the latest blocks.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-6 md:px-8 py-5 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                      <Hash className="w-5 h-5 text-zinc-900 dark:text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-zinc-900 dark:text-white">
                          {entry.event}
                        </span>
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                          Block #{formatBlockNumber(entry.blockNumber)}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                        {entry.campaign} · {entry.timestamp}
                      </div>
                      <a
                        href={getStellarExplorerLink("tx", entry.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 mt-1 transition-colors"
                      >
                        Tx: {entry.txHash.slice(0, 10)}…
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:justify-end shrink-0">
                    <span className="font-mono font-bold text-sm text-zinc-900 dark:text-white">
                      {entry.amount}
                    </span>
                    <span
                      className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${statusBadge[entry.status]}`}
                    >
                      {entry.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 border-t border-slate-100 dark:border-zinc-800/50">
            <Button
              variant="ghost"
              onClick={() =>
                setRange(
                  getLatestBlockRange(LATEST_LEDGER, DEFAULT_BLOCK_WINDOW, PLATFORM_LEDGER_BOUNDS),
                )
              }
              className="w-full text-indigo-600 dark:text-indigo-400 font-bold hover:bg-slate-50 dark:hover:bg-zinc-900/50 rounded-xl h-12"
            >
              <Hash className="w-4 h-4 mr-2" />
              Jump to latest indexed blocks
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
