import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  PauseOctagon,
  Play,
  CheckCircle2,
  ArrowLeft,
  FileText,
  Server,
  Layers,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useWeb3 } from "../hooks/useWeb3";
import {
  getEmergencyPauseState,
  setGlobalEmergencyPause,
  setContractPause,
  getEmergencyAuditLogs,
  subscribeToEmergencyPause,
  type ContractPauseState,
  type EmergencyAuditLog,
} from "../lib/emergencyPause";

interface AdminProps {
  onBack?: () => void;
}

export const Admin: React.FC<AdminProps> = ({ onBack }) => {
  const { userAddress, userRole, isConnected, updateUserRole } = useWeb3();
  const [pauseState, setPauseState] = useState<ContractPauseState>(getEmergencyPauseState);
  const [auditLogs, setAuditLogs] = useState<EmergencyAuditLog[]>(getEmergencyAuditLogs);

  // Security challenge state for master kill-switch
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<
    "GLOBAL" | keyof ContractPauseState["pausedContracts"]
  >("GLOBAL");
  const [confirmAction, setConfirmAction] = useState<"PAUSE" | "RESUME">("PAUSE");
  const [confirmInput, setConfirmInput] = useState("");
  const [reasonInput, setReasonInput] = useState(
    "Suspected Smart Contract Anomaly / Emergency Halt",
  );
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToEmergencyPause((state) => {
      setPauseState(state);
      setAuditLogs(getEmergencyAuditLogs());
    });
    return unsubscribe;
  }, []);

  const isAdmin = isConnected && userRole?.toUpperCase() === "ADMIN";

  // Admin-only role visibility check:
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-500 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black tracking-tight text-white">Restricted Admin Area</h2>
          <p className="text-sm text-slate-400">
            The Emergency Kill-Switch & Protocol Controls require platform administrator role
            credentials.
          </p>

          <div className="pt-2 flex flex-col gap-2">
            {isConnected ? (
              <Button
                variant="default"
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
                onClick={async () => {
                  await updateUserRole("ADMIN");
                }}
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                Assume Admin Role (Authorized Signer)
              </Button>
            ) : (
              <p className="text-xs text-amber-400 font-mono">
                Please connect an administrator wallet.
              </p>
            )}

            {onBack && (
              <Button
                variant="outline"
                className="border-slate-800 text-slate-300 hover:bg-slate-800"
                onClick={onBack}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Dashboard
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleOpenConfirm = (
    target: "GLOBAL" | keyof ContractPauseState["pausedContracts"],
    action: "PAUSE" | "RESUME",
  ) => {
    setConfirmTarget(target);
    setConfirmAction(action);
    setConfirmInput("");
    setReasonInput(
      action === "PAUSE"
        ? "Emergency security pause triggered by platform administrator"
        : "Operational audit completed; normal operations resumed",
    );
    setShowConfirmModal(true);
  };

  const handleExecuteEmergencyAction = async () => {
    if (confirmAction === "PAUSE" && confirmInput.trim().toUpperCase() !== "PAUSE") {
      return;
    }

    setIsProcessing(true);
    try {
      const adminAddr = userAddress || "GAADMIN...ACTIVE";
      if (confirmTarget === "GLOBAL") {
        setGlobalEmergencyPause(confirmAction === "PAUSE", adminAddr, reasonInput);
      } else {
        setContractPause(confirmTarget, confirmAction === "PAUSE", adminAddr, reasonInput);
      }
      setShowConfirmModal(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const contractsList: Array<{
    key: keyof ContractPauseState["pausedContracts"];
    name: string;
    description: string;
  }> = [
    {
      key: "CAMPAIGN_ESCROW",
      name: "Campaign Escrow Contract",
      description: "Controls deposits, campaign budget reservations, and escrow refunds.",
    },
    {
      key: "AFFILIATE_PAYOUTS",
      name: "Affiliate Settlement & Payout Engine",
      description: "Processes automated and manual XLM affiliate payout claims.",
    },
    {
      key: "BATCH_LOGGING",
      name: "Batch Sale Logging Engine",
      description: "Dispatches bulk conversion events and on-chain Merkle audit leaves.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* Top Admin Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Dashboard
              </Button>
            )}
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">
                  Platform Admin Command Center
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Soroban smart contract emergency controls and circuit breakers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-slate-400 font-mono">ADMIN WALLET</div>
              <div className="text-xs font-mono font-bold text-slate-200">
                {userAddress
                  ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
                  : "Connected"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
        {/* Prominent Emergency Status Alert Banner */}
        {pauseState.isGlobalPaused ? (
          <div
            role="alert"
            className="p-6 rounded-2xl bg-gradient-to-r from-rose-950/80 via-red-900/40 to-slate-950 border-2 border-rose-600 shadow-2xl shadow-rose-950/50 space-y-3 animate-pulse"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-rose-600 text-white">
                  <PauseOctagon className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-rose-100 uppercase tracking-wide">
                    EMERGENCY PROTOCOL PAUSE ACTIVE
                  </h2>
                  <p className="text-xs sm:text-sm text-rose-300">
                    All contract state modifications and outbound settlement transactions are
                    globally halted.
                  </p>
                </div>
              </div>
              <Button
                variant="default"
                size="lg"
                onClick={() => handleOpenConfirm("GLOBAL", "RESUME")}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm px-6 rounded-xl shadow-lg shadow-emerald-950/50"
              >
                <Play className="w-4 h-4 mr-2" />
                Resume Global Operations
              </Button>
            </div>
            <div className="pt-2 border-t border-rose-800/40 text-xs text-rose-300 flex items-center justify-between">
              <span>
                Halted by: <strong className="font-mono">{pauseState.updatedBy}</strong>
              </span>
              <span>
                Timestamp:{" "}
                <strong className="font-mono">
                  {new Date(pauseState.lastUpdated).toLocaleString()}
                </strong>
              </span>
            </div>
          </div>
        ) : (
          <div
            role="status"
            className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-3"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-white">Protocol Normal Operations</h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ALL CONTRACTS OPERATIONAL
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Soroban escrow contracts, payout settlement, and sale batching engines are
                    processing normally.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="lg"
                onClick={() => handleOpenConfirm("GLOBAL", "PAUSE")}
                className="bg-rose-600 hover:bg-rose-500 text-white font-black text-sm px-6 rounded-xl shadow-lg shadow-rose-950/50"
              >
                <PauseOctagon className="w-4 h-4 mr-2" />
                Emergency Global Kill-Switch
              </Button>
            </div>
          </div>
        )}

        {/* Granular Contract Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Granular Smart Contract Circuit Breakers
              </h2>
              <p className="text-xs text-slate-400">
                Isolate and halt specific subsystems without freezing the entire protocol.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {contractsList.map((contract) => {
              const isPaused =
                pauseState.isGlobalPaused || Boolean(pauseState.pausedContracts[contract.key]);
              return (
                <Card
                  key={contract.key}
                  className={`bg-slate-900 border transition-all duration-300 ${
                    isPaused
                      ? "border-rose-500/60 bg-rose-950/20"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          isPaused
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        }`}
                      >
                        {isPaused ? "PAUSED" : "OPERATIONAL"}
                      </span>
                      <Server className="w-4 h-4 text-slate-500" />
                    </div>
                    <CardTitle className="text-sm font-bold text-white pt-1">
                      {contract.name}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 line-clamp-2">
                      {contract.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex justify-end pt-2 border-t border-slate-800/80">
                      {isPaused ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={pauseState.isGlobalPaused}
                          onClick={() => handleOpenConfirm(contract.key, "RESUME")}
                          className="h-8 text-xs font-bold border-emerald-500/40 text-emerald-400 hover:bg-emerald-950/40"
                        >
                          <Play className="w-3.5 h-3.5 mr-1" />
                          Resume Subsystem
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenConfirm(contract.key, "PAUSE")}
                          className="h-8 text-xs font-bold border-rose-500/40 text-rose-400 hover:bg-rose-950/40"
                        >
                          <PauseOctagon className="w-3.5 h-3.5 mr-1" />
                          Halt Contract
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Emergency Action Audit Trail */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <CardTitle className="text-base font-bold text-white">
                  Emergency Action Audit Trail
                </CardTitle>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {auditLogs.length} events logged
              </span>
            </div>
            <CardDescription className="text-xs text-slate-400">
              Immutable record of security pause and resume interventions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 font-mono text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Target</th>
                    <th className="py-2.5 px-3">Admin Address</th>
                    <th className="py-2.5 px-3">Reason / Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()} ·{" "}
                        {new Date(log.timestamp).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes("PAUSE")
                              ? "bg-rose-500/20 text-rose-400"
                              : "bg-emerald-500/20 text-emerald-400"
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200 font-sans font-medium">
                        {log.targetContract || "ALL"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {log.adminAddress.length > 12
                          ? `${log.adminAddress.slice(0, 6)}...${log.adminAddress.slice(-4)}`
                          : log.adminAddress}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-sans max-w-xs truncate">
                        {log.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Confirmation Modal for Circuit Breaker Action */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  confirmAction === "PAUSE"
                    ? "bg-rose-500/20 text-rose-500 border border-rose-500/40"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                }`}
              >
                {confirmAction === "PAUSE" ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Confirm {confirmAction} Interruption
                </h3>
                <p className="text-xs text-slate-400">
                  Target: <strong className="text-indigo-400">{confirmTarget}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs text-slate-300 font-bold block mb-1">
                  Audit Justification Reason
                </label>
                <input
                  type="text"
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  placeholder="Enter reason for audit logs..."
                />
              </div>

              {confirmAction === "PAUSE" && (
                <div>
                  <label className="text-xs text-rose-400 font-bold block mb-1">
                    Security Challenge: Type <span className="underline">PAUSE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-rose-800/80 rounded-xl text-xs font-mono text-rose-300 focus:outline-none focus:border-rose-500"
                    placeholder="Type PAUSE"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                variant={confirmAction === "PAUSE" ? "destructive" : "default"}
                size="sm"
                disabled={
                  isProcessing ||
                  (confirmAction === "PAUSE" && confirmInput.trim().toUpperCase() !== "PAUSE")
                }
                onClick={handleExecuteEmergencyAction}
                className={
                  confirmAction === "PAUSE"
                    ? "bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                }
              >
                {isProcessing
                  ? "Executing..."
                  : `Execute ${confirmAction === "PAUSE" ? "Emergency Pause" : "Resume Operations"}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
