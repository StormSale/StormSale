/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffectEvent,
} from "react";
import type { ReactNode } from "react";
import {
  SorobanEventStreamEngine,
  type SorobanStreamEvent,
  type StreamingStatus,
  DEFAULT_TOPIC_FILTERS,
} from "../lib/sorobanEvents";
import * as NotifContext from "./NotificationContext";
import * as Web3ContextModule from "../context/Web3Context";

/**
 * Stable functions only. Their identities never change, so components that only
 * subscribe to topics or trigger a reconnect can use `useSorobanEventsActions()`
 * and skip the re-render that every incoming event causes (Issue #498).
 */
export interface SorobanEventsActions {
  reconnect: () => void;
  subscribeToTopic: (topic: string, callback: (event: SorobanStreamEvent) => void) => () => void;
  registerRevalidateListener: (callback: () => void) => () => void;
}

export interface SorobanEventsContextType extends SorobanEventsActions {
  events: SorobanStreamEvent[];
  status: StreamingStatus;
  lastLedger: number;
  revalidationTrigger: number;
}

const SorobanEventsContext = createContext<SorobanEventsContextType | undefined>(undefined);
const SorobanEventsActionsContext = createContext<SorobanEventsActions | undefined>(undefined);

export interface SorobanEventsProviderProps {
  children?: ReactNode;
  rpcUrlOverride?: string;
  contractIdOverride?: string;
  initialPollIntervalMs?: number;
}

const safeUseWeb3 = () => {
  try {
    if (typeof (Web3ContextModule as any).useWeb3 === "function") {
      return (Web3ContextModule as any).useWeb3();
    }
  } catch {
    // Graceful fallback when rendered in test harnesses outside Web3Provider
  }
  return undefined;
};

const safeUseNotification = () => {
  try {
    if (typeof (NotifContext as any).useNotification === "function") {
      return (NotifContext as any).useNotification();
    }
  } catch {
    // Graceful fallback when rendered in isolated test harness
  }
  return {
    showNotification: () => "",
    notifications: [],
    dismissNotification: () => {},
    notifyLowEscrowBalance: () => "",
    checkEscrowBalances: () => {},
    clearAllNotifications: () => {},
  };
};

export const SorobanEventsProvider: React.FC<SorobanEventsProviderProps> = ({
  children,
  rpcUrlOverride,
  contractIdOverride,
  initialPollIntervalMs,
}) => {
  const web3 = safeUseWeb3();
  // Depend on the URL string, not the endpoint object, so a re-rendered Web3
  // context does not restart the stream.
  const activeRpcUrl: string | undefined = web3?.activeRpcEndpoint?.url;
  const { showNotification } = safeUseNotification();
  const [events, setEvents] = useState<SorobanStreamEvent[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("Connected");
  const [lastLedger, setLastLedger] = useState<number>(0);
  const [revalidationTrigger, setRevalidationTrigger] = useState<number>(0);

  const topicListeners = useRef<Map<string, Set<(event: SorobanStreamEvent) => void>>>(new Map());
  const revalidateListeners = useRef<Set<() => void>>(new Set());
  const engineRef = useRef<SorobanEventStreamEngine | null>(null);

  // An effect event: the engine always calls the latest version (including the
  // current `showNotification`) without being torn down when it changes.
  const handleIncomingEvent = useEffectEvent((event: SorobanStreamEvent) => {
    setEvents((prev) => [event, ...prev].slice(0, 100));
    if (event.ledger) {
      setLastLedger(event.ledger);
    }

    // Notify specific topic listeners
    const topicName = event.topicName || event.topic?.[0];
    if (topicName && topicListeners.current.has(topicName)) {
      topicListeners.current.get(topicName)?.forEach((cb) => cb(event));
    }

    // Show subtle toast notification
    const label =
      topicName === "create_campaign"
        ? "New Campaign Created"
        : topicName === "log_sale"
          ? "Affiliate Sale Logged"
          : topicName === "claim_payout"
            ? "Payout Claim Settled"
            : `Event: ${topicName || "Soroban Contract"}`;

    showNotification({
      type: "info",
      title: label,
      message: `Ledger #${event.ledger || "N/A"} - Contract event synchronized.`,
      duration: 4000,
    });
  });

  const handleRevalidate = useCallback(() => {
    setRevalidationTrigger((prev) => prev + 1);
    revalidateListeners.current.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error("Revalidation listener failed:", e);
      }
    });
  }, []);

  const rpcUrl = rpcUrlOverride || activeRpcUrl || "https://soroban-testnet.stellar.org";

  useEffect(() => {
    const engine = new SorobanEventStreamEngine({
      rpcUrl,
      contractId: contractIdOverride,
      basePollingIntervalMs: initialPollIntervalMs,
      topicFilters: DEFAULT_TOPIC_FILTERS,
      onEvent: (event) => handleIncomingEvent(event),
      onStatusChange: (newStatus) => setStatus(newStatus),
      onRevalidate: handleRevalidate,
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [rpcUrl, contractIdOverride, initialPollIntervalMs, handleRevalidate]);

  const reconnect = useCallback(() => {
    engineRef.current?.reconnect();
  }, []);

  const subscribeToTopic = useCallback(
    (topic: string, callback: (event: SorobanStreamEvent) => void) => {
      if (!topicListeners.current.has(topic)) {
        topicListeners.current.set(topic, new Set());
      }
      topicListeners.current.get(topic)!.add(callback);

      return () => {
        topicListeners.current.get(topic)?.delete(callback);
      };
    },
    [],
  );

  const registerRevalidateListener = useCallback((callback: () => void) => {
    revalidateListeners.current.add(callback);
    return () => {
      revalidateListeners.current.delete(callback);
    };
  }, []);

  const actions = useMemo<SorobanEventsActions>(
    () => ({ reconnect, subscribeToTopic, registerRevalidateListener }),
    [reconnect, subscribeToTopic, registerRevalidateListener],
  );

  // Memoised so consumers re-render when stream state changes, not whenever a
  // parent provider (notifications, Web3) re-renders this one.
  const value = useMemo<SorobanEventsContextType>(
    () => ({ events, status, lastLedger, revalidationTrigger, ...actions }),
    [events, status, lastLedger, revalidationTrigger, actions],
  );

  return (
    <SorobanEventsActionsContext.Provider value={actions}>
      <SorobanEventsContext.Provider value={value}>{children}</SorobanEventsContext.Provider>
    </SorobanEventsActionsContext.Provider>
  );
};

export const useSorobanEventsContext = () => {
  const context = useContext(SorobanEventsContext);
  if (!context) {
    throw new Error("useSorobanEventsContext must be used within a SorobanEventsProvider");
  }
  return context;
};

/**
 * Stable stream actions without the event list. Unlike `useSorobanEventsContext`,
 * a component using only this hook does not re-render for each incoming event.
 */
export const useSorobanEventsActions = () => {
  const actions = useContext(SorobanEventsActionsContext);
  if (!actions) {
    throw new Error("useSorobanEventsActions must be used within a SorobanEventsProvider");
  }
  return actions;
};
