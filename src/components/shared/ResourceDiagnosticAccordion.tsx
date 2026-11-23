import React, { useState } from "react";
import {
  Cpu,
  Database,
  Coins,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Terminal,
  Code2,
} from "lucide-react";
import {
  type SorobanResourceProfile,
  formatBytes,
  getMockResourceProfile,
} from "../../lib/sorobanProfiler";

export interface ResourceDiagnosticAccordionProps {
  profile?: SorobanResourceProfile | null;
  defaultOpen?: boolean;
  initialDevMode?: boolean;
  onToggleDevMode?: (isDevMode: boolean) => void;
  className?: string;
}

export const ResourceDiagnosticAccordion: React.FC<ResourceDiagnosticAccordionProps> = ({
  profile: propProfile,
  defaultOpen = false,
  initialDevMode = false,
  onToggleDevMode,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isDevMode, setIsDevMode] = useState(initialDevMode);
  const [showRawJson, setShowRawJson] = useState(false);

  const profile = propProfile || getMockResourceProfile();

  const handleDevModeToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.checked;
    setIsDevMode(nextVal);
    onToggleDevMode?.(nextVal);
    if (nextVal && !isOpen) {
      setIsOpen(true);
    }
  };

  const getStatusColor = () => {
    if (profile.status === "critical") return "text-rose-500 border-rose-500/40 bg-rose-950/20";
    if (profile.status === "warning") return "text-amber-500 border-amber-500/40 bg-amber-950/20";
    return "text-emerald-500 border-emerald-500/40 bg-emerald-950/20";
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-rose-500";
    if (percentage >= 50) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div
      className={`border rounded-xl transition-all duration-200 overflow-hidden ${
        isDevMode
          ? "border-indigo-500/40 bg-slate-900/90 shadow-md shadow-indigo-950/30"
          : "border-slate-800 bg-slate-900/50"
      } ${className}`}
    >
      {/* Accordion Header */}
      <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 text-left focus:outline-none group"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                Resource Diagnostic
              </span>
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getStatusColor()}`}
              >
                {profile.status.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Fee: {profile.minResourceFee} · CPU: {profile.cpuPercentage.toFixed(1)}% · Mem:{" "}
              {profile.memoryPercentage.toFixed(1)}%
            </p>
          </div>
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400 ml-1" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
          )}
        </button>

        {/* Dev Mode Toggle */}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer select-none">
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Dev Mode</span>
            <input
              type="checkbox"
              checked={isDevMode}
              onChange={handleDevModeToggle}
              className="sr-only peer"
            />
            <div className="w-8 h-4.5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-indigo-600 relative" />
          </label>
        </div>
      </div>

      {/* Accordion Body */}
      {isOpen && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-800/80 space-y-3.5 text-xs">
          {/* Warnings callout */}
          {profile.warnings.length > 0 && (
            <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/40 text-amber-300 space-y-1">
              {profile.warnings.map((warn, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* Granular Breakdown (Revealed or enhanced in Dev Mode) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Min Resource Fee */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  Resource Fee
                </span>
              </div>
              <div className="text-sm font-bold font-mono text-white">{profile.minResourceFee}</div>
              {isDevMode && (
                <div className="text-[10px] text-slate-400 font-mono">
                  {profile.minResourceFeeStroops.toLocaleString()} stroops
                </div>
              )}
            </div>

            {/* CPU Instructions */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  CPU Instructions
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {profile.cpuPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProgressColor(profile.cpuPercentage)}`}
                  style={{ width: `${Math.min(100, profile.cpuPercentage)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                <span>{profile.cpuInstructions.toLocaleString()}</span>
                {isDevMode && <span>/ {(profile.cpuLimit / 1_000_000).toFixed(0)}M max</span>}
              </div>
            </div>

            {/* Memory Allocation */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-sky-400" />
                  Memory Footprint
                </span>
                <span className="font-mono font-bold text-slate-200">
                  {profile.memoryPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${getProgressColor(profile.memoryPercentage)}`}
                  style={{ width: `${Math.min(100, profile.memoryPercentage)}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                <span>{formatBytes(profile.memoryBytes)}</span>
                {isDevMode && <span>/ {formatBytes(profile.memoryLimit)}</span>}
              </div>
            </div>
          </div>

          {/* Dev Mode Extended Details */}
          {isDevMode && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                  Soroban RPC Profiler Breakdown
                </span>
                <button
                  type="button"
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="text-[10px] font-mono text-slate-400 hover:text-white underline"
                >
                  {showRawJson ? "Hide Raw XDR/JSON" : "Inspect Raw Simulation"}
                </button>
              </div>

              {showRawJson && (
                <pre className="p-2.5 rounded-lg bg-black/60 border border-slate-800 font-mono text-[10px] text-slate-300 max-h-40 overflow-y-auto">
                  {JSON.stringify(
                    profile.rawSimulation || {
                      cost: {
                        cpuInsns: profile.cpuInstructions,
                        memBytes: profile.memoryBytes,
                      },
                      minResourceFee: profile.minResourceFeeStroops,
                      status: profile.status,
                    },
                    null,
                    2,
                  )}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
