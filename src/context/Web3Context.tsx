import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import {
  connectFreeterWallet,
  connectAlbedoWallet,
  connectXBullWallet,
  checkFreeterInstalled,
  getCurrentNetwork,
  fetchXmlBalance,
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
import { pollSorobanTransaction } from "../lib/transactionPoller";
import type { PollResult } from "../lib/transactionPoller";

export interface TransactionPollState {
  id: string;
  txHash: string;
  status: "PENDING" | "SUCCESS" | "FAILED" | "TIMEOUT";
  attempts: number;
  elapsedMs: number;
  error?: string;
  canRetry: boolean;
  label?: string;
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

  // Adaptive Transaction Polling
  transactionPolls: TransactionPollState[];
  pollTransaction: (txHash: string, label?: string) => Promise<PollResult<any>>;
  retryTransactionPoll: (id: string) => Promise<PollResult<any>>;
  dismissTransactionPoll: (id: string) => void;

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
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [transactionPolls, setTransactionPolls] = useState<TransactionPollState[]>([]);
  const pollRegistry = useRef<Map<string, { txHash: string; label?: string }>>(new Map());

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXmlBalance(address);
      setXmlBalance(bal);
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

  // Multi-Wallet Stellar Connection: Freeter, Albedo, xBull, Ledger, Passkey, Mock
  const connectWallet = async (
    type: WalletType = "freeter",
    customAddress?: string,
    derivationPath?: string,
  ) => {
    try {
      let address = "";
      if (type === "freeter") {
        const isInstalled = await checkFreeterInstalled();
        if (!isInstalled) {
          throw new Error(
            "Freeter extension is not installed. If you are on a mobile device, please select Albedo (Web Wallet) or Demo Account.",
          );
        }
        address = await connectFreeterWallet();
        const currentNet = await getCurrentNetwork();
        setNetwork(currentNet);
      } else if (type === "albedo") {
        address = await connectAlbedoWallet();
        setNetwork(STELLAR_CONFIG.network);
      } else if (type === "xbull") {
        address = await connectXBullWallet();
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
        address = "GASTORMSALE7TESTNET7AAFFILIATE7MERCHANT7ESCROW7XLM77777";
        setNetwork("TESTNET");
        setXmlBalance("10000.00");
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

  // Adaptive Transaction Polling helpers
  const updatePollState = (
    id: string,
    patch: Partial<TransactionPollState>,
  ) => {
    setTransactionPolls((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const runPoll = useCallback(
    async (id: string, txHash: string, label?: string): Promise<PollResult<any>> => {
      const startedAt = Date.now();
      updatePollState(id, {
        status: "PENDING",
        attempts: 0,
        elapsedMs: 0,
        error: undefined,
        canRetry: false,
        label,
        txHash,
      });

      const result = await pollSorobanTransaction(txHash, {
        onAttempt: (attempts, delayMs) => {
          updatePollState(id, {
            attempts,
            elapsedMs: Date.now() - startedAt,
            error: `${attempts} attempt(s) — waiting ${Math.round(delayMs / 1000)}s`,
          });
        },
      });

      if (result.status === "SUCCESS") {
        updatePollState(id, {
          status: "SUCCESS",
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
          canRetry: false,
          error: undefined,
        });
        if (userAddress) setTimeout(() => refreshBalance(userAddress), 500);
      } else if (result.status === "FAILED") {
        updatePollState(id, {
          status: "FAILED",
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
          canRetry: true,
          error: result.lastError || "Transaction failed on-chain",
        });
      } else {
        updatePollState(id, {
          status: "TIMEOUT",
          attempts: result.attempts,
          elapsedMs: result.elapsedMs,
          canRetry: true,
          error: result.lastError || "Polling timed out",
        });
      }
      return result;
    },
    [userAddress, refreshBalance],
  );

  const pollTransaction = useCallback(
    async (txHash: string, label?: string): Promise<PollResult<any>> => {
      const id = `poll_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      pollRegistry.current.set(id, { txHash, label });
      setTransactionPolls((prev) => [
        ...prev,
        {
          id,
          txHash,
          status: "PENDING",
          attempts: 0,
          elapsedMs: 0,
          canRetry: false,
          label,
        },
      ]);
      return runPoll(id, txHash, label);
    },
    [runPoll],
  );

  const retryTransactionPoll = useCallback(
    async (id: string): Promise<PollResult<any>> => {
      const entry = pollRegistry.current.get(id);
      if (!entry) {
        throw new Error(`Unknown transaction poll id: ${id}`);
      }
      return runPoll(id, entry.txHash, entry.label);
    },
    [runPoll],
  );

  const dismissTransactionPoll = useCallback((id: string) => {
    pollRegistry.current.delete(id);
    setTransactionPolls((prev) => prev.filter((p) => p.id !== id));
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

    if (connectorType === "freeter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await createCampaignContractCall(
        userAddress,
        commissionRatePercent,
        clearingPeriodSecs,
        budgetXlm,
        connectorType,
      );
      if (res.txHash) {
        void pollTransaction(res.txHash, `Create campaign: ${name}`);
      }
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

  // Soroban: Log Sale
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freeter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await logSaleContractCall(
        userAddress,
        campaignId,
        affiliateAddress,
        amountXlm,
        connectorType,
      );
      if (res.txHash) {
        void pollTransaction(res.txHash, `Log sale #d{campaignId}`);
      }
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Claim Payout
  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freeter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await claimPayoutContractCall(userAddress, campaignId, connectorType);
      if (res.txHash) {
        void pollTransaction(res.txHash, `Claim payout #d{campaignId}`);
      }
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Refund Campaign Escrow
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freeter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await refundCampaignEscrowContractCall(
        userAddress,
        campaignId,
        connectorType,
      );
      if (res.txHash) {
        void pollTransaction(res.txHash, `Refund escrow #d{campaignId}`);
      }
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      return { success: true, txHash: mockTxHash };
    }
  };

  // Batch Claim Payouts
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const receipts: BatchClaimReceipt[] = [];
    for (const campaign of campaigns) {
      try {
        const res = await claimPayoutOnChain(campaign.campaignId);
        receipts.push({ campaignId: campaign.campaignId, success: res.success, txHash: res.txHash });
      } catch (err) {
        receipts.push({
          campaignId: campaign.campaignId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return receipts;
  };

  // Passkey account registration
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    const record = await registerPasskey(userName || "Affiliate User");
    setUserAddress(record.stellarAddress);
    setIsConnected(true);
    setConnectorType("passkey");
    return record;
  };

  // Compatibility helpers
  const factoryContract = null;
  const getCampaignContract = (_address: string) => null;
  const provider = null;
  const signer = null;
  const switchToStellarNetwork = async (): Promise<boolean> => {
    try {
      setNetwork(STELLAR_CONFIG.network);
      return true;
    } catch {
      return false;
    }
  };

  const isStellarNetwork = network.toUpperCase().includes("STELLAR") || network.toUpperCase().includes("TESTNET");

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork,
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
    transactionPolls,
    pollTransaction,
    retryTransactionPoll,
    dismissTransactionPoll,
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
  if (!ctx) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return ctx;
}
