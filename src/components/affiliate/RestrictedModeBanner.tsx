import React from "react";
import { AlertOctagon, FileText, ArrowRight } from "lucide-react";
import {
  isAffiliateSybilRestricted,
  getSybilClusterDetails,
  type SybilClusterTelemetry,
} from "../../lib/sybilDefense";

export interface RestrictedModeBannerProps {
  affiliateAddress?: string;
  isRestricted?: boolean;
  clusterDetails?: SybilClusterTelemetry | null;
  disputeUrl?: string;
  onDisputeClick?: () => void;
  className?: string;
}

export const RestrictedModeBanner: React.FC<RestrictedModeBannerProps> = ({
  affiliateAddress,
  isRestricted: propIsRestricted,
  clusterDetails: propClusterDetails,
  disputeUrl = "#dispute",
  onDisputeClick,
  className = "",
}) => {
  const restricted =
    propIsRestricted !== undefined
      ? propIsRestricted
      : isAffiliateSybilRestricted(affiliateAddress);

  const cluster =
    propClusterDetails !== undefined
      ? propClusterDetails
      : getSybilClusterDetails(affiliateAddress);

  if (!restricted) {
    return null;
  }

  const disputeLinkHref = cluster?.disputeId
    ? `${disputeUrl}?ticket=${encodeURIComponent(cluster.disputeId)}`
    : disputeUrl;

  return (
    <div
      role="alert"
      data-testid="banner-restricted-mode"
      className={`p-5 rounded-3xl bg-amber-50 dark:bg-amber-950/70 border-2 border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-100 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-amber-500 text-zinc-950 flex items-center justify-center shrink-0 mt-0.5 shadow-md">
          <AlertOctagon className="w-5 h-5 stroke-[2.5]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-extrabold text-sm md:text-base text-amber-900 dark:text-amber-100 tracking-tight">
              Restricted Mode: Sybil Cluster Activity Detected
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100">
              High Risk
            </span>
          </div>
          <p className="text-xs text-amber-800 dark:text-amber-200 mt-1 leading-relaxed max-w-2xl">
            Backend telemetry flagged multiple associated accounts originating from the same IP network
            or common funding source. To protect advertisers,{" "}
            <strong>instant payout claims and automated balance withdrawals are disabled</strong> while
            in restricted mode.
          </p>
          {cluster && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300 font-medium">
              <span>Cluster ID: {cluster.clusterId}</span>
              <span>•</span>
              <span>Cluster Size: {cluster.clusterSize} accounts</span>
              {cluster.sharedIpHash && (
                <>
                  <span>•</span>
                  <span>IP Hash: {cluster.sharedIpHash.slice(0, 8)}...</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 self-end md:self-center">
        <a
          href={disputeLinkHref}
          data-testid="link-submit-dispute"
          onClick={(e) => {
            if (onDisputeClick) {
              e.preventDefault();
              onDisputeClick();
            }
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
        >
          <FileText className="w-4 h-4" />
          <span>Submit Dispute</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
