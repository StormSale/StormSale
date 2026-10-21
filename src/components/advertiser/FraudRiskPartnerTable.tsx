import React, { useState, useMemo } from "react";
import { ShieldAlert, ShieldCheck, AlertOctagon, Lock, Search, Zap, Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CopyButton } from "../ui/copy-button";
import { FraudRiskBadge } from "./FraudRiskBadge";
import { useFraudRisk } from "../../hooks/useFraudRisk";
import { formatStellarAddress } from "../../lib/stellar";
import type { RiskScoreLevel } from "../../types/fraud";

export const FraudRiskPartnerTable: React.FC = () => {
  const {
    riskProfiles,
    campaignSummary,
    pausedAffiliates,
    pauseAffiliateAction,
    unpauseAffiliateAction,
  } = useFraudRisk();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<RiskScoreLevel | "ALL" | "FROZEN">(
    "ALL",
  );

  const profileList = useMemo(() => {
    return Object.values(riskProfiles);
  }, [riskProfiles]);

  const filteredProfiles = useMemo(() => {
    return profileList.filter((profile) => {
      // Risk filter
      if (selectedRiskFilter === "FROZEN") {
        if (!profile.isPaused) return false;
      } else if (selectedRiskFilter !== "ALL") {
        if (profile.riskLevel !== selectedRiskFilter) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = profile.affiliateName.toLowerCase().includes(query);
        const matchesAddr = profile.affiliateAddress.toLowerCase().includes(query);
        const matchesSub = profile.topSubId?.toLowerCase().includes(query) ?? false;
        if (!matchesName && !matchesAddr && !matchesSub) return false;
      }

      return true;
    });
  }, [profileList, selectedRiskFilter, searchQuery]);

  return (
    <div className="space-y-6" data-testid="fraud-risk-partner-table">
      {/* 1. Anomaly & Fraud Overview Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Affiliates */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Monitored Partners
              </p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white mt-1">
                {profileList.length}
              </p>
              <p className="text-[11px] text-zinc-400 font-medium">Click & conversion tracking</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Network className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Statistical Velocity Anomalies (> 3σ) */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Velocity Anomalies (&gt;3σ)
              </p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                {campaignSummary.flaggedAnomaliesCount}
              </p>
              <p className="text-[11px] text-rose-500 font-semibold">&gt; 3 standard deviations</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Zap className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Critical Risk Affiliates */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Critical Risk (Score &gt; 80)
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                {campaignSummary.criticalAffiliatesCount}
              </p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                Bot click bursts detected
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertOctagon className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Frozen Affiliates */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/80 rounded-2xl shadow-sm">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Payouts Frozen
              </p>
              <p className="text-2xl font-black text-rose-700 dark:text-rose-300 mt-1">
                {Object.keys(pausedAffiliates).length}
              </p>
              <p className="text-[11px] text-zinc-400 font-medium">1-click escrow protection</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Partner Risk Table Card */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white/90 dark:bg-zinc-900/80 overflow-hidden">
        <CardHeader className="p-6 md:p-8 border-b border-slate-100 dark:border-zinc-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-500" />
              <span>Partner Fraud Risk & Conversion Velocity Engine</span>
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Automated anomaly scoring tracking click-to-conversion time deltas, Z-score
              velocities, and repetitive sub-IDs
            </CardDescription>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search partner or wallet..."
                className="h-9 pl-9 text-xs rounded-xl border-slate-200 dark:border-zinc-800"
                data-testid="input-partner-search"
              />
            </div>

            {/* Risk Level Pills Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-950 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-bold">
              {(["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "FROZEN"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedRiskFilter(filter)}
                  className={`px-2.5 py-1 rounded-lg transition-all capitalize ${
                    selectedRiskFilter === filter
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-black"
                      : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                  data-testid={`filter-btn-${filter.toLowerCase()}`}
                >
                  {filter.toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="fraud-risk-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800/60 bg-slate-50/50 dark:bg-zinc-950/40 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-4 px-6">Affiliate Partner</th>
                  <th className="py-4 px-6">Velocity & Conversions</th>
                  <th className="py-4 px-6">Click Delta</th>
                  <th className="py-4 px-6">Traffic Patterns</th>
                  <th className="py-4 px-6">Risk Score</th>
                  <th className="py-4 px-6 text-right">1-Click Payout Control</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 text-xs">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400">
                      <ShieldCheck className="w-8 h-8 mx-auto text-emerald-500/50 mb-2" />
                      <p className="font-semibold">
                        No partners match the selected filter criteria.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((partner) => {
                    return (
                      <tr
                        key={partner.affiliateAddress}
                        className={`hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors ${
                          partner.riskLevel === "CRITICAL"
                            ? "bg-rose-50/30 dark:bg-rose-950/10"
                            : ""
                        }`}
                        data-testid={`row-partner-${partner.affiliateAddress}`}
                      >
                        {/* Name & Wallet */}
                        <td className="py-4 px-6">
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-900 dark:text-white">
                              {partner.affiliateName}
                            </span>
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400 mt-0.5">
                              <span>{formatStellarAddress(partner.affiliateAddress)}</span>
                              <CopyButton text={partner.affiliateAddress} label="Copy" size="sm" />
                            </div>
                          </div>
                        </td>

                        {/* Velocity & Z-Score */}
                        <td className="py-4 px-6">
                          <div className="flex flex-col">
                            <span className="font-extrabold text-zinc-900 dark:text-white flex items-center gap-1">
                              <span>{partner.peakVelocityPerMinute} c/min</span>
                              {partner.isVelocityAnomaly && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-mono font-bold">
                                  &gt;3σ
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {partner.totalConversions} total · Z: {partner.velocityZScore}σ
                            </span>
                          </div>
                        </td>

                        {/* Click Delta */}
                        <td className="py-4 px-6">
                          <div className="flex flex-col">
                            <span
                              className={`font-bold ${
                                partner.medianTimeDeltaSeconds < 2.0
                                  ? "text-rose-600 dark:text-rose-400 font-black"
                                  : "text-zinc-800 dark:text-zinc-200"
                              }`}
                            >
                              {partner.medianTimeDeltaSeconds}s median
                            </span>
                            <span className="text-[11px] text-zinc-400 font-mono">
                              min: {partner.minTimeDeltaSeconds}s
                            </span>
                          </div>
                        </td>

                        {/* IP Burst & Sub-ID */}
                        <td className="py-4 px-6">
                          <div className="flex flex-col text-[11px]">
                            <span className="text-zinc-700 dark:text-zinc-300 font-mono">
                              IP Burst: {partner.ipHashBurstCount}/min
                            </span>
                            <span
                              className="text-zinc-400 truncate max-w-[140px]"
                              title={partner.topSubId}
                            >
                              Sub-ID: {partner.topSubId || "direct"} ({partner.repetitiveSubIdRate}
                              %)
                            </span>
                          </div>
                        </td>

                        {/* Risk Score Badge with Tooltip */}
                        <td className="py-4 px-6">
                          <FraudRiskBadge
                            affiliateAddress={partner.affiliateAddress}
                            affiliateName={partner.affiliateName}
                            campaignId={partner.campaignId}
                            showActionBtn={false}
                            customProfile={partner}
                          />
                        </td>

                        {/* 1-Click Action */}
                        <td className="py-4 px-6 text-right">
                          {partner.isPaused ? (
                            <Button
                              size="sm"
                              onClick={() => unpauseAffiliateAction(partner.affiliateAddress)}
                              className="h-8 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                              data-testid={`btn-table-unfreeze-${partner.affiliateAddress}`}
                            >
                              Unfreeze
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant={partner.riskLevel === "CRITICAL" ? "default" : "outline"}
                              onClick={() =>
                                pauseAffiliateAction(
                                  partner.affiliateAddress,
                                  `Paused by advertiser: ${partner.riskLevel} fraud risk (score: ${partner.riskScore})`,
                                  partner.affiliateName,
                                )
                              }
                              className={`h-8 rounded-xl text-xs font-bold ${
                                partner.riskLevel === "CRITICAL"
                                  ? "bg-rose-600 hover:bg-rose-500 text-white shadow-md ring-2 ring-rose-500/20"
                                  : "border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              }`}
                              data-testid={`btn-table-freeze-${partner.affiliateAddress}`}
                            >
                              {partner.riskLevel === "CRITICAL" ? "Freeze Payouts" : "Pause"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
