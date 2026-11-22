import React from "react";
import { ShieldCheck, Clock, AlertTriangle, AlertCircle } from "lucide-react";
import type { KybStatus } from "../../types/kyb";

export interface KybStatusBadgeProps {
  status: KybStatus;
  className?: string;
}

export const KybStatusBadge: React.FC<KybStatusBadgeProps> = ({ status, className = "" }) => {
  const getConfig = () => {
    switch (status) {
      case "VERIFIED":
        return {
          label: "VERIFIED",
          displayLabel: "Verified",
          icon: ShieldCheck,
          badgeClass:
            "kyb-status-verified bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
          ariaLabel: "KYB Status: VERIFIED",
        };
      case "PENDING_REVIEW":
        return {
          label: "PENDING_REVIEW",
          displayLabel: "Pending Review",
          icon: Clock,
          badgeClass:
            "kyb-status-pending-review bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
          ariaLabel: "KYB Status: PENDING_REVIEW",
        };
      case "ACTION_REQUIRED":
        return {
          label: "ACTION_REQUIRED",
          displayLabel: "Action Required",
          icon: AlertTriangle,
          badgeClass:
            "kyb-status-action-required bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
          ariaLabel: "KYB Status: ACTION_REQUIRED",
        };
      case "UNVERIFIED":
      default:
        return {
          label: "UNVERIFIED",
          displayLabel: "Unverified",
          icon: AlertCircle,
          badgeClass:
            "kyb-status-unverified bg-slate-50 text-slate-700 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
          ariaLabel: "KYB Status: UNVERIFIED",
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;

  return (
    <span
      role="status"
      aria-label={config.ariaLabel}
      data-testid="kyb-status-badge"
      data-status={status}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.badgeClass} ${className}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
