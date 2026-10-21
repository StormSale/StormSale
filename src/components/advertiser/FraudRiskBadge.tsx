import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  Lock,
  Zap,
  Clock,
  Layers,
  Network,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../ui/tooltip";
import { Button } from "../ui/button";
import { useFraudRisk } from "../../hooks/useFraudRisk";
import type { RiskScoreLevel, AffiliateRiskProfile } from "../../types/fraud";

export interface FraudRiskBadgeProps {
  readonly affiliateAddress: string;
  readonly affiliateName?: string;
  readonly campaignId?: string;
  readonly showActionBtn?: boolean;
  readonly customProfile?: AffiliateRiskProfile;
}

export const FraudRiskBadge: React.FC<FraudRiskBadgeProps> = ({
  affiliateAddress,
  affiliateName,
  showActionBtn = true,
  customProfile,
}) => {
  const { getRiskProfile, pauseAffiliateAction, unpauseAffiliateAction, isAffiliatePaused } =
    useFraudRisk();
  const profile = customProfile || getRiskProfile(affiliateAddress);

  const riskLevel: RiskScoreLevel = profile?.riskLevel || "LOW";
  const riskScore = profile?.riskScore ?? 0;
  const isPaused = profile?.isPaused ?? isAffiliatePaused(affiliateAddress);
  const name = affiliateName || profile?.affiliateName || "Partner";

  const getPillStyles = (level: RiskScoreLevel) => {
    switch (level) {
      case "CRITICAL":
        return {
          bg: "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300 dark:border-rose-800 ring-2 ring-rose-500/20",
          icon: (
            <AlertOctagon className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0 animate-pulse" />
          ),
          label: "Critical",
        };
      case "HIGH":
        return {
          bg: "bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300 border-orange-300 dark:border-orange-800",
          icon: <AlertTriangle className="w-3 h-3 text-orange-600 dark:text-orange-400 shrink-0" />,
          label: "High",
        };
      case "MEDIUM":
        return {
          bg: "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800",
          icon: <AlertCircle className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />,
          label: "Medium",
        };
      case "LOW":
      default:
        return {
          bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
          icon: <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />,
          label: "Low",
        };
    }
  };

  const pill = getPillStyles(riskLevel);

  return (
    <div
      className="inline-flex items-center gap-2"
      data-testid={`fraud-risk-badge-${affiliateAddress}`}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              tabIndex={0}
              role="button"
              aria-label={`Fraud Risk: ${pill.label} (${riskScore}/100)`}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider border cursor-pointer transition-all hover:scale-105 select-none ${pill.bg}`}
              data-testid={`risk-pill-${riskLevel.toLowerCase()}`}
            >
              {pill.icon}
              <span>{pill.label}</span>
              <span className="font-mono text-[10px] opacity-80">{`(${riskScore})`}</span>
            </div>
          </TooltipTrigger>

          <TooltipContent
            side="top"
            align="center"
            className="w-80 p-4 space-y-3 bg-zinc-900 text-white border-zinc-800 shadow-2xl rounded-2xl"
            data-testid="fraud-risk-tooltip"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                {pill.icon}
                <span className="font-extrabold text-xs text-white">
                  Fraud Risk: {pill.label} ({riskScore}/100)
                </span>
              </div>
              {isPaused ? (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  Frozen
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Active
                </span>
              )}
            </div>

            {/* Key Statistics */}
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 uppercase">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Velocity</span>
                </div>
                <div className="font-bold text-white">
                  {profile?.peakVelocityPerMinute ?? 0}{" "}
                  <span className="text-[9px] text-zinc-400">c/min</span>
                </div>
                <div className="text-[10px] text-indigo-400">
                  Z-Score: {profile?.velocityZScore ?? 0}σ
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 uppercase">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>Click Delta</span>
                </div>
                <div className="font-bold text-white">
                  {profile?.medianTimeDeltaSeconds ?? 0}s{" "}
                  <span className="text-[9px] text-zinc-400">med</span>
                </div>
                <div className="text-[10px] text-zinc-400">
                  Min: {profile?.minTimeDeltaSeconds ?? 0}s
                </div>
              </div>
            </div>

            {/* Triggered Risk Factors */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Detected Risk Factors:
              </span>

              {profile && profile.riskFactors.length > 0 ? (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {profile.riskFactors.map((factor, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800 text-[10px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between font-bold text-zinc-200">
                        <span className="flex items-center gap-1">
                          {factor.severity === "CRITICAL" ? (
                            <AlertOctagon className="w-3 h-3 text-rose-400 shrink-0" />
                          ) : factor.severity === "HIGH" ? (
                            <AlertTriangle className="w-3 h-3 text-orange-400 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                          <span>{factor.title}</span>
                        </span>
                        {factor.value && (
                          <span className="text-zinc-400 font-mono text-[9px]">{factor.value}</span>
                        )}
                      </div>
                      <p className="text-zinc-400 leading-snug">{factor.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 py-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>No statistical anomalies or bot patterns detected.</span>
                </div>
              )}
            </div>

            {/* IP & Sub-ID Meta */}
            <div className="flex items-center justify-between text-[10px] text-zinc-400 border-t border-zinc-800 pt-2 font-mono">
              <span className="flex items-center gap-1">
                <Network className="w-3 h-3" />
                IP Burst: {profile?.ipHashBurstCount ?? 0}/min
              </span>
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Sub-ID: {profile?.repetitiveSubIdRate ?? 0}%
              </span>
            </div>

            {/* 1-Click Action inside tooltip */}
            <div className="pt-2 border-t border-zinc-800">
              {isPaused ? (
                <Button
                  size="sm"
                  onClick={() => unpauseAffiliateAction(affiliateAddress)}
                  className="w-full h-8 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5"
                  data-testid="tooltip-btn-unfreeze"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Unfreeze Affiliate</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    pauseAffiliateAction(
                      affiliateAddress,
                      `Velocity anomaly & risk review (score: ${riskScore})`,
                      name,
                    )
                  }
                  className="w-full h-8 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center gap-1.5 shadow-sm"
                  data-testid="tooltip-btn-freeze"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>Freeze Payouts Pending Review</span>
                </Button>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Paused / Frozen Indicator Badge */}
      {isPaused && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
          data-testid="badge-affiliate-frozen"
        >
          <Lock className="w-2.5 h-2.5" />
          <span>Frozen</span>
        </span>
      )}

      {/* External 1-Click Action Button when rendered in table rows */}
      {showActionBtn && (
        <div className="inline-flex items-center">
          {isPaused ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => unpauseAffiliateAction(affiliateAddress)}
              className="h-7 px-2.5 rounded-lg text-[10px] font-bold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 flex items-center gap-1"
              data-testid={`btn-unfreeze-${affiliateAddress}`}
              title="Unfreeze affiliate and restore payout claiming"
            >
              <PlayCircle className="w-3 h-3" />
              <span>Unfreeze</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                pauseAffiliateAction(affiliateAddress, `Manual review triggered for ${name}`, name)
              }
              className={`h-7 px-2.5 rounded-lg text-[10px] font-bold border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1 ${
                riskLevel === "CRITICAL" || riskLevel === "HIGH"
                  ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-400"
                  : "text-zinc-500 hover:text-rose-600 border-zinc-200 dark:border-zinc-800"
              }`}
              data-testid={`btn-freeze-${affiliateAddress}`}
              title="Freeze affiliate from claiming commission payouts"
            >
              <PauseCircle className="w-3 h-3" />
              <span>{riskLevel === "CRITICAL" ? "Freeze Payouts" : "Pause"}</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
