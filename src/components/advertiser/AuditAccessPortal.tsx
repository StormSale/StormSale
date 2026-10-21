import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useNotification } from "../../context/NotificationContext";
import {
  readAuditLedger,
  verifyAuditChain,
  revokeAuditorKey,
  getAuditorsForCampaigns,
  type AuditAccessEvent,
  type AuditAction,
  type AuditorRosterEntry,
  type ChainVerification,
} from "../../lib/auditLedger";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Key,
  RefreshCw,
  Eye,
} from "lucide-react";

/**
 * Merchant-facing Access Log Transparency Portal (Issue #182).
 * Shows every instance an auditor key inspected or decrypted this merchant's
 * campaign payloads, verifies the append-only hash chain, and provides an
 * emergency action to revoke a compromised auditor key. Read-only by design —
 * merchants never mutate history, they only append revocations.
 */

const MY_CAMPAIGNS = [
  {
    name: "Tech Gadgets Pro",
    address: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
  },
  {
    name: "Summer Sale 2026",
    address: "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
  },
  {
    name: "NFT Drop Alpha",
    address: "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
  },
];

const CAMPAIGN_ADDRESSES = MY_CAMPAIGNS.map((c) => c.address);

const actionConfig: Record<AuditAction, { label: string; badge: string }> = {
  access_granted: {
    label: "Access Granted",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  access_denied: {
    label: "Access Denied",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  },
  payload_decrypted: {
    label: "Payload Decrypted",
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400",
  },
  key_revoked: {
    label: "Key Revoked",
    badge: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  },
};

export const AuditAccessPortal = () => {
  const { showNotification } = useNotification();
  const [events, setEvents] = useState<AuditAccessEvent[]>([]);
  const [chainCheck, setChainCheck] = useState<ChainVerification | null>(null);
  const [auditors, setAuditors] = useState<AuditorRosterEntry[]>([]);
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshLedger = useCallback(async () => {
    setIsRefreshing(true);
    const ledger = readAuditLedger();
    const mine = ledger.filter((e) =>
      CAMPAIGN_ADDRESSES.map((a) => a.toUpperCase()).includes(
        e.campaignAddress.trim().toUpperCase(),
      ),
    );
    setEvents(mine);
    // Verification runs over the full chain — a break anywhere is evidence the
    // merchant is looking at tampered history.
    setChainCheck(await verifyAuditChain(ledger));
    setAuditors(getAuditorsForCampaigns(CAMPAIGN_ADDRESSES));
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    refreshLedger();
  }, [refreshLedger]);

  const visibleEvents =
    campaignFilter === "all"
      ? events
      : events.filter(
          (e) =>
            e.campaignAddress.trim().toUpperCase() === campaignFilter.trim().toUpperCase(),
        );

  const handleEmergencyRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeAuditorKey(
        revokeTarget,
        "Emergency merchant revocation from Access Log Transparency Portal",
        "merchant-portal",
      );
      showNotification({
        type: "warning",
        title: "Auditor Key Revoked",
        message: `Key ${revokeTarget.slice(0, 6)}...${revokeTarget.slice(-4)} can no longer decrypt conversion payloads.`,
      });
      await refreshLedger();
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Revocation Failed",
        message: err.message || "Audit ledger rejected the revocation event.",
      });
    } finally {
      setRevokeTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Access Log Transparency Portal
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Every auditor inspection of your campaigns&apos; encrypted conversion data, from the
            append-only tamper-evident ledger.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={refreshLedger}
          disabled={isRefreshing}
          className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Re-verify Chain
        </Button>
      </div>

      {/* Chain integrity banner */}
      <div
        className={`p-5 rounded-2xl border flex items-start gap-4 ${
          chainCheck?.valid
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
            : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
        }`}
      >
        {chainCheck?.valid ? (
          <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
        ) : (
          <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
        )}
        <div className="flex-1">
          <h3
            className={`font-bold text-sm ${
              chainCheck?.valid
                ? "text-emerald-900 dark:text-emerald-200"
                : "text-rose-900 dark:text-rose-200"
            }`}
          >
            {chainCheck?.valid
              ? `Ledger integrity verified · ${chainCheck.length} chained entries`
              : "Chain verification FAILED — logs may have been tampered with"}
          </h3>
          <p
            className={`text-xs mt-1 font-medium ${
              chainCheck?.valid
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-rose-700 dark:text-rose-300"
            }`}
          >
            {chainCheck?.valid
              ? `Head digest: ${chainCheck.headHash.slice(0, 32)}…`
              : `Break detected at entry #${chainCheck?.brokenAtSequence ?? "?"}: ${chainCheck?.reason ?? "awaiting verification"}`}
          </p>
        </div>
      </div>

      {/* Campaign filter chips */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCampaignFilter("all")}
          className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
            campaignFilter === "all"
              ? "bg-zinc-900 dark:bg-indigo-600 text-white border-transparent"
              : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900"
          }`}
        >
          All Campaigns
        </button>
        {MY_CAMPAIGNS.map((c) => (
          <button
            key={c.address}
            type="button"
            onClick={() => setCampaignFilter(c.address)}
            className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              campaignFilter === c.address
                ? "bg-zinc-900 dark:bg-indigo-600 text-white border-transparent"
                : "border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-900"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Access log table */}
        <Card className="xl:col-span-2 border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-8 pb-5 border-b border-slate-100 dark:border-zinc-800/50">
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
              Who Inspected My Sales Data
            </CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              {visibleEvents.length} logged event{visibleEvents.length === 1 ? "" : "s"} · newest
              first
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {visibleEvents.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Eye className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto" />
                <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                  No auditor access recorded for this selection yet.
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Entries appear here the moment an auditor key verifies access or decrypts one of
                  your conversion payloads.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/50">
                {[...visibleEvents].reverse().map((event) => {
                  const cfg = actionConfig[event.action];
                  return (
                    <div key={event.sequence} className="px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                          <Key className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                            {event.auditorPublicKey.slice(0, 6)}...
                            {event.auditorPublicKey.slice(-4)}
                          </div>
                          <div className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mt-0.5">
                            Sale #{event.saleId} · #{event.sequence} ·{" "}
                            {event.eventHash.slice(0, 12)}…
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:flex-col sm:items-end shrink-0">
                        <span
                          className={`inline-flex text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full ${cfg.badge}`}
                        >
                          {cfg.label}
                        </span>
                        <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auditor roster + emergency revocation */}
        <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl">
          <CardHeader className="pt-8 px-6 pb-5 border-b border-slate-100 dark:border-zinc-800/50">
            <CardTitle className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Auditor Keys On My Data
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Emergency revocation terminates a compromised key across the entire platform
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {auditors.length === 0 && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                No auditor keys have touched your campaigns.
              </p>
            )}
            {auditors.map((a) => (
              <div
                key={a.auditorPublicKey}
                className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                    {a.auditorPublicKey.slice(0, 8)}...{a.auditorPublicKey.slice(-6)}
                  </span>
                  {a.revoked ? (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border border-red-200 dark:border-red-800">
                      Revoked
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      Active
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                  {a.accessCount} access event{a.accessCount === 1 ? "" : "s"} · last{" "}
                  {new Date(a.lastAccess).toLocaleDateString()}
                </div>
                {!a.revoked && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRevokeTarget(a.auditorPublicKey)}
                    className="w-full h-8 rounded-xl text-[11px] font-bold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Emergency Revoke Key
                  </Button>
                )}
              </div>
            ))}
            {auditors.length > 0 && (
              <div className="pt-2 flex items-start gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  Revocations are appended to the same hash chain — the auditor can see the
                  revocation, and no one can erase it afterwards.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-w-md p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">
              Revoke Auditor Key?
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {revokeTarget
                ? `${revokeTarget.slice(0, 8)}...${revokeTarget.slice(-8)} will immediately lose the ability to verify access or decrypt any conversion payload.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
            This emergency action is permanent and recorded in the tamper-evident audit ledger. The
            auditor must be re-granted access with a fresh key.
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setRevokeTarget(null)}
              className="rounded-xl text-xs font-bold h-9 px-4"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEmergencyRevoke}
              className="rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold h-9 px-5"
            >
              Confirm Revocation
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
