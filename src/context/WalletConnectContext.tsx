import React, { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
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
  });

  const { connectWallet, disconnectWallet, switchToStellarNetwork, isConnected, isStellarNetwork } =
    useWeb3();

  const connect = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      await connectWallet();

      // Check if we're on Stellar network after connection
      if (isConnected && !isStellarNetwork) {
        setState((prev) => ({ ...prev, showNetworkModal: true }));
      }
    } catch (error: any) {
      console.error("Wallet connection error:", error);
      setState((prev) => ({
        ...prev,
        error: error.message || "Failed to connect wallet",
      }));
    } finally {
      setState((prev) => ({ ...prev, isConnecting: false }));
    }
  }, [connectWallet, isConnected, isStellarNetwork]);

  const disconnect = useCallback((): void => {
    disconnectWallet();
    setState({
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
    });
  }, [disconnectWallet]);

  const ensureStellarNetwork = useCallback(async (): Promise<boolean> => {
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
  }, [isStellarNetwork, switchToStellarNetwork]);

  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const setShowNetworkModal = useCallback((show: boolean): void => {
    setState((prev) => ({ ...prev, showNetworkModal: show }));
  }, []);

  const contextValue: WalletConnectContextType = {
    ...state,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
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
