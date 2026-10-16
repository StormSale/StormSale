import React, { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";
import {
  generateSEP0007TxURI,
  openSEP0007DeepLink,
  pollForTransactionConfirmation,
  streamTransactionConfirmation,
} from "../lib/stellar";

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  showSEP0007Modal: boolean;
  sep0007Uri: string | null;
  isPollingConfirmation: boolean;
  pendingTxHash: string | null;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  openSEP0007Modal: (xdrBase64: string, accountId?: string) => void;
  closeSEP0007Modal: () => void;
  confirmSEP0007Transaction: (txHash: string, accountId?: string) => Promise<void>;
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
    showSEP0007Modal: false,
    sep0007Uri: null,
    isPollingConfirmation: false,
    pendingTxHash: null,
  });

  const { connectWallet, disconnectWallet, switchToStellarNetwork, isConnected, isStellarNetwork } =
    useWeb3();

  const connect = async (): Promise<void> => {
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
  };

  const disconnect = (): void => {
    disconnectWallet();
    setState({
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
      showSEP0007Modal: false,
      sep0007Uri: null,
      isPollingConfirmation: false,
      pendingTxHash: null,
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

  const openSEP0007Modal = (xdrBase64: string, accountId?: string): void => {
    const uri = generateSEP0007TxURI(xdrBase64, false);
    openSEP0007DeepLink(uri);
    setState((prev) => ({
      ...prev,
      showSEP0007Modal: true,
      sep0007Uri: uri,
      error: null,
    }));
  };

  const closeSEP0007Modal = (): void => {
    setState((prev) => ({
      ...prev,
      showSEP0007Modal: false,
      sep0007Uri: null,
      isPollingConfirmation: false,
      pendingTxHash: null,
    }));
  };

  const confirmSEP0007Transaction = async (txHash: string, accountId?: string): Promise<void> => {
    setState((prev) => ({
      ...prev,
      isPollingConfirmation: true,
      pendingTxHash: txHash,
    }));

    try {
      if (accountId) {
        // Use streaming for real-time confirmation
        await new Promise<void>((resolve, reject) => {
          const cleanup = streamTransactionConfirmation(
            accountId,
            txHash,
            () => {
              cleanup();
              resolve();
            },
            (err) => {
              cleanup();
              reject(err);
            },
          );
        });
      } else {
        // Fallback to polling if no account ID is provided
        const confirmed = await pollForTransactionConfirmation(txHash);
        if (!confirmed) {
          throw new Error("Transaction was not confirmed within the timeout period.");
        }
      }

      setState((prev) => ({
        ...prev,
        isPollingConfirmation: false,
        pendingTxHash: null,
        showSEP0007Modal: false,
        sep0007Uri: null,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isPollingConfirmation: false,
        error: error.message || "Failed to confirm transaction.",
      }));
    }
  };

  const contextValue: WalletConnectContextType = {
    ...state,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
    openSEP0007Modal,
    closeSEP0007Modal,
    confirmSEP0007Transaction,
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
