import { Asset, Contract, nativeToScVal, Address, Operation, xdr } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG, SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import type { SupportedEscrowAssetCode } from "../config/stellar";

/**
 * Cross-Chain / Cross-Asset Swap Routing via Soroban DEX protocols (Issue #127).
 *
 * Affiliates earn commissions in XLM but frequently want stablecoins. This
 * module talks to Soroban AMM routers (Soroswap, Phoenix) so a payout can be
 * swapped to a target token *atomically at claim time*: the `claim_payout`
 * invocations and the DEX `swap` invocation are packed into a single Stellar
 * transaction envelope, mirroring the auto-split payment strategy in
 * {@link ./batchClaim}.
 *
 * All pricing uses exact constant-product (x·y = k) integer math so quotes are
 * deterministic and unit-testable, matching how the on-chain routers price
 * multi-hop swaps.
 */

export type SwapToken = Extract<SupportedEscrowAssetCode, "XLM" | "USDC" | "EURC">;

export const SWAP_TOKEN_DECIMALS: Record<SwapToken, 7> = {
  XLM: 7,
  USDC: 7,
  EURC: 7,
};

export interface DexRouter {
  id: DexRouterId;
  name: string;
  /** Soroban router contract id for the active network. */
  routerContractId: string;
}

export type DexRouterId = "soroswap" | "phoenix";

/**
 * Known Soroban DEX routers on Stellar Testnet. Contract ids are illustrative
 * deployments; the runtime resolves the active network's addresses.
 */
export const DEX_ROUTERS: Record<DexRouterId, DexRouter> = {
  soroswap: {
    id: "soroswap",
    name: "Soroswap",
    routerContractId:
      import.meta.env.VITE_SOROSWAP_ROUTER_ID ||
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASOROSW",
  },
  phoenix: {
    id: "phoenix",
    name: "Phoenix",
    routerContractId:
      import.meta.env.VITE_PHOENIX_ROUTER_ID ||
      "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPHOENX",
  },
};

export const DEFAULT_ROUTER_ID: DexRouterId = "soroswap";

export interface SwapPool {
  /** AMM pool / pair contract identifier (used for footprint reporting). */
  pool: string;
  routerId: DexRouterId;
  from: SwapToken;
  to: SwapToken;
  /** Reserves denominated in base units (10^7 scaled integers). */
  reserveIn: bigint;
  reserveOut: bigint;
  /** Swap fee in basis points (e.g. 30 = 0.30%). */
  feeBps: number;
}

/**
 * Illustrative testnet liquidity used to route + price swaps. Reserves are in
 * base units. A real deployment queries the router's `get_reserves` view.
 */
const U = (whole: number): bigint => BigInt(Math.round(whole * 1e7));

const POOLS: SwapPool[] = [
  { pool: "soroswap:XLM:USDC", routerId: "soroswap", from: "XLM", to: "USDC", reserveIn: U(1_500_000), reserveOut: U(300_000), feeBps: 30 },
  { pool: "soroswap:USDC:XLM", routerId: "soroswap", from: "USDC", to: "XLM", reserveIn: U(300_000), reserveOut: U(1_500_000), feeBps: 30 },
  { pool: "soroswap:XLM:EURC", routerId: "soroswap", from: "XLM", to: "EURC", reserveIn: U(1_200_000), reserveOut: U(140_000), feeBps: 30 },
  { pool: "soroswap:EURC:XLM", routerId: "soroswap", from: "EURC", to: "XLM", reserveIn: U(140_000), reserveOut: U(1_200_000), feeBps: 30 },
  { pool: "phoenix:XLM:USDC", routerId: "phoenix", from: "XLM", to: "USDC", reserveIn: U(2_000_000), reserveOut: U(402_000), feeBps: 25 },
  { pool: "phoenix:XLM:EURC", routerId: "phoenix", from: "XLM", to: "EURC", reserveIn: U(900_000), reserveOut: U(105_000), feeBps: 25 },
];

export function findDirectPool(from: SwapToken, to: SwapToken, routerId?: DexRouterId): SwapPool | undefined {
  return POOLS.find(
    (p) => p.from === from && p.to === to && (routerId === undefined || p.routerId === routerId),
  );
}

