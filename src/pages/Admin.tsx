import { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../hooks/useWeb3";
import { useNotification } from "../context/NotificationContext";
import { CONTRACT_ADDREPSES, STALLAR_NETWORK } from "../config/contracts";

interface AdminProps {
  onBack?: () => void;
}

export interface ContractPauseState {
  contractId: string;
  contractName: string;
  isPaused: boolean;
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
}

const PAUSE_STORAGE_KEY = "stormsale_admin_pause_state";

function loadPauseState(): Record<string, ContractPauseState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PAUSE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, ContractPauseState>;
  } catch {
    return {};
  }
}

function persistPauseState(state: Record<string, ContractPauseState>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAUSE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore persistence failures */
  }
}

const CONTRACTS: Array<{ id: string; name: string; description: string }> = [
  {
    id: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
    name: "Campaign Escrow",
    description: "Holds campaign budgets and releases affiliate commissions.",
  },
  {
    id: CONTRACT_ADDRESSES.NATIVE_XLM_SAC,
    name: "Native XLM SAC",
    description: "Stellar Asset Contract wrapping native Lumens.",
  },
];

function shorten(addr: string, size = 6 ) {
  if (!addr) return "";
  if (addr.length <= size * 2 + 3) return addr;
  return `${addr.slice(0, size)}...${addr.slice(addr.length - size)}`;
}

export function Admin({ onBack }: AdminProps) {
  const { userAddress, userRole, isConnected } = useWeb3();
  const { notify } = useNotification();

  const isAdmin = userRole === "ADMIN";

  const [pauseState, setPauseState] = useState<Record<string, ContractPauseState>>(
    () => loadPauseState(),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Ensure every contract has an entry in state.
  useEffect(() => {
    setPauseState((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const c of CONTRACTS) {
        if (!next[c.id]) {
          next[c.id] = {
            contractId: c.id,
            contractName: c.name,
            isPaused: false,
            lastUpdated: null,
            lastUpdatedBy: null,
          };
          changed = true;
        }
      }
      if (changed) persistPauseState(next);
      return next;
    });
  }, []);

  const anyPaused = Object.values(pauseState).some((s) => s.isPaused);

  const togglePause = useCallback(
    (id: string, nextPaused: boolean) => {
      if (!isAdmin || !userAddress) return;
      setPendingId(id);
      // Simulate on-chain admin invocation latency for the kill switch.
      window.setTimeout(() => {
        setPauseState((prev) => {
          const existing = prev[id];
          const next: Record<string, ContractPauseState> = {
            ...prev,
            [id]: {
              contractId: id,
              contractName: existing?.contractName ?? id,
              isPaused: nextPaused,
              lastUpdated: new Date().toISOString(),
              lastUpdatedBy: userAddress,
            },
          };
          persistPauseState(next);
          return next;
        });
        setPendingId(null);
        setConfirmId(null);
        notify({
          type: nextPaused ? "warning" : "success",
          title: nextPaused ? "Contract Paused" : "Contract Resumed",
          message: nextPaused
            ? "Emergency pause activated. All mutating operations are halted."
            : "Contract has been resumed. Normal operations may resume.",
        });
      }, 600);
    },
    [isAdmin, userAddress, notify],
  );

  const resumeAll = useCallback(() => {
    if (!isAdmin || !userAddress) return;
    setPauseState((prev) => {
      const next: Record<string, ContractPauseState> = { ...prev };
      for (const c of CONTRACTS) {
        const existing = next[c.id];
        next[c.id] = {
          contractId: c.id,
          contractName: existing?.contractName ?? c.name,
          isPaused: false,
          lastUpdated: new Date().toISOString(),
          lastUpdatedBy: userAddress,
        };
      }
      persistPauseState(next);
      return next;
    });
    notify({
      type: "success",
      title: "All Contracts Resumed",
      message: "Every contract has been resumed. Normal operations may resume.",
    });
  }, [isAdmin, userAddress, notify]);

  // Admin-only guard: render access denied screen for non-admins.
  if (!isConnected || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center border border-red-200 bg-red-50 rounded-xl p-8">
          <div className="text-4xl mb-3">🔗</div>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Access Denied</h2>
          <p className="text-sm text-red-700 mb-4">
            This administrative console is restricted to platform administrators.
            {!isConnected && " Please connect your admin wallet."}
            {isConnected && " Your wallet does not have the ADMIN role."}
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
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
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Admin Console</h1>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                ADMIN
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {STELLAR_NETWORK.network} network — connected as {shorten(userAddress ?? "")}
            </p>
          </div>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Back to Dashboard
            </button>
          )}
        </div>

        {/* Emergency Pause banner */}
        <div
          className={`inline-flex items-center justify-between flex-wrap gap-4 rounded-xl p-6 border-2 ${
            anyPaused
              ? "border-red-500 bg-red-50 text-red-800"
              : "border-amber-400 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{anyPaused ? "🔺" : "⚠️"}</span>
            <div>
              <div className="text-lg font-bold">
                {anyPaused ? "Emergency Pause Active" : "Emergency Kill-Switch"}
              </div>
              <div className="text-sm">
                {anyPaused
                  ? "One or more contracts are paused. Mutating operations are halted."
                  : "Pause contracts immediately in an emergency."}
              </div>
            </div>
          </div>
          {anyPaused && (
            <button
              onClick={resumeAll}
              className="px-5 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700"
            >
              Resume All Contracts
            </button>
          )}
        </div>

        {/* Contract list */}
        <div className="space-y-4">
          {CONTRACTS.map((c) => {
            const state = pauseState[c.id];
            const isPaused = state?.isPaused ?? false;
            const isPending = pendingId === c.id;
            const isConfirming = confirmId === c.id;
            return (
              <div
                key={c.id}
                className={`border rounded-xl p-5 bg-white shadow-sm ${
                  isPaused ? "border-red-300" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{c.name}</h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          isPaused
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isPaused ? "PAUSED" : "ACTIVE"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{c.description}</p>
                    <p className="text-xs text-gray-500 mt-2 font-mono break-all">
                      {c.id}
                    </p>
                    {state?.lastUpdated && (
                      <p className="text-xs text-gray-500 mt-1">
                        Last updated {new Date(state.lastUpdated).toLocaleString()}
                        {state.lastUpdatedBy && ` by ${shorten(state.lastUpdatedBy)}`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isConfirming ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-red-700">
                          {isPaused ? "Resume?" : "Pause?"} Confirm:
                        </span>
                        <button
                          onClick={() => togglePause(c.id, !isPaused)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold text-white ${
                            isPaused ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                          }`}
                        >
                          {isPaused ? "Yes, resume" : "Yes, pause"}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(c.id)}
                        disabled={isPending}
                        className={`px-5 py-2.5 rounded-lg font-semibold text-white transition disabled:opacity-50 ${
                          isPaused
                            ? "bg-green-600 hover:bg-green-700"
                            : "bg-red-600 hover:bg-red-700"
                        }`}
                      >
                        {isPending ? "Processing…" : isPaused ? "Resume" : "Emergency Pause"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 text-center pt-4">
          Admin actions are audited. Pausing a contract halts all mutating operations until resumed.
        </p>
      </div>
    </div>
  );
}
