import React, { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";
import { buildSep7TxUri, pollTransactionInclusion } from "../lib/stellar";

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  sep7Uri: string | null;
  isAwaitingLedgerConfirmation: boolean;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  signWithSep7MobileWallet: (xdr: string, account: string) => Promise<void>;
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
    isAwaitingLedgerConfirmation: false,
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
      isAwaitingLedgerConfirmation: false,
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

  const signWithSep7MobileWallet = async (xdr: string, account: string): Promise<void> => {
    setState((prev) => ({
      ...prev,
      error: null,
      sep7Uri: buildSep7TxUri(xdr),
      isAwaitingLedgerConfirmation: true,
    }));

    try {
      await pollTransactionInclusion(account);
      setState((prev) => ({ ...prev, isAwaitingLedgerConfirmation: false }));
    } catch (error: any) {
      console.error("SEP-0007 ledger confirmation error:", error);
      setState((prev) => ({
        ...prev,
        isAwaitingLedgerConfirmation: false,
        error: error.message || "Failed to confirm transaction on the Stellar ledger",
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
    signWithSep7MobileWallet,
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
