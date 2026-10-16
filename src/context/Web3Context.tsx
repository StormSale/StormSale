import { createContext, useContext, useState, useCallback, useRef } from "react";
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
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";

export interface OptimisticTransaction {
  id: string;
  type: "createCampaign" | "logSale" | "claimPayout";
  status: "pending" | "confirmed" | "reverted";
  description: string;
  txHash?: string;
  error?: string;
  createdAt: number;
  revert?: () => void;
  commit?: (txHash?: string) => void;
}

export interface WebContextType {
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

  // Optimistic UI state
  pendingTransactions: OptimisticTransaction[];
  optimisticBalanceDelta: number;
  optimisticCampaigns: Array<{ id: number; name: string; budgetXlm: number; pending: boolean }>;
  clearRevertedTransactions: () => void;

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

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<WebContextType | undefined>(undefined);

const OPTIMISTIC_CONFIRM_DAYS = 1;

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Optimistic UI state
  const [pendingTransactions, setPendingTransactions] = useState<OptimisticTransaction[]>([]);
  const [optimisticBalanceDelta, setOptimisticBalanceDelta] = useState<number>(0);
  const [optimisticCampaigns, setOptimisticCampaigns] = useState<
    Array<{ id: number; name: string; budgetXlm: number; pending: boolean }>
  >([]);

