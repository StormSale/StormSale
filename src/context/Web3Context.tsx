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
  getTokenAllowanceQuery,
  approveTokenContractCall,
  refundCampaignEscrowContractCall,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
import { purgeOnLogout } from "../lib/storage";

// ---------------------------------------------------------------------------
// Optimistic UI & Revert Logic
// ---------------------------------------------------------------------------
//
// On-chain actions apply an instant (<SOMS) optimistic state update before
// the transaction is mined. If the transaction fails (rejected, reverted,
// or throws), the previous state snapshot is restored reliably.
//
// Architecture:
//   component -> context action -> applyOptimistic()
//                                   |
//                                   v (instant state snapshot + mutation)
//                              await contract call
//                                   |
//                       success ----------------------> commit (refresh balance)
//                       failure ----------------------> revert(snapshot)
// ---------------------------------------------------------------------------

export interface OptimisticCampaign {
  id: number;
  name: string;
  budgetXlm: number;
  commissionRatePercent: number;
  clearingPeriodSecs: number;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  optimistic?: boolean;
}

export interface OptimisticSale {
 id: string;
  campaignId: number;
  affiliateAddress: string;
  amountXlm: number;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  optimistic?: boolean;
}

export interface OptimisticPayout {
  campaignId: number;
  amountXlm: number;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  optimistic?: boolean;
}

export interface OptimisticRefund {
  campaignId: number;
  amountXlm: number;
  status: "pending" | "confirmed" | "failed";
  txHash?: string;
  optimistic?: boolean;
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
  ledgerBipPath: string;
  setLedgerBipPath: (path: string) => void;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWallet: (
    connectorType?: WalletType,
    customAddress?: string,
    derivationPath?: string,
  ) => Promise<void>;
  disconnectWallet: () => void;
  updateUserRole: (role: string) => Promise<void>;
  requestFriendbotFunding: () => Promise<boolean>;

  // Optimistic state exposed to UI for instant rendering
  optimisticCampaigns: OptimisticCampaign[];
  optimisticSales: OptimisticSale[];
  optimisticPayouts: OptimisticPayout[];
  optimisticRefunds: OptimisticRefund[];
  isTransactionPending: boolean;
  pendingTxCount: number;

  // Soroban Smart Contract Operations
  createCampaignOnChain: (
    name: string,
    budgetXlm: number,
    commissionRatePercent: number,
    clearingPeriodSecs : number,
  ) => Promise<{ success: boolean; campaignId: number; txHash?: string }>;

