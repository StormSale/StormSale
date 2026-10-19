import { useMemo, useState } from "react";
import { useWeb3 } from "../hooks/useWeb3";
import { STORMSALE_CONTRACT_METHODS } from "../config/abis";
import { CONTRACT_ADDRESSES } from "../config/contracts";

interface PauseResult {
  success: boolean;
  txHash?: string;
  message?: string;
}

export default function Admin() {
  const { userAddress, userRole, isConnected, pauseContract } = useWeb3();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [pauseResult, setPauseResult] = useState<PauseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = useMemo(() => {
    if (!isConnected || !userAddress) return false;
    return (userRole || "").toUpperCase() === "ADMIN";
  }, [isConnected, userAddress, userRole]);

  const handleEmergencyPause = async () => {
    if (!isAdmin || !userAddress) return;
    setError(null);
    setPauseResult(null);
    setIsPausing(true);
    try {
      const result = await pauseContract();
      setPauseResult({
        success: true,
        txHash: result?.txHash,
        message: "Contracts paused. New deposits and claims are halted.",
      });
    } catch (err: any) {
      console.error("Emergency pause failed:", err);
      setError(err?.message || "Emergency pause failed.");
    } finally {
      setIsPausing(false);
      setIsConfirming(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <div className="text-4xl mb-4">🔏</div>
          <h1 className="text-xl font-semibold text-white">Admin Access Required</h1>
          <p className="mt-2 text-sm text-slate-400">
            This page is restricted to platform administrators. Connect an admin wallet to continue.
          </p>
          {isConnected && (
            <p className="mt-4 text-xs text-slate-500">
              Connected as <span className="font-mono text-slate-300">{userAddress}</span> (role: {userRole || "NONE"})
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-white">Admin Control Panel</h1>
          <p className="mt-1 text-sm text-slate-400">
            Signed in as <span className="font-mono text-emerald-400">{userAddress}</span>
          </p>
        </header>

        <section
          aria-labelledby="emergency-pause-title"
          className="rounded-2xl border-2-border-red-600 bg-red-950/50 p-6 shadow-lg"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 animate-pulse items-center justify-center rounded-full bg-red-600 text-2xl">
              ⚡
            </div>
            <div>
              <h2 id="emergency-pause-title" className="text-lg font-bold text-red-100">
                Emergency Pause
              </h2>
              <p className="mt-1 text-sm text-red-200">
                Immediately halt all campaign escrow deposits and commission claims. Use only in case of a confirmed exploit or incident.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            {!isConfirming && (
              <button
                type="button"
                onClick={() => setIsConfirming(true)}
                disabled={isPausing}
                className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                Pause Contracts Now
              </button>
            )}
            {isConfirming && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleEmergencyPause}
                  disabled={isPausing}
                  className="rounded-lg bg-red-700 px-6 py-3 font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {isPausing ? "Pausing…" : "Confirm Emergency Pause"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  disabled={isPausing}
                  className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-900/60 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}
          {pauseResult?.success && (
            <p className="mt-4 rounded-lg bg-emerald-900/60 px-4 py-3 text-sm text-emerald-100">
              {pauseResult.message}
              {pauseResult.txHash && (
                <span className="ml-2 font-mono text-xs">(tx: {pauseResult.txHash})</span>
              )}
            </p>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Contract Target
          </h2>
          <p className="mt-2 break-all font-mono text-xs text-slate-300">
            {CONTRACT_ADDRESSES.CAMPAIGN_ESCROW}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Method: <span className="font-mono">{STORMSALE_CONTRACT_METHODS.PAUSE}</span>
          </p>
        </section>
      </div>
    </div>
  );
}