  // Track the latest balance read from the chain so optimistic deltas can be reconciled
  const balanceRef = useRef<string>("0.00");

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXlmBalance(address);
      balanceRef.current = bal;
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
        setNetwork(STELLAR_CONFIG.network);
      } else {
        // Mock fallback demo account with 10,000 XLM
        address = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
        setNetwork("TESTNET");
        setXlmBalance("10000.00");
        balanceRef.current = "10000.00";
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
    balanceRef.current = "0.00";
    setPendingTransactions([]);
    setOptimisticBalanceDelta(0);
    setOptimisticCampaigns([]);
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

  // -----------------------------------------------------------------------------
  // Optimistic UI helpers
  // -----------------------------------------------------------------------------
  const generateTxId = () =>
    `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;

  const addPendingTransaction = useCallback((tx: OptimisticTransaction) => {
    setPendingTransactions((prev) => [tx, ...prev]);
  }, []);

  const updatePendingTransaction = useCallback(
    (id: string, patch: Partial<OptimisticTransaction>) => {
      setPendingTransactions((prev) => prev.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)));
    },
    [],
  );

  const clearRevertedTransactions = useCallback(() => {
    setPendingTransactions((prev) => prev.filter((tx) => tx.status !== "reverted"));
  }, []);

  // Reconcile optimistic balance delta once the chain balance has been refreshed
  const applyOptimisticBalance = useCallback((delta: number) => {
    setOptimisticBalanceDelta((prev) => prev + delta);
  }, []);

  const reconcileOptimisticBalance = useCallback(() => {
    setOptimisticBalanceDelta(0);
  }, []);

  // -----------------------------------------------------------------------------
  // Soroban: Create Campaign Escrow (optimistic)
  // -----------------------------------------------------------------------------
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

    // --- Optimistic update (<Stms UI feedback) ---
    const txId = generateTxId();
    const optimisticId = Math.floor(Math.random() * 9000) + 1000;
    const optimisticCandidate = {
      id: optimisticId,
      name,
      budgetXlm,
      pending: true,
    };
    setOptimisticCampaigns((prev) => [optimisticCandidate, ...prev]);
    applyOptimisticBalance(-budgetXlm);

    const pendingTx: OptimisticTransaction = {
      id: txId,
      type: "createCampaign",
      status: "pending",
      description: `Creating campaign "${name}"`,
      createdAt: Date.now(),
      revert: () => {
        setOptimisticCampaigns((prev) => prev.filter((c) => c.id !== optimisticId));
        applyOptimisticBalance(budgetXlm);
      },
      commit: () => {
        setOptimisticCampaigns((prev) =>
          prev.map((c) => (c.id === optimisticId ? { ...c, pending: false } : c)),
        );
      },
    };
    addPendingTransaction(pendingTx);

    try {
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        const res = await createCampaignContractCall(
          userAddress,
          commissionRatePercent,
          clearingPeriodSecs,
          budgetXlm,
          connectorType,
        );
        if (!res || res.success === false) {
          throw new Error(
            (res as any)?.error || "Campaign creation failed on-chain",
          );
        }
        updatePendingTransaction(txId, {
          status: "confirmed",
          txHash: res.txHash,
        });
        pendingTx.commit?.(res.txHash);
        // Refresh balance after confirmation and reconcile optimistic delta
        setTimeout(async () => {
          await refreshBalance(userAddress);
          reconcileOptimisticBalance();
        }, 1000);
        return res;
      } else {
        // Mock fallback for UI preview without extension
        const mockTxHash = txId;
        updatePendingTransaction(txId, {
          status: "confirmed",
          txHash: mockTxHash,
        });
        pendingTx.commit?.(mockTxHash);
        return {
          success: true,
          campaignId: optimisticId,
          txHash: mockTxHash,
        };
      }
    } catch (error: any) {
      // --- Revert optimistic state on failure ---
      pendingTx.revert?.();
      updatePendingTransaction(txId, {
        status: "reverted",
        error: error.message || "Transaction failed",
      });
      throw error;
    }
  };

  // -----------------------------------------------------------------------------
  // Soroban: Log Verified Sale (optimistic)
  // -----------------------------------------------------------------------------
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(
      `[Soroban] Logging sale for Campaign #${campaignId}: Affiliate=${affiliateAddress}, Amount=${amountXlm} XLM`,
    );

    const txId = generateTxId();
    const pendingTx: OptimisticTransaction = {
      id: txId,
      type: "logSale",
      status: "pending",
      description: `Logging sale of ${amountXlm} XLM for campaign #${campaignId}`,
      createdAt: Date.now(),
      revert: () => {
        // No derived state to revert for logSale beyond the pending list
      },
    };
    addPendingTransaction(pendingTx);

    try {
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        const res = await logSaleContractCall(
          userAddress,
          campaignId,
          affiliateAddress,
          amountXlm,
          connectorType,
        );
        if (!res || res.success === false) {
          throw new Error((res as any)?.error || "Sale logging failed on-chain");
        }
        updatePendingTransaction(txId, {
          status: "confirmed",
          txHash: res.txHash,
        });
        return res;
      } else {
        const mockTxHash = txId;
        updatePendingTransaction(txId, {
          status: "confirmed",
          txHash: mockTxHash,
        });
        return {
          success: true,
          txHash: mockTxHash,
        };
      }
    } catch (error: any) {
      pendingTx.revert?.();
      updatePendingTransaction(txId, {
        status: "reverted",
        error: error.message || "Transaction failed",
      });
      throw error;
    }
  };

  // -----------------------------------------------------------------------------
  // Soroban: Claim Affiliate Commission (optimistic)
  // -----------------------------------------------------------------------------
  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(`[Soroban] Claiming payout for Campaign #${campaignId} by ${userAddress}`);

    const txId = generateTxId();
    const pendingTx: OptimisticTransaction = {
      id: txId,
      type: "claimPayout",
      status: "pending",
      description: `Claiming payout for campaign #${campaignId}`,
      createdAt: Date.now(),
      revert: () => {
        // No derived state to revert for claimPayout beyond the pending list
      },
    };
    addPendingTransaction(pendingTx);

    try {
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        const res = await claimPayoutContractCall(userAddress, campaignId, connectorType);
        if (!res || res.success === false) {
          throw new Error((res as any)?.error || "Payout claim failed on-chain");
        }
        updatePendingTransaction(txId, {
          status: "confirmed",
          txHash: res.txHash,
        });
        setTimeout(async () => {
          await refreshBalance(userAddress);
          reconcileOptimisticBalance();
        }, 1000);
        return res;
      } else {
        const mockTxHash = txId;
        updatePendingTransaction(txId, {
          status: "confirmed",
          txHash: mockTxHash,
        });
        return {
          success: true,
          txHash: mockTxHash,
        };
      }
    } catch (error: any) {
      pendingTx.revert?.();
      updatePendingTransaction(txId, {
        status: "reverted",
        error: error.message || "Transaction failed",
      });
      throw error;
    }
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

  // Auto-cleanup reverted transactions after a short window so UI can animate the revert
  const revertedCleanupRef = useRef(false);
  if (!revertedCleanupRef.current && pendingTransactions.some((tx) => tx.status === "reverted")) {
    revertedCleanupRef.current = true;
    setTimeout(() => {
      clearRevertedTransactions();
      revertedCleanupRef.current = false;
    }, OPTIMISTIC_CONFIRM_DAYS * 24 * 60 * 60 * 1000);
  }

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
        pendingTransactions,
        optimisticBalanceDelta,
        optimisticCampaigns,
        clearRevertedTransactions,
        createCampaignOnChain,
        logSaleOnChain,
        claimPayoutOnChain,
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

export function useWeb3(): WebContextType {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
