import { useState, useEffect } from "react";
import { useWeb3 } from "../hooks/useWeb3";
import { useNotification } from "../context/NotificationContext";
import { STORMSALE_CONTRACT_METHODS } from "../config/abis";
import { CONTRACT_ADDRERSES } from "../config/contracts";

interface AdminProps {
  onBack?: () => void;
}

export interface PauseStatus {
  isPaused: boolean;
  pausedAt: string | null;
  pausedBy: string | null;
  reason: string | null;
  lastTxHash: string | null;
}

const INITIAL_STATUS: PauseStatus = {
  isPaused: false,
  pausedAt: null,
  pausedBy: null,
  reason: null,
  lastTxHash: null,
};

function shortAddress(address: string | null): string {
  if (!address) return "—";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Admin({ onBack }: AdminProps) {
  const { userRole, userAddress, connectorType } = useWeb3();
  const { notify } = useNotification();

  const isAdmin = userRole === "ADMIN";

  const [status, setStatus] = useState<PauseStatus>(INITIAL_STATUS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmPause, setConfirmPause] = useState(false);
  const [history, setHistory] = useState<PauseStatus[]>([]);

  // Sync the latest on-chain pause state when the admin view mounts.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await queryPauseStatus();
        if (!cancelled && result) {
          setStatus(result);
        }
      } catch (err) {
        console.warn("Could not load pause status:", err);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [isAdmin]);

  const queryPauseStatus = async (): Promise<PauseStatus | null> => {
    // Soroban contract invocation for the admin pause flag.
    // The contract exposes a `is_paused` read method that returns a boolean.
    const method = STORMSALE_CONTRACT_METHODS.GET_CAMPAIGN;
    const contractId = CONTRACT_ADDRESSES.CAMPAIGN_ESCROW;
    if (!contractId) return null;
    try {
      const { server, contract } = await import("../lib/stellar");
      if (!server || !contract) return null;
      const tx = await server.getContractData(contractId);
      const result = tx.result;
      if (!result) return null;
      // The contract returns a boolean for `is_paused`.
      const isPaused = Boolean(result);
      return {
        ...INITIAL_STATUS,
        isPaused,
      };
    } catch (e) {
      console.warn(`Failed to read contract pause flag (${method}): `, e);
      return null;
    }
  };

  const handlePause = async () => {
    if (!isAdmin || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const txHash = await invokePauseContract(true, reason || "Emergency pause initiated by admin");
      const nextStatus: PauseStatus = {
        isPaused: true,
        pausedAt: new Date().toISOString(),
        pausedBy: userAddress,
        reason: reason || "Emergency pause initiated by admin",
        lastTxHash: txHash,
      };
      setStatus(nextStatus);
      setHistory((prev) => [nextStatus, ...prev].slice(0, 10));
      notify({
        type: "success",
        title: "Emergency Pause Activated",
        message: "All campaign contracts are now paused.",
      });
    } catch (error) {
      console.error("Pause failed:", error);
      notify({
        type: "error",
        title: "Pause Failed",
        message: error instanceof Error ? error.message : "Unable to pause contracts.",
      });
    } finally {
      setIsSubmitting(false);
      setConfirmPause(false);
    }
  };

  const handleResume = async () => {
    if (!isAdmin || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const txHash = await invokePauseContract(false, "Resumed by admin");
      const nextStatus: PauseStatus = {
        isPaused: false,
        pausedAt: null,
        pausedBy: null,
        reason: null,
        lastTxHash: txHash,
      };
      setStatus(nextStatus);
      setHistory((prev) => [nextStatus, ...prev].slice(0, 10));
      notify({
        type: "success",
        title: "Contracts Resumed",
        message: "Normal operations have been restored.",
      });
    } catch (error) {
      console.error("Resume failed:", error);
      notify({
        type: "error",
        title: "Resume Failed",
        message: error instanceof Error ? error.message : "Unable to resume contracts.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const invokePauseContract = async (paused: boolean, note: string): Promise<string> => {
    const contractId = CONTRACT_ADDRESSES.CAMPAIGN_ESCROW;
    if (!contractId) throw new Error("Contract ID not configured.");
    const { adminPauseContractCall } = await import("../lib/stellar");
    if (typeof adminPauseContractCall !== "function") {
      throw new Error("adminPauseContractCall is not available in the Stellar library.");
    }
    const res = await adminPauseContractCall(userAddress as string, paused, note, connectorType);
    if (!res || !res.success) {
      throw new Error(res?.txHash ? "Transaction rejected by contract." : "Contract invocation failed.");
    }
    return res.txHash ?? "unknown";
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-red-500/40 bg-red-500/5 p-8">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🚨</span>
            <h2 className="text-xl font-semibold text-red-400">Admin Access Required</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            This page is restricted to platform administrators. Your current role is
            <span className="font-mono text-foreground"> {userRole ?? "UNKNOWN"}</span>.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="mt-4 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin Console</h1>
            <p className="text-sm text-muted-foreground">
              Restricted operations for platform administrators.
            </p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
            >
              Back to Dashboard
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="text-4xl leading-none">🚨</div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-red-400">Emergency Pause</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Immediately halt all campaign contracts. This action is on-chain and cannot be undone without an administrator resuming.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm grid-cols-2">
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p className={`mt-1 text-sm font-semibold ${status.isPaused ? "text-red-400" : "text-emerald-400"}`}>
                {status.isPaused ? "PAUSED" : "ACTIVE"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Admin</p>
              <p className="mt-1 text-sm font-mono">{shortAddress(userAddress)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background/60 p-3">
            <label className="block text-xs uppercase tracking-wide text-muted-foreground">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Exploit detected in campaign escrow"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500/50"
            />
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            {!status.isPaused ? (
              <>
                <button
                  onClick={() => setConfirmPause(true)}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Activate Emergency Pause"}
                </button>
              </>
            ) : (
              <button
                onClick={handleResume}
                disabled={isSubmitting}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Resume Contracts"}
              </button>
            )}
          </div>

          {confirmPause && (
            <div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <p className="text-sm text-red-300">
                Are you sure? This will halt all campaign contracts immediately.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handlePause}
                  disabled={isSubmitting}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Confirm Pause
                </button>
                <button
                  onClick={() => setConfirmPause(false)}
                  className="rounded-lg border border-border px-3 py-2 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {status.isPaused && (
          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <h3 className="text-sm font-semibold">Current Pause Details</h3>
            <dl className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="uppercase tracking-wide">Paused At</dt>
                <dd className="font-mono text-foreground">{status.pausedAt ?? "—"}</dd>
              </div>
              <div>
                <dt className="uppercase tracking-wide">Paused By</dt>
                <dd className="font-mono text-foreground">{shortAddress(status.pausedBy)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="uppercase tracking-wide">Reason</dt>
                <dd className="text-foreground">{status.reason ?? "—"}</dd>
              </div>
              {status.lastTxHash && (
                <div className="sm:col-span-2">
                  <dt className="uppercase tracking-wide">Last Tx</dt>
                  <dd className="break-all font-mono text-foreground">{status.lastTxHash}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-2xl border border-border bg-background/60 p-4">
            <h3 className="text-sm font-semibold">Recent Admin Actions</h3>
            <ul className="mt-2 space-2">
              {history.map((entry, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/40 p-2 text-xs"
                >
                  <span className={`mr-2 inline-block h-2 w-2 rounded-full ${entry.isPaused ? "bg-red-500" : "bg-emerald-500"}`} />
                  <span className="flex-1">{entry.isPaused ? "Paused" : "Resumed"}</span>
                  <span className="font-mono text-muted-foreground">
                    {entry.pausedAt ?? new Date().toISOString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;
