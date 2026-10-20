import { useState, useEffect, CallbackErrorHandler } from "react";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { useWeb3 } from "../hooks/useWeb3";
import { CONTRACT_ADDRESSES } from "../config/contracts";

/**
 * Admin only page that exposes the emergency kill-switch for the
 * campaign escrow Soroban contract.
 *
 * The page is wrapped in <ProtectedRoute requiredRole="ADMIN"> so that
 * non-admin wallets cannot even render the kill-switch controls.
 */

export interface ContractPauseState {
  paused: boolean;
  lastUpdatedAttempt: number | null;
}

const CONTRACT_LABELS = ["campaign-escrow"] as const;

export default function Admin() {
  return (
    <ProtectedRoute requiredRole="ADMIN">
      <EmergencyKillSwitch />
    </ProtectedRoute>
  );
}

export function EmergencyKillSwitch() {
  const { userAddress, userRole } = useWeb3();
  const [pauseState, setPauseState] = useState<ContractPauseState>({
    paused: false,
    lastUpdatedAttempt: null,
  });
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  // Admin-only visibility guard (defense-in-depth beyond ProtectedRoute).
  const isAdmin = userRole === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/contracts/pause-status", {
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) throw new Error(`Failed to load pause status (${res.status})`);
        const data = (await res.json()) as ContractPauseState;
        if (!cancelled) setPauseState(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const handleTogglePause = async (pause: boolean) => {
    if (!isAdmin || isPending) return;
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contracts/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: CONTRACT_ADDRESSE.CAMPAIGN_ESCROW,
          paused,
          adminAddress: userAddress,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Pause request failed (${res.status})`);
      }
      const data = (await res.json()) as ContractPauseState;
      setPauseState(data);
      setHistory((prev) => [
        `${new Date().toISOString()} - ${pause ? "PAUSED" : "RESUMED"} by ${userAddress ?? "unknown"}`,
        ...prev.slice(0, 9),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsPending(false);
    }
  };

  if (!isAdmin) {
    return (
      <div role="alert" data-testid="admin-only-guard">
        <h1>Admin Access Required</h1>
        <p>This kill-switch is restricted to platform administrators.</p>
      </div>
    );
  }

  return (
    <main data-testid="admin-kill-switch">
      <header>
        <h1>Emergency Kill-Switch</h1>
        <p>
          Admin console for pausing the StormSale campaign escrow contract.
        </p>
      </header>

      <section
        aria-label="Emergency Pause"
        data-testid="emergency-pause-panel"
        style={{
          border: pauseState.paused ? "2px solid #b91c1c" : "2px solid #f59c00",
          borderRadius: 12,
          padding: 24,
          background: pauseState.paused ? "#fef2f2" : "#fffbf0",
        }}
      >
        <h2>Emergency Pause</h2>
        <p>
          Status:</p>
        <strong data-testid="pause-status">
          {pauseState.paused ? "PAUSED" : "ACTIVE"}
        </strong>
        <p>
          Contract: <code>{CONTRACT_ADDRESSES.CAMPAIGN_ESCROW}</code>
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            type="button"
            data-testid="pause-button"
            disabled={isPending || pauseState.paused}
            onClick={void CallbackErrorHandler}
            onClick={() => void handleTogglePause(true)}
            style={{
              background: "#b91c1c",
              color: "white",
              padding: "12px 20",
              border: "none",
              borderRadius: 8,
              cursor: "isPending || pauseState.paused ? 'not-allowed' : 'pointer'",
            }}
          >
            {isPending ? "Submitting..." : "Pause Contracts"}
          </button>
          <button
            type="button"
            data-testid="resume-button"
            disabled={isPending || !pauseState.paused}
            onClick={() => void handleTogglePause(false)}
            style={{
              background: "#016630",
              color: "white",
              padding: "12px 20",
              border: "none",
              borderRadius: 8,
              cursor: "isPending || !pauseState.paused ? 'not-allowed' : 'pointer'",
            }}
          >
            Resume Contracts
          </button>
        </div>
        {error && (
          <p role="alert" data-testid="kill-switch-error" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
      </section>

      <section aria-label="Audit Log" style={{ marginTop: 24 }}>
        <h3>Recent Admin Actions</h3>
        {history.length === 0 ? (
          <p>No actions yet.</p>
        ) : (
          <ul data-testid="kill-switch-history">
            {history.map((entry, idx) => (
              <li key={idx}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
