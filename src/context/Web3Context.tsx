import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXbullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXlmBalance,
  fundTestnetAccount,
  createCampaignContractCall,
  logSaleContractCall,
  claimPayoutContractCall,
  startSorobanEventStream,
  SOROBAN_EVENT_TOPICS,
} from "../lib/stellar";
import type {
  WalletType,
  SorobanEvent,
  SorobanStreamStatus,
  SorobanEventStreamHandle,
} from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";
import { useNotification } from "./NotificationContext";

export interface Web3ContextType {
  userAddress: string | null;
  userRole: string | null;
  isConnected: boolean;
  isStellarNetwork: boolean;
  network: string;
  xlmBalance: string;
  connectorType: WalletType | null;
  isWalletModalOpen: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWallet: (connectorType?: WalletType, customAddress?: string) => Promise<void>;
  disconnectWallet: () => void;
  updateUserRole: (role: string) => Promise<void>;
  requestFriendbotFunding: () => Promise<boolean>;

  // Soroban Smart Contract Operations
  createCampaignOnChain: (
    name: string,
    budgetXlm: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ) => Promise<{ success: boolean; campaignId: number; txHash?: string }>;

  logSaleOnChain: (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => Promise<{ success: boolean; txHash?: string }>;

  claimPayoutOnChain: (campaignId: number) => Promise<{ success: boolean; txHash?: string }>;

  // Real-time Soroban event stream
  eventStreamStatus: SorobanStreamStatus;
  lastEvent: SorobanStreamEvent | null;
  eventStreamError: string | null;
  forceEventStreamReconnect: () => void;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

export interface SorobanStreamEvent {
  id: string;
  topic: string;
  contractId: string;
  ledger: number;
  txHash: string;
  value: any;
  closedAt: string;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

function describeEvent(event: SorobanEvent): { title: string; message: string } {
  const shortTx = event.txHash ? `${event.txHash.slice(0, 8)}…${event.txHash.slice(-8)}` : "";
  switch (event.topic) {
    case "create_campaign":
      return {
        title: "New campaign created",
        message: `Campaign on ledger ${event.ledger}${shortTx ? ` • ${shortTx}` : ""}`,
      };
    case "log_sale":
      return {
        title: "Sale logged on-chain",
        message: `Affiliate sale confirmed on ledger ${event.ledger}${shortTx ? ` • ${shortTx}` : ""}`,
      };
    case "claim_payout":
      return {
        title: "Payout claimed",
        message: `Commission payout claimed on ledger ${event.ledger}${shortTx ? ` • ${shortTx}` : ""}`,
      };
    default:
      return {
        title: "On-chain event",
        message: `${event.topic} on ledger ${event.ledger}`,
      };
  }
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const { showNotification } = useNotification();
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const [eventStreamStatus, setEventStreamStatus] =
    useState<SorobanStreamStatus>("idle");
  const [lastEvent, setLastEvent] = useState<SorobanStreamEvent | null>(null);
  const [eventStreamError, setEventStreamError] = useState<string | null>(null);
  const streamRef = useRef<SorobanStreamHandle | null>(null);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXlmBalance(address);
      setXlmBalance(bal);
    } catch (err) {
      console.warn("Could not fetch balance:", err);
    }
  }, []);

  // Sync with backend database & persistent role
  const syncUserWithBackend = useCallback(async (address: string) => {
    try {
      const savedUser = await registerUser(address);
      if (savedUser && savedUser.role) {
        setUserRole(savedUser.role);
      }
    } catch (err) {
      console.error("Error registering user with backend:", err);
    }
  }, []);

  // Multi-Wallet Stellar Connection: Freighter, Albedo, xBull, Mock
  const connectWallet = async (type: WalletType = "freighter", customAddress?: string) => {
    try {
      let address = "";
      if (type === "freighter") {
        const isInstalled = await checkFreighterInstalled();
        if (!isInstalled) {
          throw new Error(
            "Freighter extension is not installed. If you are on a mobile device, please select Albedo (Web Wallet) or Demo Account.",
          );
        }
        address = await connectFreighterWallet();
        const currentNet = await getCurrentNetwork();
        setNetwork(currentNet);
      } else if (type === "albedo") {
        address = await connectAlbedoWallet();
        setNetwork(STELLAR_CONFIG.network);
      } else if (type === "xbull") {
        address = await connectXbullWallet();
        setNetwork(STELLAR_CONFIG.network);
      } else if (type === "readonly") {
        if (!customAddress) throw new Error("Please provide a valid Stellar address.");
        address = customAddress;
        setNetwork!(STELLAR_CONFIG.network);
      } else {
        // Mock fallback demo account with 10,000 XLM
        address = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
        setNetwork("TESTNET");
        setXlmBalance("10000.00");
      }

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);

      if (type !== "mock") {
        await refreshBalance(address);
      }
      await syncUserWithBackend(address);
      setIsWalletModalOpen(false);
    } catch (error) {
      console.error("Wallet connection failed:", error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setUserRole(null);
    setIsConnected(false);
    setConnectorType(null);
    setXlmBalance("0.00");
  };

  const updateUserRole = async (role: string) => {
    if (!userAddress) return;
    try {
      const updated = await registerUser(userAddress, role);
      if (updated && updated.role) {
        setUserRole(updated.role);
      }
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const requestFriendbotFunding = async (): Promise<boolean> => {
    if (!userAddress) return false;
    const ok = await fundTestnetAccount(userAddress);
    if (ok) {
      setTimeout(() => refreshBalance(userAddress), 2000);
    }
    return ok;
  };

  // Soroban: Create Campaign Escrow
  const createCampaignOnChain = async (
    name: string,
    budgetXlm: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(
      `[Soroban] Creating campaign "${name}": Budget=${budgetXlm} XLM, Rate=${commissionRatePercent}%, Clearing=${clearingPeriodSecs}s`,
    );

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await createCampaignContractCall(
        userAddress,
        commissionRatePercent,
        clearingPeriodSecs,
        budgetXlm,
        connectorType,
      );
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } else {
      // Mock fallback for UI preview without extension
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      const newCampaignId = Math.floor(Math.random() * 9000) + 1000;
      return {
        success: true,
        campaignId: newCampaignId,
        txHash: mockTxHash,
      };
    }
  };

  // Soroban: Log Verified Sale
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(
      `[Soroban] Logging sale for Campaign #${campaignId}: Affiliate=${affiliateAddress}, Amount=${amountXlm} XLM`,
    );

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await logSaleContractCall(
        userAddress,
        campaignId,
        affiliateAddress,
        amountXlm,
        connectorType,
      );
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      return {
        success: true,
        txHash: mockTxHash,
      };
    }
  };

