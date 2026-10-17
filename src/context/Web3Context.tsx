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
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
import {
  pollTransactionConfirmation,
  type PollingResult,
} from "../lib/txPolling";

export interface TransactionPollingState {
  txHash: string;
  status: "polling" | "confirmed" | "failed" | "timeout";
  attempts: number;
  elapsedMs: number;
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

  // Adaptive transaction polling
  transactionPollingState: TransactionPollingState | null;
  waitForTransactionConfirmation: (
    txHash: string,
    options?: { timeoutMs?: number; initialDelayMs?: number; maxDelayMs?: number },
  ) => Promise<PollingResult>;
  retryTransactionPolling: () => Promise<PollingResult | null>;
  cancelTransactionPolling: () => void;
  dismissTransactionPollingState: () => void;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("\"44'/148'/0'\"");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Adaptive transaction polling state
  const [transactionPollingState, setTransactionPollingState] =
    useState<TransactionPollingState | null>(null);
  const pollingAbortRef = useRef<AbortController | null>(null);
  const lastPollingRequestRef = useRef<{
    txHash: string;
    options?: { timeoutMs?: number; initialDelayMs?: number; maxDelayMs?: number };
  } | null>(null);

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

  // Adaptive transaction polling with exponential backoff + timeout handling
  const waitForTransactionConfirmation = useCallback(
    async (
      txHash: string,
      options?: { timeoutMs?: number; initialDelayMs?: number; maxDelayMs?: number },
    ): Promise<PollingResult> => {
      // Abort any previous in-flight polling session.
      pollingAbortRef.current?.abort();
      const controller = new AbortController();
      pollingAbortRef.current = controller;
      lastPollingRequestRef.current = { txHash, options };

      setTransactionPollingState({
        txHash,
        status: "polling",
        attempts: 0,
        elapsedMs: 0,
      });

      const result = await pollTransactionConfirmation(txHash, {
        timeoutMs: options?.timeoutMs,
        initialDelayMs: options?.initialDelayMs,
        maxDelayMs: options?.maxDelayMs,
        signal: controller.signal,
        onPoll: (attempts, elapsedMs) => {
          setTransactionPollingState({
            txHash,
            status: "polling",
            attempts,
            elapsedMs,
          });
        },
      });

      if (result.status === "SUCCESS") {
        setTransactionPollingState({
          txHash,
          status: "confirmed",
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
        });
        if (userAddress) {
          refreshBalance(userAddress);
        }
      } else if (result.status === "FAILED") {
        setTransactionPollingState({
          txHash,
          status: "failed",
          attempts: result.attempts,
          elapsedMs: 0,
          error: result.error,
        });
      } else if (result.status === "TIMEOUT") {
        setTransactionPollingState({
          txHash,
          status: "timeout",
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
        });
      }

      return result;
    },
    [userAddress, refreshBalance],
  );

  // Retry the last timed-out polling request (used by timeout retry prompts).
  const retryTransactionPolling = useCallback(async (): Promise<PollingResult | null> => {
    const last = lastPollingRequestRef.current;
    if (!last) return null;
    return waitForTransactionConfirmation(last.txHash, last.options);
  }, [waitForTransactionConfirmation]);

  const cancelTransactionPolling = useCallback(() => {
    pollingAbortRef.current?.abort();
    pollingAbortRef.current = null;
  }, []);

  const dismissTransactionPollingState = useCallback(() => {
    setTransactionPollingState(null);
  }, []);

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
      if (res.txHash) {
        // Follow the submitted transaction until confirmation with adaptive polling.
        void waitForTransactionConfirmation(res.txHash);
      } else {
        setTimeout(() => refreshBalance(userAddress), 1000);
      }
      return res;
    } else {
      // Mock fallback for UI preview without extension
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      void waitForTransactionConfirmation(mockTxHash);
      return { success: true, campaignId: Math.floor(Math.random() * 1000), txHash: mockTxHash };
    }
  };

  // Soroban: Log Sale
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await logSaleContractCall(
        userAddress,
        campaignId,
        affiliateAddress,
        amountXlm,
        connectorType,
      );
      if (res.txHash) {
        void waitForTransactionConfirmation(res.txHash);
      }
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      void waitForTransactionConfirmation(mockTxHash);
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Claim Payout
  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await claimPayoutContractCall(userAddress, campaignId, connectorType);
      if (res.txHash) {
        void waitForTransactionConfirmation(res.txHash);
      }
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      void waitForTransactionConfirmation(mockTxHash);
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Refund Campaign Escrow
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await refundCampaignEscrowContractCall(
        userAddress,
        campaignId,
        connectorType,
      );
      if (res.txHash) {
        void waitForTransactionConfirmation(res.txHash);
      }
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      void waitForTransactionConfirmation(mockTxHash);
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Batch Claim Payouts
  const batchClaimPayoutsOnChain = async (campaigns: ClaimableCampaignItem[]) => {
    if (!userAddress) throw new Error("Wallet not connected");
    const receipts: BatchClaimReceipt = {
      successCount: 0,
      failureCount: 0,
      results: [],
    };
    for (const campaign of campaigns) {
      try {
        const res = await claimPayoutOnChain(campaign.campaignId);
        receipts.successCount += 1;
        receipts.results.push({ campaignId: campaign.campaignId, success: true, txHash: res.txHash });
      } catch (err) {
        receipts.failureCount += 1;
        receipts.results.push({
          campaignId: campaign.campaignId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return receipts;
  };

  // Passkey: Register Account
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Passkey User");
  };

  // Compatibility helpers
  const factoryContract = null;
  const getCampaignContract = (_address: string) => null;
  const provider = null;
  const signer = null;
  const switchToStellarNetwork = async (): Promise<boolean> => {
    try {
      const currentNet = await getCurrentNetwork();
      setNetwork(currentNet);
      return true;
    } catch {
      return false;
    }
  };

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: true,
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
    createCampaignOnChain,
    logSaleOnChain,
    claimPayoutOnChain,
    refundCampaignEscrow,
    batchClaimPayoutsOnChain,
    registerPasskeyAccount,
    transactionPollingState,
    waitForTransactionConfirmation,
    retryTransactionPolling,
    cancelTransactionPolling,
    dismissTransactionPollingState,
    factoryContract,
    getCampaignContract,
    provider,
    signer,
    switchToStellarNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used within a Web3Provider");
  return ctx;
}
