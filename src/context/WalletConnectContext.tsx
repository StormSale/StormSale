import React, { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";
import { generateSep7TxUri, pollTransactionInclusion } from "../lib/stellar";

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  sep7Uri: string | null;
  isPollingTx: boolean;
  txHash: string | null;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  signWithSep7Wallet: (xdr: string) => Promise<void>;
  resetSep7: () => void;
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
    sep7Uri: null,
    isPollingTx: false,
    txHash: null,
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
      sep7Uri: null,
      isPollingTx: false,
      txHash: null,
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

  const signWithSep7Wallet = async (xdr: string): Promise<void> => {
    setState((prev) => ({ ...prev, error: null, txHash: null, isPollingTx: false }));

    try {
      const uri = generateSep7TxUri(xdr);
      setState((prev) => ({ ...prev, sep7Uri: uri }));

      // Deep-link into the installed mobile wallet
      if (typeof window !== "undefined") {
        window.location.href = uri;
      }

      setState((prev) => ({ ...prev, isPollingTx: true }));

      const hash = await pollTransactionInclusion(xdr);

      setState((prev) => ({ ...prev, isPollingTx: false, txHash: hash }));
    } catch (error: any) {
      console.error("SEP-0007 signing error:", error);
      setState((prev) => ({
        ...prev,
        isPollingTx: false,
        error: error.message || "Failed to confirm SEP-0007 transaction",
      }));
    }
  };

  const resetSep7 = (): void => {
    setState((prev) => ({ ...prev, sep7Uri: null, isPollingTx: false, txHash: null }));
  };

  const contextValue: WalletConnectContextType = {
    ...state,
    connect,
    disconnect,
    ensureStellarNetwork,
    clearError,
    setShowNetworkModal,
    signWithSep7Wallet,
    resetSep7,
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
