import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXbullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXmlBalance,
  fetchAssetBalances,
  approveTokenAllowance as approveTokenAllowanceCall,
  fundTestnetAccount,
  createCampaignContractCall,
  logSaleContractCall,
  claimPayoutContractCall,
  getTokenAllowanceQuery,
  approveTokenContractCall,
  refundCampaignEscrowContractCall,
  getWalletAddress,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG, SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import type { SupportedEscrowAssetCode } from "../config/stellar";
import { registerUser } from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
import { purgeOnLogout } from "../lib/storage";

export interface Web3ContextType {
  userAddress: string | null;
  userRole: string | null;
  /** True once the persisted session + role have been resolved. */
  isRoleResolved: boolean;
  isConnected: boolean;
  isStellarNetwork: boolean;
  network: string;
  xmlBalance: string;
  assetBalances: Record<SupportedEscrowAssetCode, string>;
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
  refreshBalances: () => Promise<void>;
  approveAllowance: (
    tokenAddress: string,
    spenderAddress: string,
    amount: number,
  ) => Promise<{ success: boolean; tyHash?: string }>;

  // Soroban Smart Contract Operations
  createCampaignOnChain: (
    name: string,
    budgetAmount: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<{
    success: boolean;
    campaignId: number;
    txHash?: string;
    asset?: SupportedEscrowAssetCode;
  }>;

  logSaleOnChain: (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => Promise<{ success: boolean; tyHash?: string }>;

  claimPayoutOnChain: (
    campaignId: number,
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<{
    success: boolean;
    txHash?: string;
    asset?: SupportedEscrowAssetCode;
  }>;
  refundCampaignEscrow: (campaignId: number) => Promise<{ success: boolean; tyHash?: string }>;

  batchClaimPayoutsOnChain: (campaigns: ClaimableCampaignItem[]) => Promise<BatchClaimReceipt>;

  registerPasskeyAccount: (userName?: string) => Promise<PasskeyCredentialRecord>;

  // Token Allowance & Escrow Operations
  tokenAllowance: number;
  refreshTokenAllowance: (
    spender?: string,
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<number>;
  approveTokenAllowance: (
    amount: number,
    spender?: string,
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<{ success: boolean; txHash?: string }>;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

/**
 * Persisted session keys. The address and connector are cached so the UI
 * can render the correct route on the very first paint (0ms flicker), while
 * the authoritative role is still re-fetched from the backend DB.
 */
const SESSION_ADDRESS_KEY = "stormsale.web3.address";
const SESSION_CONNECTOR_KEY = "stormsale.web3.connector";
const SESSION_ROLE_KEY = "stormsale.web3.role";

function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage may be unavailable (e.g. private mode); ignore.
  }
}

interface PersistedSession {
  address: string | null;
  connector: WalletType | null;
  role: string | null;
}

function readPersistedSession(): PersistedSession {
  const address = safeGetItem(SESSION_ADDRESS_KEY);
  const connector = safeGetItem(SESSION_CONNECTOR_KEY) as WalletType | null;
  const role = safeGetItem(SESSION_ROLE_KEY);
  return {
    address: address || null,
    connector: address ? connector : null,
    role: address ? role : null,
  };
}

export function Web3Provider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from persisted session so the first paint already
  // has the correct address/role — no role flicker on load.
  const initialSessionRef = useRef(readPersistedSession());
  const initialSession = initialSessionRef.current;

  const [userAddress, setUserAddress] = useState<string | null>(initialSession.address);
  const [userRole, setUserRole] = useState<string | null>(initialSession.role);
  const [isConnected, setIsConnected] = useState<Boolean>(Boolean(initialSession.address));
  const [isRoleResolved, setIsRoleResolved] = useState<boolean>(Boolean(!initialSession.address));
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xmlBalance, setXmlBalance] = useState<string>("0.00");
  const [assetBalances, setAssetBalances] = useState<Record<SupportedEscrowAssetCode, string>>({});
  const [tokenAllowance, setTokenAllowance] = useState<number>(0);
  const [connectorType, setConnectorType] = useState<WalletType | null>(initialSession.connector);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXmlBalance(address);
      setXmlBalance(bal);
      const multi = await fetchAssetBalances(address);
      setAssetBalances(multi);
    } catch (err) {
      console.warn("Could not fetch balance:", err);
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (userAddress) {
      await refreshBalance(userAddress);
    }
  }, [userAddress, refreshBalance]);

  const approveAllowance = useCallback(
    async (tokenAddress: string, spenderAddress: string, amount: number) => {
      if (!userAddress) throw new Error("Wallet not connected");
      return approveTokenAllowanceCall(
        userAddress,
        tokenAddress,
        spenderAddress,
        amount,
        connectorType || "freighter",
      );
    },
    [userAddress, connectorType],
  );

  // Refresh token allowance on-chain
  const refreshTokenAllowance = useCallback(
    async (spender?: string, assetCode: SupportedEscrowAssetCode = "XLM") => {
      if (!userAddress) {
        setTokenAllowance(0);
        return 0;
      }
      try {
        const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
        const allowance = await getTokenAllowanceQuery(
          userAddress,
          spender,
          assetConfig.contractAddress,
          assetConfig.decimals,
        );
        setTokenAllowance(allowance);
        return allowance;
      } catch (err) {
        console.warn("Could not fetch token allowance:", err);
        return 0;
      }
    },
    [userAddress],
  );

