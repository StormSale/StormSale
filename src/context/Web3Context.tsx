import { createContext, useContext, useState, useCallback, useEffect } from "react";
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
import { dispatchWebhookEvent } from "../lib/webhookEngine";
import { assertNotSanctioned } from "../lib/sanctions";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { SplitPlan } from "../lib/commissionSplit";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
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
  ) => Promise<{ success: boolean; txHash?: string }>;

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
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Stellar SEP-0030 Multi-Sig State
  const [multiSigInfo, setMultiSigInfo] = useState<MultiSigAccountInfo | null>(null);
  const [isMultiSigModalOpen, setIsMultiSigModalOpen] = useState(false);
  const [activeMultiSigXdr, setActiveMultiSigXdr] = useState<string | null>(null);
  const [activeMultiSigDescription, setActiveMultiSigDescription] = useState<string | null>(null);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

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

      await assertNotSanctioned(address, `wallet-connect:${type}`);

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);

      await refreshMultiSigInfo(address);

      if (type !== "mock") {
        await refreshBalance(address);
      }
      await refreshTokenAllowance();
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
    setAssetBalances({
      XLM: "0.00",
      USDC: "0.00",
      EURC: "0.00",
    });
    setTokenAllowance(0);
    setMultiSigInfo(null);
    setIsMultiSigModalOpen(false);
    setActiveMultiSigXdr(null);
    setActiveMultiSigDescription(null);
    void purgeOnLogout();
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
    budgetAmount: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
    assetCode: SupportedEscrowAssetCode = "XLM",
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    await assertNotSanctioned(userAddress, "create-campaign");

    console.log(
      `[Soroban] Creating campaign "${name}": Budget=${budgetAmount} ${assetCode}, Rate=${commissionRatePercent}%, Clearing=${clearingPeriodSecs}s`,
    );

    // Escrow locking interacts with corresponding Stellar Asset Contract:
    // If deploying with a SAC stablecoin (USDC, EURC), authorize token allowance on SAC contract for escrow spender
    // Gate allowance approval to supported connectors only (freighter, albedo, xbull)
    if (assetCode !== "XLM") {
      const isSupportedConnector =
        connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull";
      if (isSupportedConnector) {
        const assetConfig = SUPPORTED_ESCROW_ASSETS[assetCode];
        if (assetConfig) {
          console.log(
            `[Soroban SAC] Authorizing ${budgetAmount} ${assetCode} allowance on SAC contract ${assetConfig.contractAddress} for escrow ${STELLAR_CONFIG.contractId}`,
          );
          await approveTokenAllowanceCall(
            userAddress,
            assetConfig.contractAddress,
            STELLAR_CONFIG.contractId,
            budgetAmount,
            connectorType,
            assetConfig.decimals,
          );
        }
      }
    }

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await createCampaignContractCall(
        userAddress,
        commissionRatePercent,
        clearingPeriodSecs,
        budgetAmount,
        connectorType,
        assetCode,
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
      return res;
    } else {
      // Mock fallback for UI preview without extension
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      const newCampaignId = Math.floor(Math.random() * 9000) + 1000;
      setTokenAllowance((prev) => Math.max(0, prev - budgetAmount));
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(
          `mock_allowance_${userAddress}_${STELLAR_CONFIG.contractId}`,
        );
        if (stored) {
          const updated = Math.max(0, parseFloat(stored) - budgetAmount);
          window.localStorage.setItem(
            `mock_allowance_${userAddress}_${STELLAR_CONFIG.contractId}`,
            updated.toString(),
          );
        }
      }
      return {
        success: true,
        campaignId: newCampaignId,
        txHash: mockTxHash,
        asset: assetCode,
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
  const claimPayoutOnChain = async (campaignId: number, assetCode?: SupportedEscrowAssetCode) => {
    if (!userAddress) throw new Error("Wallet not connected");
    await assertNotSanctioned(userAddress, "claim-payout");

    console.log(
      `[Soroban] Claiming payout for Campaign #${campaignId}${assetCode ? ` in ${assetCode}` : ""} by ${userAddress}`,
    );

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await claimPayoutContractCall(userAddress, campaignId, connectorType, assetCode);
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
      return res;
    } else {
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      return {
        success: true,
        txHash: mockTxHash,
        ...(assetCode ? { asset: assetCode } : {}),
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
  // (optionally routes the withdrawn total to auto-split vault destinations in the same envelope)
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
    splitPlan?: SplitPlan | null,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    await assertNotSanctioned(userAddress, "batch-claim-payout");
    const { executeBatchCommissionClaim } = await import("../lib/batchClaim");
    const res = await executeBatchCommissionClaim(
      userAddress,
      campaigns,
      connectorType || "freighter",
      splitPlan,
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
        "XLM",
      );
      return {
        wait: async () => res,
      };
    },
    joinCampaign: async (campaignAddr: string) => {
      console.log(`[Soroban] Joined campaign: ${campaignAddr}`);
      return {
        wait: async () => ({ success: true }),
      };
    },
  };

  const getCampaignContract = (_address: string) => ({
    logEncryptedSale: async (
      affiliate: string,
      amount: string,
      _payload: any,
      _advKey: any,
      _affKey: any,
    ) => {
      const res = await logSaleOnChain(1, affiliate, parseFloat(amount) || 0);
      return {
        wait: async () => res,
      };
    },
    grantAuditAccess: async (saleId: string, auditor: string, _key: any) => {
      console.log(`[Soroban] Granted audit access for sale ${saleId} to ${auditor}`);
      return {
        wait: async () => ({ success: true }),
      };
    },
  });

  const switchToStellarNetwork = async () => {
    setNetwork("TESTNET");
    return true;
  };

  return (
    <Web3Context.Provider
      value={{
        userAddress,
        userRole,
        isConnected,
        isStellarNetwork: network.toUpperCase() === "TESTNET" || network.toUpperCase() === "PUBLIC",
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
        factoryContract,
        getCampaignContract,
        multiSigInfo,
        isMultiSigAccount,
        isMultiSigModalOpen,
        activeMultiSigXdr,
        activeMultiSigDescription,
        openMultiSigModal,
        closeMultiSigModal,
        refreshMultiSigInfo,
        provider: null,
        signer: null,
        switchToStellarNetwork,
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
      }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
