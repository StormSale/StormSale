import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXBullWallet,
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
  buildSep0007TxUri,
  waitForTransactionInclusion,
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
  ) => Promise<{ success: boolean; tyHash?: string }>;

  // SEP-0007 Mobile Wallet Invocations
  sep0007Uri: string | null;
  sep0007IsPolling: boolean;
  sep0007TxHash: string | null;
  sep0007Error: string | null;
  invokeSep0007MobileWallet: (xdr: string) => Promise<string>;
  pollSep0007Confirmation: (txHash: string) => Promise<boolean>;
  resetSep0007State: () => void;

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
  const [sep0007Uri, setSep0007Uri] = useState<string | null>(null);
  const [sep0007IsPolling, setSep0007IsPolling] = useState(false);
  const [sep0007TxHash, setSep0007TxHash] = useState<string | null>(null);
  const [sep0007Error, setSep0007Error] = useState<string | null>(null);

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

  // Sync with backend database & persistent role
  const syncUserWithBackend = useCallback(async (address: string) => {
    try {
      const savedUser = await registerUser(address);
      if (savedUser && savedUser.role) {
        setUserRole(savedUser.role);
      }
    } catch (err) {
      console.error("Error registering user with backend:", error);
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
          address = authResult.record.stellarAddress;
        }
        setNetwork(STELLAR_CONFIG.network);
      } else if (type === "readonly") {
        if (!customAddress) throw new Error("Please provide a valid Stellar address.");
        address = customAddress;
        setNetwork(STELLAR_CONFIG.network);
      } else {
        // Mock fallback demo account with 10,000 XLM
        address = "GATORMSALE7TESTNET7AAFILIATE7MERCHANT7ESCROW7XLM77777";
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
    setSep0007Uri(null);
    setSep0007IsPolling(false);
    setSep0007TxHash(null);
    setSep0007Error(null);
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

  // SEP-0007 Mobile Wallet Invocation
  const invokeSep0007MobileWallet = useCallback(async (xdr: string): Promise<string> => {
    if (!xdr) throw new Error("Missing transaction XDR for SEP-0007 invocation.");
    setSep0007Error(null);
    setSep0007TxHash(null);
    setSep0007IsPolling(false);
    const uri = buildSep0007TxUri(xdr, { replace: false });
    setSep0007Uri(uri);
    try {
      if (typeof window !== "undefined") {
        window.location.href = uri;
      }
      return uri;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown SEP-0007 invocation error";
      setSep0007Error(msg);
      throw err;
    }
  }, []);

  const pollSep0007Confirmation = useCallback(
    async (txHash: string): Promise<boolean> => {
      if (!txHash) throw new Error("Missing transaction hash to poll.");
      setSep0007IsPolling(true);
      setSep0007Error(null);
      try {
        const confirmed = await waitForTransactionInclusion(txHash);
        if (confirmed) {
          setSep0007TxHash(txHash);
          setSep0007IsPolling(false);
          if (userAddress) {
            await refreshBalance(userAddress);
          }
          return true;
        }
        setSep0007IsPolling(false);
        return false;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to confirm transaction on Stellar ledger";
        setSep0007Error(msg);
        setSep0007IsPolling(false);
        throw err;
      }
    },
    [userAddress, refreshBalance],
  );

  const resetSep0007State = useCallback(() => {
    setSep0007Uri(null);
    setSep0007IsPolling(false);
    setSep0007TxHash(null);
    setSep0007Error(null);
  }, []);

  // Soroban: Create Campaign Escrow
  const createCampaignOnChain = async (
    name: string,
    budgetAmount: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
    assetCode: SupportedEscrowAssetCode = "XLM",
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(
      `[Soroban] Creating campaign "${name}": Budget=${budgetAmount} ${assetCode}, Rate=${commissionRatePercent}%, Clearing=${clearingPeriodSecs}s`,
    );

    // Escrow locking interacts with corresponding Stellar Asset Contract:
    // If deployed contract addresses are configured, the call is forwarded to the
    // on-chain factory; otherwise the local demo campaign IDs are used.
    const factoryAddress = (STELLAR_CONFIG as unknown as { factoryContractAddress?: string })
      .factoryContractAddress;
    if (factoryAddress && connectorType && connectorType !== "mock") {
      const res = await createCampaignContractCall(
        userAddress,
        factoryAddress,
        name,
        budgetAmount,
        commissionRatePercent,
        clearingPeriodSecs,
        connectorType,
        assetCode,
      );
      void dispatchWebhookEvent("campaign.created", {
        campaignId: res.campaignId,
        tyHash: res.tyHash,
        address: userAddress,
        asset: assetCode,
      });
      return { success: true, campaignId: res.campaignId, txHash: res.tyHash, asset: assetCode };
    }

    const campaignId = Date.now();
    void dispatchWebhookEvent("campaign.created", {
      campaignId,
      address: userAddress,
      asset: assetCode,
    });
    return { success: true, campaignId, asset: assetCode };
  };

  // Soroban: Log Affiliate Sale
  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    const campaignAddress = getCampaignContractAddress(campaignId);
    if (campaignAddress && connectorType && connectorType !== "mock") {
      const res = await logSaleContractCall(
        userAddress,
        campaignAddress,
        campaignId,
        affiliateAddress,
        amountXlm,
        connectorType,
      );
      void dispatchWebhookEvent("sale.logged", {
        campaignId,
        affiliateAddress: affiliateAddress,
        amountXlm,
        txHash: res.txHash,
      });
      return { success: true, txHash: res.txHash };
    }
    void dispatchWebhookEvent("sale.logged", {
      campaignId,
      affiliateAddress: affiliateAddress,
      amountXlm,
    });
    return { success: true };
  };

  // Soroban: Claim Affiliate Payout
  const claimPayoutOnChain = async (
    campaignId: number,
    assetCode: SupportedEscrowAssetCode = "XLM",
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    const campaignAddress = getCampaignContractAddress(campaignId);
    if (campaignAddress && connectorType && connectorType !== "mock") {
      const res = await claimPayoutContractCall(
        userAddress,
        campaignAddress,
        campaignId,
        connectorType,
        assetCode,
      );
      void dispatchWebhookEvent("payout.claimed", {
        campaignId,
        address: userAddress,
        txHash: res.txHash,
        asset: assetCode,
      });
      return { success: true, txHash: res.tyHash, asset: assetCode };
    }
    void dispatchWebhookEvent("payout.claimed", {
      campaignId,
      address: userAddress,
      asset: assetCode,
    });
    return { success: true, asset: assetCode };
  };

  // Soroban: Refund Escrow (after clearing period)
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");
    const campaignAddress = getCampaignContractAddress(campaignId);
    if (campaignAddress && connectorType && connectorType !== "mock") {
      const res = await refundCampaignEscrowContractCall(
        userAddress,
        campaignAddress,
        campaignId,
        connectorType,
      );
      void dispatchWebhookEvent("campaign.refunded", {
        campaignId,
        address: userAddress,
        txHash: res.txHash,
      });
      return { success: true, txHash: res.txHash };
    }
    void dispatchWebhookEvent("campaign.refunded", {
      campaignId,
      address: userAddress,
    });
    return { success: true };
  };

  // Soroban: Batch Claim Payouts
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
    splitPlan: SplitPlan | null = null,
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const { executeBatchClaim } = await import("../lib/batchClaim");
    const receipt = await executeBatchClaim({
      walletAddress: userAddress,
      connectorType: connectorType || "freighter",
      campaigns,
      splitPlan,
      getCampaignContractAddress,
    });
    if (receipt.success) {
      await refreshBalance(userAddress);
    }
    return receipt;
  };

  // Passkey: Register Smart Wallet
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    const record = await registerPasskey(userName || "Affiliate User");
    setUserAddress(record.stellarAddress);
    setIsConnected(true);
    setConnectorType("passkey");
    setNetwork(STELLAR_CONFIG.network);
    await refreshBalance(record.stellarAddress);
    await syncUserWithBackend(record.stellarAddress);
    return record;
  };

  // Compatibility helpers for legacy form callers
  const factoryContract = (STELLAR_CONFIG as unknown as { factoryContractAddress?: string })
    .factoryContractAddress;
  const getCampaignContract = (address: string) => address;
  const switchToStellarNetwork = async () => true;

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: true,
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
    sep0007Uri,
    sep0007IsPolling,
    sep0007TxHash,
    sep0007Error,
    invokeSep0007MobileWallet,
    pollSep0007Confirmation,
    resetSep0007State,
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