  logSaleOnChain: (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => Promise<{ success: boolean; txHash?: string }>;

  claimPayoutOnChain: (campaignId: number) => Promise<{ success: boolean; txHash?: string }>;
  refundCampaignEscrow: (campaignId: number) => Promise<{ success: boolean; txHash?: string }>;

  batchClaimPayoutsOnChain: (campaigns: ClaimableCampaignItem[]) => Promise<BatchClaimReceipt>;

  registerPasskeyAccount: (userName?: string) => Promise<PasskeyCredentialRecord>;

  // Token Allowance & Escrow Operations
  tokenAllowance: number;
  refreshTokenAllowance: (spender?: string) => Promise<number>;
  approveTokenAllowance: (
    amount: number,
    spender?: string,
  ) => Promise<{ success: boolean; txHash?: string }>;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

// Snapshot of all optimistic state slices for reliable revert.
interface OptimisticSnapshot {
  optimisticCampaigns: OptimisticCampaign[];
  optimisticSales: OptimisticSale[];
  optimisticPayouts: OptimisticPayout[];
  optimisticRefunds: OptimisticRefund[];
  xlmBalance: string;
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [tokenAllowance, setTokenAllowance] = useState<number>(0);
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Optimistic state slices
  const [optimisticCampaigns, setOptimisticCampaigns] = useState<OptimisticCampaign[]>([]);
  const [optimisticSales, setOptimisticSales] = useState<OptimisticSale[]>([]);
  const [optimisticPayouts, setOptimisticPayouts] = useState<OptimisticPayout[]>([]);
  const [optimisticRefunds, setOptimisticRefunds] = useState<OptimisticRefund[]>([]);
  const [pendingTxCount, setPendingTxCount] = useState(0);

  // Refs mirror the latest state so snapshots are always accurate even when
  // multiple optimistic operations are in flight concurrently.
  const campaignsRef = useRef<OptimisticCampaign[]>([]);
  const salesRef = useRef<OptimisticSale[]>([]);
  const payoutsRef = useRef<OptimisticPayout[]>([]);
  const refundsRef = useRef<OptimisticRefund[]>([]);
  const xlmBalanceRef = useRef<string>("0.00");

  const syncRefs = useCallback(() => {
    campaignsRef.current = optimisticCampaigns;
    salesRef.current = optimisticSales;
    payoutsRef.current = optimisticPayouts;
    refundsRef.current = optimisticRefunds;
    xlmBalanceRef.current = xlmBalance;
  }, [optimisticCampaigns, optimisticSales, optimisticPayouts, optimisticRefunds, xlmBalance]);

  // Apply an optimistic mutation and return a snapshot for revert.
  const applyOptimistic = useCallback(
    (mutate: (setters: {
      setCampaigns: React.Dispatch<React.SetStateAction<OptimisticCampaign[]>>;
      setSales: React.Dispatch<React.SetStateAction<OptimisticSale[]>>;
      setPayouts: React.Dispatch<React.SetStateAction<OptimisticPayout[]>>;
      setRefunds: React.Dispatch<React.SetStateAction<OptimisticRefund[]>>;
      setBalance: React.Dispatch<React.SetStateAction<string>>;
    }) => void) => {
      const snapshot: OptimisticSnapshot = {
        optimisticCampaigns: campaignsRef.current,
        optimisticSales: salesRef.current,
        optimisticPayouts: payoutsRef.current,
        optimisticRefunds: refundsRef.current,
        xlmBalance: xlmBalanceRef.current,
      };
      mutate({
        setCampaigns: setOptimisticCampaigns,
        setSales: setOptimisticSales,
        setPayouts: setOptimisticPayouts,
        setRefunds: setOptimisticRefunds,
        setBalance: setXlmBalance,
      });
      return snapshot;
    },
    [],
  );

  const revertOptimistic = useCallback((snapshot: OptimisticSnapshot) => {
    setOptimisticCampaigns(snapshot.optimisticCampaigns);
    setOptimisticSales(snapshot.optimisticSales);
    setOptimisticPayouts(snapshot.optimisticPayouts);
    setOptimisticRefunds(snapshot.optimisticRefunds);
    setXlmBalance(snapshot.xlmBalance);
  }, []);

  const markTransactionStarted = useCallback(() => setPendingTxCount((c) => c + 1), []);
  const markTransactionEnded = useCallback(() => setPendingTxCount((c) => Math.max(0, c - 1)), []);

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

  // Refresh token allowance on-chain
  const refreshTokenAllowance = useCallback(async (spender?: string) => {
    if (!userAddress) {
      setTokenAllowance(0);
      return 0;
    }
    try {
      const allowance = await getTokenAllowanceQuery(userAddress, spender);
      setTokenAllowance(allowance);
      return allowance;
    } catch (err) {
      console.warn("Could not fetch token allowance:", err);
      return 0;
    }
  }, [userAddress]);

  // Approve token allowance on-chain
  const approveTokenAllowance = useCallback(async (amount: number, spender?: string) => {
    if (!userAddress) throw new Error("Wallet not connected");
    const res = await approveTokenContractCall(
      userAddress,
      amount,
      spender,
      connectorType || "freighter",
    );
    setTokenAllowance(res.allowance);
    return res;
  }, [userAddress, connectorType]);

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

  // Multi-Wallet Stellar Connection: Freighter, Albedo, xBull, Ledger, Passkey, Mock
  const connectWallet = async (
    type: WalletType = "freighter",
    customAddress?: string,
    derivationPath?: string,
  ) => {
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
      } else if (type === "ledger") {
        const { connectLedgerDevice, DEFAULT_STELLAR_BIP_PATH } =
          await import("../lib/ledgerBridge");
        const path = derivationPath || ledgerBipPath || DEFAULT_STELLAR_BIP_PATH;
        const info = await connectLedgerDevice(path);
        address = info.address;
        setNetwork(STELLAR_CONFIG.network);
      } else if (type === "passkey") {
        const { authenticateWithPasskey, loadEncryptedPasskeyVault, registerPasskey } =
          await import("../lib/passkeySigner");
        const vault = await loadEncryptedPasskeyVault();
        if (vault.length === 0) {
          const newRecord = await registerPasskey(customAddress || "Affiliate User");
          address = newRecord.stellarAddress;
        } else {
          const authResult = await authenticateWithPasskey();
          address = authResult.record.stellarAddress;
        }
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
      await refreshTokenAllowance();
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
    setOptimisticCampaigns([]);
    setOptimisticSales([]);
    setOptimisticPayouts([]);
    setOptimisticRefunds([]);
    setTokenAllowance(0);
    void purgeOnLogout();
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

  // Soroban: Create Campaign Escrow (optimistic)
  const createCampaignOnChain = async (
    name: string,
    budgetXlm: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    const optimisticId = -Date.now(); // negative id = pending
    const optimisticCampaign: OptimisticCampaign = {
      id: optimisticId,
      name,
      budgetXlm,
      commissionRatePercent,
      clearingPeriodSecs,
      status: "pending",
      optimistic: true,
    };

    // <SOMS: instant optimistic update
    const snapshot = applyOptimistic((setters) => {
      setters.setCampaigns((prev) => [optimisticCampaign, ...prev]);
      // Deduct escrowed budget from displayed balance instantly.
      const current = parseFloat(xlmBalanceRef.current) || 0;
      setters.setBalance(Math.max(0, current - budgetXlm).toFixed(2));
    });
    markTransactionStarted();

    try {
      console.log(
        `[Soroban] Creating campaign "${name}": Budget=${budgetXlm} XLM, Rate=${commissionRatePercent}%, Clearing=${clearingPeriodSecs}s`,
      );

      let res: { success: boolean; campaignId: number; txHash?: string };
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        res = await createCampaignContractCall(
          userAddress,
          commissionRatePercent,
          clearingPeriodSecs,
          budgetXlm,
          connectorType,
        );
      } else {
        // Mock fallback for UI preview without extension
        const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
        const newCampaignId = Math.floor(Math.random() * 9000) + 1000;
        res = {
          success: true,
          campaignId: newCampaignId,
          txHash: mockTxHash,
        };
      }

      if (!res || res.success === false) {
        throw new Error("Campaign creation transaction failed");
      }

      // Commit: replace optimistic entry with confirmed real id
      setOptimisticCampaigns((prev) =>
        prev.map((c) =>
          c.id === optimisticId
            ? { ...c, id: res.campaignId, status: "confirmed", txHash: res.txHash, optimistic: false }
            : c,
        ),
      );
      setTimeout(() => {
        refreshBalance(userAddress);
        refreshTokenAllowance();
      }, 1000);
      return res;
    } catch (error) {
      // Reliable revert on failure
      revertOptimistic(snapshot);
      console.error("[Soroban] Create campaign failed, reverted optimistic state:", error);
      throw error;
    } finally {
      markTransactionEnded();
    }
  };

  // Soroban: Log Verified Sale (optimistic)
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    const optimisticSaleId = `sale_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const optimisticSale: OptimisticSale = {
      id: optimisticSaleId,
      campaignId,
      affiliateAddress,
      amountXlm,
      status: "pending",
      optimistic: true,
    };

    const snapshot = applyOptimistic((setters) => {
      setters.setSales((prev) => [optimisticSale, ...prev]);
    });
    markTransactionStarted();

    try {
      console.log(
        `[Soroban] Logging sale for Campaign #${campaignId}: Affiliate=${affiliateAddress}, Amount=${amountXlm} XLM`,
      );

      let res: { success: boolean; txHash?: string };
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        res = await logSaleContractCall(
          userAddress,
          campaignId,
          affiliateAddress,
          amountXlm,
          connectorType,
        );
      } else {
        const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
        res = {
          success: true,
          txHash: mockTxHash,
        };
      }

