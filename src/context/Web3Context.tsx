import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXbullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXlmBalance,
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
  ) => Promise<{ success: boolean; txHash?: string; allowance?: number }>;

  // Optimistic UI state
  pendingTxs: Record<string, PendingTxState>;
  isPending: (key: string) => boolean;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

export type PendingTxStatus = "pending" | "confirmed" | "reverted";

export interface PendingTxState {
  key: string;
  status: PendingTxStatus;
  startedAt: number;
  txHash?: string;
  error?: string;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [assetBalances, setAssetBalances] = useState<Record<SupportedEscrowAssetCode, string>>({
    XLM: "0.00",
    USDC: "0.00",
    EURC: "0.00",
  });
  const [tokenAllowance, setTokenAllowance] = useState<number>(0);
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [pendingTxs, setPendingTxs] = useState<Record<string, PendingTxState>>({});
  const pendingTxsRef = useRef<Record<string, PendingTxState>>({});

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  const upsertPendingTx = useCallback((key: string, patch: Partial<PendingTxState>) => {
    const prev = pendingTxsRef.current[key] || {
      key,
      status: "pending" as PendingTxStatus,
      startedAt: Date.now(),
    };
    const next = { ...prev, ...patch, key };
    pendingTxsRef.current = { ...pendingTxsRef.current, [key]: next };
    setPendingTxs((current) => ({ ...current, [key]: next }));
  }, []);

  const clearPendingTx = useCallback((key: string, delayMs = 0) => {
    const run = () => {
      const { [key]: _removed, ...rest } = pendingTxsRef.current;
      pendingTxsRef.current = rest;
      setPendingTxs((current) => {
        const { [key]: _drop, ...remaining } = current;
        return remaining;
      });
    };
    if (delayMs > 0) {
      setTimeout(run, delayMs);
    } else {
      run();
    }
  }, []);

