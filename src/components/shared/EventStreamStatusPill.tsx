/**
 * src/components/shared/EventStreamStatusPill.tsx
 *
 * Page HUD displaying real-time Soroban RPC connection status pill (Issue #123).
 */
import React from "react";
import { useSorobanEventsContext } from "../../context/SorobanEventsContext";
import type { StreamingStatus } from "../../lib/sorobanEvents";
import { Activity, RefreshCw, Radio, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";

export interface EventStreamStatusPillProps {
  className?: string;
  showLedger?: boolean;
}

export const EventStreamStatusPill: React.FC<EventStreamStatusPillProps> = ({
  className,
  showLedger = true,
}) => {
  let status: StreamingStatus = "Connected";
  let lastLedger = 0;
  let reconnect = () => {};

  try {
    const ctx = useSorobanEventsContext();
    status = ctx.status;
    lastLedger = ctx.lastLedger;
    reconnect = ctx.reconnect;
  } catch {
    // Graceful fallback when rendered outside SorobanEventsProvider in tests
  }

  const statusConfig = {
    Connected: {
      color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      dot: "bg-emerald-500",
      pulse: true,
      label: "Connected",
      icon: Radio,
    },
    Polling: {
      color: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
      dot: "bg-cyan-500",
      pulse: false,
      label: "Polling",
      icon: Activity,
    },
    Reconnecting: {
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      dot: "bg-amber-500",
      pulse: true,
      label: "Reconnecting",
      icon: AlertTriangle,
    },
  }[status];

  return (
    <div
      data-testid="event-stream-status-pill"
      aria-label={`Soroban RPC Status: ${statusConfig.label}`}
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border shadow-xs transition-colors",
        statusConfig.color,
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {statusConfig.pulse && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              statusConfig.dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", statusConfig.dot)} />
      </span>

      <span className="font-semibold">{statusConfig.label}</span>

      {showLedger && lastLedger > 0 && (
        <span className="text-[10px] opacity-75 font-mono border-l border-current/20 pl-1.5">
          L#{lastLedger}
        </span>
      )}

      {status === "Reconnecting" && (
        <button
          type="button"
          onClick={() => reconnect()}
          title="Retry Soroban RPC connection"
          className="ml-1 hover:opacity-100 opacity-75 transition-opacity"
        >
          <RefreshCw className="w-3 h-3 animate-spin" />
        </button>
      )}
    </div>
  );
};
