import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";
import {
  generateSep0007TxUri,
  streamAccountTransactions,
} from "../lib/stellar";

const WALLETCONNECT_SESSION_KEY = "stormsale_walletconnect_session";

export interface WalletConnectSession {
  topic?: string;
  peerMeta?: {
    name?: string;
    description?: string;
    icons?: string[];
  };
  connectedAt: number;
}

export interface WalletConnectCoreProvider {
  isInitialized: boolean;
  init: () => Promise<void>;
  connect: () => Promise<WalletConnectSession>;
  disconnect: () => Promise<void>;
  getSession: () => WalletConnectSession | null;
}

/**
 * Singleton instance manager for WalletConnect.
 * Lives outside the React component lifecycle to prevent multiple initializations
 * when React 18/19 StrictMode double-mounts components in development.
 */
class WalletConnectSingleton {
  private static instance: WalletConnectSingleton | null = null;
  private isInitialized = false;
  private initPromise: Promise<WalletConnectCoreProvider> | null = null;
  private session: WalletConnectSession | null = null;

  private constructor() {
    this.restoreSession();
  }

  public static getInstance(): WalletConnectSingleton {
    if (!WalletConnectSingleton.instance) {
      WalletConnectSingleton.instance = new WalletConnectSingleton();
    }
    return WalletConnectSingleton.instance;
  }

  /**
   * Resets the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    if (WalletConnectSingleton.instance) {
      WalletConnectSingleton.instance.isInitialized = false;
      WalletConnectSingleton.instance.initPromise = null;
      WalletConnectSingleton.instance.session = null;
      WalletConnectSingleton.instance = null;
    }
  }

  private restoreSession(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem(WALLETCONNECT_SESSION_KEY);
        if (stored) {
          this.session = JSON.parse(stored);
        }
      }
    } catch (err) {
      console.warn("Could not restore WalletConnect session from storage:", err);
    }
  }

  public initialize(): Promise<WalletConnectCoreProvider> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // Create the core provider instance once per app session
        const coreProvider: WalletConnectCoreProvider = {
          isInitialized: true,
          init: async () => {},
          connect: async () => {
            const newSession: WalletConnectSession = {
              topic: "wc_" + Math.random().toString(36).substring(2, 12),
              peerMeta: {
                name: "StormSale Mobile",
                description: "Stellar Affiliate Escrow Platform",
              },
              connectedAt: Date.now(),
            };
            this.session = newSession;
            try {
              if (typeof window !== "undefined" && window.localStorage) {
                localStorage.setItem(WALLETCONNECT_SESSION_KEY, JSON.stringify(newSession));
              }
            } catch (err) {
              console.warn("Could not save WalletConnect session to storage:", err);
            }
            return newSession;
          },
          disconnect: async () => {
            this.session = null;
            try {
              if (typeof window !== "undefined" && window.localStorage) {
                localStorage.removeItem(WALLETCONNECT_SESSION_KEY);
              }
            } catch (err) {
              console.warn("Could not clear WalletConnect session from storage:", err);
            }
          },
          getSession: () => this.session,
        };

        this.isInitialized = true;
        return coreProvider;
      } catch (err) {
        this.initPromise = null;
        throw err;
      }
    })();

    return this.initPromise;
  }

  public getSession(): WalletConnectSession | null {
    return this.session;
  }

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }
}

export interface Sep0007SignRequest {
  /** The assembled transaction envelope (base64 XDR) to be signed. */
  xdr: string;
  /** The SEP-0007 deep-link URI (`web+stellar:tx?xdr=...&replace=false`). */
  uri: string;
  /** Stellar account (G-...) whose transactions are streamed for inclusion. */
  account: string;
}

export type Sep0007Status = "idle" | "awaiting" | "confirmed" | "failed";

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  isProviderReady: boolean;
  // SEP-0007 mobile wallet invocation state
  sep0007Status: Sep0007Status;
  sep0007Request: Sep0007SignRequest | null;
  sep0007TxHash: string | null;
  sep0007Error: string | null;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  provider: WalletConnectCoreProvider | null;
  /**
   * Builds a SEP-0007 `web+stellar:tx` deep-link for the given XDR and opens
   * it in the installed mobile wallet, then polls Horizon until the tx is included.
   */
  signWithSep0007MobileWallet: (xdr: string, account: string) => Promise<void>;
  /** Cancels an in-flight SEP-0007 signing request and stops polling. */
  cancelSep0007: () => void;
  /** Clears the last SEP-0007 error without affecting other state. */
  clearSep0007Error: () => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | undefined>(undefined);

interface WalletConnectProviderProps {
  children: ReactNode;
}

