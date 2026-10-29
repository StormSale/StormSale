import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
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
  getTransactionStatus,
} from "../lib/stellar";
import type { WalletType, TransactionPollStatus } from "../lib/stellar";
import { topUpCampaignEscrowContractCall } from "../lib/escrowTopUp";
import { STELLAR_CONFIG, SUPPORTED_ESCROW_ASSETS } from "../config/stellar";
import type { SupportedEscrowAssetCode } from "../config/stellar";
import { registerUser } from "../utils/api";
import { dispatchWebhookEvent } from "../lib/webhookEngine";
import { assertNotSanctioned } from "../lib/sanctions";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { SplitPlan } from "../lib/commissionSplit";
import type { AutoSwapConfig } from "../lib/sorobanDex";
import { isAffiliatePaused } from "../lib/fraudRiskEngine";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";
import { purgeOnLogout } from "../lib/storage";
import type { MultiSigAccountInfo } from "../lib/multisig";
import { inspectMultiSigAccount } from "../lib/multisig";
import {
  rpcFallbackManager,
  type RpcEndpointStatus,
  type RpcFailoverEvent,
} from "../lib/rpcFallback";
import { recordReferralSale } from "../lib/referralTree";
import type { TwoTierCommissionSplit } from "../types/referral";

// ----------------------------------------------------------------------------
// Adaptive Transaction Polling System
// ----------------------------------------------------------------------------
//
// Polling strategy:
//   attempt 1  ->  wait  500ms
//   attempt 2  ->  wait 1000ms  (500 * 2)
//   attempt 3  ->  wait 2000ms  (1000 * 2)
//   attempt 4  ->  wait 4000ms  (4000 * 2)
//   ... capped at 8000ms, total deadline 30s.
//
// On timeout the poller rejects with a retryable error and exposes a
// `retryTransactionPoll` helper so UI can prompt the user to retry.
// ----------------------------------------------------------------------------

export const POLL_BASE_DELAY_MS = 500;
export const POLL_MAX_DELAY_MS = 8000;
export const POLL_TIMEOUT_MS = 30000;
export const POLL_MAX_ATTEMPTS = 10;

export class TransactionPollTimeoutError extends Error {
  readonly txHash: string;
  readonly attempts: number;
  readonly retryable = true as const;

  constructor(txHash: string, attempts: number) {
    super(
      `Transaction ${txHash} did not confirm within ${POLL_TIMEOUT_MS / 1000}s. You can retry polling.`,
    );
    this.name = "TransactionPollTimeoutError";
    this.txHash = txHash;
    this.attempts = attempts;
  }
}

export function computeBackoffDelay(attempt: number): number {
  const raw = POLL_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(raw, POLL_MAX_DELAY_MS);
}

export interface PollTransactionOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  onAttempt?: (attempt: number, delayMs: number) => void;
}

export async function pollTransactionConfirmation(
  txHash: string,
  options: PollTransactionOptions = {},
): Promise<TransactionPollStatus> {
  const timeoutMs = options.timeoutMs ?? POLL_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? POLL_MAX_ATTEMPTS;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const status = await getTransactionStatus(txHash);
    if (status.status === "success" || status.status === "failed") {
      return status;
    }

    const delayMs = computeBackoffDelay(attempt);
    options.onAttempt?.(attempt, delayMs);

    if (Date.now() + delayMs >= deadline) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new TransactionPollTimeoutError(txHash, attempt);
}

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
    recruiterAddress?: string,
    commissionRatePercent?: number,
  ) => Promise<{ success: boolean; txHash?: string; split?: TwoTierCommissionSplit }>;

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
    assetCode?: SupportedEscrowAssetCode,
  ) => Promise<{ success: boolean; txHash?: string; toppedUpAmount?: number }>;

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
  ) => Promise<{ success: boolean; txHash?: string }>;

  // Adaptive transaction polling
  pollTransaction: (
    txHash: string,
    options?: PollTransactionOptions,
  ) => Promise<TransactionPollStatus>;
  retryTransactionPoll: (
    txHash: string,
    options?: PollTransactionOptions,
  ) => Promise<TransactionPollStatus>;
  pollingStatus: TransactionPollStatus | null;
  pollingTxHash: string | null;
  pollingError: string | null;
  clearPollingError: () => void;

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

export const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function useSafeWeb3(): Web3ContextType | undefined {
  return useContext(Web3Context);
}

export function Web3Provider({
  children,
  overrideAddress,
  initialUserAddress,
}: {
  children: ReactNode;
  overrideAddress?: string | null;
  initialUserAddress?: string | null;
}) {
  const [userAddress, setUserAddress] = useState<string | null>(
    overrideAddress ?? initialUserAddress ?? null,
  );
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(Boolean(overrideAddress ?? initialUserAddress));
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

  // Adaptive polling state
  const [pollingStatus, setPollingStatus] = useState<TransactionPollStatus | null>(null);
  const [pollingTxHash, setPollingTxHash] = useState<string | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const pollAbortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const clearPollingError = useCallback(() => setPollingError(null), []);

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
