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
  getSACAllowance,
  simulateSACApprove,
  approveSACDelegation,
  checkAllowanceBeforeTopUp,
  getCampaignStorageTTL,
  extendCampaignStorageTTL,
  signSEP0010Challenge,
  getTokenAllowanceQuery,
  refundCampaignEscrowContractCall,
} from "../lib/stellar";
import type {
  WalletType,
  SACSimulationFeedback,
  StorageTTLInfo,
  AllowanceCheckResult,
  SorobanInvokeResult,
} from "../lib/stellar";
import { topUpCampaignEscrowContractCall } from "../lib/escrowTopUp";
import { STELLAR_CONFIG, SAC_TOKENS, SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import type { SACTokenSymbol, SupportedEscrowAssetCode } from "../config/stellar";
import {
  registerUser,
  requestAuthChallenge,
  verifyAuthChallenge,
  getStoredSessionToken,
  clearSessionToken,
} from "../utils/api";
import { dispatchWebhookEvent } from "../lib/webhookEngine";
import { assertNotSanctioned } from "../lib/sanctions";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { SplitPlan } from "../lib/commissionSplit";
import type { AutoSwapConfig } from "../lib/sorobanDex";
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

  // SEP-0010 Stellar Web Authentication
  sessionToken: string | null;
  isAuthenticated: boolean;
  authenticateSession: (role?: string) => Promise<boolean>;

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
  topUpCampaignEscrow: (
    campaignId: number,
    amount: number,
    assetCode?: SupportedEscrowAssetCode | SACTokenSymbol,
  ) => Promise<{ success: boolean; txHash?: string; toppedUpAmount?: number }>;

  // SAC Token Allowance & TTL Management
  getAllowance: (tokenSymbol?: SACTokenSymbol) => Promise<bigint>;
  simulateApprove: (amount: number, tokenSymbol?: SACTokenSymbol) => Promise<SACSimulationFeedback>;
  checkTopUpAllowance: (
    amount: number,
    tokenSymbol?: SACTokenSymbol,
  ) => Promise<AllowanceCheckResult>;
  getStorageTTL: (contractId?: string) => Promise<StorageTTLInfo>;
  extendStorageTTL: (
    contractId?: string,
    extendBy?: number,
  ) => Promise<SorobanInvokeResult & { ttlInfo: StorageTTLInfo }>;

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
    tokenOrSpender?: string,
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<SorobanInvokeResult & { allowance?: number; simulationFeedback: SACSimulationFeedback }>;

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
  const [sessionToken, setSessionToken] = useState<string | null>(() => getStoredSessionToken());
  const isAuthenticated = Boolean(
    sessionToken && userAddress && getStoredSessionToken(userAddress) === sessionToken,
  );

  // Sync session token with userAddress so switching accounts does not reuse the previous wallet's token
  useEffect(() => {
    if (!userAddress) {
      setSessionToken(null);
    } else {
      setSessionToken(getStoredSessionToken(userAddress));
    }
  }, [userAddress]);

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

  // Approve token allowance on-chain (supporting SAC delegation and token approvals)
  const approveTokenAllowance = useCallback(
    async (
      amount: number,
      tokenOrSpender?: string,
      assetCode?: SupportedEscrowAssetCode,
    ): Promise<SorobanInvokeResult & { allowance?: number; simulationFeedback: SACSimulationFeedback }> => {
      if (!userAddress) throw new Error("Wallet not connected");

      const isTokenSym =
        Boolean(tokenOrSpender) &&
        (tokenOrSpender! in SAC_TOKENS || tokenOrSpender! in SUPPORTED_ESCROW_ASSETS) &&
        !assetCode;

      const resolvedTokenSymbol: SACTokenSymbol = isTokenSym
        ? (tokenOrSpender as SACTokenSymbol)
        : (assetCode as SACTokenSymbol) || "USDC";

      const resolvedSpender: string = isTokenSym
        ? STELLAR_CONFIG.contractId
        : tokenOrSpender || STELLAR_CONFIG.contractId;

      const isSupportedConnector =
        connectorType === "freighter" ||
        connectorType === "albedo" ||
        connectorType === "xbull" ||
        connectorType === "mock";

      if (!isSupportedConnector) {
        throw new Error(`Allowance approval is not supported for ${connectorType} wallets.`);
      }

      const token = SAC_TOKENS[resolvedTokenSymbol] || SAC_TOKENS.USDC;

      const res = await approveSACDelegation(
        userAddress,
        resolvedSpender,
        token.contractId,
        amount,
        undefined,
        resolvedTokenSymbol,
        connectorType || "freighter",
      );

      setTokenAllowance(amount);
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          `mock_allowance_${userAddress}_${resolvedSpender}`,
          amount.toString(),
        );
      }

      return {
        success: res.success,
        txHash: res.txHash,
        allowance: amount,
        simulationFeedback: res.simulationFeedback,
      };
    },
    [userAddress, connectorType],
  );

  // SEP-0010 Stellar Web Authentication
  const authenticateSession = async (role: string = "AFFILIATE"): Promise<boolean> => {
    if (!userAddress) return false;
    try {
      const challenge = await requestAuthChallenge(userAddress);
      const signedXdr = await signSEP0010Challenge(
        challenge.challengeXdr,
        connectorType || "freighter",
      );
      const authResult = await verifyAuthChallenge(userAddress, signedXdr, role);
      if (authResult.token) {
        setSessionToken(authResult.token);
        return true;
      }
    } catch (err) {
      console.warn("SEP-0010 authentication warning:", err);
    }
    return false;
  };

  // Sync with backend database & persistent role
  const syncUserWithBackend = useCallback(
    async (address: string, walletType: WalletType = "freighter") => {
      try {
        const challenge = await requestAuthChallenge(address);
        const signedXdr = await signSEP0010Challenge(challenge.challengeXdr, walletType);
        const authSession = await verifyAuthChallenge(address, signedXdr, "AFFILIATE");
        if (authSession?.token) {
          setSessionToken(authSession.token);
        }
        const savedUser = await registerUser(address);
        if (savedUser && savedUser.role) {
          setUserRole(savedUser.role);
        }
      } catch (err) {
        console.error("Error registering user with backend:", err);
      }
    },
    [],
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
      await syncUserWithBackend(address, type);
      setIsWalletModalOpen(false);
    } catch (error) {
      console.error("Wallet connection failed:", error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    clearSessionToken();
    setSessionToken(null);
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

  /**
   * Tops up a campaign's escrow balance on Soroban or mock sandbox, deducting token allowance.
   */
  const topUpCampaignEscrow = async (
    campaignId: number,
    amount: number,
    assetCode: SupportedEscrowAssetCode | SACTokenSymbol = "XLM",
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(
      `[Soroban] Topping up escrow for Campaign #${campaignId} by ${userAddress} with ${amount} ${assetCode}`,
    );

    if (connectorType === "freighter" || connectorType === "albedo" || connectorType === "xbull") {
      const res = await topUpCampaignEscrowContractCall(
        userAddress,
        campaignId,
        amount,
        connectorType,
        (assetCode as SupportedEscrowAssetCode) || "XLM",
      );
      setTimeout(() => {
        refreshBalance(userAddress);
        refreshTokenAllowance(undefined, assetCode as SupportedEscrowAssetCode);
      }, 1000);
      return res;
    } else {
      if (connectorType !== "mock") {
        throw new Error(`Escrow top-up is not supported for ${connectorType} wallets.`);
      }
      const mockTxHash = `tx_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
      setTokenAllowance((prev) => Math.max(0, prev - amount));
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(
          `mock_allowance_${userAddress}_${STELLAR_CONFIG.contractId}`,
        );
        if (stored) {
          const updated = Math.max(0, parseFloat(stored) - amount);
          window.localStorage.setItem(
            `mock_allowance_${userAddress}_${STELLAR_CONFIG.contractId}`,
            updated.toString(),
          );
        }
      }
      return {
        success: true,
        txHash: mockTxHash,
        toppedUpAmount: amount,
      };
    }
  };

  // Soroban: Automated Batch Commission Claim Dispatcher across Multiple Campaigns
  // (optionally routes the withdrawn total to auto-split vault destinations in the same envelope)
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
    splitPlan?: SplitPlan | null,
    autoSwap?: AutoSwapConfig | null,
  ) => {
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

  // SAC Token Allowance & TTL Management Implementation
  const getAllowance = useCallback(
    async (tokenSymbol: SACTokenSymbol = "USDC"): Promise<bigint> => {
      if (!userAddress) return BigInt(0);
      const token = SAC_TOKENS[tokenSymbol] || SAC_TOKENS.USDC;
      return await getSACAllowance(
        userAddress,
        STELLAR_CONFIG.contractId,
        token.contractId,
        connectorType || "freighter",
      );
    },
    [userAddress, connectorType],
  );

  const simulateApprove = useCallback(
    async (
      amount: number,
      tokenSymbol: SACTokenSymbol = "USDC",
    ): Promise<SACSimulationFeedback> => {
      const caller = userAddress || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
      const token = SAC_TOKENS[tokenSymbol] || SAC_TOKENS.USDC;
      return await simulateSACApprove(
        caller,
        STELLAR_CONFIG.contractId,
        token.contractId,
        amount,
        undefined,
        tokenSymbol,
      );
    },
    [userAddress],
  );

  const checkTopUpAllowance = useCallback(
    async (
      amount: number,
      tokenSymbol: SACTokenSymbol = "USDC",
    ): Promise<AllowanceCheckResult> => {
      if (!userAddress) throw new Error("Wallet not connected");
      return await checkAllowanceBeforeTopUp(
        userAddress,
        amount,
        tokenSymbol,
        STELLAR_CONFIG.contractId,
        connectorType || "freighter",
      );
    },
    [userAddress, connectorType],
  );

  const getStorageTTL = useCallback(
    async (contractId?: string): Promise<StorageTTLInfo> => {
      return await getCampaignStorageTTL(contractId || STELLAR_CONFIG.contractId);
    },
    [],
  );

  const extendStorageTTL = useCallback(
    async (
      contractId?: string,
      extendBy?: number,
    ): Promise<SorobanInvokeResult & { ttlInfo: StorageTTLInfo }> => {
      if (!userAddress) throw new Error("Wallet not connected");
      return await extendCampaignStorageTTL(
        userAddress,
        contractId || STELLAR_CONFIG.contractId,
        extendBy,
        connectorType || "freighter",
      );
    },
    [userAddress, connectorType],
  );

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
        sessionToken,
        isAuthenticated,
        authenticateSession,
        createCampaignOnChain,
        logSaleOnChain,
        claimPayoutOnChain,
        refundCampaignEscrow,
        getAllowance,
        simulateApprove,
        checkTopUpAllowance,
        topUpCampaignEscrow,
        getStorageTTL,
        extendStorageTTL,
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

export const DEFAULT_WEB3_CONTEXT: Web3ContextType = {
  userAddress: null,
  userRole: null,
  isConnected: false,
  isStellarNetwork: true,
  network: STELLAR_CONFIG.network,
  xlmBalance: "0.00",
  assetBalances: { XLM: "0.00", USDC: "0.00", EURC: "0.00" },
  connectorType: null,
  isWalletModalOpen: false,
  ledgerBipPath: "44'/148'/0'",
  setLedgerBipPath: () => {},
  openWalletModal: () => {},
  closeWalletModal: () => {},
  connectWallet: async () => {},
  disconnectWallet: () => {},
  updateUserRole: async () => {},
  requestFriendbotFunding: async () => false,
  refreshBalances: async () => {},
  approveAllowance: async () => ({ success: false }),
  sessionToken: null,
  isAuthenticated: false,
  authenticateSession: async () => false,
  createCampaignOnChain: async () => ({ success: false, campaignId: 0 }),
  logSaleOnChain: async () => ({ success: false }),
  claimPayoutOnChain: async () => ({ success: false }),
  refundCampaignEscrow: async () => ({ success: false }),
  topUpCampaignEscrow: async () => ({ success: false }),
  getAllowance: async () => BigInt(0),
  simulateApprove: async (): Promise<SACSimulationFeedback> => ({
    success: true,
    minResourceFee: "0.0001850 XLM",
    cpuInstructions: "1,450,200 / 100,000,000",
    memoryBytes: "210.5 KB / 40.0 MB",
    eventsCount: 1,
    spenderAddress: STELLAR_CONFIG.contractId,
    tokenContractId: SAC_TOKENS.USDC.contractId,
    amountAuthorized: "0.00 USDC",
    tokenSymbol: "USDC",
    liveUntilLedger: 1500000,
  }),
  checkTopUpAllowance: async (): Promise<AllowanceCheckResult> => ({
    isSufficient: true,
    currentAllowance: BigInt(1000000000),
    currentAllowanceFormatted: "100.00",
    requiredAmount: BigInt(0),
    requiredAmountFormatted: "0.00",
    tokenSymbol: "USDC",
    tokenContractId: SAC_TOKENS.USDC.contractId,
    spenderAddress: STELLAR_CONFIG.contractId,
  }),
  getStorageTTL: async (contractId?: string): Promise<StorageTTLInfo> => ({
    contractId: contractId || STELLAR_CONFIG.contractId,
    currentLedger: 1000000,
    liveUntilLedger: 1100000,
    remainingLedgers: 100000,
    estimatedHoursRemaining: 138.8,
    status: "healthy",
    threshold: 50000,
  }),
  extendStorageTTL: async (contractId?: string): Promise<SorobanInvokeResult & { ttlInfo: StorageTTLInfo }> => ({
    success: true,
    txHash: "0xmock_extend_tx",
    ttlInfo: {
      contractId: contractId || STELLAR_CONFIG.contractId,
      currentLedger: 1000000,
      liveUntilLedger: 1200000,
      remainingLedgers: 200000,
      estimatedHoursRemaining: 277.6,
      status: "healthy",
      threshold: 50000,
    },
  }),
  batchClaimPayoutsOnChain: async (): Promise<BatchClaimReceipt> => ({
    success: true,
    txHash: "0xmock_batch_claim_tx",
    totalClaimedXlm: 0,
    timestamp: Date.now(),
    itemizedClaims: [],
  }),
  registerPasskeyAccount: async (): Promise<PasskeyCredentialRecord> => ({
    credentialId: "mock_cred",
    publicKeySpki: "mock_spki",
    stellarAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    userName: "user",
    createdAt: Date.now(),
  }),
  tokenAllowance: 0,
  refreshTokenAllowance: async () => 0,
  approveTokenAllowance: async (): Promise<SorobanInvokeResult & { allowance?: number; simulationFeedback: SACSimulationFeedback }> => ({
    success: true,
    txHash: "0xmock_allowance_tx",
    simulationFeedback: {
      success: true,
      minResourceFee: "0.0001850 XLM",
      cpuInstructions: "1,450,200 / 100,000,000",
      memoryBytes: "210.5 KB / 40.0 MB",
      eventsCount: 1,
      spenderAddress: STELLAR_CONFIG.contractId,
      tokenContractId: SAC_TOKENS.USDC.contractId,
      amountAuthorized: "0.00 USDC",
      tokenSymbol: "USDC",
      liveUntilLedger: 1500000,
    },
  }),
  multiSigInfo: null,
  isMultiSigAccount: false,
  isMultiSigModalOpen: false,
  activeMultiSigXdr: null,
  activeMultiSigDescription: null,
  openMultiSigModal: () => {},
  closeMultiSigModal: () => {},
  refreshMultiSigInfo: async () => null,
  activeRpcEndpoint: rpcFallbackManager.getActiveEndpoint(),
  rpcEndpoints: rpcFallbackManager.getAllEndpoints(),
  rpcFailoverHistory: [],
  rpcTimeoutMs: 10000,
  isRpcModalOpen: false,
  openRpcModal: () => {},
  closeRpcModal: () => {},
  switchRpcEndpoint: () => {},
  simulateRpcFailover: () => {},
  checkRpcHealth: async () => {},
  addCustomRpcEndpoint: () => {},
  factoryContract: null,
  getCampaignContract: () => null,
  provider: null,
  signer: null,
  switchToStellarNetwork: async () => true,
};

export function useWeb3(): Web3ContextType {
  const context = useContext(Web3Context);
  return context ?? DEFAULT_WEB3_CONTEXT;
}