/** Best (largest reserveOut) direct pool across routers for a token pair. */
function bestDirectPool(from: SwapToken, to: SwapToken): SwapPool | undefined {
  const candidates = POOLS.filter((p) => p.from === from && p.to === to);
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, cur) => (cur.reserveOut > best.reserveOut ? cur : best));
}

export interface SwapRoute {
  from: SwapToken;
  to: SwapToken;
  hops: SwapPool[];
}

/**
 * Resolves a swap route. Prefers a direct pool; otherwise falls back to a
 * two-hop route through the XLM base asset (the canonical quote currency on
 * Soroban DEXes). Throws when no path exists.
 */
export function resolveSwapRoute(from: SwapToken, to: SwapToken, routerId?: DexRouterId): SwapRoute {
  if (from === to) {
    throw new Error("Target token must differ from the source token.");
  }

  const direct = routerId ? findDirectPool(from, to, routerId) : bestDirectPool(from, to);
  if (direct) {
    return { from, to, hops: [direct] };
  }

  // Multi-hop via the XLM base asset.
  const legA = bestDirectPool(from, "XLM");
  const legB = bestDirectPool("XLM", to);
  if (legA && legB) {
    return { from, to, hops: [legA, legB] };
  }

  throw new Error(`No Soroban DEX route found to swap ${from} into ${to}.`);
}

/**
 * Constant-product output for a single hop, in base units, applying the fee.
 * out = (reserveOut · amountIn · (10000 − feeBps)) / (reserveIn · 10000 + amountIn · (10000 − feeBps))
 */
export function constantProductOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number,
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const feeFactor = BigInt(10000 - feeBps);
  const numerator = amountIn * feeFactor * reserveOut;
  const denominator = reserveIn * 10000n + amountIn * feeFactor;
  return numerator / denominator;
}

export interface SwapQuote {
  from: SwapToken;
  to: SwapToken;
  amountIn: bigint;
  expectedOut: bigint;
  minimumOut: bigint;
  maxSlippageBps: number;
  /** Execution price impact vs. the mid price, in basis points. */
  priceImpactBps: number;
  route: SwapRoute;
  routerName: string;
}

/**
 * Computes a full multi-hop quote with slippage tolerance and price impact.
 * `maxSlippageBps` bounds how far the realized output may fall below the quoted
 * expected output before the on-chain swap reverts (slippage protection).
 */
export function computeSwapQuote(
  amountIn: bigint,
  route: SwapRoute,
  maxSlippageBps: number,
): SwapQuote {
  if (amountIn <= 0n) throw new Error("Swap input amount must be greater than zero.");
  if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 0 || maxSlippageBps > 10000) {
    throw new Error("Maximum slippage must be an integer between 0 and 10000 basis points.");
  }
  if (route.hops.length === 0) throw new Error("Swap route has no hops.");

  let running = amountIn;
  // Ideal (no-impact) output: product of mid prices applied to the input.
  let ideal = amountIn;
  for (const hop of route.hops) {
    running = constantProductOutput(running, hop.reserveIn, hop.reserveOut, hop.feeBps);
    ideal = (ideal * hop.reserveOut) / hop.reserveIn;
    if (running <= 0n) {
      throw new Error("Insufficient input amount yields no output across the route.");
    }
  }

  const expectedOut = running;
  const minimumOut = (expectedOut * BigInt(10000 - maxSlippageBps)) / 10000n;

  const priceImpactBps =
    ideal > expectedOut && ideal > 0n
      ? Number(((ideal - expectedOut) * 10000n) / ideal)
      : 0;

  return {
    from: route.from,
    to: route.to,
    amountIn,
    expectedOut,
    minimumOut,
    maxSlippageBps,
    priceImpactBps,
    route,
    routerName: DEX_ROUTERS[route.hops[0].routerId].name,
  };
}

/** Convenience wrapper: resolve the best route and quote in one call. */
export function quoteSwap(
  amountIn: bigint,
  from: SwapToken,
  to: SwapToken,
  maxSlippageBps: number,
  routerId?: DexRouterId,
): SwapQuote {
  return computeSwapQuote(amountIn, resolveSwapRoute(from, to, routerId), maxSlippageBps);
}

