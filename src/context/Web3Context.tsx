import { createContext, useContext, useState, useCallback, useEffect } from "react";
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

export interface Web3ContextType {
  userAddress: string | null;
  userRole: string | null;
  // True once the role has been resolved from the backend (or the user
  // is disconnected). Used by the router to avoid role flicker on load.
  isRoleResolved: boolean;
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

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

const ROLE_STORAGE_KEY = "stellar:userRole";
const ADDRESS_STORAGE_KEY = "stellar:userAddress";

function readPersistedRole(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ROLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersistedRole(role: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (role) {
      window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    } else {
      window.localStorage.removeItem(ROLE_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function readPersistedAddress(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ADDRESS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writePersistedAddress(address: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (address) {
      window.localStorage.setItem(ADDRESS_STORAGE_KEY, address);
    } else {
      window.localStorage.removeItem(ADDRESS_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function Web3Provider({ children }: { children: ReactNode }) {
  // Hydrate from persisted state synchronously so the first render already
  // has the correct role -> zero flicker on load.
  const initialAddress = readPersistedAddress();
  const initialRole = readPersistedRole();
  const [initialState] = useState(() => ({
    address: initialAddress,
    role: initialRole,
    // Role is considered resolved immediately if we have a cached role,
    // otherwise we must wait for the backend sync to complete.
    roleResolved: !!initialAddress && !!initialRole,
  }));

  const [userAddress, setUserAddress] = useState<string | null>(initialState.address);
  const [userRole, setUserRoleState] = useState<string | null>(initialState.role);
  const [isRoleResolved, setIsRoleResolved] = useState<boolean>(initialState.roleResolved);
  const [isConnected, setIsConnected] = useState<boolean>(Boolean(initialState.address));
  const [network] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Single source of truth for setting the role: always persist to storage
  // so a reload can hydrate synchronously without a flicker.
  const applyRole = useCallback((role: string | null) => {
    setUserRoleState(role);
    writePersistedRole(role);
    setIsRoleResolved(true);
  }, []);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXlmBalance(address);
      setXlmBalance(bal);
    } catch (err) {
      console.warn("Could not fetch balance:", err);
    }
  }, []);

  // Sync with backend database & persistent role. The DB remains the
  // authoritative source; the cached value is only used to avoid flicker.
  const syncUserWithBackend = useCallback(
    async (address: string) => {
      try {
        const savedUser = await registerUser(address);
        if (savedUser && savedUser.role) {
          applyRole(savedUser.role);
        } else {
          // Backend responded with no role: clear any stale cache.
          applyRole(null);
        }
      } catch (err) {
        console.error("Error registering user with backend:", err);
        // On failure, fall back to the cached role if present, otherwise
        // mark as resolved with no role so the UI doesn't stay stuck loading.
        if (!readPersistedRole()) {
          setIsRoleResolved(true);
        }
      }
    },
    [applyRole],
  );

  // On mount, if we have a persisted address, re-sync the role from the
  // backend in the background. The cached role keeps the UI stable meanwhile.
  useEffect(() => {
    if (!initialState.address) return;
    void syncUserWithBackend(initialState.address);
    void refreshBalance(initialState.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // network is initialized from config; keep the detected value for logging
        console.info("Connected network:", currentNet);
      } else if (type === "albedo") {
        address = await connectAlbedoWallet();
      } else if (type === "xbull") {
        address = await connectXbullWallet();
      } else if (type === "ledger") {
        const { connectLedgerDevice, DEFAULT_STELLAR_BIP_PATH } =
          await import("../lib/ledgerBridge");
        const path = derivationPath || ledgerBipPath || DEFAULT_STELLAR_BIP_PATH;
        const info = await connectLedgerDevice(path);
        address = info.address;
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
      } else if (type === "readonly") {
        if (!customAddress) throw new Error("Please provide a valid Stellar address.");
        address = customAddress;
      } else {
        // Mock fallback demo account with 10,000 XLM
        address = "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777";
        setXlmBalance("10000.00");
      }

      // Mark role as unresolved for this new address until the backend
      // responds. If we have a cached role for the same address, keep it
      // to avoid a flicker.
      const cachedAddress = readPersistedAddress();
      const cachedRole = readPersistedRole();
      if (cachedAddress !== address || !cachedRole) {
        setIsRoleResolved(false);
        if (cachedAddress !== address) {
          setUserRoleState(null);
          writePersistedRole(null);
        }
      }

      setUserAddress(address);
      writePersistedAddress(address);
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
    setUserRoleState(null);
    writePersistedRole(null);
    writePersistedAddress(null);
    setIsRoleResolved(true);
    setIsConnected(false);
    setConnectorType(null);
    setXlmBalance("0.00");
  };

  const updateUserRole = async (role: string) => {
    if (!userAddress) return;
    try {
      const updated = await registerUser(userAddress, role);
      if (updated && updated.role) {
        applyRole(updated.role);
      } else {
        // Optimistic fallback: if the backend responded without a role,
        // still persist the requested role so the UI stays consistent.
        applyRole(role);
      }
    } catch (error) {
      console.error("Failed to update role:", error);
      throw error;
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
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      return { success: true, campaignId: Date.now() % 10000, txHash: mockTxHash };
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
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Claim Payout
  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await claimPayoutContractCall(userAddress, campaignId, connectorType);
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      return { success: true, txHash: mockTxHash };
    }
  };

  // Soroban: Refund Campaign Escrow
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await refundCampaignEscrowContractCall(userAddress, campaignId, connectorType);
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
      return { success: true, txHash: mockTxHash };
    }
  };

  // Batch Claim Payouts
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");

    const receipts: BatchClaimReceipt["receipts"] = [];
    for (const c of campaigns) {
      try {
        const res = await claimPayoutOnChain(c.campaignId);
        receipts.push({ campaignId: c.campaignId, success: res.success, txHash: res.txHash });
      } catch (err) {
        receipts.push({
          campaignId: c.campaignId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { receipts };
  };

  // Passkey account registration
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
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
    isRoleResolved,
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
