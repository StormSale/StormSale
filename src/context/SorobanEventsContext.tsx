/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import {
  SorobanEventStreamEngine,
  type SorobanStreamEvent,
  type StreamingStatus,
  DEFAULT_TOPIC_FILTERS,
} from "../lib/sorobanEvents";
import * as NotifContext from "./NotificationContext";
import * as Web3ContextModule from "../context/Web3Context";

export interface SorobanEventsContextType {
  events: SorobanStreamEvent[];
  status: StreamingStatus;
  lastLedger: number;
  revalidationTrigger: number;
  reconnect: () => void;
  subscribeToTopic: (
    topic: string,
    callback: (event: SorobanStreamEvent) => void,
  ) => () => void;
  registerRevalidateListener: (callback: () => void) => () => void;
}

const SorobanEventsContext = createContext<SorobanEventsContextType | undefined>(undefined);

export interface SorobanEventsProviderProps {
  children: ReactNode;
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
  const activeRpcEndpoint = web3?.activeRpcEndpoint;
  const { showNotification } = safeUseNotification();
  const [events, setEvents] = useState<SorobanStreamEvent[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("Connected");
  const [lastLedger, setLastLedger] = useState<number>(0);
  const [revalidationTrigger, setRevalidationTrigger] = useState<number>(0);

  const topicListeners = useRef<Map<string, Set<(event: SorobanStreamEvent) => void>>>(new Map());
  const revalidateListeners = useRef<Set<() => void>>(new Set());
  const engineRef = useRef<SorobanEventStreamEngine | null>(null);

  const handleIncomingEvent = useCallback(
    (event: SorobanStreamEvent) => {
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
    },
    [showNotification],
  );

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

  useEffect(() => {
    const rpcUrl =
      rpcUrlOverride ||
      activeRpcEndpoint?.url ||
      "https://soroban-testnet.stellar.org";

    const engine = new SorobanEventStreamEngine({
      rpcUrl,
      contractId: contractIdOverride,
      basePollingIntervalMs: initialPollIntervalMs,
      topicFilters: DEFAULT_TOPIC_FILTERS,
      onEvent: handleIncomingEvent,
      onStatusChange: (newStatus) => setStatus(newStatus),
      onRevalidate: handleRevalidate,
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [
    rpcUrlOverride,
    activeRpcEndpoint,
    contractIdOverride,
    initialPollIntervalMs,
    handleIncomingEvent,
    handleRevalidate,
  ]);

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

  return (
    <SorobanEventsContext.Provider
      value={{
        events,
        status,
        lastLedger,
        revalidationTrigger,
        reconnect,
        subscribeToTopic,
        registerRevalidateListener,
      }}
    >
      {children}
    </SorobanEventsContext.Provider>
  );
};

export const useSorobanEventsContext = () => {
  const context = useContext(SorobanEventsContext);
  if (!context) {
    throw new Error(
      "useSorobanEventsContext must be used within a SorobanEventsProvider",
    );
  }
  return context;
};