/**
 * Simulates the multi-hop payment footprint — the ordered list of pool
 * identifiers whose reserves the swap touches. Useful for transparency in the
 * claim modal and for detecting cross-router arbitrage paths.
 */
export function simulateSwapFootprint(route: SwapRoute): string[] {
  return route.hops.map((hop, index) => `hop#${index + 1}:${hop.pool}`);
}

export function formatBaseUnits(units: bigint, token: SwapToken): string {
  const decimals = SWAP_TOKEN_DECIMALS[token];
  const whole = units / BigInt(10 ** decimals);
  const frac = (units % BigInt(10 ** decimals)).toString().padStart(decimals, "0");
  return `${whole}.${frac}`;
}

export function toBaseUnits(amount: number, token: SwapToken): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Swap amount must be a finite non-negative number.");
  }
  return BigInt(Math.round(amount * 10 ** SWAP_TOKEN_DECIMALS[token]));
}

function tokenContractAddress(token: SwapToken): string {
  if (token === "XLM") {
    return Asset.native().contractId(STELLAR_CONFIG.networkPassphrase);
  }
  return SUPPORTED_ESCROW_ASSETS[token].contractAddress;
}

/**
 * Builds the on-chain router `swap_exact_tokens_for_tokens` invocation as a
 * Soroban operation. The token path mirrors the resolved multi-hop route and
 * `min_out` enforces the caller's slippage tolerance atomically on-chain.
 */
export function buildSwapOperation(quote: SwapQuote, recipient: string): xdr.Operation {
  const router = DEX_ROUTERS[quote.route.hops[0].routerId];
  const contract = new Contract(router.routerContractId);
  const path = quote.route.hops.map((hop) => new Address(tokenContractAddress(hop.to)).toScVal());

  return contract.call(
    "swap_exact_tokens_for_tokens",
    nativeToScVal(quote.amountIn, { type: "i128" }),
    nativeToScVal(quote.minimumOut, { type: "i128" }),
    xdr.ScVal.scvVec(path),
    new Address(recipient).toScVal(),
  );
}

/**
 * Higher-level helper returning the operations required to settle a swap for a
 * recipient. Kept separate from {@link buildSwapOperation} so future features
 * (e.g. token-202 transfer hooks or per-hop allowance ops) can extend it
 * without touching the claim dispatcher.
 */
export function buildSwapOperations(quote: SwapQuote, recipient: string): xdr.Operation[] {
  return [buildSwapOperation(quote, recipient)];
}

export interface AutoSwapConfig {
  enabled: boolean;
  tokenIn: SwapToken;
  targetToken: SwapToken;
  maxSlippageBps: number;
}

export const DEFAULT_AUTO_SWAP: AutoSwapConfig = {
  enabled: false,
  tokenIn: "XLM",
  targetToken: "USDC",
  maxSlippageBps: 100,
};

export interface AutoSwapReceipt {
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountIn: string;
  expectedOut: string;
  minimumOut: string;
  maxSlippageBps: number;
  priceImpactBps: number;
  routerName: string;
  hopCount: number;
  footprint: string[];
}

export function toAutoSwapReceipt(quote: SwapQuote): AutoSwapReceipt {
  return {
    tokenIn: quote.from,
    tokenOut: quote.to,
    amountIn: formatBaseUnits(quote.amountIn, quote.from),
    expectedOut: formatBaseUnits(quote.expectedOut, quote.to),
    minimumOut: formatBaseUnits(quote.minimumOut, quote.to),
    maxSlippageBps: quote.maxSlippageBps,
    priceImpactBps: quote.priceImpactBps,
    routerName: quote.routerName,
    hopCount: quote.route.hops.length,
    footprint: simulateSwapFootprint(quote.route),
  };
}

/** Payment operation transferring the swapped output is handled by the router;
 * this helper is retained for direct-transfer fallbacks on routers that return
 * output to the caller rather than the recipient. */
export function buildRecipientTransferOperation(
  token: SwapToken,
  destination: string,
  amountUnits: bigint,
): xdr.Operation {
  const asset =
    token === "XLM"
      ? Asset.native()
      : new Asset(token, SUPPORTED_ESCROW_ASSETS[token].issuer!);
  return Operation.payment({
    destination,
    asset,
    amount: formatBaseUnits(amountUnits, token),
  });
}
