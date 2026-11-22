import React from "react";
import { AlertTriangle } from "lucide-react";
import type { KybStatus } from "../../types/kyb";

export interface KybRestrictedBannerProps {
  status: KybStatus;
  expiresAt?: string | number | Date | null;
  className?: string;
}

export const KybRestrictedBanner: React.FC<KybRestrictedBannerProps> = ({
  status,
  expiresAt,
  className = "",
}) => {
  const isExpired = Boolean(
    expiresAt && new Date(expiresAt).getTime() <= Date.now()
  );
  const isActionRequired = status === "ACTION_REQUIRED";

  const shouldShow = isActionRequired || isExpired;

  if (!shouldShow) {
    return null;
  }

  const reason = isExpired
    ? "Your organization KYB compliance status has expired. Functionality is restricted until renewal."
    : "Action is required to complete your organization KYB compliance verification. Functionality is currently restricted.";

  return (
    <div
      role="alert"
      data-testid="kyb-restricted-banner"
      className={`rounded-2xl p-4 border flex items-start gap-3 bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200 ${className}`}
    >
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 text-xs">
        <div className="font-bold text-amber-900 dark:text-amber-100 flex items-center gap-2">
          <span>Restricted Functionality</span>
          {isExpired && (
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300">
              Expired
            </span>
          )}
        </div>
        <p className="mt-1 text-amber-700 dark:text-amber-300">{reason}</p>
      </div>
    </div>
  );
};