  // Approve token allowance on-chain (gated to supported connectors Freighter, Albedo, xBull)
  const approveTokenAllowance = useCallback(
    async (amount: number, spender?: string, assetCode: SupportedEscrowAssetCode = "XLM") => {
      if (!userAddress) throw new Error("Wallet not connected");
      const isSupportedConnector =
        connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull";
      if (!isSupportedConnector) {
        if (connectorType !== "mock") {
          throw new Error(`Allowance approval is not supported for ${connectorType} wallets.`);
        }
        setTokenAllowance(amount);
        return { success: true, txHash: "sim_allowance", allowance: amount };
      }
      const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
      const res = await approveTokenContractCall(
        userAddress,
        amount,
        spender,
        connectorType,
        assetConfig.contractAddress,
        assetConfig.decimals,
      );
      setTokenAllowance(res.allowance);
      return res;
    },
    [userAddress, connectorType],
  );

  /**
   * Sync user with backend DB. The DB is the source of truth for the role;
   * the cached value is only used to avoid a flicker on the first paint.
   */
  const syncUserWithBackend = useCallback(async (address: string) => {
    try {
      const savedUser = await registerUser(address);
      if (savedUser && savedUser.role) {
        setUserRole(savedUser.role);
        safeSetItem(SESSION_ROLE_KEY, savedUser.role);
      }
    } catch (err) {
      console.error("Error registering user with backend:", err);
    } finally {
      setIsRoleResolved(true);
    }
  }, []);

  // On mount, re-sync the persisted session with the backend so the DB role
  // replaces the cached one without a routing flicker.
  useEffect(() => {
    if (initialSession.address) {
      void syncUserWithBackend(initialSession.address);
    }
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
          address = authResult.stellarAddress;
        }
        setNetwork(STELLAR_CONFIG.network);
      } else if (type === "mock") {
        address = customAddress || "GADDER...MOCK";
        setNetwork(STELLAR_CONFIG.network);
      } else {
        throw new Error(`Unsupported wallet type: ${type}`);
      }

      if (!address) throw new Error("Failed to retrieve wallet address.");

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);
      safeSetItem(SESSION_ADDRESS_KEY, address);
      safeSetItem(SESSION_CONNECTOR_KEY, type);
      setIsRoleResolved(false);
      await syncUserWithBackend(address);
      await refreshBalance(address);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      throw err;
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setUserRole(null);
    setIsConnected(false);
    setConnectorType(null);
    setIsRoleResolved(true);
    setXmlBalance("0.00");
    setAssetBalances({});
    setTokenAllowance(0);
    safeSetItem(SESSION_ADDRESS_KEY, null);
    safeSetItem(SESSION_CONNECTOR_KEY, null);
    safeSetItem(SESSION_ROLE_KEY, null);
    purgeOnLogout();
  };

  const updateUserRole = useCallback(async (role: string) => {
    setUserRole(role);
    safeSetItem(SESSION_ROLE_KEY, role);
  }, []);

  const requestFriendbotFunding = useCallback(async () => {
    if (!userAddress) return false;
    try {
      await fundTestnetAccount(userAddress);
      await refreshBalance(userAddress);
      return true;
    } catch (err) {
      console.error("Friendbot funding failed:", err);
      return false;
    }
  }, [userAddress, refreshBalance]);

  const createCampaignOnChain = useCallback(
    async (
      name: string,
      budgetAmount: number,
      commissionRatePercent: number,
      clearingPeriodSecs: number,
      assetCode: SupportedEscrowAssetCode = "XLM",
    ) => {
      if (!userAddress) throw new Error("Wallet not connected");
      return createCampaignContractCall(
        userAddress,
        name,
        budgetAmount,
        commissionRatePercent,
        clearingPeriodSecs,
        connectorType || "freighter",
        assetCode,
      );
    },
    [userAddress, connectorType],
  );

  const logSaleOnChain = useCallback(
    async (campaignId: number, affiliateAddress: string, amountXlm: number) => {
      if (!userAddress) throw new Error("Wallet not connected");
      return logSaleContractCall(
        userAddress,
        campaignId,
        affiliateAddress,
        amountXlm,
        connectorType || "freighter",
      );
    },
    [userAddress, connectorType],
  );

  const claimPayoutOnChain = useCallback(
    async (campaignId: number, assetCode: SupportedEscrowAssetCode = "XLM") => {
      if (!userAddress) throw new Error("Wallet not connected");
      return claimPayoutContractCall(
        userAddress,
        campaignId,
        connectorType || "freighter",
        assetCode,
      );
    },
    [userAddress, connectorType],
  );

  const refundCampaignEscrow = useCallback(
    async (campaignId: number) => {
      if (!userAddress) throw new Error("Wallet not connected");
      return refundCampaignEscrowContractCall(
        userAddress,
        campaignId,
        connectorType || "freighter",
      );
    },
    [userAddress, connectorType],
  );

  const batchClaimPayoutsOnChain = useCallback(
    async (campaigns: ClaimableCampaignItem[]): Promise<BatchClaimReceipt> => {
      if (!userAddress) throw new Error("Wallet not connected");
      const { batchClaimPayouts } = await import("../lib/batchClaim");
      return batchClaimPayouts(userAddress, campaigns, connectorType || "freighter");
    },
    [userAddress, connectorType],
  );

  const registerPasskeyAccount = useCallback(async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  }, []);

  const switchToStellarNetwork = useCallback(async () => {
    try {
      const net = await getCurrentNetwork();
      setNetwork(net);
      return net === STELLAR_CONFIG.network;
    } catch {
      return false;
    }
  }, []);

  const factoryContract = null;
  const getCampaignContract = () => null;
  const provider = null;
  const signer = null;

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isRoleResolved,
    isConnected,
    isStellarNetwork: network === STELLAR_CONFIG.network,
    network,
    xmlBalance,
    assetBalances,
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
    refreshBalances,
    approveAllowance,
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