  const isPending = useCallback(
    (key: string) => pendingTxs[key]?.status === "pending",
    [pendingTxs],
  );

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
      const key = `allowance:${assetCode}:${spender ?? "default"}`;
      const previousAllowance = tokenAllowance;
      const isSupportedConnector =
        connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull";
      if (!isSupportedConnector) {
        if (connectorType !== "mock") {
          throw new Error(`Allowance approval is not supported for ${connectorType} wallets.`);
        }
        // Optimistic update for mock connector
        upsertPendingTx(key, { status: "pending" });
        setTokenAllowance(amount);
        upsertPendingTx(key, { status: "confirmed", txHash: "sim_allowance" });
        clearPendingTx(key, 1500);
        return { success: true, txHash: "sim_allowance", allowance: amount };
      }
      const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
      // Optimistic: apply new allowance immediately (<50ms)
      upsertPendingTx(key, { status: "pending" });
      setTokenAllowance(amount);
      try {
        const res = await approveTokenContractCall(
          userAddress,
          amount,
          spender,
          connectorType,
          assetConfig.contractAddress,
          assetConfig.decimals,
        );
        setTokenAllowance(res.allowance);
        upsertPendingTx(key, { status: "confirmed", txHash: res.txHash });
        clearPendingTx(key, 1500);
        return res;
      } catch (err) {
        // Reliable revert on failure
        setTokenAllowance(previousAllowance);
        upsertPendingTx(key, {
          status: "reverted",
          error: err instanceof Error ? err.message : String(err),
        });
        clearPendingTx(key, 3000);
        throw err;
      }
    },
    [userAddress, connectorType, tokenAllowance, upsertPendingTx, clearPendingTx],
  );

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
      } else if (type === "mock") {
        address = customAddress || "GDEMOACCOUNTFORDEVMODEXAMPLE000000000000000";
        setNetwork(STELLAR_CONFIG.network);
      } else {
        throw new Error(`Unsupported wallet type: ${type}`);
      }

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);
      await refreshBalance(address);
      await syncUserWithBackend(address);
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
    setXlmBalance("0.00");
    setAssetBalances({ XLM: "0.00", USDC: "0.00", EURC: "0.00" });
    setTokenAllowance(0);
    setPendingTxs({});
    pendingTxsRef.current = {};
    purgeOnLogout();
  };

  const updateUserRole = async (role: string) => {
    setUserRole(role);
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

  const createCampaignOnChain = useCallback(
    async (
      name: string,
      budgetAmount: number,
      commissionRatePercent: number,
      clearingPeriodSecs: number,
      assetCode: SupportedEscrowAssetCode = "XLM",
    ) => {
      if (!userAddress) throw new Error("Wallet not connected");
      const key = `createCampaign:${name}`;
      upsertPendingTx(key, { status: "pending" });
      try {
        const res = await createCampaignContractCall(
          userAddress,
          name,
          budgetAmount,
          commissionRatePercent,
          clearingPeriodSecs,
          connectorType || "freighter",
          assetCode,
        );
        upsertPendingTx(key, { status: "confirmed", txHash: res.tyHash });
        clearPendingTx(key, 1500);
        return { success: true, campaignId: res.campaignId, txHash: res.tyHash, asset: assetCode };
      } catch (err) {
        upsertPendingTx(key, {
          status: "reverted",
          error: err instanceof Error ? err.message : String(err),
        });
        clearPendingTx(key, 3000);
        throw err;
      }
    },
    [userAddress, connectorType, upsertPendingTx, clearPendingTx],
  );

  const logSaleOnChain = useCallback(
    async (campaignId: number, affiliateAddress: string, amountXlm: number) => {
      if (!userAddress) throw new Error("Wallet not connected");
      const key = `logSale:${campaignId}:${affiliateAddress}`;
      upsertPendingTx(key, { status: "pending" });
      try {
        const res = await logSaleContractCall(
          userAddress,
          campaignId,
          affiliateAddress,
          amountXlm,
          connectorType || "freighter",
        );
        upsertPendingTx(key, { status: "confirmed", txHash: res.tyHash });
        clearPendingTx(key, 1500);
        return { success: true, tyHash: res.tyHash };
      } catch (err) {
        upsertPendingTx(key, {
          status: "reverted",
          error: err instanceof Error ? err.message : String(err),
        });
        clearPendingTx(key, 3000);
        throw err;
      }
    },
    [userAddress, connectorType, upsertPendingTx, clearPendingTx],
  );

  const claimPayoutOnChain = useCallback(
    async (campaignId: number, assetCode: SupportedEscrowAssetCode = "XLM") => {
      if (!userAddress) throw new Error("Wallet not connected");
      const key = `claimPayout:${campaignId}`;
      upsertPendingTx(key, { status: "pending" });
      try {
        const res = await claimPayoutContractCall(
          userAddress,
          campaignId,
          connectorType || "freighter",
          assetCode,
        );
        upsertPendingTx(key, { status: "confirmed", txHash: res.tyHash });
        clearPendingTx(key, 1500);
        return { success: true, txHash: res.tyHash, asset: assetCode };
      } catch (err) {
        upsertPendingTx(key, {
          status: "reverted",
          error: err instanceof Error ? err.message : String(err),
        });
        clearPendingTx(key, 3000);
        throw err;
      }
    },
    [userAddress, connectorType, upsertPendingTx, clearPendingTx],
  );

  const refundCampaignEscrow = useCallback(
    async (campaignId: number) => {
      if (!userAddress) throw new Error("Wallet not connected");
      const key = `refund:${campaignId}`;
      upsertPendingTx(key, { status: "pending" });
      try {
        const res = await refundCampaignEscrowContractCall(
          userAddress,
          campaignId,
          connectorType || "freighter",
        );
        upsertPendingTx(key, { status: "confirmed", txHash: res.tyHash });
        clearPendingTx(key, 1500);
        return { success: true, tyHash: res.tyHash };
      } catch (err) {
        upsertPendingTx(key, {
          status: "reverted",
          error: err instanceof Error ? err.message : String(err),
        });
        clearPendingTx(key, 3000);
        throw err;
      }
    },
    [userAddress, connectorType, upsertPendingTx, clearPendingTx],
  );

  const batchClaimPayoutsOnChain = useCallback(
    async (campaigns: ClaimableCampaignItem[]) => {
      if (!userAddress) throw new Error("Wallet not connected");
      const key = "batchClaim";
      upsertPendingTx(key, { status: "pending" });
      try {
        const { batchClaimPayouts } = await import("../lib/batchClaim");
        const receipt = await batchClaimPayouts(
          userAddress,
          campaigns,
          connectorType || "freighter",
        );
        upsertPendingTx(key, { status: "confirmed" });
        clearPendingTx(key, 1500);
        return receipt;
      } catch (err) {
        upsertPendingTx(key, {
          status: "reverted",
          error: err instanceof Error ? err.message : String(err),
        });
        clearPendingTx(key, 3000);
        throw err;
      }
    },
    [userAddress, connectorType, upsertPendingTx, clearPendingTx],
  );

  const registerPasskeyAccount = useCallback(async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName);
  }, []);

  const switchToStellarNetwork = async () => {
    try {
      const currentNet = await getCurrentNetwork();
      setNetwork(currentNet);
      return currentNet === STELLAR_CONFIG.network;
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
    pendingTxs,
    isPending,
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
