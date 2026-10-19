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
  isConnected: boolean;
  isStellarNetwork: boolean;
  network: string;
  xlmBalance: string;
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
  ) => Promise<{ success: boolean; txHash?: string }>;

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
    amountXml: number,
  ) => Promise<{ success: boolean; txHash?: string }>;

  claimPayoutOnChain: (
    campaignId: number,
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<{
    success: boolean;
    txHash?: string;
    asset?: SupportedEscrowAssetCode;
  }>;
  refundCampaignEscrow: (campaignId: number) => Promise<{ success: boolean; txHash?: string }>;

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

const ROLE_STORAGE_KEY = "stellar-user-role";
const ADDRESS_STORAGE_KEY = "stellar-connected-address";

function readStoredRole(): string | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(ROLE_STORAGE_KEY) : null;
    return raw || null;
  } catch {
    return null;
  }
}

function writeStoredRole(role: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (role) window.localStorage.setItem(ROLE_STORAGE_KEY, role);
    else window.localStorage.removeItem(ROLE_STORAGE_KEY);
  } catch {
    /* ignore storage access errors */
  }
}

function readStoredAddress(): string | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(ADDRESS_STORAGE_KEY) : null;
    return raw || null;
  } catch {
    return null;
  }
}

function writeStoredAddress(address: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (address) window.localStorage.setItem(ADDRESS_STORAGE_KEY, address);
    else window.localStorage.removeItem(ADDRESS_STORAGE_KEY);
  } catch {
    /* ignore storage access errors */
  }
}

export function Web3Provider({ children }: { children: ReactNode }) {
  // Hydrate role + address synchronously on first render to eliminate flicker.
  const initialAddress = readStoredAddress();
  const initialRole = readStoredRole();
  const [userAddress, setUserAddress] = useState<string | null>(initialAddress);
  const [userRole, setUserRoleState] = useState<string | null>(initialRole);
  const [isConnected, setIsConnected] = useState<boolean>(Boolean(initialAddress));
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("\"0.00\"");
  const [assetBalances, setAssetBalances] = useState<Record<SupportedEscrowAssetCode, string>>({
    XLM: "0.00",
    USDC: "0.00",
    EURC: "0.00",
  });
  const [tokenAllowance, setTokenAllowance] = useState<number>(0);
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);

  // Role sync guard: track which address the current role belongs to so a stale
  // backend response can't overwrite the role of a newly connected wallet.
  const roleAddressRef = useRef<string | null>(initialAddress);
  const roleResolvedRef = useRef<boolean>(Boolean(initialAddress && initialRole));

  const setUserRole = useCallback((role: string | null) => {
    setUserRoleState(role);
    writeStoredRole(role);
  }, []);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXlmBalance(address);
      setXlmBalance(bal);
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

  // Sync with backend database & persistent role. Resolves the role for the
  // given address and ignores stale responses from previous addresses.
  const syncUserWithBackend = useCallback(
    async (address: string) => {
      try {
        const savedUser = await registerUser(address);
        if (roleAddressRef.current !== address) return;
        if (savedUser && savedUser.role) {
          setUserRole(savedUser.role);
        }
        roleResolvedRef.current = true;
      } catch (err) {
        console.error("Error registering user with backend:", err);
      }
    },
    [setUserRole],
  );

  // On mount, if a wallet address was persisted, re-sync the role from the
  // backend so DB and UI stay in step. The stored role is already applied
  // synchronously above, so there is no flicker while this resolves.
  useEffect(() => {
    if (initialAddress) {
      void syncUserWithBackend(initialAddress);
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
      } else if (type === "mock") {
        address = customAddress || "GADEMOADEMODERACCOUNT4XYZ6Q3KLMNOPQRSTUVWXY234567890ABCDEF";
        setNetwork(STELLAR_CONFIG.network);
      } else {
        throw new Error(`Unsupported wallet type: ${type}`);
      }

      if (!address) throw new Error("Failed to retrieve wallet address");

      // Reset role sync guard for the new address before any async resolution.
      roleAddressRef.current = address;
      roleResolvedRef.current = false;

      setUserAddress(address);
      writeStoredAddress(address);
      setIsConnected(true);
      setConnectorType(type);
      setIsWalletModalOpen(false);

      // Resync role from DB for the newly connected address.
      void syncUserWithBackend(address);

      // Fetch balances for the newly connected address.
      void refreshBalance(address);
    } catch (err) {
      console.error("Wallet connection failed:", err);
      throw err;
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setIsConnected(false);
    setConnectorType(null);
    setXlmBalance("0.00");
    setAssetBalances({ XLM: "0.00", USDC: "0.00", EURC: "0.00" });
    setTokenAllowance(0);
    setUserRole(null);
    writeStoredAddress(null);
    roleAddressRef.current = null;
    roleResolvedRef.current = false;
    try {
      purgeOnLogout();
    } catch {
      /* ignore purge errors */
    }
  };

  const updateUserRole = async (role: string) => {
    setUserRole(role);
    if (userAddress) {
      try {
        await registerUser(userAddress, role);
      } catch (err) {
        console.error("Error updating user role:", err);
      }
    }
  };

  const requestFriendbotFunding = async () => {
    if (!userAddress) return false;
    try {
      await fundTestnetAccount(userAddress);
      await refreshBalance(userAddress);
      return true;
    } catch (err) {
      console.error("Friendbot funding failed:", err);
      return false;
    }
  };

  const createCampaignOnChain = async (
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
  };

  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return logSaleContractCall(
      userAddress,
      campaignId,
      affiliateAddress,
      amountXml,
      connectorType || "freighter",
    );
  };

  const claimPayoutOnChain = async (
    campaignId: number,
    assetCode: SupportedEscrowAssetCode = "XLM",
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return claimPayoutContractCall(
      userAddress,
      campaignId,
      connectorType || "freighter",
      assetCode,
    );
  };

  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return refundCampaignEscrowContractCall(
      userAddress,
      campaignId,
      connectorType || "freighter",
    );
  };

  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const { batchClaimPayouts } = await import("../lib/batchClaim");
    return batchClaimPayouts(
      userAddress,
      campaigns,
      connectorType || "freighter",
    );
  };

  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  };

  const switchToStellarNetwork = async () => {
    try {
      const current = await getCurrentNetwork();
      setNetwork(current);
      return current === STELLAR_CONFIG.network;
    } catch (err) {
      console.error("Failed to switch Stellar network:", err);
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
    factoryContract: null,
    getCampaignContract: () => null,
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
