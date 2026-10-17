import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  getLiveOracleRates,
  convertFiatToXlm,
  formatFreshness,
  type OracleRateData,
  type SupportedCurrency,
} from "../../lib/oracleEngine";
import { RefreshCw, Clock, Coins, ArrowRightLeft, Sparkles, Layers } from "lucide-react";

interface ConversionRateEngineProps {
  compact?: boolean;
  data?: OracleRateData | null;
  onRefresh?: () => void;
}

export const ConversionRateEngine: React.FC<ConversionRateEngineProps> = ({
  compact = false,
  data: externalData,
  onRefresh,
}) => {
  const [internalData, setInternalData] = useState<OracleRateData | null>(null);
  const oracleData = externalData !== undefined ? externalData : internalData;
  const [isLoading, setIsLoading] = useState(false);
  const [freshnessText, setFreshnessText] = useState("");

  // Interactive mini calculator states
  const [calcAmount, setCalcAmount] = useState<string>("100");
  const [calcCurrency, setCalcCurrency] = useState<SupportedCurrency>("USD");

  const loadRates = useCallback(
    async (force = false) => {
      if (onRefresh && force) {
        onRefresh();
        return;
      }
      setIsLoading(true);
      try {
        const data = await getLiveOracleRates(force);
        setInternalData(data);
        setFreshnessText(formatFreshness(data.timestamp));
      } catch (err) {
        console.error("Failed to load oracle rates:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [onRefresh],
  );

  // Initial load effect: load only if not controlled externally
  useEffect(() => {
    if (externalData === undefined) {
      void loadRates();
    }
  }, [loadRates, externalData]);

  // Separate freshness timer effect keyed to oracleData
  useEffect(() => {
    if (!oracleData || oracleData.timestamp === 0) return;
    const ts = oracleData.timestamp;
    setFreshnessText(formatFreshness(ts));
    const interval = setInterval(() => {
      setFreshnessText(formatFreshness(ts));
    }, 5000);

    return () => clearInterval(interval);
  }, [oracleData]);

  if (!oracleData) {
    return (
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl bg-white dark:bg-zinc-900/50 p-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 dark:bg-zinc-800 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4">
          <div className="h-20 bg-slate-100 dark:bg-zinc-800/60 rounded-xl" />
          <div className="h-20 bg-slate-100 dark:bg-zinc-800/60 rounded-xl" />
          <div className="h-20 bg-slate-100 dark:bg-zinc-800/60 rounded-xl" />
        </div>
      </Card>
    );
  }

  const { rates, isStale, source } = oracleData;
  const numAmount = parseFloat(calcAmount) || 0;
  let convertedAmount = 0;
  try {
    convertedAmount = convertFiatToXlm(numAmount, calcCurrency, oracleData).xlmAmount;
  } catch {
    convertedAmount = 0;
  }

  if (compact) {
    return (
      <div className="bg-slate-50 dark:bg-zinc-950/70 p-4 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Coins className="w-4 h-4 text-indigo-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
              Live Oracle Feed
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                !isStale
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  !isStale ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {!isStale ? "Live" : "Stale"}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-[11px]">{freshnessText}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadRates(true)}
              disabled={isLoading}
              className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-md"
              title="Refresh Oracle Rates"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-zinc-500 ${
                  isLoading ? "animate-spin text-indigo-500" : ""
                }`}
              />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800/80">
            <div className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">
              XLM / USD
            </div>
            <div className="text-sm font-extrabold text-zinc-900 dark:text-white mt-0.5">
              {rates.USD && rates.USD > 0 ? `$${rates.USD.toFixed(4)}` : "Unavailable"}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800/80">
            <div className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">
              XLM / EUR
            </div>
            <div className="text-sm font-extrabold text-zinc-900 dark:text-white mt-0.5">
              {rates.EUR && rates.EUR > 0 ? `€${rates.EUR.toFixed(4)}` : "Unavailable"}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800/80">
            <div className="text-[10px] uppercase font-bold text-zinc-400 dark:text-zinc-500">
              XLM / USDC
            </div>
            <div className="text-sm font-extrabold text-zinc-900 dark:text-white mt-0.5">
              {rates.USDC && rates.USDC > 0 ? `$${rates.USDC.toFixed(4)}` : "Unavailable"}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-zinc-900 text-[10px] text-zinc-400">
          <span>
            Provider: <strong className="text-zinc-600 dark:text-zinc-300">{source}</strong>
          </span>
          <span>60s TTL Caching</span>
        </div>
      </div>
    );
  }

  return (
    <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
      <CardHeader className="pb-4 pt-6 px-6 sm:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner border border-indigo-100 dark:border-indigo-800/50">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                Multi-Currency Oracle Engine
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    !isStale
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full mr-1.5 ${
                      !isStale ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  {!isStale ? "Live Feed" : "Stale / Fallback"}
                </span>
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-0.5 text-xs">
                Real-time Stellar asset exchange rates from CoinGecko & Pyth Network Soroban feeds
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-950 px-3 py-1.5 rounded-xl border border-slate-200/70 dark:border-zinc-800">
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span>{freshnessText}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadRates(true)}
              disabled={isLoading}
              className="h-9 px-3 rounded-xl border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin text-indigo-500" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-6 sm:px-8 pb-6 space-y-6">
        {/* Rate Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-indigo-50/20 dark:from-zinc-900 dark:to-indigo-950/20 border border-slate-200/80 dark:border-zinc-800 relative overflow-hidden group hover:border-indigo-300 dark:hover:border-indigo-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                XLM / USD
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold">
                1 XLM
              </span>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-2">
              {rates.USD && rates.USD > 0 ? `$${rates.USD.toFixed(4)}` : "Unavailable"}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              {rates.USD && rates.USD > 0
                ? `$1.00 USD = ${(1 / rates.USD).toFixed(3)} XLM`
                : "Rate unavailable"}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-purple-50/20 dark:from-zinc-900 dark:to-purple-950/20 border border-slate-200/80 dark:border-zinc-800 relative overflow-hidden group hover:border-purple-300 dark:hover:border-purple-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                XLM / EUR
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-bold">
                1 XLM
              </span>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-2">
              {rates.EUR && rates.EUR > 0 ? `€${rates.EUR.toFixed(4)}` : "Unavailable"}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              {rates.EUR && rates.EUR > 0
                ? `€1.00 EUR = ${(1 / rates.EUR).toFixed(3)} XLM`
                : "Rate unavailable"}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50/20 dark:from-zinc-900 dark:to-blue-950/20 border border-slate-200/80 dark:border-zinc-800 relative overflow-hidden group hover:border-blue-300 dark:hover:border-blue-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                XLM / USDC
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold">
                1 XLM
              </span>
            </div>
            <div className="text-2xl font-black text-zinc-900 dark:text-white mt-2">
              {rates.USDC && rates.USDC > 0 ? `$${rates.USDC.toFixed(4)}` : "Unavailable"}
            </div>
            <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              {rates.USDC && rates.USDC > 0
                ? `1.00 USDC = ${(1 / rates.USDC).toFixed(3)} XLM`
                : "Rate unavailable"}
            </div>
          </div>
        </div>

        {/* Live Interactive Conversion Preview Simulator */}
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white">
                Live Conversion Calculator
              </span>
            </div>
            <span className="text-[11px] text-zinc-400">
              60s Cache TTL • Active:{" "}
              <strong className="text-zinc-700 dark:text-zinc-200">{source}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-5">
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(e.target.value)}
                  placeholder="Enter fiat amount"
                  className="h-11 rounded-xl pr-20 bg-white dark:bg-zinc-900 font-semibold"
                />
                <select
                  aria-label="Calculator currency"
                  value={calcCurrency}
                  onChange={(e) => setCalcCurrency(e.target.value as SupportedCurrency)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 px-2 bg-slate-100 dark:bg-zinc-800 border-0 rounded-lg text-xs font-bold text-zinc-700 dark:text-zinc-300 cursor-pointer"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USDC">USDC</option>
                  <option value="XLM">XLM</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2 flex justify-center text-zinc-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>

            <div className="sm:col-span-5">
              <div className="h-11 px-4 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200/60 dark:border-indigo-500/30 flex items-center justify-between">
                <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  Equivalent:
                </span>
                <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-300">
                  {convertedAmount > 0
                    ? `${convertedAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })} XLM`
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Oracle Tech Spec Info Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <Layers className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              Soroban Pyth Feed ID:{" "}
              <code className="ml-1 text-[10px] text-zinc-400 font-mono">0xb7a8...a850</code>
            </span>
          </div>
          <span>Lock-in exchange rate timestamp guarantees zero slippage on logged sales.</span>
        </div>
      </CardContent>
    </Card>
  );
};
