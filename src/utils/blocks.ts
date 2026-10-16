/**
 * Block (ledger) number utilities for navigating and filtering StormSale
 * platform data.
 *
 * On Stellar every "block" is identified by its ledger sequence number. These
 * helpers are pure and framework-agnostic so any role dashboard (advertiser,
 * affiliate, auditor) can filter its on-chain data by a block range without
 * duplicating range math, and so they can be unit tested in isolation.
 */

/** Inclusive block number interval. `from` must be <= `to`. */
export interface BlockRange {
  from: number;
  to: number;
}

/** A named block range shortcut offered by the navigation tool. */
export interface BlockPreset {
  id: string;
  label: string;
  size: number;
}

/** Default number of ledgers a single navigation window covers. */
export const DEFAULT_BLOCK_WINDOW = 250;

/** Quick window sizes offered in the block navigator. */
export const BLOCK_PRESETS: BlockPreset[] = [
  { id: "25", label: "25 blocks", size: 25 },
  { id: "100", label: "100 blocks", size: 100 },
  { id: "250", label: "250 blocks", size: 250 },
  { id: "1000", label: "1,000 blocks", size: 1000 },
];

/**
 * Renders a block number with thousands separators for display.
 * Non-finite input renders as an em dash.
 */
export const formatBlockNumber = (value: number): string => {
  if (!Number.isFinite(value)) return "—";
  return Math.trunc(value).toLocaleString("en-US");
};

/**
 * Parses user input into a block number.
 *
 * Accepts surrounding whitespace, thousands separators, underscores and a
 * leading `#`, e.g. `"# 6,120,940"`. Returns `null` for anything that is not a
 * non-negative integer.
 */
export const parseBlockNumber = (input: string): number | null => {
  const cleaned = input
    .trim()
    .replace(/^#/, "")
    .replace(/[,\s_]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/** Orders the endpoints so `from <= to`, truncating any fractional input. */
export const normalizeBlockRange = (from: number, to: number): BlockRange => {
  const a = Math.trunc(from);
  const b = Math.trunc(to);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
};

/** Constrains a range so it stays inside known ledger bounds. */
export const clampBlockRange = (range: BlockRange, bounds: BlockRange): BlockRange => {
  const lo = bounds.from;
  const hi = bounds.to;
  const from = Math.min(Math.max(range.from, lo), hi);
  const to = Math.min(Math.max(range.to, lo), hi);
  return normalizeBlockRange(from, to);
};

/** True when `block` falls inside `range`, inclusive of both endpoints. */
export const isBlockInRange = (block: number, range: BlockRange): boolean =>
  block >= range.from && block <= range.to;

/**
 * Filters platform records down to those whose block number sits inside the
 * active range.
 */
export const filterByBlockRange = <T>(
  items: T[],
  range: BlockRange,
  getBlock: (item: T) => number,
): T[] => items.filter((item) => isBlockInRange(getBlock(item), range));

/** Slides a range by `offset` blocks (positive = newer, negative = older). */
export const shiftBlockRange = (range: BlockRange, offset: number): BlockRange => {
  const delta = Math.trunc(offset);
  return { from: range.from + delta, to: range.to + delta };
};

/**
 * Builds the window that ends at `latest` and spans `size` ledgers, clamped to
 * the available bounds. Used for the "latest blocks" presets.
 */
export const getLatestBlockRange = (
  latest: number,
  size: number,
  bounds: BlockRange,
): BlockRange => {
  const span = Math.max(1, Math.trunc(size));
  return clampBlockRange({ from: latest - span + 1, to: latest }, bounds);
};

/** Human readable label such as `#6,119,000 – #6,120,940`. */
export const describeBlockRange = (range: BlockRange): string =>
  `#${formatBlockNumber(range.from)} – #${formatBlockNumber(range.to)}`;
