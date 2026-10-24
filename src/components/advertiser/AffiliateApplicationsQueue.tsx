import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import {
  listApplications,
  listAdvertiserPolicies,
  reviewApplication,
  type AffiliateApplication,
  type ApplicationStatus,
} from "../../lib/campaignAccess";
import { formatStellarAddress } from "../../lib/stellar";
import { Check, ClipboardList, ExternalLink, Inbox, Lock, X } from "lucide-react";

const FILTERS: { id: ApplicationStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_BADGE: Record<ApplicationStatus, string> = {
  pending: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  approved: "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  rejected: "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10",
};

/**
 * The advertiser's queue of affiliate applications for their private
 * campaigns. One click approves or rejects; a decision can be reversed from
 * the Approved / Rejected views.
 */
export const AffiliateApplicationsQueue = () => {
  const { userAddress } = useWeb3();
  const { showNotification } = useNotification();
  const [filter, setFilter] = useState<ApplicationStatus>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bumped whenever the access data changes (here, in another component, or
  // in another tab); the views below are derived from storage during render.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener("stormsale:campaign-access", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("stormsale:campaign-access", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  const { applications, counts, privateCampaigns } = useMemo(() => {
    const all: AffiliateApplication[] = userAddress
      ? listApplications({ advertiser: userAddress })
      : [];
    const countBy = (status: ApplicationStatus) => all.filter((a) => a.status === status).length;
    return {
      applications: all.filter((a) => a.status === filter),
      counts: {
        pending: countBy("pending"),
        approved: countBy("approved"),
        rejected: countBy("rejected"),
      },
      privateCampaigns: userAddress
        ? listAdvertiserPolicies(userAddress).filter((p) => p.visibility === "private").length
        : 0,
    };
    // `version` is the change signal: it is read so the memo recomputes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress, filter, version]);

  const decide = (application: AffiliateApplication, decision: "approved" | "rejected") => {
    if (!userAddress) return;
    setBusyId(application.id);
    try {
      reviewApplication(application.id, userAddress, decision);
      showNotification({
        type: decision === "approved" ? "success" : "info",
        title: decision === "approved" ? "Affiliate Approved" : "Affiliate Rejected",
        message:
          decision === "approved"
            ? `${formatStellarAddress(application.affiliate)} can now generate tracking links for campaign #${application.campaignId}.`
            : `${formatStellarAddress(application.affiliate)} cannot promote or be credited on campaign #${application.campaignId}.`,
      });
    } catch (err) {
      showNotification({
        type: "error",
        title: "Review Failed",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Affiliate Applications
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
          Review affiliates applying to your private campaigns. Only approved affiliates can
          generate tracking links or be credited with sales.
        </p>
      </div>

      {!userAddress ? (
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl">
          <CardContent className="p-8 text-center text-zinc-500 dark:text-zinc-400 font-medium">
            Connect your advertiser wallet to review applications.
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm rounded-3xl bg-white dark:bg-zinc-900/50">
          <CardHeader className="pb-4 pt-8 px-6 sm:px-8 border-b border-slate-100 dark:border-zinc-800/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-zinc-900 dark:bg-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                  <ClipboardList className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                    Review Queue
                  </CardTitle>
                  <CardDescription className="text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    {privateCampaigns} private campaign{privateCampaigns === 1 ? "" : "s"}
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2" role="tablist" aria-label="Application status">
                {FILTERS.map((f) => (
                  <Button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.id}
                    variant={filter === f.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(f.id)}
                    className="rounded-xl font-semibold"
                  >
                    {f.label}
                    <span className="ml-1.5 text-xs opacity-80">{counts[f.id]}</span>
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {applications.length === 0 ? (
              <div className="p-10 text-center">
                <Inbox className="w-10 h-10 mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="mt-3 font-semibold text-zinc-700 dark:text-zinc-300">
                  No {filter} applications
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  {filter === "pending"
                    ? "New applications to your private campaigns will appear here."
                    : `Applications you have ${filter} will appear here.`}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                {applications.map((a) => (
                  <li key={a.id} className="p-6 sm:p-8 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="font-mono font-bold text-zinc-900 dark:text-white"
                            title={a.affiliate}
                          >
                            {formatStellarAddress(a.affiliate)}
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            Campaign #{a.campaignId}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${STATUS_BADGE[a.status]}`}
                          >
                            {a.status}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                          Applied {new Date(a.submittedAt).toLocaleString()}
                          {a.reviewedAt
                            ? ` · reviewed ${new Date(a.reviewedAt).toLocaleString()}`
                            : ""}
                        </p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {a.status !== "approved" && (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyId === a.id}
                            onClick={() => decide(a, "approved")}
                            aria-label={`Approve ${a.affiliate} for campaign ${a.campaignId}`}
                            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        )}
                        {a.status !== "rejected" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyId === a.id}
                            onClick={() => decide(a, "rejected")}
                            aria-label={`Reject ${a.affiliate} for campaign ${a.campaignId}`}
                            className="rounded-xl border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-semibold"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                        Promotional channels
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {a.channels.map((channel) => (
                          <li key={channel}>
                            <a
                              href={channel}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                            >
                              {channel.replace(/^https?:\/\//, "")}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {a.message && (
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950/50 rounded-xl p-4 whitespace-pre-wrap break-words">
                        {a.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
