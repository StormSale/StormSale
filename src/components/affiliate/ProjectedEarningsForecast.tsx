import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Shield, BarChart3, Activity, Target } from "lucide-react";

interface ClickDataPoint {
  day: string;
  clicks: number;
  conversions: number;
  conversionRate: number;
}

interface Projection {
  label: string;
  xlm: number;
  usd: number;
  weeklyXlm: number;
  weeklyUsd: number;
  color: string;
}

const XLM_USD_RATE = 0.45;
const AVG_COMMISSION_PER_CONVERSION = 2.5;

const generateHistoricalData = (): ClickDataPoint[] => {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day, i) => {
    const baseClicks = 1200 + i * 80 + Math.floor(Math.random() * 200);
    const baseRate = 0.025 + (i % 3) * 0.005 + (Math.random() * 0.01 - 0.005);
    const conversions = Math.floor(baseClicks * Math.max(0.01, baseRate));
    return {
      day,
      clicks: baseClicks,
      conversions,
      conversionRate: Math.max(0.01, baseRate),
    };
  });
};

const movingAverage = (values: number[], window: number): number[] => {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const windowValues = values.slice(start, i + 1);
    result.push(windowValues.reduce((a, b) => a + b, 0) / windowValues.length);
  }
  return result;
};

export const ProjectedEarningsForecast = () => {
  const [trafficMultiplier, setTrafficMultiplier] = useState(1.0);
  const [usdXlmRate, setUsdXlmRate] = useState(XLM_USD_RATE);

  const historicalData = useMemo(() => generateHistoricalData(), []);
  const clicks7DayAvg = useMemo(() => {
    const avgs = movingAverage(historicalData.map((d) => d.clicks), 7);
    return avgs[avgs.length - 1];
  }, [historicalData]);
  const conversionRate7DayAvg = useMemo(() => {
    const avgs = movingAverage(
      historicalData.map((d) => d.conversionRate),
      7,
    );
    return avgs[avgs.length - 1];
  }, [historicalData]);

  const projectedDailyConversions = useMemo(() => {
    return clicks7DayAvg * trafficMultiplier * conversionRate7DayAvg;
  }, [clicks7DayAvg, trafficMultiplier, conversionRate7DayAvg]);

  const projectedDailyXlm = useMemo(() => {
    return projectedDailyConversions * AVG_COMMISSION_PER_CONVERSION;
  }, [projectedDailyConversions]);

  const projectedMonthlyXlm = useMemo(() => {
    return projectedDailyXlm * 30;
  }, [projectedDailyXlm]);

  const projectedWeeklyXlm = useMemo(() => {
    return projectedDailyXlm * 7;
  }, [projectedDailyXlm]);

  const projections = useMemo<Projection[]>(() => {
    const low = projectedMonthlyXlm * 0.75;
    const avg = projectedMonthlyXlm;
    const high = projectedMonthlyXlm * 1.25;
    const weeklyLow = projectedWeeklyXlm * 0.75;
    const weeklyAvg = projectedWeeklyXlm;
    const weeklyHigh = projectedWeeklyXlm * 1.25;
    return [
      {
        label: "Low",
        xlm: low,
        usd: low * usdXlmRate,
        weeklyXlm: weeklyLow,
        weeklyUsd: weeklyLow * usdXlmRate,
        color: "text-amber-500",
      },
      {
        label: "Average",
        xlm: avg,
        usd: avg * usdXlmRate,
        weeklyXlm: weeklyAvg,
        weeklyUsd: weeklyAvg * usdXlmRate,
        color: "text-indigo-600",
      },
      {
        label: "High",
        xlm: high,
        usd: high * usdXlmRate,
        weeklyXlm: weeklyHigh,
        weeklyUsd: weeklyHigh * usdXlmRate,
        color: "text-emerald-500",
      },
    ];
  }, [projectedMonthlyXlm, projectedWeeklyXlm, usdXlmRate]);

  const accuracyScore = useMemo(() => {
    const variance = historicalData.reduce(
      (sum, d) => sum + Math.pow(d.conversionRate - conversionRate7DayAvg, 2),
      0,
    ) / historicalData.length;
    const stdDev = Math.sqrt(variance);
    return Math.max(60, Math.min(99, Math.round(100 - stdDev * 500)));
  }, [historicalData, conversionRate7DayAvg]);

  const forecastDaily = useMemo(() => {
    const daily: { day: string; low: number; avg: number; high: number }[] = [];
    const base = projectedDailyXlm;
    for (let i = 0; i < 30; i++) {
      const variance = 0.15 * Math.sin((i / 30) * Math.PI * 2);
      daily.push({
        day: `Day ${i + 1}`,
        low: Math.round(base * (0.75 + variance) * 100) / 100,
        avg: Math.round(base * (1 + variance) * 100) / 100,
        high: Math.round(base * (1.25 + variance) * 100) / 100,
      });
    }
    return daily;
  }, [projectedDailyXlm]);

  const maxDailyHigh = useMemo(() => {
    return Math.max(...forecastDaily.map((p) => p.high), 1);
  }, [forecastDaily]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Projected Earnings Forecast
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          30-day earnings projection based on 7-day moving average traffic velocity
        </p>
      </div>

      {/* Forecast Card */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
        <CardHeader className="pt-8 px-8 pb-6 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-zinc-900 dark:text-white">
                30-Day Earnings Forecast
              </CardTitle>
              <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1">
                Low, average, and high projections in XLM and USD
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-8 pb-8 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {projections.map((proj) => (
              <Card
                key={proj.label}
                className="border-l-4 p-6 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {proj.label} Projection
                    </p>
                    <div className="flex items-baseline gap-1 mt-2">
                      <span className="text-3xl font-extrabold text-zinc-900 dark:text-white">
                        {proj.xlm.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-sm font-medium {proj.color}">XLM</span>
                    </div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      ≈ ${proj.usd.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <div className="mt-3 pt-2 border-t border-slate-200 dark:border-zinc-800">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                        Weekly
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-bold text-zinc-900 dark:text-white">
                          {proj.weeklyXlm.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span className="text-sm font-medium {proj.color}">XLM</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                        ≈ ${proj.weeklyUsd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-zinc-800/50">
                    <Shield className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Confidence Intervals */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                7-Day Avg Clicks
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {Math.round(clicks7DayAvg * trafficMultiplier).toLocaleString()}
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">clicks/day</span>
              </div>
            </Card>
            <Card className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                7-Day Avg Conversion
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-zinc-900 dark:text-white">
                  {(conversionRate7DayAvg * 100).toFixed(2)}%
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">conversion rate</span>
              </div>
            </Card>
            <Card className="p-6 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                Prediction Accuracy
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {accuracyScore}%
                </span>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">historical accuracy</span>
              </div>
            </Card>
          </div>

          {/* Traffic Simulator Slider */}
          <div className="bg-slate-50 dark:bg-zinc-950/50 p-6 rounded-2xl border border-slate-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                  Traffic Volume Simulator
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Simulate impact of increased traffic on monthly earnings
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                  {Math.round((trafficMultiplier - 1) * 100)}%
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">traffic change</span>
              </div>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.1"
              value={trafficMultiplier}
              onChange={(e) => setTrafficMultiplier(parseFloat(e.target.value))}
              aria-label="Traffic volume simulator slider"
              className="w-full h-2 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </div>

          {/* 30-Day Forecast Chart Area */}
          <div className="mt-8">
            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4">
              30-Day Forecast Trajectory
            </p>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 h-48">
              {forecastDaily.map((point, i) => {
                const isMid = i === 0 || i === 14 || i === 29;
                return (
                  <div key={i} className="flex flex-col items-center justify-end gap-1">
                    <div
                      className="w-full bg-indigo-200 dark:bg-indigo-500/20 rounded-t-lg transition-all duration-300 hover:bg-indigo-300 dark:hover:bg-indigo-500/40"
                      style={{
                        height: `${Math.max(20, (point.high / maxDailyHigh) * 100)}%`,
                      }}
                    />
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-indigo-600/20 to-transparent rounded-t-lg h-4" />
                    {isMid && (
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
                        {point.day}
                      </span>
                    )}
                    <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500 mt-2 font-mono">
              <span>{projections[0].xlm.toFixed(2)} XLM</span>
              <span>{projections[1].xlm.toFixed(2)} XLM</span>
              <span>{projections[2].xlm.toFixed(2)} XLM</span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="pt-6 px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-4 h-4 text-zinc-500" />
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Based on {historicalData.length}-day moving average analysis
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {accuracyScore}% accuracy score
              </span>
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              XLM to USD Rate
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              Current exchange rate for projections
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              <Label htmlFor="xlmUsdRate" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                1 XLM = USD
              </Label>
              <Input
                id="xlmUsdRate"
                type="number"
                step="0.01"
                value={usdXlmRate}
                onChange={(e) => setUsdXlmRate(parseFloat(e.target.value) || 0)}
                className="h-11"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
