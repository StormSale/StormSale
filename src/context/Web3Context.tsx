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

const ROLE_STORAGE_KEY = "stellarsale.userRole";
const ADDRESS_STORAGE_KEY = "stellarsale.userAddress";

export interface Web3ContextType {
  userAddress: string | null;
  userRole: string | null;
  isConnected: boolean;
  /** True while the persisted/DB-backed role is being resolved for a connected wallet. */
  isLoadingRole: boolean;
  /** True once the role has been resolved (DB, cache, or default). */
  roleResolved: boolean;
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

function readCachedRole(): { address: string | null; role: string | null } {
  if (typeof window === "undefined") return { address: null, role: null };
  try {
    const address = window.localStorage.getItem(ADDRESS_STORAGE_KEY);
    const role = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return { address: address || null, role: role || null };
  } catch {
    return { address: null, role: null };
  }
}

function writeCachedRole(address: string | null, role: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (address) window.localStorage.setItem(ADDRESS_STORAGE_KEY, address);
    else window.localStorage.removeItem(ADDRESS_STORAGE_KEY);
    if (role) window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    else window.localStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {
    /* ignore storage failures */
  }
}

export function Web3Provider({ children }: { children: ReactNode }) {
  // Hydrate from cache synchronously so the first paint already has the role.
  const initialCache = readCachedRole();
  const [initialAddress] = useState(initialCache.address);
  const [initialRole] = useState(initialCache.role);

  const [userAddress, setUserAddress] = useState<string | null>(initialAddress);
  const [userRole, setUserRole] = useState<string | null>(initialRole);
  const [isConnected, setIsConnected] = useState<boolean>(Boolean(initialAddress));
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [tokenAllowance, setTokenAllowance] = useState<number>(0);
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Role resolution state: loading is true only when we have an address but no role yet.
  const [isLoadingRole, setIsLoadingRole] = useState<boolean>(Boolean(initialAddress && !initialRole));
  const [roleResolved, setRoleResolved] = useState<boolean>(Boolean(initialRole));

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXlmBalance(address);
      setXlmBalance(bal);
    } catch (err) {
      console.warn("Could not fetch balance:", error);
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

  // Sync with backend database & persistent role.
  // Returns the resolved role so callers can await completion and avoid flicker.
  const syncUserWithBackend = useCallback(async (address: string): Promise<string | null> => {
    try {
      const savedUser = await registerUser(address);
      if (savedUser && savedUser.role) {
        setUserRole(savedUser.role);
        writeCachedRole(address, savedUser.role);
        return savedUser.role;
      }
    } catch (err) {
      console.error("Error registering user with backend:", err);
    }
    return null;
  }, []);

  // On mount, if we hydrated an address from cache but no role, resolve it from the DB.
  // This is the core of the "0ms flicker" fix: the role is already present on hydration,
  // or we show a neutral shell until the DB responds -- never flashing the wrong route.
  useEffect(() => {
    if (!userAddress) return;
    if (userRole) {
      setIsLoadingRole(false);
      setRoleResolved(true);
      return;
    }
    let cancelled = false;
    setIsLoadingRole(true);
    setRoleResolved(false);
    (async () => {
      const role = await syncUserWithBackend(userAddress);
      if (cancelled) return;
      if (!role) {
        // DB did not return a role; fall back to cache if present.
        const cached = readCachedRole();
        if (cached.role && cached.address === userAddress) {
          setUserRole(cached.role);
        }
      }
      setIsLoadingRole(false);
      setRoleResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userAddress, userRole, syncUserWithBackend]);

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

      // Reset role state for the new address and mark loading until the DB resolves.
      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);
      setUserRole(null);
      setRoleResolved(false);
      setIsLoadingRole(true);
      writeCachedRole(address, null);

      if (type !== "mock") {
        await refreshBalance(address);
      }
      await refreshTokenAllowance();
      const role = await syncUserWithBackend(address);
      if (!role) {
        // DB returned no role; try cache for this address as a fallback.
        const cached = readCachedRole();
        if (cached.role && cached.address === address) {
          setUserRole(cached.role);
        }
      }
      setIsLoadingRole(false);
      setRoleResolved(true);
      setIsWalletModalOpen(false);
    } catch (error) {
      console.error("Wallet connection failed:", error);
      setIsLoadingRole(false);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setUserRole(null);
    setIsConnected(false);
    setConnectorType(null);
    setXlmBalance("0.00");
    setTokenAllowance(0);
    setIsLoadingRole(false);
    setRoleResolved(false);
    writeCachedRole(null, null);
    void purgeOnLogout();
  };

  const updateUserRole = async (role: string) => {
    if (!userAddress) return;
    try {
      const updated = await registerUser(userAddress, role);
      if (updated && updated.role) {
        setUserRole(updated.role);
        writeCachedRole(userAddress, updated.role);
        setRoleResolved(true);
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
      setTimeout(() => {
        refreshBalance(userAddress);
        refreshTokenAllowance();
      }, 1000);
      return res;
    } else {
      // Mock fallback for UI preview without extension
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      const newCampaignId = Math.floor(Math.random() * 9000) + 1000;
      setTokenAllowance((prev) => Math.max(0, prev - budgetXlm));
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(`mock_allowance_${userAddress}_${STELLAR_CONFIG.contractId}`);
        if (stored) {
          const updated = Math.max(0, parseFloat(stored) - budgetXlm);
          window.localStorage.setItem(`mock_allowance_${userAddress}_${STELLAR_CONFIG.contractId}`, updated.toString());
        }
      }
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
  const batchClaimPayoutsOnChain = async (campaigns: ClaimableCampaignItem[]) => {
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

  const getCampaignContract = (_address: string) => factoryContract;

  const switchToStellarNetwork = async () => true;

  const value:Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isLoadingRole,
    roleResolved,
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
    switchToStellarNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used within a Web3Provider");
  return ctx;
}