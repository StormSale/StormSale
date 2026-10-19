import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { cn } from "../../lib/utils";
import {
  BLOCK_PRESETS,
  DEFAULT_BLOCK_WINDOW,
  clampBlockRange,
  describeBlockRange,
  getLatestBlockRange,
  normalizeBlockRange,
  parseBlockNumber,
  shiftBlockRange,
  type BlockRange,
} from "../../utils/blocks";
import { ChevronLeft, ChevronRight, Hash, RotateCcw, SlidersHorizontal } from "lucide-react";

interface BlockNavigatorProps {
  /** Full ledger range available in the data set. */
  bounds: BlockRange;
  /** Currently active block range used to filter platform data. */
  range: BlockRange;
  /** Called whenever the user changes the active range. */
  onRangeChange: (range: BlockRange) => void;
  /** How many records fall inside the active range. */
  matchedCount: number;
  /** How many records exist in total. */
  totalCount: number;
  /** Default page size for "latest blocks" presets and stepping. */
  windowSize?: number;
  className?: string;
}

interface RangeDraft {
  from: string;
  to: string;
}

/**
 * Navigation tool for browsing platform data by block (ledger) number.
 *
 * Supports manual `from`/`to` entry, quick "latest N blocks" presets, and
 * previous/next window steering. It is presentation-only: the parent owns the
 * active range and receives every change through `onRangeChange`.
 */
export const BlockNavigator = ({
  bounds,
  range,
  onRangeChange,
  matchedCount,
  totalCount,
  windowSize = DEFAULT_BLOCK_WINDOW,
  className,
}: BlockNavigatorProps) => {
  // The text fields follow the active range until the user starts editing, at
  // which point a draft takes over so keystrokes are never clobbered.
  const [draft, setDraft] = useState<RangeDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fromValue = draft ? draft.from : String(range.from);
  const toValue = draft ? draft.to : String(range.to);

  const atOldest = range.from <= bounds.from;
  const atNewest = range.to >= bounds.to;
  const span = Math.max(1, range.to - range.from + 1);
  const isFullRange = range.from === bounds.from && range.to === bounds.to;

  const editDraft = (patch: Partial<RangeDraft>) => {
    setDraft({ from: fromValue, to: toValue, ...patch });
  };

  const applyManualRange = () => {
    const nextFrom = parseBlockNumber(fromValue);
    const nextTo = parseBlockNumber(toValue);
    if (nextFrom === null || nextTo === null) {
      setError("Enter whole block numbers, e.g. 6,120,940.");
      return;
    }
    setError(null);
    setDraft(null);
    onRangeChange(clampBlockRange(normalizeBlockRange(nextFrom, nextTo), bounds));
  };

  const steer = (direction: "older" | "newer") => {
    setDraft(null);
    setError(null);
    const offset = direction === "newer" ? span : -span;
    onRangeChange(clampBlockRange(shiftBlockRange(range, offset), bounds));
  };

  const applyLatestPreset = (size: number) => {
    setDraft(null);
    setError(null);
    onRangeChange(getLatestBlockRange(bounds.to, size, bounds));
  };

  const resetToLatest = () => {
    setDraft(null);
    setError(null);
    onRangeChange(getLatestBlockRange(bounds.to, windowSize, bounds));
  };

  const showAllBlocks = () => {
    setDraft(null);
    setError(null);
    onRangeChange({ ...bounds });
  };

  return (
    <div
      className={cn(
        "border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/50 shadow-sm p-5 md:p-6 space-y-5",
        className,
      )}
    >
      {/* Header + live match summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shrink-0">
            <SlidersHorizontal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">
              Block Navigator
            </h3>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
              Filter platform data by Stellar ledger number
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
            <Hash className="w-3.5 h-3.5" />
            {describeBlockRange(range)}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            {matchedCount} / {totalCount} events
          </span>
        </div>
      </div>

      {/* Manual range entry */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              From block
            </span>
            <Input
              type="text"
              inputMode="numeric"
              value={fromValue}
              onChange={(e) => editDraft({ from: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyManualRange()}
              placeholder={String(bounds.from)}
              aria-label="From block number"
              className="mt-1.5 h-11 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              To block
            </span>
            <Input
              type="text"
              inputMode="numeric"
              value={toValue}
              onChange={(e) => editDraft({ to: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyManualRange()}
              placeholder={String(bounds.to)}
              aria-label="To block number"
              className="mt-1.5 h-11 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950"
            />
          </label>
        </div>

        <Button
          onClick={applyManualRange}
          className="h-11 rounded-xl px-5 font-bold bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-sm"
        >
          Apply range
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* Presets + window steering */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mr-1">
            Latest
          </span>
          {BLOCK_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => applyLatestPreset(preset.size)}
              className="h-9 rounded-full px-3.5 font-semibold border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
            >
              {preset.label}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={showAllBlocks}
            disabled={isFullRange}
            className="h-9 rounded-full px-3.5 font-semibold border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            All blocks
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => steer("older")}
            disabled={atOldest}
            aria-label="Older blocks"
            className="h-9 rounded-xl px-3 font-semibold border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Older
          </Button>
          <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 tabular-nums px-1">
            {span.toLocaleString("en-US")} blocks
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => steer("newer")}
            disabled={atNewest}
            aria-label="Newer blocks"
            className="h-9 rounded-xl px-3 font-semibold border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            Newer
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToLatest}
            aria-label="Reset to latest blocks"
            className="h-9 rounded-xl px-3 font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
};
