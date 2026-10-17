import { createContext, useContext, useState, useCallback } from "react";
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
  getSACAllowance,
  simulateSACApprove,
  approveSACDelegation,
  checkAllowanceBeforeTopUp,
  topUpCampaignEscrowContractCall,
  getCampaignStorageTTL,
  extendCampaignStorageTTL,
  signSEP0010Challenge,
} from "../lib/stellar";
import type {
  WalletType,
  SACSimulationFeedback,
  StorageTTLInfo,
  AllowanceCheckResult,
  SorobanInvokeResult,
} from "../lib/stellar";
import { STELLAR_CONFIG, SAC_TOKENS } from "../config/stellar";
import type { SACTokenSymbol } from "../config/stellar";
import {
  registerUser,
  requestAuthChallenge,
  verifyAuthChallenge,
  getStoredSessionToken,
  clearSessionToken,
} from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";

export interface Web3ContextType {
  userAddress: string | null;
  userRole: string | null;
  isConnected: boolean;
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

  // SEP-0010 Stellar Web Authentication
  sessionToken: string | null;
  isAuthenticated: boolean;
  authenticateSession: (role?: string) => Promise<boolean>;

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

  // SAC Token Allowance & TTL Management
  getAllowance: (tokenSymbol?: SACTokenSymbol) => Promise<bigint>;
  simulateApprove: (amount: number, tokenSymbol?: SACTokenSymbol) => Promise<SACSimulationFeedback>;
  approveTokenAllowance: (
    amount: number,
    tokenSymbol?: SACTokenSymbol,
  ) => Promise<SorobanInvokeResult & { simulationFeedback: SACSimulationFeedback }>;
  checkTopUpAllowance: (
    amount: number,
    tokenSymbol?: SACTokenSymbol,
  ) => Promise<AllowanceCheckResult>;
  topUpCampaignEscrow: (
    campaignId: number,
    amount: number,
    tokenSymbol?: SACTokenSymbol,
  ) => Promise<SorobanInvokeResult>;
  getStorageTTL: (contractId?: string) => Promise<StorageTTLInfo>;
  extendStorageTTL: (
    contractId?: string,
    extendBy?: number,
  ) => Promise<SorobanInvokeResult & { ttlInfo: StorageTTLInfo }>;

  batchClaimPayoutsOnChain: (campaigns: ClaimableCampaignItem[]) => Promise<BatchClaimReceipt>;

  registerPasskeyAccount: (userName?: string) => Promise<PasskeyCredentialRecord>;

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
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(() => getStoredSessionToken());
  const isAuthenticated = Boolean(sessionToken && userAddress);

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

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);

      if (type !== "mock") {
        await refreshBalance(address);
      }
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
  const getAllowance = async (tokenSymbol: SACTokenSymbol = "USDC"): Promise<bigint> => {
    if (!userAddress) return BigInt(0);
    const token = SAC_TOKENS[tokenSymbol] || SAC_TOKENS.USDC;
    return await getSACAllowance(
      userAddress,
      STELLAR_CONFIG.contractId,
      token.contractId,
      connectorType || "freighter",
    );
  };

  const simulateApprove = async (
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
  };

  const approveTokenAllowance = async (
    amount: number,
    tokenSymbol: SACTokenSymbol = "USDC",
  ): Promise<SorobanInvokeResult & { simulationFeedback: SACSimulationFeedback }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const token = SAC_TOKENS[tokenSymbol] || SAC_TOKENS.USDC;
    return await approveSACDelegation(
      userAddress,
      STELLAR_CONFIG.contractId,
      token.contractId,
      amount,
      undefined,
      tokenSymbol,
      connectorType || "freighter",
    );
  };

  const checkTopUpAllowance = async (
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
  };

  const topUpCampaignEscrow = async (
    campaignId: number,
    amount: number,
    tokenSymbol: SACTokenSymbol = "USDC",
  ): Promise<SorobanInvokeResult> => {
    if (!userAddress) throw new Error("Wallet not connected");
    return await topUpCampaignEscrowContractCall(
      userAddress,
      campaignId,
      amount,
      tokenSymbol,
      connectorType || "freighter",
    );
  };

  const getStorageTTL = async (contractId?: string): Promise<StorageTTLInfo> => {
    return await getCampaignStorageTTL(contractId || STELLAR_CONFIG.contractId);
  };

  const extendStorageTTL = async (
    contractId?: string,
    extendBy?: number,
  ): Promise<SorobanInvokeResult & { ttlInfo: StorageTTLInfo }> => {
    const caller = userAddress || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    return await extendCampaignStorageTTL(
      caller,
      contractId || STELLAR_CONFIG.contractId,
      extendBy,
      connectorType || "freighter",
    );
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
        sessionToken,
        isAuthenticated,
        authenticateSession,
        createCampaignOnChain,
        logSaleOnChain,
        claimPayoutOnChain,
        getAllowance,
        simulateApprove,
        approveTokenAllowance,
        checkTopUpAllowance,
        topUpCampaignEscrow,
        getStorageTTL,
        extendStorageTTL,
        batchClaimPayoutsOnChain,
        registerPasskeyAccount,
        factoryContract,
        getCampaignContract,
        provider: null,
        signer: null,
        switchToStellarNetwork,
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
