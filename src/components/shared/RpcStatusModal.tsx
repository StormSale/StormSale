import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Globe,
  Radio,
  Plus,
  ArrowRightLeft,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import type { RpcEndpointStatus } from "../../lib/rpcFallback";

export const RpcStatusModal: React.FC = () => {
  const {
    isRpcModalOpen,
    closeRpcModal,
    activeRpcEndpoint,
    rpcEndpoints,
    rpcFailoverHistory,
    rpcTimeoutMs,
    switchRpcEndpoint,
    simulateRpcFailover,
    checkRpcHealth,
    addCustomRpcEndpoint,
  } = useWeb3();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [isCustomLocal, setIsCustomLocal] = useState(true);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const allUnreachable =
    rpcEndpoints.length > 0 && rpcEndpoints.every((ep) => ep.status === "unreachable");
  const anyHealthy = rpcEndpoints.some((ep) => ep.status === "healthy");

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Manage accessibility: focus trap, Escape dismissal, and return focus
  useEffect(() => {
    if (!isRpcModalOpen) return;

    if (typeof document !== "undefined") {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
    }

    const focusTimer = setTimeout(() => {
      if (!dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length > 0) {
        focusable[0]?.focus();
      } else {
        dialogRef.current.focus();
      }
    }, 20);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRpcModal();
        return;
      }

      if (event.key === "Tab") {
        if (!dialogRef.current) return;
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (el) =>
            el.offsetParent !== null ||
            (typeof el.getClientRects === "function" && el.getClientRects().length > 0),
        );

        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (event.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !dialogRef.current.contains(document.activeElement)
          ) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      clearTimeout(focusTimer);
      if (typeof document !== "undefined") {
        document.removeEventListener("keydown", handleKeyDown);
      }
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === "function"
      ) {
        previousActiveElement.current.focus();
      }
    };
  }, [isRpcModalOpen, closeRpcModal]);

  if (!isRpcModalOpen) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await checkRpcHealth();
      setNoticeMessage("All RPC nodes probed successfully.");
      setTimeout(() => setNoticeMessage(null), 3000);
    } catch {
      setNoticeMessage("Failed to ping some RPC endpoints.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSimulateFailover = () => {
    simulateRpcFailover("Simulated connection timeout / node outage");
    setNoticeMessage(`Silently failed over from ${activeRpcEndpoint?.name}`);
    setTimeout(() => setNoticeMessage(null), 3000);
  };

  const handleAddCustomEndpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim() || !customUrl.trim()) return;

    try {
      const parsed = new URL(customUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setNoticeMessage("Please enter a valid HTTP/HTTPS URL.");
        return;
      }
    } catch {
      setNoticeMessage("Please enter a valid HTTP/HTTPS URL.");
      return;
    }

    addCustomRpcEndpoint(customName.trim(), customUrl.trim(), isCustomLocal);
    setCustomName("");
    setCustomUrl("");
    setShowAddCustom(false);
    setNoticeMessage("Custom node added to fallback pool.");
    setTimeout(() => setNoticeMessage(null), 3000);
  };

  const getStatusBadge = (status: RpcEndpointStatus["status"]) => {
    switch (status) {
      case "healthy":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Healthy</span>
          </span>
        );
      case "degraded":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Degraded</span>
          </span>
        );
      case "unreachable":
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Unreachable</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
            <span>Untested</span>
          </span>
        );
    }
  };

  const getTypeBadge = (type: RpcEndpointStatus["type"]) => {
    switch (type) {
      case "primary":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Primary
          </span>
        );
      case "local":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-100 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 flex items-center space-x-1">
            <Cpu className="w-2.5 h-2.5 mr-0.5" />
            Local Node
          </span>
        );
      case "blockdag":
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center space-x-1">
            <Zap className="w-2.5 h-2.5 mr-0.5" />
            BlockDAG
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
            Backup
          </span>
        );
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeRpcModal}
          className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rpc-status-modal-title"
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-auto flex flex-col max-h-[90vh] outline-none"
        >
          {/* Header */}
          <div className="p-6 pb-4 border-b border-slate-100 dark:border-zinc-800/80 flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    allUnreachable
                      ? "bg-rose-500"
                      : anyHealthy
                        ? "bg-emerald-500 animate-pulse"
                        : "bg-amber-500"
                  }`}
                />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {allUnreachable
                    ? "Infrastructure • Service Interrupted"
                    : anyHealthy
                      ? "Infrastructure • High Availability Failover"
                      : "Infrastructure • Multi-Endpoint Failover"}
                </span>
              </div>
              <h2
                id="rpc-status-modal-title"
                className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight mt-1 flex items-center space-x-2"
              >
                <span>Soroban & BlockDAG RPC Health</span>
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                Local node fallback logic with automatic silent failover across distributed nodes.
              </p>
            </div>
            <button
              type="button"
              onClick={closeRpcModal}
              aria-label="Close RPC status"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Active Node Highlight Card */}
          <div className="px-6 pt-4">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/70 via-purple-50/50 to-blue-50/50 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-blue-950/20 border border-indigo-200/60 dark:border-indigo-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-zinc-400 uppercase">
                      Current Active Node
                    </span>
                    {getTypeBadge(activeRpcEndpoint?.type)}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-white">
                    {activeRpcEndpoint?.name}
                  </h3>
                  <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-xs sm:max-w-md">
                    {activeRpcEndpoint?.url}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                {getStatusBadge(activeRpcEndpoint?.status)}
                {activeRpcEndpoint?.latencyMs !== null && (
                  <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg border border-emerald-500/20">
                    {activeRpcEndpoint.latencyMs}ms
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Notice Banner */}
          {noticeMessage && (
            <div className="mx-6 mt-3 px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs text-indigo-700 dark:text-indigo-300 flex items-center space-x-2">
              <Activity className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
              <span>{noticeMessage}</span>
            </div>
          )}

          {/* Quick Controls Bar */}
          <div className="px-6 pt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
              AVAILABLE ENDPOINTS ({rpcEndpoints.length})
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Ping All Nodes</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateFailover}
                className="px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center space-x-1.5 transition-colors"
                title="Simulates a node failure to test silent fallback without throwing an error"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Simulate Silent Failover</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddCustom(!showAddCustom)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 flex items-center space-x-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Node</span>
              </button>
            </div>
          </div>

          {/* Add Custom Endpoint Form */}
          {showAddCustom && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              onSubmit={handleAddCustomEndpoint}
              className="mx-6 mt-3 p-4 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200 dark:border-zinc-700/60 space-y-3"
            >
              <div className="font-bold text-xs text-zinc-800 dark:text-zinc-200">
                Register Custom or Local RPC Endpoint
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    Node Name / Label
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Local Soroban Standalone"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                    RPC Endpoint URL
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="http://localhost:8000/soroban/rpc"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-mono text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCustomLocal}
                    onChange={(e) => setIsCustomLocal(e.target.checked)}
                    className="rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Mark as Local / Standalone Node</span>
                </label>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddCustom(false)}
                    className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow"
                  >
                    Save Endpoint
                  </button>
                </div>
              </div>
            </motion.form>
          )}

          {/* Node List Scrollable */}
          <div className="p-6 pt-3 space-y-2.5 overflow-y-auto flex-1">
            {rpcEndpoints.map((ep) => {
              const isActive = ep.id === activeRpcEndpoint?.id;

              return (
                <div
                  key={ep.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                    isActive
                      ? "border-indigo-500/60 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-sm"
                      : "border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-900/40 hover:bg-slate-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {ep.isLocal ? (
                        <Cpu className="w-4 h-4" />
                      ) : ep.type === "blockdag" ? (
                        <Zap className="w-4 h-4" />
                      ) : (
                        <Globe className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white truncate">
                          {ep.name}
                        </span>
                        {getTypeBadge(ep.type)}
                        {isActive && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 bg-indigo-600 text-white rounded">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 truncate max-w-xs sm:max-w-sm">
                        {ep.url}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {getStatusBadge(ep.status)}
                    {ep.latencyMs !== null && (
                      <span className="text-[11px] font-mono font-semibold text-zinc-600 dark:text-zinc-300">
                        {ep.latencyMs}ms
                      </span>
                    )}

                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => switchRpcEndpoint(ep.id)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="Switch active endpoint"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Failover Event Audit Trail */}
            {rpcFailoverHistory.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-2 flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Failover Audit Log ({rpcFailoverHistory.length} events)</span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {rpcFailoverHistory.slice(0, 5).map((ev) => (
                    <div
                      key={ev.id}
                      className="p-2 rounded-xl bg-slate-100/60 dark:bg-zinc-800/40 border border-slate-200/60 dark:border-zinc-800 text-[11px] flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-mono text-zinc-500 truncate">
                          {ev.fromUrl.replace("https://", "").replace("http://", "")}
                        </span>
                        <span className="text-zinc-400">→</span>
                        <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                          {ev.toUrl.replace("https://", "").replace("http://", "")}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 shrink-0 ml-2">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Note */}
          <div className="p-4 bg-slate-50 dark:bg-zinc-950/60 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center">
              {allUnreachable ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-rose-500" />
                  All RPC Nodes Unreachable
                </>
              ) : anyHealthy ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                  Silent Failover Active
                </>
              ) : (
                <>
                  <Activity className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  Multi-Node Fallback Pool
                </>
              )}
            </span>
            <span className="font-mono text-[10px] text-zinc-400">
              Timeout: {rpcTimeoutMs ?? 4000}ms • Auto-failover
            </span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
