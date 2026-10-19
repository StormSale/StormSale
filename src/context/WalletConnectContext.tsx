import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";
import { buildSep0007TxUri, watchTransactionInclusion } from "../lib/stellar";

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
  uri: string;
  xdr: string;
  account?: string;
  networkPassphrase?: string;
  createdAt: number;
}

export interface Sep0007SignResult {
  txHash: string;
  ledger: number;
  successful: boolean;
}

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  isProviderReady: boolean;
  sep0007Request: Sep0007SignRequest | null;
  isSep0007Polling: boolean;
  sep0007Result: Sep0007SignResult | null;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  provider: WalletConnectCoreProvider | null;
  // SEP-0007 mobile wallet invocation
  signWithSep0007MobileWallet: (xdr: string, options?: { account?: string; networkPassphrase?: string }) => Sep0007SignRequest;
  clearSep0007Request: () => void;
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
    sep0007Request: null,
    isSep0007Polling: false,
    sep0007Result: null,
  });

  const [providerInstance, setProviderInstance] = useState<WalletConnectCoreProvider | null>(null);

  // Use a ref to track initialization state across component lifecycles & StrictMode double mounts
  const hasInitializedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const sep0007UnsubscribeRef = useRef<(() => void) | null>(null);

  const { connectWallet, disconnectWallet, switchToStellarNetwork, isConnected, isStellarNetwork } =
    useWeb3();

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

  // Clean up any active SEP-0007 stream on unmount
  useEffect(() => {
    return () => {
      if (sep0007UnsubscribeRef.current) {
        sep0007UnsubscribeRef.current();
        sep0007UnsubscribeRef.current = null;
      }
    };
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
      setState((prev) => ({ ...prev, isConnecting: false }));
    }
  };

  const disconnect = (): void => {
    const singleton = WalletConnectSingleton.getInstance();
    if (providerInstance) {
      providerInstance.disconnect().catch(console.warn);
    }
    disconnectWallet();
    if (sep0007UnsubscribeRef.current) {
      sep0007UnsubscribeRef.current();
      sep0007UnsubscribeRef.current = null;
    }
    setState({
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
      isProviderReady: true,
      sep0007Request: null,
      isSep0007Polling: false,
      sep0007Result: null,
    });
    singleton.getSession();
  };

  const ensureStellarNetwork = async (): Promise<boolean> => {
    if (!isConnected) {
      return false;
    }
    if (isStellarNetwork) {
      return true;
    }
    setState((prev) => ({ ...prev, isSwitchingNetwork: true, error: null }));
    try {
      const switched = await switchToStellarNetwork();
      if (!switched) {
        setState((prev) => ({
          ...prev,
          error: "Failed to switch to Stellar network",
          showNetworkModal: true,
        }));
        return false;
      }
      setState((prev) => ({ ...prev, showNetworkModal: false }));
      return true;
    } catch (err: unknown) {
      console.error("Network switch error:", err);
      setState((prev) => ({
        ...prev,
        error: "Failed to switch to Stellar working network",
        showNetworkModal: true,
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

  const clearSep0007Request = (): void => {
    if (sep0007UnsubscribeRef.current) {
      sep0007UnsubscribeRef.current();
      sep0007UnsubscribeRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      sep0007Request: null,
      isSep0007Polling: false,
      sep0007Result: null,
    }));
  };

  const signWithSep0007MobileWallet = (
    xdr: string,
    options?: { account?: string; networkPassphrase?: string },
  ): Sep0007SignRequest => {
    const request = buildSep0007TxUri(xdr, options);

    if (sep0007UnsubscribeRef.current) {
      sep0007UnsubscribeRef.current();
      sep0007UnsubscribeRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      sep0007Request: request,
      isSep0007Polling: true,
      sep0007Result: null,
      error: null,
    }));

    // Open the installed mobile wallet via the SEP-0007 deep link.
    if (typeof window !== "undefined") {
      try {
        window.location.href = request.uri;
      } catch (err) {
        console.warn("Failed to open SEP-0007 deep link::", err);
      }
    }

    // Poll the Stellar ledger via Horizon transaction streaming until inclusion.
    const unsubscribe = watchTransactionInclusion(
      request.xdr,
      {
        account: request.account,
        networkPassphrase: request.networkPassphrase,
        onInclusion: (result) => {
          if (!isMountedRef.current) {
            return;
          }
          sep0007UnsubscribeRef.current = null;
          setState((prev) => ({
            ...prev,
            isSep0007Polling: false,
            sep0007Result: result,
          }));
        },
        onError: (err) => {
          if (!isMountedRef.current) {
            return;
          }
          console.warn("SEP-0007 transaction stream error:", err);
          sep0007UnsubscribeRef.current = null;
          setState((prev) => ({
            ...prev,
            isSep0007Polling: false,
            error: err instanceof Error && err.message.trim()
              ? err.message
              : "Failed to confirm transaction on the Stellar ledger",
          }));
        },
      },
    );
    sep0007UnsubscribeRef.current = unsubscribe;

    return request;
  };

  return (
    <WalletConnectContext.Provider
      value={{
        ...state,
        connect,
        disconnect,
        ensureStellarNetwork,
        clearError,
        setShowNetworkModal,
        provider: providerInstance,
        signWithSep0007MobileWallet,
        clearSep0007Request,
      }}
    >
      {children}
    </WalletConnectContext.Provider>
  );
};

export const useWalletConnect = (): WalletConnectContextType => {
  const context = useContext(WalletConnectContext);
  if (context === undefined) {
    throw new Error("useWalletConnect must be used within a WalletConnectProvider");
  }
  return context;
};
