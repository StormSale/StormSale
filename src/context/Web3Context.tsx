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
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser, getCachedRole, setCachedRole } from "../utils/api";

// Persisted wallet session keys. We store the address + connector so the UI
// can hydrate the connected state synchronously on mount and avoid any flicker.
const SESSION_ADDRESS_KEY = "stellar.session.address";
const SESSION_CONNECTOR_KEY = "stellar.session.connector";
const SESSION_ROLE_KEY = "stellar.session.role";

function readStoredSession() {
  if (typeof window === "undefined") {
    return { address: null, connector: null, role: null } as {
      address: string | null;
      connector: WalletType | null;
      role: string | null;
    };
  }
  try {
    const address = window.localStorage.getItem(SESSION_ADDRESS_KEY);
    const connector = window.localStorage.getItem(SESSION_CONNECTOR_KEY) as WalletType | null;
    const role = window.localStorage.getItem(SESSION_ROLE_KEY);
    return { address, connector, role };
  } catch {
    return { address: null, connector: null, role: null };
  }
}

function writeStoredSession(address: string | null, connector: WalletType | null, role: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (address) window.localStorage.setItem(SESSION_ADDRESS_KEY, address);
    else window.localStorage.removeItem(SESSION_ADDRESS_KEY);

    if (connector) window.localStorage.setItem(SESSION_CONNECTOR_KEY, connector);
    else window.localStorage.removeItem(SESSION_CONNECTOR_KEY);

    if (role) window.localStorage.setItem(SESSION_ROLE_KEY, role);
    else window.localStorage.removeItem(SESSION_ROLE_KEY);
  } catch {
    // localStorage may be unavailable (private mode, etc.) — fail silently.
  }
}

export interface Web3ContextType {
  userAddress: string | null;
  userRole: string | null;
  isConnected: boolean;
  isRoleLoading: boolean;
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

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  // Hydrate from localStorage synchronously during the first render so the
  // connected state and cached role are available without a flicker.
  const initialSession = useRef(readStoredSession()).current;
  // Fall back to the role cache managed by the API utils if the session key
  // wasn't written yet (e.g. after a version migration).
  const initialRole = initialSession.role ?? getCachedRole();

  const [userAddress, setUserAddress] = useState<string | null>(initialSession.address);
  const [userRole, setUserRole] = useState<string | null>(initialRole);
  const [isConnected, setIsConnected] = useState<boolean>(Boolean(initialSession.address));
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(initialSession.connector);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  // Role is only "loading" when we're connected but have no cached role yet.
  const [isRoleLoading, setIsRoleLoading] = useState<boolean>(
    Boolean(initialSession.address) && !initialRole,
  );

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
        setCachedRole(savedUser.role as any);
        writeStoredSession(address, null, savedUser.role);
      }
    } catch (err) {
      console.error("Error registering user with backend:", err);
    } finally {
      setIsRoleLoading(false);
    }
  }, []);

  // On mount, if we hydrated a cached session, refresh balance and re-sync the
  // role from the backend in the background. The UI already renders with the
  // cached role, so this is a silent refresh (no flicker).
  useEffect(() => {
    if (initialSession.address) {
      void refreshBalance(initialSession.address);
      void syncUserWithBackend(initialSession.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-depends
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

      // Mark role as loading before we hit the backend so the Router can
      // render a stable shell instead of flashing a wrong route.
      setIsRoleLoading(true);
      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);
      // Persist the session immediately so a reload hydrates with the same state.
      writeStoredSession(address, type, userRole);

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
    setIsRoleLoading(false);
    setCachedRole(null);
    writeStoredSession(null, null, null);
  };

  const updateUserRole = async (role: string) => {
    if (!userAddress) return;
    try {
      const updated = await registerUser(userAddress, role as any);
      if (updated && updated.role) {
        setUserRole(updated.role);
        setCachedRole(updated.role as any);
        writeStoredSession(userAddress, connectorType, updated.role);
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

  // Compatibility facade for existing form components
  const factoryContract = {
    createCampaign: async (rate: string, period: string) => {
      const res = await createCampaignOnChain(
        "New Campaign",
        0,
        Number(rate),
        Number(period),
      );
      return res;
    },
  };

  const getCampaignContract = (_address: string) => ({
    logSale: async (campaignId: number, affiliate: string, amount: number) =>
      logSaleOnChain(campaignId, affiliate, amount),
    claimPayout: async (campaignId: number) => claimPaayoutOnChain(campaignId),
  });

  const switchToStellarNetwork = async () => true;

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isRoleLoading,
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
    factoryContract,
    getCampaignContract,
    provider: null,
    signer: null,
    switchToStellarNetwork,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