export const WalletConnectProvider: React.FC<WalletConnectProviderProps> = ({ children }) => {
  const [state, setState] = useState<WalletConnectState>({
    isConnecting: false,
    isSwitchingNetwork: false,
    error: null,
    showNetworkModal: false,
    isProviderReady: false,
    sep0007Status: "idle",
    sep0007Request: null,
    sep0007TxHash: null,
    sep0007Error: null,
  });

  const [providerInstance, setProviderInstance] = useState<WalletConnectCoreProvider | null>(null);

  // Use a ref to track initialization state across component lifecycles & StrictMode double mounts
  const hasInitializedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Holds the active unsubscribe function for the Horizon transaction stream
  const streamUnsubscribeRef = useRef<(() => void) | null>(null);

  const { connectWallet, disconnectWallet, switchToStellarNetwork, isConnected, isStellarNetwork } =
    useWeb3();

  const stopStreaming = (): void => {
    if (streamUnsubscribeRef.current) {
      try {
        streamUnsubscribeRef.current();
      } catch (err) {
        console.warn("Failed to stop Horizon transaction stream:", err);
      }
      streamUnsubscribeRef.current = null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    // React 18/19 StrictMode guard: only initialize once per session
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    const initSingleton = async () => {
      try {
        const singleton = WalletConnectSingleton.getInstance();
        const provider = await singleton.initialize();

        if (isMountedRef.current) {
          setProviderInstance(provider);
          setState((prev) => ({ ...prev, isProviderReady: true }));
        }
      } catch (err: unknown) {
        if (isMountedRef.current) {
          console.error("WalletConnect provider singleton init error:", err);
          const errorMessage =
            err instanceof Error && err.message.trim()
              ? err.message
              : "Failed to initialize WalletConnect provider";
          setState((prev) => ({
            ...prev,
            error: errorMessage,
          }));
        }
      }
    };

    initSingleton();

    return () => {
      isMountedRef.current = false;
      // Do NOT destroy the global singleton here so React StrictMode does not re-init on remount
    };
  }, []);

  // Ensure the Horizon stream is torn down on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (): Promise<void> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const singleton = WalletConnectSingleton.getInstance();
      const provider = await singleton.initialize();
      await provider.connect();

      await connectWallet();

      // Check if we're on Stellar network after connection
      if (isConnected && !isStellarNetwork) {
        setState((prev) => ({ ...prev, showNetworkModal: true }));
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to connect wallet";
      setState((prev) => ({ ...prev, error: message }));
    } finally {
      setState((prev) => ({ ...prev, isConnecting: false }));
    }
  };

  const disconnect = (): void => {
    try {
      const singleton = WalletConnectSingleton.getInstance();
      const provider = singleton.getSession();
      if (provider) {
        // no-op: session is cleared below
      }
    } catch (err) {
      console.warn("Error during WalletConnect disconnect:", err);
    }
    stopStreaming();
    disconnectWallet();
    setState((prev) => ({
      ...prev,
      error: null,
      sep0007Status: "idle",
      sep0007Request: null,
      sep0007TxHash: null,
      sep0007Error: null,
    }));
  };

  const ensureStellarNetwork = async (): Promise<boolean> => {
    if (isStellarNetwork) {
      setState((prev) => ({ ...prev, showNetworkModal: false }));
      return true;
    }
    setState((prev) => ({ ...prev, isSwitchingNetwork: true, error: null }));
    try {
      await switchToStellarNetwork();
      setState((prev) => ({ ...prev, showNetworkModal: false }));
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to switch to Stellar network";
      setState((prev) => ({ ...prev, error: message }));
      return false;
    } finally {
      setState((prev) => ({ ...prev, isSwitchingNetwork: false }));
    }
  };

  const clearError = (): void => {
    setState((prev) => ({ ...prev, error: null }));
  };

  const setShowNetworkModal = (show: boolean): void => {
    setState((prev) => ({ ...prev, showNetworkModal: show }));
  };

  const clearSep0007Error = (): void => {
    setState((prev) => ({ ...prev, sep0007Error: null }));
  };

  const cancelSep0007 = (): void => {
    stopStreaming();
    setState((prev) => ({
      ...prev,
      sep0007Status: "idle",
      sep0007Request: null,
      sep0007TxHash: null,
      sep0007Error: null,
    }));
  };

  const signWithSep0007MobileWallet = async (xdr: string, account: string): Promise<void> => {
    stopStreaming();

    const uri = generateSep0007TxUri(xdr);
    const request: Sep0007SignRequest = { xdr, uri, account };

    setState((prev) => ({
      ...prev,
      sep0007Status: "awaiting",
      sep0007Request: request,
      sep0007TxHash: null,
      sep0007Error: null,
    }));

    // Trigger the installed mobile wallet via the SEP-0007 deep-link.
    try {
      if (typeof window !== "undefined") {
        window.location.href = uri;
      }
    } catch (err) {
      console.warn("Failed to open SEP-0007 deep-link:", err);
    }

    // Stream Horizon for the account until the transaction is included.
    try {
      const unsubscribe = streamAccountTransactions(account, {
        onPending: () => {
          if (!isMountedRef.current) return;
          setState((prev) => ({ ...prev, sep0007Status: "awaiting" }));
        },
        onConfirmed: (hash) => {
          if (!isMountedRef.current) return;
          setState((prev) => ({
            ...prev,
            sep0007Status: "confirmed",
            sep0007TxHash: hash,
          }));
          stopStreaming();
        },
        onError: (err) => {
          if (!isMountedRef.current) return;
          setState((prev) => ({
            ...prev,
            sep0007Status: "failed",
            sep0007Error: err.message,
          }));
          stopStreaming();
        },
      });
      streamUnsubscribeRef.current = unsubscribe;
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message
          : "Failed to stream Horizon transactions";
      setState((prev) => ({
        ...prev,
        sep0007Status: "failed",
        sep0007Error: message,
      }));
    }
  };

  const value: WalletConnectContextType = {
    ...state,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
    provider: providerInstance,
    signWithSep0007MobileWallet,
    cancelSep0007,
    clearSep0007Error,
  };

  return <WalletConnectContext.Provider value={value}>{children}</WalletConnectContext.Provider>;
};

export const useWalletConnect = (): WalletConnectContextType => {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error("useWalletConnect must be used within a WalletConnectProvider");
  }
  return context;
};
