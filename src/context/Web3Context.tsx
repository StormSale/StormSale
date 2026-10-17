import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXbullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXimBalance,
  fundTestnetAccount,
  createCampaignContractCall,
  logSaleContractCall,
  claimPayoutContractCall,
  refundCampaignEscrowContractCall,
  getSorobanServer,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";

export type SorobanConnectionStatus = "Connected" | "Polling" | "Reconnecting";

export interface SorobanEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  contractId: string;
  values?: unknown;
  receivedAt: number;
}

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

  // Real-time Soroban event stream
  sorobanConnectionStatus: SorobanConnectionStatus;
  lastSorobanEvent: SorobanEvent | null;
  sorobanEvents: SorobanEvent[];
  subscribeToSorobanEvents: (handler: (event: SorobanEvent) => void) => () => void;

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
  refundCampaignEscrow: (campaignId: number) => Promise<{ success: boolean; txHash?: string }>;

  batchClaimPayoutsOnChain: (campaigns: ClaimableCampaignItem[]) => Promise<BatchClaimReceipt>;

  registerPasskeyAccount: (userName?: string) => Promise<PasskeyCredentialRecord>;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const WEBC_CONTEXT = createContext<Web3ContextType | undefined>(undefined);

const SOROBAN_TOPICS = ["create_campaign", "log_sale", "claim_payout"] as const;
const POLL_INTERVAL_ACTIVE_MS = 5_000;
const POLL_INTERVAL_BLURRED_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;
const EVENT_CACHE_LIMIT = 100;

function toStringTopic(topic: unknown): string {
  if (typeof topic === "string") return topic;
  if (topic && typeof topic === "object") {
    const candidate = topic as { toString?: () => string; value?: () => unknown };
    if (typeof candidate.toString === "function") {
      try {
        const s = candidate.toString();
        if (s && s !== "[object Object]") return s;
      } catch {
        // ignore and fall through
      }
    }
  }
  return String(topic);
}

function toStringTopicSafe(topic: unknown): string {
  try {
    return toStringTopic(topic);
  } catch {
    return "";
  }
}

