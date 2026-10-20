import React from "react";
import { type TTLHealthStatus } from "../../lib/contractTTL";
import { ShieldCheck, AlertTriangle, AlertOctagon, Archive } from "lucide-react";

interface ContractTTLBadgeProps {
  status: TTLHealthStatus;
  remainingLedgers: number;
  durationText: string;
  onClick?: () => void;
  className?: string;
}

export const ContractTTLBadge: React.FC<ContractTTLBadgeProps> = ({
  status,
  remainingLedgers,
  durationText,
  onClick,
  className = "",
}) => {
  const getBadgeConfig = () => {
    switch (status) {
      case "healthy":
        return {
          bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
          dot: "bg-emerald-500",
          icon: ShieldCheck,
          label: "TTL Healthy",
        };
      case "warning":
        return {
          bg: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
          dot: "bg-amber-500",
          icon: AlertTriangle,
          label: "TTL Warning",
        };
      case "critical":
        return {
          bg: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400 animate-pulse",
          dot: "bg-rose-500",
          icon: AlertOctagon,
          label: "Restoration Required",
        };
      case "archived":
        return {
          bg: "bg-zinc-500/10 border-zinc-500/30 text-zinc-600 dark:text-zinc-400",
          dot: "bg-zinc-500",
          icon: Archive,
          label: "Contract Archived",
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  return (
    <div
      role="status"
      aria-label={`Contract TTL: ${config.label}`}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold transition-all cursor-pointer select-none ${config.bg} ${className}`}
      title={`Remaining: ${remainingLedgers.toLocaleString()} ledgers (~${durationText})`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dot}`} />
      <Icon className="w-3.5 h-3.5" />
      <span>{config.label}</span>
      <span className="opacity-75 font-normal">({remainingLedgers.toLocaleString()} ledgers)</span>
    </div>
  );
};