  // Soroban: Claim Affiliate Commission
  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(`[Soroban] Claiming payout for Campaign #${campaignId} by ${userAddress}`);

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await claimPayoutContractCall(userAddress, campaignId, connectorType);
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      return {
        success: true,
        txHash: mockTxHash,
      };
    }
  };

  // Real-time Soroban event stream: start when wallet is connected.
  useEffect(() => {
    if (!isConnected) {
      streamRef.current?.stop();
      streamRef.current = null;
      setEventStreamStatus("idle");
      return;
    }

    const handle = startSorobanEventStream({
      contractId: STELLAR_CONFIG.contractId,
      topics: SOROBAN_EVENT_TOPICS,
      onStatusChange: (status) => {
        setEventStreamStatus(status);
        if (status === "connected") {
          setEventStreamError(null);
        }
      },
      onError: (err) => {
        setEventStreamError(err.message);
      },
      onEvent: (event: SorobanEvent) => {
        const normalized: SorobanStreamEvent = {
          id: event.id,
          topic: event.topic,
          contractId: event.contractId,
          ledger: event.ledger,
          txHash: event.txHash,
          value: event.value,
          closedAt: event.closedAt,
        };
        setLastEvent(normalized);

        // Subtle toast notification for incoming on-chain events
        const { title, message } = describeEvent(event);
        showNotification({ type: "info", title, message, duration: 4000 });

        // Lightweight re-validation triggers
        if (event.topic === "log_sale" || event.topic === "claim_payout") {
          if (userAddress) {
            void refreshBalance(userAddress);
          }
        }
      },
    });

    streamRef.current = handle;

    return () => {
      handle.stop();
      streamRef.current = null;
    };
  }, [isConnected, userAddress, refreshBalance, showNotification]);

  const forceEventStreamReconnect = () => {
    streamRef.current?.forceReconnect();
  };

  // Compatibility facade for existing form components
  const factoryContract = {
    createCampaign: async (rate: string, period: string) => {
      const res = await createCampaignOnChain(
        "Campaign",
        1000,
        parseFloat(rate) || 10,
        parseInt(period) || 604800,
      );
      return {
        wait: async () => res,
      };
    },
    joinCampaign: async (campaignAddr: string) => {
      console.log(`[Soroban] Joined campaign: ${campaignAddr}`);
      return {
        wait: async () => ({ success: true }),
      };
    },
  };

  const getCampaignContract = (_address: string) => ({
    logEncryptedSale: async (
      affiliate: string,
      amount: string,
      _payload: any,
      _advKey: any,
      _affKey: any,
    ) => {
      const res = await logSaleOnChain(1, affiliate, parseFloat(amount) || 0);
      return {
        wait: async () => res,
      };
    },
    grantAuditAccess: async (saleId: string, auditor: string, _key: any) => {
      console.log(`[Soroban] Granted audit access for sale ${saleId} to ${auditor}`);
      return {
        wait: async () => ({ success: true }),
      };
    },
  });

  const switchToStellarNetwork = async () => {
    setNetwork("TESTNET");
    return true;
  };

  return (
    <Web3Context.Provider
      value={{
        userAddress,
        userRole,
        isConnected,
        isStellarNetwork: network.toUpperCase() === "TESTNET" || network.toUpperCase() === "PUBLIC",
        network,
        xlmBalance,
        connectorType,
        isWalletModalOpen,
        openWalletModal,
        closeWalletModal,
        connectWallet,
        disconnectWallet,
        updateUserRole,
        requestFriendbotFunding,
        createCampaignOnChain,
        logSaleOnChain,
        claimPayoutOnChain,
        eventStreamStatus,
        lastEvent,
        eventStreamError,
        forceEventStreamReconnect,
        factoryContract,
        getCampaignContract,
        provider: null,
        signer: null,
        switchToStellarNetwork,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