      if (!res || res.success === false) {
        throw new Error("Log sale transaction failed");
      }

      setOptimisticSales((prev) =>
        prev.map((s) =>
          s.id === optimisticSaleId
            ? { ...s, status: "confirmed", txHash: res.txHash, optimistic: false }
            : s,
        ),
      );
      return res;
    } catch (error) {
      revertOptimistic(snapshot);
      console.error("[Soroban] Log sale failed, reverted optimistic state:", error);
      throw error;
    } finally {
      markTransactionEnded();
    }
  };

  // Soroban: Claim Affiliate Commission (optimistic)
  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    const optimisticPayout: OptimisticPayout = {
      campaignId,
      amountXlm: 0,
      status: "pending",
      optimistic: true,
    };

    const snapshot = applyOptimistic((setters) => {
      setters.setPayouts((prev) => [optimisticPayout, ...prev]);
    });
    markTransactionStarted();

    try {
      console.log(`[Soroban] Claiming payout for Campaign #${campaignId} by ${userAddress}`);

      let res: { success: boolean; txHash?: string };
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        res = await claimPayoutContractCall(userAddress, campaignId, connectorType);
      } else {
        const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
        res = {
          success: true,
          txHash: mockTxHash,
        };
      }

      if (!res || res.success === false) {
        throw new Error("Claim payout transaction failed");
      }

      setOptimisticPayouts((prev) =>
        prev.map((p) =>
          p.campaignId === campaignId && p.status === "pending"
            ? { ...p, status: "confirmed", txHash: res.txHash, optimistic: false }
            : p,
        ),
      );
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } catch (error) {
      revertOptimistic(snapshot);
      console.error("[Soroban] Claim payout failed, reverted optimistic state:", error);
      throw error;
    } finally {
      markTransactionEnded();
    }
  };

  // Soroban: Refund Unused Campaign Escrow (optimistic)
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    const optimisticRefund: OptimisticRefund = {
      campaignId,
      amountXlm: 0,
      status: "pending",
      optimistic: true,
    };

    const snapshot = applyOptimistic((setters) => {
      setters.setRefunds((prev) => [optimisticRefund, ...prev]);
    });
    markTransactionStarted();

    try {
      console.log(`[Soroban] Refunding unused escrow for Campaign #${campaignId} by ${userAddress}`);

      let res: { success: boolean; txHash?: string };
      if (
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull"
      ) {
        res = await refundCampaignEscrowContractCall(userAddress, campaignId, connectorType);
      } else {
        const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
        res = {
          success: true,
          txHash: mockTxHash,
        };
      }

      if (!res || res.success === false) {
        throw new Error("Refund transaction failed");
      }

      setOptimisticRefunds((prev) =>
        prev.map((r) =>
          r.campaignId === campaignId && r.status === "pending"
            ? { ...r, status: "confirmed", txHash: res.txHash, optimistic: false }
            : r,
        ),
      );
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } catch (error) {
      revertOptimistic(snapshot);
      console.error("[Soroban] Refund failed, reverted optimistic state:", error);
      throw error;
    } finally {
      markTransactionEnded();
    }
  };

  // Soroban: Automated Batch Commission Claim Dispatcher across Multiple Campaigns
  const batchClaimPayoutsOnChain = async (campaigns: ClaimableCampaignItem[]) => {
    if (!userAddress) throw new Error("Wallet not connected");

    const optimisticPayouts: OptimisticPayout[] = campaigns.map((c) => ({
      campaignId: c.campaignId,
      amountXlm: c.amountXlm ?? 0,
      status: "pending",
      optimistic: true,
    }));

    const snapshot = applyOptimistic((setters) => {
      setters.setPayouts((prev) => [...optimisticPayouts, ...prev]);
    });
    markTransactionStarted();

    try {
      const { executeBatchCommissionClaim } = await import("../lib/batchClaim");
      const res = await executeBatchCommissionClaim(
        userAddress,
        campaigns,
        connectorType || "freighter",
      );

      if (!res || res.success === false) {
        throw new Error("Batch claim transaction failed");
      }

      setOptimisticPayouts((prev) =>
        prev.map((p) =>
          optimisticPayouts.some((o) => o.campaignId === p.campaignId && p.status === "pending")
            ? { ...p, status: "confirmed", optimistic: false }
            : p,
        ),
      );
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } catch (error) {
      revertOptimistic(snapshot);
      console.error("[Soroban] Batch claim failed, reverted optimistic state:", error);
      throw error;
    } finally {
      markTransactionEnded();
    }
  };

  // Passkey Smart Account Registration
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    const record = await registerPasskey(userName || "Affiliate User");
    await connectWallet("passkey");
    return record;
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
      console.log(`[Soroban] Joining campaign ${campaignAddr}`);
      // Optimistically register the join in the campaign list before confirmation.
      const optimisticId = -Date.now();
      const snapshot = applyOptimistic((setters) => {
        setters.setCampaigns((prev) => [
          {
            id: optimisticId,
            name: `Joined: ${campaignAddr}`,
            budgetXlm: 0,
            commissionRatePercent: 0,
            clearingPeriodSecs: 0,
            status: "pending",
            optimistic: true,
          },
          ...prev,
        ]);
      });
      markTransactionStarted();
      try {
        // Placeholder for the real contract call when join is wired through
        // the Soroban client. The optimistic state is committed only after the
        // transaction resolves successfully.
        await Promise.resolve(undefined);
        setOptimisticCampaigns((prev) =>
          prev.map((c) =>
            c.id === optimisticId
              ? { ...c, status: "confirmed", optimistic: false }
              : c,
          ),
        );
        return {
          wait: async () => ({ success: true }),
        };
      } catch (error) {
        revertOptimistic(snapshot);
        throw error;
      } finally {
        markTransactionEnded();
      }
    },
  };

  const getCampaignContract = (address: string) => {
    console.log(`[Soroban] Resolving campaign contract at ${address}`);
    return factoryContract;
  };

  const switchToStellarNetwork = async () => {
    setNetwork(STELLAR_CONFIG.network);
    return true;
  };

  // Keep refs in sync with state for reliable snapshots.
  syncRefs();

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: network === "TESTNET" || network === "PUBLIC",
    network,
    xlmBalance,
    connectorType,
    isWalletModalOpen,
    ledgerBipPath,
    setLedgerBipPath,
    openWalletModal,
    closeWalletModal,
    connectWallet,
    disconnectWallet,
    updateUserRole,
    requestFriendbotFunding,

    optimisticCampaigns,
    optimisticSales,
    optimisticPayouts,
    optimisticRefunds,
    isTransactionPending: pendingTxCount > 0,
    pendingTxCount,

    createCampaignOnChain,
    logSaleOnChain,
    claimPayoutOnChain,
    refundCampaignEscrow,
    batchClaimPayoutsOnChain,
    registerPasskeyAccount,

    tokenAllowance,
    refreshTokenAllowance,
    approveTokenAllowance,

    factoryContract,
    getCampaignContract,
    provider: null,
    signer: null,
    switchToStellarNetwork: switchToStellarNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used within a Web3Provider");
  return ctx;
}