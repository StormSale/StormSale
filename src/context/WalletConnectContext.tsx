import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";

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

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  isProviderReady: boolean;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  provider: WalletConnectCoreProvider | null;
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
  });

  const [providerInstance, setProviderInstance] = useState<WalletConnectCoreProvider | null>(null);

  // Use a ref to track initialization state across component lifecycles & StrictMode double mounts
  const hasInitializedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  // Tracks the active connection attempt so results from a superseded session are ignored
  const disconnectSessionRef = useRef(0);

  const { connectWallet, disconnectWallet, switchToStellarNetwork, isConnected, isStellarNetwork } =
    useWeb3();

  // Reactively trigger network modal when wallet is connected but on incorrect network
  useEffect(() => {
    if (isConnected && !isStellarNetwork) {
      setState((prev) => ({ ...prev, showNetworkModal: true }));
    } else if (isStellarNetwork) {
      setState((prev) => ({ ...prev, showNetworkModal: false }));
    }
  }, [isConnected, isStellarNetwork]);

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

  const connect = async (): Promise<void> => {
    const currentSession = ++disconnectSessionRef.current;
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
      if (disconnectSessionRef.current !== currentSession) return;
      console.error("Wallet connection error:", error);
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to connect wallet";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
      }));
    } finally {
      if (disconnectSessionRef.current === currentSession) {
        setState((prev) => ({ ...prev, isConnecting: false }));
      }
    }
  };

  const disconnect = (): void => {
    disconnectSessionRef.current++;
    const singleton = WalletConnectSingleton.getInstance();
    if (providerInstance) {
      providerInstance.disconnect().catch(console.warn);
    }
    disconnectWallet();
    setState({
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
      isProviderReady: singleton.getIsInitialized(),
    });
  };

  const ensureStellarNetwork = async (): Promise<boolean> => {
    if (isStellarNetwork) return true;

    setState((prev) => ({ ...prev, isSwitchingNetwork: true, error: null }));

    try {
      const success = await switchToStellarNetwork();

      if (success) {
        setState((prev) => ({ ...prev, showNetworkModal: false }));
        return true;
      } else {
        setState((prev) => ({
          ...prev,
          error: "Failed to switch to Stellar network. Please switch manually.",
        }));
        return false;
      }
    } catch (error: any) {
      console.error("Network switch error:", error);
      setState((prev) => ({
        ...prev,
        error: error.message || "Failed to switch network",
      }));
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

  const contextValue: WalletConnectContextType = {
    ...state,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
    provider: providerInstance,
  };

  return (
    <WalletConnectContext.Provider value={contextValue}>{children}</WalletConnectContext.Provider>
  );
};

export const useWalletConnect = (): WalletConnectContextType => {
  const context = useContext(WalletConnectContext);
  if (context === undefined) {
    throw new Error("useWalletConnect must be used within a WalletConnectProvider");
  }
  return context;
};

export { WalletConnectSingleton };
