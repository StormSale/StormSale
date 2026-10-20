import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
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
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { SplitPlan } from "../lib/commissionSplit";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
import { purgeOnLogout } from "../lib/storage";
import { useSorobanEvents } from "../hooks/useSorobanEvents";
import type { SorobanConnectionStatus } from "../hooks/useSorobanEvents";
import { SOROBAN_EVENT_CONFIG, CONTRACT_ADDRESSES } from "../config/contracts";

export type SorobanEventListener = (events: any[]) => void;

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

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;

  // Real-time Soroban event stream
  sorobanEventStatus: SorobanConnectionStatus;
  sorobanEvents: any[];
  subscribeSorobanEvents: (listener: SorobanEventListener) => () => void;
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
        connectorType || "freeighter",
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

  // Approve token allowance on-chain (gated to supported connectors Freeighter, Albedo, xBull)
  const approveTokenAllowance = useCallback(
    async (amount: number, spender?: string, assetCode: SupportedEscrowAssetCode = "XLM") => {
      if (!userAddress) throw new Error("Wallet not connected");
      const isSupportedConnector =
        connectorType === "freeighter" || connectorType === "albedo" || connectorType === "xbull";
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

  // Multi-Wallet Stellar Connection: Freeighter, Albedo, xBull, Ledger, Passkey, Mock
  const connectWallet = async (
    type: WalletType = "freeighter",
    customAddress?: string,
    derivationPath?: string,
  ) => {
    try {
      let address = "";
      if (type === "freeighter") {
        const isInstalled = await checkFreeighterInstalled();
        if (!isInstalled) {
          throw new Error(
            "Freeighter extension is not installed. If you are on a mobile device, please select Albedo (Web Wallet) or Demo Account.",
          );
        }
        address = await connectFreeighterWallet();
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
        address = "GASTORMSALE7TESTNET7AAFFLIATE7MERCHANT7ESCROW7XLM77777";
        setNetwork("TESTNET");
        setXlmBalance("10000.00");
      }

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);

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
  ): Promise<{
    success: boolean;
    campaignId: number;
    txHash?: string;
    asset?: SupportedEscrowAssetCode;
  }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const result = await createCampaignContractCall(
      userAddress,
      name,
      budgetAmount,
      commissionRatePercent,
      clearingPeriodSecs,
      connectorType || "freeighter",
      assetCode,
    );
    return result;
  };

  // Soroban: Log Sale
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    return logSaleContractCall(
      userAddress,
      campaignId,
      affiliateAddress,
      amountXlm,
      connectorType || "freeighter",
    );
  };

  // Soroban: Claim Payout
  const claimPayoutOnChain = async (
    campaignId: number,
    assetCode: SupportedEscrowAssetCode = "XLM",
  ): Promise<{
    success: boolean;
    txHash?: string;
    asset?: SupportedEscrowAssetCode;
  }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    return claimPayoutContractCall(
      userAddress,
      campaignId,
      connectorType || "freeighter",
      assetCode,
    );
  };

  // Soroban: Refund Campaign Escrow
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return refundCampaignEscrowContractCall(
      userAddress,
      campaignId,
      connectorType || "freeighter",
    );
  };

  // Soroban: Batch Claim Payouts
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
    splitPlan: SplitPlan | null = null,
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const { batchClaimPayoutsOnChain } = await import("../lib/batchClaim");
    return batchClaimPayoutsOnChain(
      userAddress,
      campaigns,
      connectorType || "freeighter",
      splitPlan,
    );
  };

  // Passkey: Register Account
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  };

  // Compatibility helpers for legacy form callers
  const factoryContract = null;
  const getCampaignContract = (address: string) => ({
    address,
    contractId: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
  });
  const provider = null;
  const signer = null;
  const switchToStellarNetwork = async () => true;

  // Real-time Soroban event stream
  const sorobanListenersRef = useRef<Set<SorobanEventListener>>(new Set());
  const handleSorobanEvents = useCallback((incoming: any[]) => {
    for (const listener of sorobanListenersRef.current) {
      try {
        listener(incoming);
      } catch (err) {
        console.warn("Soroban event listener error:", err);
      }
    }
  }, []);

  const {
    events: sorobanEvents,
    status: sorobanEventStatus,
  } = useSorobanEvents({
    rpcUrl: STELLAR_CONFIG.rpcUrl,
    contractId: CONTRACT_ADDRESSES.CAMPAIGN_ESCROW,
    pollingIntervalMs: SOROBAN_EVENT_CONFIG.pollIntervalMs,
    topics: [...SOROBAN_EVENT_CONFIG.topics],
    onEvents: handleSorobanEvents,
  });

  const subscribeSorobanEvents = useCallback((listener: SorobanEventListener) => {
    sorobanListenersRef.current.add(listener);
    return () => {
      sorobanListenersRef.current.delete(listener);
    };
  }, []);

  // Dispatch global webhook events for incoming on-chain events
  useEffect(() => {
    if (!sorobanEvents.length) return;
    const latest = sorobanEvents[sorobanEvents.length - 1];
    try {
      dispatchWebhookEvent("web3:soroban-event", {
        type: latest.type,
        topics: latest.topic,
        ledger: latest.ledger,
      });
    } catch (err) {
      console.warn("Failed to dispatch Soroban webhook event:", err);
    }
  }, [sorobanEvents]);

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
    factoryContract,
    getCampaignContract,
    provider,
    signer,
    switchToStellarNetwork,
    sorobanEventStatus,
    sorobanEvents,
    subscribeSorobanEvents,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return ctx;
}
