import React from "react";
import { Shield, ShieldCheck, Award, Gem, Crown, CheckCircle2, Lock, ExternalLink } from "lucide-react";
import { useZKProof } from "../../hooks/useZKProof";
import { verifyZKRevenueProofSync } from "../../lib/zkProofEngine";
import type { RevenueTier } from "../../types/zkProof";

export interface VerifiedRevenueBadgeProps {
  customTier?: RevenueTier;
  customThresholdUsd?: number;
  className?: string;
  showDetails?: boolean;
  onOpenVerifier?: () => void;
}

export const VerifiedRevenueBadge: React.FC<VerifiedRevenueBadgeProps> = ({
  customTier,
  customThresholdUsd,
  className = "",
  showDetails = true,
  onOpenVerifier,
}) => {
  const { activeBadgeProof, activeBadgeTier, openVerifierModal } = useZKProof();

  const isProofValid = activeBadgeProof ? verifyZKRevenueProofSync(activeBadgeProof).isValid : true;

  if (activeBadgeProof && !isProofValid) {
    return null;
  }

  const tier = customTier || activeBadgeProof?.revenueTier || activeBadgeTier?.tier || "GOLD";
  const threshold =
    customThresholdUsd !== undefined
      ? customThresholdUsd
      : (activeBadgeProof?.claimedThresholdUsd ?? 50_000);

  const getTierIcon = () => {
    switch (tier) {
      case "ELITE":
        return <Crown className="w-4 h-4 text-purple-400" />;
      case "DIAMOND":
        return <Gem className="w-4 h-4 text-cyan-400" />;
      case "GOLD":
        return <Award className="w-4 h-4 text-amber-400" />;
      case "SILVER":
        return <ShieldCheck className="w-4 h-4 text-slate-300" />;
      case "BRONZE":
      default:
        return <Shield className="w-4 h-4 text-amber-600" />;
    }
  };

  const getTierStyle = () => {
    switch (tier) {
      case "ELITE":
        return "bg-gradient-to-r from-purple-950/60 to-purple-900/40 text-purple-200 border-purple-500/40 shadow-purple-500/10";
      case "DIAMOND":
        return "bg-gradient-to-r from-cyan-950/60 to-cyan-900/40 text-cyan-200 border-cyan-500/40 shadow-cyan-500/10";
      case "GOLD":
        return "bg-gradient-to-r from-amber-950/60 to-yellow-900/40 text-amber-200 border-amber-500/40 shadow-amber-500/10";
      case "SILVER":
        return "bg-gradient-to-r from-slate-900/60 to-slate-800/40 text-slate-200 border-slate-500/40 shadow-slate-500/10";
      case "BRONZE":
      default:
        return "bg-gradient-to-r from-amber-950/40 to-amber-900/30 text-amber-300 border-amber-600/30 shadow-amber-600/10";
    }
  };

  const handleClick = () => {
    if (onOpenVerifier) {
      onOpenVerifier();
    } else {
      openVerifierModal(activeBadgeProof || undefined);
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleClick();
        }
      }}
      data-testid="verified-revenue-badge"
      className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border shadow-lg backdrop-blur-md cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:brightness-110 select-none ${getTierStyle()} ${className}`}
      title="Click to view and cryptographically verify Zero-Knowledge Proof of Revenue"
    >
      <div className="flex items-center gap-1.5">
        {getTierIcon()}
        <span className="text-xs font-black tracking-wide uppercase">
          {`${tier} VERIFIED`}
        </span>
      </div>

      <div className="h-3 w-px bg-current opacity-20" />

      <div className="flex items-center gap-1">
        <span className="font-mono text-xs font-extrabold text-white">
          {`$${(threshold / 1000).toFixed(0)}K+ Vol`}
        </span>
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
      </div>

      {showDetails && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold opacity-75 hover:opacity-100 pl-1 border-l border-current/20">
          <Lock className="w-2.5 h-2.5" />
          <span>ZK-Proof</span>
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </span>
      )}
    </div>
  );
};
