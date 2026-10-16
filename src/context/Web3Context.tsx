import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
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
  fetchAccountSequence,
  isSequenceError,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";

export type QueueStatus = "idle" | "queued" | "submitting" | "retrying" | "resyncing" | "error";

export interface QueueItem {
  id: string;
  label: string;
  status: QueueStatus;
  attempts: number;
  error?: string;
}

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

  // Sequence queue monitoring
  queueStatus: QueueStatus;
  queueLength: number;
  queueItems: QueueItem[];
  localSequence: string | null;
  resyncSequence: () => Promise<void>;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const WebContext = createContext<Web3ContextType | undefined>(undefined);

interface QueueTask<T> {
  id: string;
  label: string;
  run: (sequence: string | undefined) => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Sequence queue state
  const [localSequence, setLocalSequence] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("idle");

  const queueRef = useRef<QueueTask<any>[]>([]);
  const processingRef = useRef(false);
  const sequenceRef = useRef<string | null>(null);
  const addressRef = useRef<string | null>(null);

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

  // -----------------------------------------------------------------------------------
  // Sequence queue implementation
  // -----------------------------------------------------------------------------------

  const updateQueueItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueueItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const removeQueueItem = useCallback((id: string) => {
    setQueueItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const resyncSequence = useCallback(async (): Promise<void> => {
    const address = addressRef.current;
    if (!address) {
      sequenceRef.current = null;
      setLocalSequence(null);
      return;
    }
    setQueueStatus("resyncing");
    try {
      const next = await fetchAccountSequence(address);
      sequenceRef.current = next;
      setLocalSequence(next);
    } finally {
      setQueueStatus(queueRef.current.length > 0 ? "queued" : "idle");
    }
  }, []);

  const ensureSequence = useCallback(async (): Promise<string | undefined> => {
    const address = addressRef.current;
    if (!address) return undefined;
    if (!sequenceRef.current) {
      const next = await fetchAccountSequence(address);
      sequenceRef.current = next;
      setLocalSequence(next);
    }
    return sequenceRef.current ?? undefined;
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const task = queueRef.current[0];
        updateQueueItem(task.id, { status: "submitting" });
        setQueueStatus("submitting");

        try {
          const seq = await ensureSequence();
          const result = await task.run(seq);
          // On success, advance local optimistic sequence by one.
          if (sequenceRef.current) {
            const next = (BigInt(sequenceRef.current) + 1n).toString();
            sequenceRef.current = next;
            setLocalSequence(next);
          }
          updateQueueItem(task.id, { status: "idle" });
          task.resolve(result);
        } catch (error: any) {
          const message = typeof error === "string" ? error : error?.message || "Unknown error";
          if (isSequenceError(message) && (task as any).attempts === 0) {
            // Automatic resync from Horizon + single retry
            updateQueueItem(task.id, { status: "resyncing", attempts: 1 });
            setQueueStatus("resyncing");
            try {
              const fresh = addressRef.current
                ? await fetchAccountSequence(addressRef.current)
                : undefined;
              sequenceRef.current = fresh ?? null;
              setLocalSequence(fresh ?? null);
              updateQueueItem(task.id, { status: "retrying" });
              setQueueStatus("retrying");
              const result = await task.run(fresh);
              if (sequenceRef.current) {
                const next = (BigInt(sequenceRef.current) + 1).toString();
                sequenceRef.current = next;
                setLocalSequence(next);
              }
              updateQueueItem(task.id, { status: "idle" });
              task.resolve(result);
            } catch (retryError: any) {
              const retryMessage =
                typeof retryError === "string"
                  ? retryError
                  : retryError?.message || "Retry failed";
              updateQueueItem(task.id, { status: "error", error: retryMessage });
              task.reject(retryError);
            }
          } else {
            updateQueueItem(task.id, { status: "error", error: message });
            task.reject(error);
          }
        } finally {
          // Remove the completed task from the head of the queue.
          queueRef.current.shift();
          removeQueueItem(task.id);
        }
      }
    } finally {
      processingRef.current = false;
      setQueueStatus(queueRef.current.length > 0 ? "queued" : "idle");
    }
  }, [ensureSequence, removeQueueItem, updateQueueItem]);

  const enqueue = useCallback(
    <T>(label: string, run: (sequence: string | undefined) => Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const task: QueueTask<T> = { id, label, run, resolve, reject } as any;
        queueRef.current.push(task as QueueTask<any>);
        setQueueItems((prev) => [
          ...prev,
          { id: task.id, label, status: "queued", attempts: 0 },
        ]);
        setQueueStatus("queued");
        void processQueue();
      }),
    [processQueue],
  );

  // Reset queue when wallet disconnects or address changes
  useEffect(() => {
    addressRef.current = userAddress;
    sequenceRef.current = null;
    setLocalSequence(null);
    if (!userAddress) {
      queueRef.current = [];
      setQueueItems([]);
      setQueueStatus("idle");
    }
  }, [userAddress]);

  // -----------------------------------------------------------------------------------
  // Multi-Wallet Stellar Connection: Freighter, Albedo, xBull, Mock
  // -----------------------------------------------------------------------------------
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
    return enqueue("Create Campaign", async (sequence) => {
      const result = await createCampaignContractCall(
        name,
        budgetXlm,
        commissionRatePercent,
        clearingPeriodSecs,
        sequence,
      );
      return result;
    });
  };

  // Soroban: Log Sale
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    return enqueue("Log Sale", async (sequence) => {
      const result = await logSaleContractCall(
        campaignId,
        affiliateAddress,
        amountXlm,
        sequence,
      );
      return result;
    });
  };

  // Soroban: Claim Payout
  const claimPayoutOnChain = async (campaignId: number) => {
    return enqueue("Claim Payout", async (sequence) => {
      const result = await claimPayoutContractCall(campaignId, sequence);
      return result;
    });
  };

  // Compatibility helpers for legacy form callers
  const factoryContract = null;
  const getCampaignContract = (_address: string) => null;
  const provider = null;
  const signer = null;
  const switchToStellarNetwork = async () => true;

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: network === "TESTNET" || network === "PUBLIC",
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
    queueStatus,
    queueLength: queueItems.length,
    queueItems,
    localSequence,
    resyncSequence,
    factoryContract,
    getCampaignContract,
    provider,
    signer,
    switchToStellarNetwork,
  };

  return <WebContext.Provider value={value}>{children}</WebContext.Provider>;
}

export function useWeb3() {
  const context = useContext(WebContext);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
