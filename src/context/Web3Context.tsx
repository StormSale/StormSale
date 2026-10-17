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
  refundCampaignEscrowContractCall,
  fetchTransactionStatus,
} from "../lib/stellar";
import type { WalletType, TransactionStatusResult } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";

export interface TransactionPollingOptions {
  /** Initial delay before the first poll (ms). */
  initialDelayMs?: number;
  /** Maximum delay between polls (ms). */
  maxDelayMs?: number;
  /** Multiplier applied to the delay after each poll. */
  backoffFactor?: number;
  /** Maximum total time to poll before timing out (ms). */
  timeoutMs?: number;
  /** Optional hard cap on the number of poll attempts. */
  maxAttempts?: number;
}

export interface TransactionPollingResult {
  success: boolean;
  status: "SUCCESS" | "FAILED" | "TIMEOUT" | "PENDING" | "UNKNOWN";
  timedOut: boolean;
  attempts: number;
  elapsedMs: number;
  txHash?: string;
  lastResult?: TransactionStatusResult;
  error?: string;
  /** True when the caller should prompt the user to retry. */
  retrySuggested: boolean;
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

  // Adaptive Transaction Polling
  pollTransactionStatus: (
    txHash: string,
    options?: TransactionPollingOptions,
  ) => Promise<TransactionPollingResult>;
  waitForTransaction: (
    txHash: string,
    options?: TransactionPollingOptions,
  ) => Promise<TransactionPollingResult>;
  cancelTransactionPolling: (txHash?: string) => void;

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
  refundCampaignEscrow: (campaignId: number) => Promise<{ success: boolean; txHash?: string }>;

  batchClaimPayoutsOnChain: (campaigns: ClaimableCampaignItem[]) => Promise<BatchClaimReceipt>;

