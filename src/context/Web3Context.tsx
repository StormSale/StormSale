import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXbullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXLmBalance,
  fetchAssetBalances,
  approveTokenAllowance as approveTokenAllowanceCall,
  fundTestnetAccount,
  createCampaignContractCall,
  logSaleContractCall,
  claimPayoutContractCall,
  getTokenAllowanceQuery,
  approveTokenContractCall,
  refundCampaignEscrowContractCall,
  connectLedgerDevice,
  DEFAULT_STALLAR_BIP_PATH,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG, SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import type { SupportedEscrowAssetCode } from "../config/stellar";
import { registerUser } from "../utils/api";
import { dispatchWebhookEvent } from "../lib/webhookEngine";
import { assertNotSanctioned } from "../lib/sanctions";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { SplitPlan } from "../lib/commissionSplit";
import type { AutoSwapConfig } from "../lib/sorobanDex";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
import { useUserQuery, useUpdateRoleMutation } from "../hooks/useUserQuery";
import { useBalanceQuery } from "../hooks/useBalanceQuery";
import { queryKeys } from "../lib/queryClient";
import { purgeOnLogout } from "../lib/storage";
import type { MultiSigAccountInfo } from "../lib/multisig";
import { inspectMultiSigAccount } from "../lib/multisig";
import {
  rpcFallbackManager,
  type RpcEndpointStatus,
  type RpcFailoverEvent,
} from "../lib/rpcFallback";

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
    amountXlm: number,
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

  batchClaimPayoutsOnChain: (
    campaigns: ClaimableCampaignItem[],
    splitPlan?: SplitPlan | null,
    autoSwap?: AutoSwapConfig | null,
  ) => Promise<BatchClaimReceipt>;

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

  // Stellar SEP-0030 Multi-Signature Campaign Escrow
  multiSigInfo: MultiSigAccountInfo | null;
  isMultiSigAccount: boolean;
  isMultiSigModalOpen: boolean;
  activeMultiSigXdr: string | null;
  activeMultiSigDescription: string | null;
  openMultiSigModal: (initialXdr?: string, actionDescription?: string) => void;
  closeMultiSigModal: () => void;
  refreshMultiSigInfo: (address?: string) => Promise<MultiSigAccountInfo | null>;

  // RPC Fallback & Multi-Endpoint Status (#109)
  activeRpcEndpoint: RpcEndpointStatus;
  rpcEndpoints: RpcEndpointStatus[];
  rpcFailoverHistory: RpcFailoverEvent[];
  rpcTimeoutMs: number;
  isRpcModalOpen: boolean;
  openRpcModal: () => void;
  closeRpcModal: () => void;
  switchRpcEndpoint: (idOrUrl: string) => void;
  simulateRpcFailover: (reason?: string) => void;
  checkRpcHealth: () => Promise<void>;
  addCustomRpcEndpoint: (name: string, url: string, isLocal?: boolean) => void;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [assetBalances, setAssetBalances] = useState<Record<SupportedEscrowAssetCode, string>>({
    XLM: "0.00",
    USDC: "0.00",
    EURC: "0.00",
  });
  const [tokenAllowance, setTokenAllowance] = useState<number>(0);
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("\"44'/148'/0'\"".replace(/"/g, ""));
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Stellar SEP-0030 Multi-Sig State
  const [multiSigInfo, setMultiSigInfo] = useState<MultiSigAccountInfo | null>(null);
  const [isMultiSigModalOpen, setIsMultiSigModalOpen] = useState(false);
  const [activeMultiSigXdr, setActiveMultiSigXdr] = useState<string | null>(null);
  const [activeMultiSigDescription, setActiveMultiSigDescription] = useState<string | null>(null);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // TanStack Query: cached user profile (role) and cached XLM balance.
  // Both queries refetch automatically on focus/reconnect via the global config.
  const userQuery = useUserQuery(userAddress);
  const balanceQuery = useBalanceQuery(userAddress, {
    enabled: connectorType !== "mock",
  });
  const updateRoleMutation = useUpdateRoleMutation(userAddress);

  const userRole = userQuery.data?.role ?? null;
  const xlmBalance = connectorType === "mock" ? "10000.00" : (balanceQuery.data ?? "0.00");
  const isConnected = Boolean(userAddress);

  // Refresh balance by marking the cache stale and triggering a refetch.
  const refreshBalance = useCallback(
    (address?: string | null) => {
      const target = address ?? userAddress;
      if (!target) return;
      queryClient.invalidateQueries({ queryKey: queryKeys.balance(target) });
    },
    [queryClient, userAddress],
  );

  const openMultiSigModal = useCallback((initialXdr?: string, actionDescription?: string) => {
    if (initialXdr !== undefined) setActiveMultiSigXdr(initialXdr);
    if (actionDescription !== undefined) setActiveMultiSigDescription(actionDescription);
    setIsMultiSigModalOpen(true);
  }, []);

  const closeMultiSigModal = useCallback(() => {
    setIsMultiSigModalOpen(false);
  }, []);

  const refreshMultiSigInfo = useCallback(
    async (targetAddress?: string) => {
      const addr = targetAddress || userAddress;
      if (!addr) {
        setMultiSigInfo(null);
        return null;
      }
      try {
        const info = await inspectMultiSigAccount(addr);
        setMultiSigInfo(info);
        return info;
      } catch (err) {
        console.warn("Could not inspect multi-sig account info:", err);
        return null;
      }
    },
    [userAddress],
  );

  const isMultiSigAccount = !!(multiSigInfo && multiSigInfo.isMultiSig);

  // RPC Fallback Management State (#109)
  const [activeRpcEndpoint, setActiveRpcEndpoint] = useState<RpcEndpointStatus>(() =>
    rpcFallbackManager.getActiveEndpoint(),
  );
  const [rpcEndpoints, setRpcEndpoints] = useState<RpcEndpointStatus[]>(() =>
    rpcFallbackManager.getAllEndpoints(),
  );
  const [rpcFailoverHistory, setRpcFailoverHistory] = useState<RpcFailoverEvent[]>(() =>
    rpcFallbackManager.getFailoverHistory(),
  );
  const [isRpcModalOpen, setIsRpcModalOpen] = useState(false);

  const openRpcModal = useCallback(() => setIsRpcModalOpen(true), []);
  const closeRpcModal = useCallback(() => setIsRpcModalOpen(false), []);

  const switchRpcEndpoint = useCallback((idOrUrl: string) => {
    const target = rpcFallbackManager.setActiveEndpoint(idOrUrl);
    setActiveRpcEndpoint({ ...target });
    setRpcEndpoints(rpcFallbackManager.getAllEndpoints());
  }, []);

  const simulateRpcFailover = useCallback((reason?: string) => {
    const next = rpcFallbackManager.failoverToNext(reason || "Manual simulated failover");
    setActiveRpcEndpoint({ ...next });
    setRpcEndpoints(rpcFallbackManager.getAllEndpoints());
    setRpcFailoverHistory(rpcFallbackManager.getFailoverHistory());
  }, []);

  const checkRpcHealth = useCallback(async () => {
    const updated = await rpcFallbackManager.checkAllHealth();
    setRpcEndpoints([...updated]);
    setActiveRpcEndpoint({ ...rpcFallbackManager.getActiveEndpoint() });
  }, []);

  const addCustomRpcEndpoint = useCallback(
    (name: string, url: string, isLocal: boolean = false) => {
      const id = `custom-${Date.now()}`;
      rpcFallbackManager.addEndpoint({
        id,
        name,
        url,
        type: isLocal ? "local" : "backup",
        isLocal,
      });
      setRpcEndpoints(rpcFallbackManager.getAllEndpoints());
    },
    [],
  );

  // Subscribe to RPC Fallback Manager events for live reactive UI updates
  useEffect(() => {
    const unsubscribe = rpcFallbackManager.subscribe((event) => {
      setActiveRpcEndpoint({ ...event.active });
      setRpcEndpoints([...event.endpoints]);
      setRpcFailoverHistory(rpcFallbackManager.getFailoverHistory());
    });
    void rpcFallbackManager.checkAllHealth().catch(() => {});
    return () => {
      unsubscribe();
    };
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

  // Sync with backend database & persistent role
  const syncUserWithBackend = useCallback(
    async (address: string) => {
      try {
        const savedUser = await registerUser(address);
        if (savedUser && savedUser.role) {
          queryClient.setQueryData(queryKeys.user(address), savedUser);
        }
      } catch (err) {
        console.error("Error registering user with backend:", err);
      }
    },
    [queryClient],
  );

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
        const path = derivationPath || ledgerBipPath || DEFAULT_STALLAR_BIP_PATH;
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
        address = "GASTORMSALE'TESTNET7AFFILIATE7MERCHANT'ESCROW7XLM77777";
        setNetwork("TESTNET");
      }

      await assertNotSanctioned(address, `wallet-connect:${type}`);

      setUserAddress(address);
      setConnectorType(type);

      await refreshMultiSigInfo(address);

      if (type !== "mock") {
        await refreshBalance(address);
      }
      await refreshTokenAllowance();
      await syncUserWithBackend(address);
      setIsWalletModalOpen(false);

      // Prime the cache for the newly connected wallet so role/balance are
      // available immediately and the cache is refreshed in the background.
      await queryClient.invalidateQueries({ queryKey: queryKeys.user(address) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.balance(address) });
    } catch (err) {
      console.error("Wallet connection failed:", err);
      throw err;
    }
  };

  const disconnectWallet = () => {
    setUserAddress(null);
    setConnectorType(null);
    setTokenAllowance(0);
    setAssetBalances({ XLM: "0.00", USDC: "0.00", EURC: "0.00" });
    setMultiSigInfo(null);
    setIsMultiSigModalOpen(false);
    setActiveMultiSigXdr(null);
    setActiveMultiSigDescription(null);
    void purgeOnLogout();
    queryClient.clear();
  };

  const updateUserRole = useCallback(
    async (role: string) => {
      if (!userAddress) throw new Error("Wallet not connected");
      await updateRoleMutation.mutateAsync(role);
    },
    [userAddress, updateRoleMutation],
  );

  const requestFriendbotFunding = useCallback(async () => {
    if (!userAddress) return false;
    try {
      const ok = await fundTestnetAccount(userAddress);
      if (ok) {
        await refreshBalance(userAddress);
      }
      return ok;
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
      const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
      const res = await createCampaignContractCall(
        userAddress,
        name,
        budgetAmount,
        commissionRatePercent,
        clearingPeriodSecs,
        connectorType || "freighter",
        assetConfig.contractAddress,
        assetConfig.decimals,
      );
      if (res.success) {
        void dispatchWebhookEvent("campaign.created", {
          id: `campaign_${res.campaignId}`,
          event: "campaign.created",
          created_at: new Date().toISOString(),
          campaign_id: res.campaignId,
          campaign_name: name,
          advertiser_address: userAddress,
          budget: budgetAmount,
          currency: assetCode || "XLM",
          commission_rate_percent: commissionRatePercent,
          clearing_period_seconds: clearingPeriodSecs,
          tx_hash: res.txHash,
          status: "created",
        });
      }
      setTimeout(() => {
        refreshBalance(userAddress);
        refreshTokenAllowance(undefined, assetCode);
      }, 1000);
      return { ...res, asset: assetCode };
    },
    [userAddress, connectorType, refreshBalance, refreshTokenAllowance],
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

  // Soroban: Claim Affiliate Commission
  const claimPayoutOnChain = useCallback(
    async (campaignId: number, assetCode: SupportedEscrowAssetCode = "XLM") => {
      if (!userAddress) throw new Error("Wallet not connected");
      const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode] || SUPPORTED_ESCROW_ASSETS.XLM;
      const res = await claimPayoutContractCall(
        userAddress,
        campaignId,
        connectorType || "freighter",
        assetConfig.contractAddress,
        assetConfig.decimals,
      );
      if (res.success) {
        void dispatchWebhookEvent("payout.created", {
          id: `payout_${res.txHash}`,
          event: "payout.created",
          created_at: new Date().toISOString(),
          payout_id: res.txHash,
          campaign_id: campaignId,
          affiliate_address: userAddress,
          currency: (res.asset as string) || (assetCode as string) || "XLM",
          tx_hash: res.txHash,
          status: "claimed",
        });
      }
      setTimeout(() => refreshBalance(userAddress), 1000);
      return { ...res, asset: assetCode };
    },
    [userAddress, connectorType, refreshBalance],
  );

  // Soroban: Refund Unused Campaign Escrow
  const refundCampaignEscrow = useCallback(
    async (campaignId: number) => {
      if (!userAddress) throw new Error("Wallet not connected");
      const res = await refundCampaignEscrowContractCall(
        userAddress,
        campaignId,
        connectorType || "freighter",
      );
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    },
    [userAddress, connectorType, refreshBalance],
  );

  // Soroban: Automated Batch Commission Claim Dispatcher across Multiple Campaigns
  // (optionally routes the withdrawn total to auto-split vault destinations in the same envelope)
  const batchClaimPayoutsOnChain = useCallback(
    async (
      campaigns: ClaimableCampaignItem[],
      splitPlan?: SplitPlan | null,
      autoSwap?: AutoSwapConfig | null,
    ): Promise<BatchClaimReceipt> => {
      if (!userAddress) throw new Error("Wallet not connected");
      await assertNotSanctioned(userAddress, "batch-claim-payout");
      const { executeBatchCommissionClaim } = await import("../lib/batchClaim");
      const res = await executeBatchCommissionClaim(
        userAddress,
        campaigns,
        connectorType || "freighter",
        splitPlan,
        autoSwap,
      );
      setTimeout(() => refreshBalance(userAddress), 1000);
      return res;
    },
    [userAddress, connectorType, refreshBalance],
  );

  // Passkey Smart Account Registration
  const registerPasskeyAccount = useCallback(async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  }, []);

  // Compatibility facade for existing form components
  const factoryContract = null;
  const getCampaignContract = useCallback((_address: string) => null, []);
  const provider = null;
  const signer = null;
  const switchToStellarNetwork = useCallback(async () => {
    try {
      const current = await getCurrentNetwork();
      setNetwork(current);
      return current === STELLAR_CONFIG.network;
    } catch (err) {
      console.error("Failed to switch Stellar network:", err);
      return false;
    }
  }, []);

  // Keep asset balances in sync with the cached XLM balance and fetch the rest.
  useEffect(() => {
    setAssetBalances((prev) => ({ ...prev, XLM: xlmBalance }));
  }, [xlmBalance]);

  useEffect(() => {
    if (!userAddress || connectorType === "mock") return;
    let cancelled = false;
    (async () => {
      try {
        const balances = await fetchAssetBalances(userAddress);
        if (!cancelled && balances) {
          setAssetBalances((prev) => ({ ...prev, ...balances }));
        }
      } catch (err) {
        console.warn("Could not fetch asset balances:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userAddress, connectorType]);

  const isStellarNetwork = network === STELLAR_CONFIG.network;

  const value = useMemo(
    () => ({
      userAddress,
      userRole,
      isConnected,
      isStellarNetwork,
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
      multiSigInfo,
      isMultiSigAccount,
      isMultiSigModalOpen,
      activeMultiSigXdr,
      activeMultiSigDescription,
      openMultiSigModal,
      closeMultiSigModal,
      refreshMultiSigInfo,
      activeRpcEndpoint,
      rpcEndpoints,
      rpcFailoverHistory,
      rpcTimeoutMs: rpcFallbackManager.getTimeoutMs(),
      isRpcModalOpen,
      openRpcModal,
      closeRpcModal,
      switchRpcEndpoint,
      simulateRpcFailover,
      checkRpcHealth,
      addCustomRpcEndpoint,
      factoryContract,
      getCampaignContract,
      provider,
      signer,
      switchToStellarNetwork,
    }),
    [
      userAddress,
      userRole,
      isConnected,
      isStellarNetwork,
      network,
      xlmBalance,
      assetBalances,
      connectorType,
      isWalletModalOpen,
      ledgerBipPath,
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
      multiSigInfo,
      isMultiSigAccount,
      isMultiSigModalOpen,
      activeMultiSigXdr,
      activeMultiSigDescription,
      openMultiSigModal,
      closeMultiSigModal,
      refreshMultiSigInfo,
      activeRpcEndpoint,
      rpcEndpoints,
      rpcFailoverHistory,
      isRpcModalOpen,
      openRpcModal,
      closeRpcModal,
      switchRpcEndpoint,
      simulateRpcFailover,
      checkRpcHealth,
      addCustomRpcEndpoint,
      getCampaignContract,
      switchToStellarNetwork,
    ],
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}