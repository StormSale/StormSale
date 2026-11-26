import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";

export const WALLETCONNECT_SESSION_KEY = "stormsale_walletconnect_session";
export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24-hour session window

export interface WalletConnectSession {
  topic?: string;
  peerMeta?: {
    name?: string;
    description?: string;
    icons?: string[];
  };
  connectedAt: number;
  expiresAt: number;
  lastActiveAt?: number;
}

export type MobileWalletName = "metamask" | "rainbow" | "trust";

export interface MobileWalletConfig {
  id: MobileWalletName;
  name: string;
  universalLink: string;
  nativeScheme: string;
  description: string;
}

export const SUPPORTED_MOBILE_WALLETS: Record<MobileWalletName, MobileWalletConfig> = {
  metamask: {
    id: "metamask",
    name: "MetaMask",
    universalLink: "https://metamask.app.link/wc",
    nativeScheme: "metamask://wc",
    description: "Connect to MetaMask Mobile via deep link",
  },
  rainbow: {
    id: "rainbow",
    name: "Rainbow",
    universalLink: "https://rainbow.me/wc",
    nativeScheme: "rainbow://wc",
    description: "Connect to Rainbow Wallet via deep link",
  },
  trust: {
    id: "trust",
    name: "Trust Wallet",
    universalLink: "https://link.trustwallet.com/wc",
    nativeScheme: "trust://wc",
    description: "Connect to Trust Wallet via deep link",
  },
};

/**
 * Generates verified deep-linking URLs for MetaMask, Rainbow, or Trust Wallet.
 * Supports universal links (web redirect) or native OS URI schemes.
 */
export function formatMobileDeepLink(
  wallet: MobileWalletName,
  wcUri: string,
  options?: { nativeScheme?: boolean }
): string {
  const config = SUPPORTED_MOBILE_WALLETS[wallet];
  if (!config || !wcUri) return wcUri || "";
  const encodedUri = encodeURIComponent(wcUri);
  const base = options?.nativeScheme ? config.nativeScheme : config.universalLink;
  return `${base}?uri=${encodedUri}`;
}

/**
 * Triggers mobile deep link navigation or window open.
 */
export function triggerMobileDeepLink(
  wallet: MobileWalletName,
  wcUri: string,
  options?: { nativeScheme?: boolean }
): boolean {
  if (typeof window === "undefined" || !wcUri) return false;
  const link = formatMobileDeepLink(wallet, wcUri, options);
  try {
    if (window.location && typeof window.location.assign === "function") {
      window.location.assign(link);
    } else if (window.location) {
      window.location.href = link;
    }
    return true;
  } catch (err) {
    console.warn("Could not trigger mobile deep link:", err);
    return false;
  }
}

/**
 * Detects if the current user agent is a mobile or tablet device.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
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

  public restoreSession(): void {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = localStorage.getItem(WALLETCONNECT_SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          const now = Date.now();
          const expiresAt =
            typeof parsed.expiresAt === "number"
              ? parsed.expiresAt
              : (parsed.connectedAt || now) + SESSION_WINDOW_MS;

          // Enforce 24-hour session window resilience
          if (now < expiresAt) {
            this.session = {
              ...parsed,
              expiresAt,
              lastActiveAt: now,
            };
          } else {
            // Prune expired session from storage
            localStorage.removeItem(WALLETCONNECT_SESSION_KEY);
            this.session = null;
          }
        }
      }
    } catch (err) {
      console.warn("Could not restore WalletConnect session from storage:", err);
    }
  }

  public isSessionValid(): boolean {
    if (!this.session) return false;
    const now = Date.now();
    return now < (this.session.expiresAt || this.session.connectedAt + SESSION_WINDOW_MS);
  }

  public getSessionRemainingTime(): number {
    if (!this.session) return 0;
    const expiresAt = this.session.expiresAt || this.session.connectedAt + SESSION_WINDOW_MS;
    return Math.max(0, expiresAt - Date.now());
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
            const now = Date.now();
            const newSession: WalletConnectSession = {
              topic: "wc_" + Math.random().toString(36).substring(2, 12),
              peerMeta: {
                name: "StormSale Mobile",
                description: "Stellar Affiliate Escrow Platform",
              },
              connectedAt: now,
              expiresAt: now + SESSION_WINDOW_MS,
              lastActiveAt: now,
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
  isSessionActive: boolean;
  sessionRemainingTime: number;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  provider: WalletConnectCoreProvider | null;
  session: WalletConnectSession | null;
  formatDeepLink: (wallet: MobileWalletName, uri?: string, options?: { nativeScheme?: boolean }) => string;
  triggerDeepLink: (wallet: MobileWalletName, uri?: string, options?: { nativeScheme?: boolean }) => boolean;
  isMobileDevice: () => boolean;
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
    isSessionActive: false,
    sessionRemainingTime: 0,
  });

  const [providerInstance, setProviderInstance] = useState<WalletConnectCoreProvider | null>(null);

  // Use a ref to track initialization state across component lifecycles & StrictMode double mounts
  const hasInitializedRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

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
          const valid = singleton.isSessionValid();
          setState((prev) => ({
            ...prev,
            isProviderReady: true,
            isSessionActive: valid,
            sessionRemainingTime: singleton.getSessionRemainingTime(),
          }));

          // 24-hour session window auto-reconnect
          if (valid && !isConnected) {
            connectWallet("mock").catch((err) => {
              console.warn("WalletConnect auto-reconnect notice:", err);
            });
          }
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
    };
  }, [connectWallet, isConnected]);

  const connect = async (): Promise<void> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const singleton = WalletConnectSingleton.getInstance();
      const provider = await singleton.initialize();
      await provider.connect();

      await connectWallet();

      setState((prev) => ({
        ...prev,
        isSessionActive: true,
        sessionRemainingTime: singleton.getSessionRemainingTime(),
      }));

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
    setState({
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
      isProviderReady: singleton.getIsInitialized(),
      isSessionActive: false,
      sessionRemainingTime: 0,
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

  const formatDeepLink = (
    wallet: MobileWalletName,
    uri?: string,
    options?: { nativeScheme?: boolean }
  ): string => {
    const singleton = WalletConnectSingleton.getInstance();
    const effectiveUri = uri || singleton.getSession()?.topic || "";
    return formatMobileDeepLink(wallet, effectiveUri, options);
  };

  const triggerDeepLink = (
    wallet: MobileWalletName,
    uri?: string,
    options?: { nativeScheme?: boolean }
  ): boolean => {
    const singleton = WalletConnectSingleton.getInstance();
    const effectiveUri = uri || singleton.getSession()?.topic || "";
    return triggerMobileDeepLink(wallet, effectiveUri, options);
  };

  const contextValue: WalletConnectContextType = {
    ...state,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
    provider: providerInstance,
    session: WalletConnectSingleton.getInstance().getSession(),
    formatDeepLink,
    triggerDeepLink,
    isMobileDevice,
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
