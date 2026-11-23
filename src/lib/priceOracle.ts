/**
 * Multi-Currency Conversion Rate Engine with Live CoinGecko / Pyth Feeds (Issue #145)
 *
 * Integrates live Stellar asset price oracle feeds (CoinGecko API & Pyth Network feeds).
 * Caches rates locally with 60-second TTL to avoid rate-limiting.
 * Enables advertisers pricing in fiat (USD/EUR) to compute exact XLM equivalents
 * at the moment of conversion, locking the oracle exchange rate into conversion metadata.
 */

export type SupportedFiatCurrency = "USD" | "EUR" | "USDC";

export interface OracleRates {
  USD: number;
  EUR: number;
  USDC: number;
}

export interface OracleRateResponse {
  rates: OracleRates;
  source: "CoinGecko" | "Pyth" | "Authoritative Fallback";
  updatedAt: number; // ms
  isStale: boolean;
  cached: boolean;
}

export const ORACLE_CACHE_KEY = "stormsale_price_oracle_cache_v1";
export const ORACLE_CACHE_TTL_MS = 60 * 1000; // 60-second TTL

// Fallback rates if external oracles are unreachable or offline
export const FALLBACK_RATES: OracleRates = {
  USD: 0.125,
  EUR: 0.115,
  USDC: 0.125,
};

let memoryCache: { data: OracleRateResponse; expiry: number } | null = null;

export function clearOracleCache(): void {
  memoryCache = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ORACLE_CACHE_KEY);
  }
}

/**
 * Reads cached oracle rates from memory or localStorage.
 */
export function getCachedRates(): OracleRateResponse | null {
  const now = Date.now();
  if (memoryCache && memoryCache.expiry > now) {
    return { ...memoryCache.data, cached: true };
  }

  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(ORACLE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.rates && parsed.updatedAt) {
          const isStale = now - parsed.updatedAt > ORACLE_CACHE_TTL_MS;
          return {
            rates: parsed.rates,
            source: parsed.source || "CoinGecko",
            updatedAt: parsed.updatedAt,
            isStale,
            cached: true,
          };
        }
      }
    } catch {
      // Storage unavailable or corrupted
    }
  }

  return null;
}

/**
 * Saves oracle rates to memory and localStorage.
 */
export function persistRates(
  rates: OracleRates,
  source: "CoinGecko" | "Pyth" | "Authoritative Fallback",
): OracleRateResponse {
  const now = Date.now();
  const res: OracleRateResponse = {
    rates,
    source,
    updatedAt: now,
    isStale: false,
    cached: false,
  };

  memoryCache = {
    data: res,
    expiry: now + ORACLE_CACHE_TTL_MS,
  };

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(
        ORACLE_CACHE_KEY,
        JSON.stringify({
          rates,
          source,
          updatedAt: now,
        }),
      );
    } catch {
      // Ignore storage write error
    }
  }

  return res;
}

/**
 * Fetches real-time Stellar price feeds from CoinGecko, with Pyth Network Soroban
 * feed fallback and local 60-second cache TTL.
 */
export async function fetchLiveOracleRates(forceRefresh = false): Promise<OracleRateResponse> {
  if (!forceRefresh) {
    const cached = getCachedRates();
    if (cached && !cached.isStale) {
      return cached;
    }
  }

  // 1. Try CoinGecko API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd,eur,usdc&include_last_updated_at=true",
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      },
    );
    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      const stellar = json?.stellar;
      if (stellar && typeof stellar.usd === "number" && stellar.usd > 0) {
        const rates: OracleRates = {
          USD: stellar.usd,
          EUR:
            typeof stellar.eur === "number" && stellar.eur > 0 ? stellar.eur : stellar.usd * 0.92,
          USDC: typeof stellar.usdc === "number" && stellar.usdc > 0 ? stellar.usdc : stellar.usd,
        };
        return persistRates(rates, "CoinGecko");
      }
    }
  } catch {
    // CoinGecko failed or timed out — failover to Pyth feed
  }

  // 2. Pyth Network Soroban Price Feed Fallback (Stellar XLM/USD price account)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    // Pyth Hermès / price feed endpoint for Crypto.XLM/USD
    const pythRes = await fetch(
      "https://hermes.pyth.network/v2/updates/price/latest?ids[]=0x696081da22e5163a3c2670732152eb7a3713093df97428f44d8b6716beaeec43",
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      },
    );
    clearTimeout(timeoutId);

    if (pythRes.ok) {
      const pythJson = await pythRes.json();
      const parsedPrice = pythJson?.parsed?.[0]?.price;
      if (parsedPrice?.price && parsedPrice?.expo) {
        const rawPrice = Number(parsedPrice.price) * Math.pow(10, parsedPrice.expo);
        const price = Math.round(rawPrice * 10_000_000) / 10_000_000;
        if (price > 0) {
          const rates: OracleRates = {
            USD: price,
            EUR: Math.round(price * 0.92 * 10_000_000) / 10_000_000,
            USDC: price,
          };
          return persistRates(rates, "Pyth");
        }
      }
    }
  } catch {
    // Pyth fallback failed or timed out
  }

  // 3. Last-known cached rates fallback or authoritative defaults
  const staleCached = getCachedRates();
  if (staleCached) {
    return {
      ...staleCached,
      isStale: true,
      cached: true,
    };
  }

  return {
    rates: FALLBACK_RATES,
    source: "Authoritative Fallback",
    updatedAt: Date.now(),
    isStale: true,
    cached: false,
  };
}

/**
 * Converts a fiat currency amount (USD / EUR) to its exact XLM equivalent.
 */
export function convertFiatToXlm(
  fiatAmount: number,
  currency: "USD" | "EUR" | "USDC",
  rates: OracleRates,
): number {
  if (!fiatAmount || isNaN(fiatAmount) || fiatAmount <= 0) return 0;
  const rate = rates[currency] || rates.USD;
  if (!rate || rate <= 0) return 0;
  const xlm = fiatAmount / rate;
  // Return rounded to Stellar native 7 decimal precision
  return Math.round(xlm * 10_000_000) / 10_000_000;
}

/**
 * Converts XLM amount to estimated fiat equivalent.
 */
export function convertXlmToFiat(
  xlmAmount: number,
  currency: "USD" | "EUR" | "USDC",
  rates: OracleRates,
): number {
  if (!xlmAmount || isNaN(xlmAmount) || xlmAmount <= 0) return 0;
  const rate = rates[currency] || rates.USD;
  return Math.round(xlmAmount * rate * 100) / 100;
}

/**
 * Formats relative or wall-clock freshness string for the oracle rate.
 */
export function formatOracleFreshness(updatedAt: number, now = Date.now()): string {
  const diffSec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (diffSec < 5) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}