  registerPasskeyAccount: (userName?: string) => Promise<PasskeyCredentialRecord>;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export const DEFAULT_POLLING_OPTIONS: Required<TransactionPollingOptions> = {
  initialDelayMs: 1000,
  maxDelayMs: 15000,
  backoffFactor: 1.6,
  timeoutMs: 60000,
  maxAttempts: 12,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Track active polling operations so they can be cancelled on disconnect/unmount.
  const pollingControllers = useRef<Map<string, AbortController>>(new Map());

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

  // Adaptive polling with exponential backoff and timeout handling.
  const pollTransactionStatus = useCallback(
    async (
      txHash: string,
      options?: TransactionPollingOptions,
    ): Promise<TransactionPollingResult> => {
      const opts = { ...DEFAULT_POLLING_OPTIONS,...options };
      const startedAt = Date.now();
      let delay = Math.max(0, opts.initialDelayMs);
      let attempts = 0;
      let lastResult: TransactionStatusResult | undefined;

      const existing = pollingControllers.current.get(txHash);
      existing?.abort();
      const controller = new AbortController();
      pollingControllers.current.set(txHash, controller);

      const finish = (result: TransactionPollingResult): TransactionPollingResult => {
        pollingControllers.current.delete(txHash);
        return result;
      };

      try {
        while (true) {
          const elapsed = Date.now() - startedAt;
          if (elapsed >= opts.timeoutMs) {
            return finish({
              success: false,
              status: "TIMEOUT",
              timedOut: true,
              attempts,
              elapsedMs: elapsed,
              txHash,
              lastResult,
              retrySuggested: true,
              error: "Transaction confirmation timed out.",
            });
          }

          const remaining = opts.timeoutMs - elapsed;
          const waitMs = Math.min(delay, remaining);
          if (waitMs > 0) {
            await sleep(waitMx, controller.signal);
          }

          attempts += 1;
          try {
            lastResult = await fetchTransactionStatus(txHash);
          } catch (err) {
            // Transient network errors are tolerated and retried with backoff.
            console.warn(`[Polling] Transient error for ${txHash}:`, err);
            lastResult = undefined;
          }

          if (lastResult) {
            if (lastResult.status === "SUCCESS") {
              return finish({
                success: true,
                status: "SUCCESS",
                timedOut: false,
                attempts,
                elapsedMs: Date.now() - startedAt,
                txHash,
                lastResult,
                retrySuggested: false,
              });
            }
            if (lastResult.status === "FAILED") {
              return finish({
                success: false,
                status: "FAILED",
                timedOut: false,
                attempts,
                elapsedMs: Date.now() - startedAt,
                txHash,
                lastResult,
                retrySuggested: true,
                error: lastResult.error || "Transaction failed.",
              });
            }
          }

          if (opts.maxAttempts !== undefined && attempts >= opts.maxAttempts) {
            return finish({
              success: false,
              status: "TIMEOUT",
              timedOut: true,
              attempts,
              elapsedMs: Date.now() - startedAt,
              txHash,
              lastResult,
              retrySuggested: true,
              error: "Maximum polling attempts reached.",
            });
          }

          // Exponential backoff with cap.
          delay = Math.min(opts.maxDelayMs, Math.max(1, delay * opts.backoffFactor));
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          return finish({
            success: false,
            status: "PENDING",
            timedOut: false,
            attempts,
            elapsedMs: Date.now() - startedAt,
            txHash,
            lastResult,
            retrySuggested: true,
            error: "Polling cancelled.",
          });
        }
        return finish({
          success: false,
          status: "UNKNOWN",
          timedOut: false,
          attempts,
          elapsedMs: Date.now() - startedAt,
          txHash,
          lastResult,
          retrySuggested: true,
          error: (err as Error)?.message || "Unknown polling error.",
        });
      } finally {
        pollingControllers.current.delete(txHash);
      }
    },
    [],
  );

  // Alias for callers that want an explicit "wait" semantic.
  const waitForTransaction = pollTransactionStatus;

  const cancelTransactionPolling = useCallback((txHash?: string) => {
    if (txHash) {
      pollingControllers.current.get(txHash)?.abort();
      pollingControllers.current.delete(txHash);
      return;
    }
    pollingControllers.current.forEach((ctrl) => ctrl.abort());
    pollingControllers.current.clear();
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
      await syncUserWithBackend(address);
      setIsWalletModalOpen(false);
    } catch (error) {
      console.error("Wallet connection failed:", error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    // Cancel any in-flight transaction polling before clearing wallet state.
    pollingControllers.current.forEach((ctrl) => ctrl.abort());
    pollingControllers.current.clear();
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

  // Soroban: Refund Unused Campaign Escrow
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(`[Soroban] Refunding unused escrow for Campaign #${campaignId} by ${userAddress}`);

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await refundCampaignEscrowContractCall(userAddress, campaignId, connectorType);
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

  // Soroban: Automated Batch Commission Claim Dispatcher across Multiple Campaigns
  const batchClaimPayoutsOnChain = async (campaigms: ClaimableCampaignItem[]) => {
    if (!userAddress) throw new Error("Wallet not connected");
    const { executeBatchCommissionClaim } = await import("../lib/batchClaim");
    const res = await executeBatchCommissionClaim(
      userAddress,
      campaigns,
      connectorType || "freighter",
    );
    setTimeout(() => refreshBalance(userAddress), 1000);
    return res;
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
      console.log(`[Soroban] Join campaign ${campaignAddr}`);
      return { success: true };
    },
  };

  const getCampaignContract = (address: string) => ({
    address,
    logSale: async (affiliateAddress: string, amountXlm: number) =>
      logSaleOnChain(0, affiliateAddress, amountXlm),
    claimPayout: async () => claimPayoutOnChain(0),
  });

  const switchToStellarNetwork = async () => {
    try {
      const current = await getCurrentNetwork();
      setNetwork(current);
      return current === STELLAR_CONFIG.network;
    } catch {
      return false;
    }
  };

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: network === STELLAR_CONFIG.network,
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
    pollTransactionStatus,
    waitForTransaction,
    cancelTransactionPolling,
    createCampaignOnChain,
    logSaleOnChain,
    claimPayoutOnChain,
    refundCampaignEscrow,
    batchClaimPayoutsOnChain,
    registerPasskeyAccount,
    factoryContract,
    getCampaignContract,
    provider: null,
    signer: null,
    switchToStellarNetwork: switchToStellarNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return ctx;
}
