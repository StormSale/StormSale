import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useWeb3 } from "./Web3Context";
import {
  buildSep0007TxUri,
  buildSep0007QrCodeDataUrl,
  streamTransactionInclusion,
  type Sep0007TxParams,
  type TransactionInclusionStreamHandle,
} from "../lib/stellar";


interface Sep0007State {
  isActive: boolean;
  isPolling: boolean;
  isConfirmed: boolean;
  uri: string | null;
  qrCodeDataUrl: string | null;
  hash: string | null;
  error: string | null;
}

interface WalletConnectState {
  isConnecting: boolean;
  isSwitchingNetwork: boolean;
  error: string | null;
  showNetworkModal: boolean;
  sep0007: Sep0007State;
}

interface WalletConnectContextType extends WalletConnectState {
  connect: () => Promise<void>;
  disconnect: () => void;
  ensureStellarNetwork: () => Promise<boolean>;
  clearError: () => void;
  setShowNetworkModal: (show: boolean) => void;
  invokeSep0007Wallet: (params: Sep0007TxParams) => Promise<void>;
  cancelSep0007Wallet: () => void;
}

const Sep0007InitialState: Sep0007State = {
  isActive: false,
  isPolling: false,
  isConfirmed: false,
  uri: null,
  qrCodeDataUrl: null,
  hash: null,
  error: null,
};

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
    sep0007: Sep0007InitialState,
  });

  const streamRef = useRef<TransactionInclusionStreamHandle | null>(null);

  const { connectWallet, disconnectWallet, switchToStellarNetwork, isConnected, isStellarNetwork, address } =
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

  const stopStream = (): void => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  };

  const disconnect = (): void => {
    stopStream();
    disconnectWallet();
    setState({
      isConnecting: false,
      isSwitchingNetwork: false,
      error: null,
      showNetworkModal: false,
      sep0007: Sep0007InitialState,
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

  const cancelSep0007Wallet = useCallback((): void => {
    stopStream();
    setState((prev) => ({ ...prev, sep0007: Sep0007InitialState }));
  }, []);

  const invokeSep0007Wallet = async (params: Sep0007TxParams): Promise<void> => {
    stopStream();

    try {
      const uri = buildSep0007TxUri(params);
      const qrCodeDataUrl = buildSep0007QrCodeDataUrl(params);
      const hash = params.hash ?? null;

      setState((prev) => ({
        ...prev,
        error: null,
        sep0007: {
          isActive: true,
          isPolling: true,
          isConfirmed: false,
          uri,
          qrCodeDataUrl,
          hash,
          error: null,
        },
      }));

      // Deep-link into the installed mobile wallet (no-op if unsupported).
      if (typeof window !== "undefined") {
        window.location.href = uri;
      }

      const streamAddress = params.account ?? address;
      if (!streamAddress) {
        throw new Error(
          "No Stellar account available to stream for transaction inclusion. Connect a wallet or pass an account.",
        );
      }

      streamRef.current = streamTransactionInclusion({
        account: streamAddress,
        hash,
        onIncluded: (txHash) => {
          stopStream();
          setState((prev) => ({
            ...prev,
            sep0007: {
              ...prev.sep0007,
              isPolling: false,
              isConfirmed: true,
              hash: txHash,
            },
          }));
        },
        onError: (err) => {
          stopStream();
          setState((prev) => ({
            ...prev,
            sep0007: {
              ...prev.sep0007,
              isPolling: false,
              error: err.message || "Failed to confirm transaction on the Stellar ledger",
            },
          }));
        },
      });
    } catch (error: any) {
      console.error("SEP-0007 invocation error:", error);
      setState((prev) => ({
        ...prev,
        sep0007: {
          ...prev.sep0007,
          isPolling: false,
          error: error.message || "Failed to invoke SEP-0007 mobile wallet",
        },
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
    invokeSep0007Wallet,
    cancelSep0007Wallet,
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