function matchesTopicFilter(topics: unknown[], filter: string): boolean {
  return topics.some((t) => {
    const s = toStringTopicSafe(t);
    return s === filter || s.includes(filter);
  });
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148'0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Real-time Soroban event stream state
  const [sorobanConnectionStatus, setSorobanConnectionStatus] =
    useState<SorobanConnectionStatus>("Polling");
  const [lastSorobanEvent, setLastSorobanEvent] = useState<SorobanEvent | null>(null);
  const [sorobanEvents, setSorobanEvents] = useState<SorobanEvent[]>([]);

  const subscribersRef = useRef<Set<(event: SorobanEvent) => void>>(new Set());
  const cursorRef = useRef({ lastLedger: 0 });
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const backoffMsRef = useRef(INITIAL_BACKOFF_MS);
  const isBlurredRef = useRef(typeof document !== "undefined" && document.hidden);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const abortRef = useRef(false);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXimBalance(address);
      setXlmBalance(bal);
    } catch (err) {
      console.warn("Could not fetch balance:", err);
    }
  }, []);

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

      setUserAddress(address);
      setIsConnected(true);
      setConnectorType(type);

      if (type !== "mock") {
        await refreshBalance(address);
      }
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

  // Real-time Soroban event subscription (consumed by HUD/toast layers)
  const subscribeToSorobanEvents = useCallback((handler: (event: SorobanEvent) => void) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  const dispatchEvent = useCallback((event: SorobanEvent) => {
    setLastSorobanEvent(event);
    setSorobanEvents((prev) => {
      const next = [event, ...prev];
      return next.length > EVENT_CACHE_LIMIT ? next.slice(0, EVENT_CACHE_LIMIT) : next;
    });
    subscribersRef.current.forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        console.error("Soroban event subscriber failed:", err);
      }
    });
  }, []);

  // Exponential backoff polling worker using server.getEvents()
  useEffect(() => {
    if (typeof window === "undefined") return;

    const contractId = STELLAR_CONFIG.contractId || "";
    if (!contractId) {
      setSorobanConnectionStatus("Polling");
      return;
    }

    abortRef.current = false;
    runningRef.current = true;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleNext = (delayMs: number) => {
      clearTimer();
      if (abortRef.current) return;
      timerRef.current = setTimeout(() => {
        void poll();
      }, delayMs);
    };

    const poll = async (): Promise<void> => {
      if (abortRef.current) return;
      try {
        const server = getSorobanServer();
        const response = await server.getEvents({
          filters: [
            {
              type: "contract",
              contractIds: [contractId],
              topics: [SOROBAN_TOPICS.map((t) => [t]) as any],
            },
          ],
          startLedger: cursorRef.current.lastLedger || undefined,
          limit: 50,
        });

        const rawEvents = (response as { events?: any[] }).events || [];
        for (const raw of rawEvents as any[]) {
          const id = String(
            raw.id || `${raw.txHash}-${raw.ledger}-${raw.type}${JSON.stringify(raw.topic || [])}`,
          );
          if (seenEventIdsRef.current.has(id)) continue;
          seenEventIdsRef.current.add(id);
          if (seenEventIdsRef.current.size > EVENT_CACHE_LIMIT * 2) {
            const iter = seenEventIdsRef.current.values();
            const trimToLimit = EVENT_CACHE_LIMIT;
            while (seenEventIdsRef.current.size > trimToLimit) {
              const next = iter.next();
              if (next.done) break;
              seenEventIdsRef.current.delete(next.value);
            }
          }

          const topics = Array.isArray(raw.topic) ? raw.topic : [];
          const matched = SOROBAN_TOPICS.find((t) => matchesTopicFilter(topics, t));
          if (!matched) continue;

          const event: SorobanEvent = {
            id,
            topic: matched,
            ledger: Number(raw.ledger || 0),
            txHash: String(raw.txHash || ""),
            contractId: String(raw.contractId || contractId),
            values: raw.value,
            receivedAt: Date.now(),
          };
          dispatchEvent(event);
        }

        const latestLedger = Number((response as { latestLedger?: number }).latestLedger || 0);
        if (latestLedger > cursorRef.current.lastLedger) {
          cursorRef.current.lastLedger = latestLedger;
        }

        setSorobanConnectionStatus("Connected");
        backoffMsRef.current = INITIAL_BACKOFF_MS;
        const delay = isBlurredRef.current
          ? POLL_INTERVAL_BLURRED_MS
          : POLL_INTERVAL_ACTIVE_MS;
        scheduleNext(delay);
      } catch (err) {
        console.warn("Soroban event poll failed, retrying with backoff:", err);
        setSorobanConnectionStatus("Reconnecting");
        const nextBackoff = Math.min(backoffMsref.current * 2, MAX_BACKOFF_MS);
        backoffMsref.current = nextBackoff;
        const effectiveDelay = isBlurredRef.current
          ? Math.max(nextBackoff, POLL_INTERVAL_BLURRED_MS)
          : nextBackoff;
        scheduleNext(Math.min(effectiveDelay, MAX_BACKOFF_MS));
      }
    };

    const handleVisibility = () => {
      isBlurredRef.current = document.hidden;
      if (!document.hidden) {
        // Resume immediately when tab regains focus
        backoffMsRef.current = INITIAL_BACKOFF_MS;
        clearTimer();
        void poll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    // Kick off the polling loop
    void poll();

    return () => {
      abortRef.current = true;
      runningRef.current = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [dispatchEvent]);

  // Soroban Smart Contract Operations
  const createCampaignOnChain = async (
    name: string,
    budgetXlm: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ): Promise<{ success: boolean; campaignId: number; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const result = await createCampaignContractCall({
      address: userAddress,
      name,
      budgetXlm,
      commissionRatePercent,
      clearingPeriodSecs,
    });
    return {
      success: true,
      campaignId: result.campaignId,
      txHash: result.txHash,
    };
  };

  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXlm: number,
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const result = await logSaleContractCall({
      address: userAddress,
      campaignId,
      affiliateAddress,
      amountXlm,
    });
    return { success: true, txHash: result.txHash };
  };

  const claimPayoutOnChain = async (
    campaignId: number,
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const result = await claimPayoutContractCall({
      address: userAddress,
      campaignId,
    });
    return { success: true, txHash: result.txHash };
  };

  const refundCampaignEscrow = async (
    campaignId: number,
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const result = await refundCampaignEscrowContractCall({
      address: userAddress,
      campaignId,
    });
    return { success: true, txHash: result.txHash };
  };

  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const { batchClaimPayouts } = await import("../lib/batchClaim");
    return batchClaimPayouts(userAddress, campaigns);
  };

  const registerPasskeyAccount = async (
    userName?: string,
  ): Promise<PasskeyCredentialRecord> => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  };

  const switchToStellarNetwork = async (): Promise<boolean> => {
    try {
      const current = await getCurrentNetwork();
      setNetwork(current);
      return current === STELLAR_CONFIG.network;
    } catch (err) {
      console.error("Failed to switch Stellar worker network:", err);
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
    sorobanConnectionStatus,
    lastSorobanEvent,
    sorobanEvents,
    subscribeToSorobanEvents,
    createCampaignOnChain,
    logSaleOnChain,
    claimPayoutOnChain,
    refundCampaignEscrow,
    batchClaimPayoutsOnChain,
    registerPasskeyAccount,
    factoryContract: null,
    getCampaignContract: () => null,
    provider: null,
    signer: null,
    switchToStellarNetwork,
  };

  return <WEBC_CONTEXT.Provider value={value}>{children}</WEBC_CONTEXT.Provider>;
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(WEBC_CONTEXT);
  if (!ctx) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return ctx;
}
