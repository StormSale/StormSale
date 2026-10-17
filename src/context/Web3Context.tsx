import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXbullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXmlBalance,
  fundTestnetAccount,
  createCampaignContractCall,
  logSaleContractCall,
  claimPayoutContractCall,
  refundCampaignEscrowContractCall,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";
import type { ClaimableCampaignItem, BatchClaimReceipt } from "../lib/batchClaim";
import type { PasskeyCredentialRecord } from "../lib/passkeySigner";

export type EventStreamStatus = "connected" | "polling" | "reconnecting" | "idle";

export interface SorobanEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  contractId: string;
  value: unknown;
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
  eventStreamStatus: EventStreamStatus;
  lastEvent: SorobanEvent | null;
  recentEvents: SorobanEvent[];
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

  // Soroban Smart Contract Operations
  createCampaignOnChain: (
    name: string,
    budgetXml: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ) => Promise<{ success: boolean; campaignId: number; txHash?: string }>;

  logSaleOnChain: (
    campaignId: number,
    affiliateAddress: string,
    amountXml: number,
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

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [eventStreamStatus, setEventStreamStatus] = useState<EventStreamStatus>("idle");
  const [lastEvent, setLastEvent] = useState<SorobanEvent | null>(null);
  const [recentEvents, setRecentEvents] = useState<SorobanEvent[]>([]);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);

  // Refresh balance whenever userAddress changes
  const refreshBalance = useCallback(async (address: string) => {
    try {
      const bal = await fetchXmlBalance(address);
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

  // Real-time Soroban RPC event streaming with exponential backoff & tab-blur throttling
  const eventCursorRef = useRef<string | null>(null);
  const eventStreamActiveRef = useRef<boolean>(false);
  const eventStreamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventStreamBackoffRef = useRef<number>(1000);
  const eventStreamAbortRef = useRef<AbortController | null>(null);

  const EVENT_TOPICS = ["create_campaign", "log_sale", "claim_payout"] as const;
  const MIN_POLL_INTERVAL_MS = 1000;
  const MAX_POLL_INTERVAL_MS = 30000;
  const BLURRED_POLL_INTERVAL_MS = 30000;

  const dispatchEventNotification = useCallback((event: SorobanEvent) => {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent("soroban:event", {
          detail: event,
        }),
      );
      window.dispatchEvent(
        new CustomEvent("soroban:invalidate", {
          detail: { topic: event.topic, eventId: event.id },
        }),
      );
    } catch (err) {
      console.warn("Failed to dispatch Soroban event:", err);
    }
  }, []);

  const pollSorobanEvents = useCallback(async () => {
    if (!eventStreamActiveRef.current) return;

    const isBlurred =
      typeof document !== "undefined" && document.visibilityState === "hidden";

    try {
      setEventStreamStatus((prev) => (prev === "idle" ? "polling" : prev));

      const { getEvents } = await import("../lib/stellar");
      const response = await getEvents({
        topics: [...EVENT_TOPICS],
        cursor: eventCursorRef.current || undefined,
        signal: eventStreamAbortRef.current?.signal,
      });

      const events: SorobanEvent[] = Array.isArray(response?.events)
        ? response.events.map((raw: any) => ({
            id: String(raw.id ?? raw.pagingToken ?? `${Date.now()}-${Math.random()}`),
            topic: String(raw.topic ?? raw.topics?.[0] ?? "unknown"),
            ledger: Number(raw.ledger ?? 0),
            txHash: String(raw.txHash ?? raw.tx_hash ?? ""),
            contractId: String(raw.contractId ?? raw.contract_id ?? ""),
            value: raw.value ?? null,
            receivedAt: Date.now(),
          }))
        : [];

      if (response?.cursor) {
        eventCursorRef.current = String(response.cursor);
      } else if (events.length > 0) {
        eventCursorRef.current = events[events.length - 1].id;
      }

      if (events.length > 0) {
        setRecentEvents((prev) => [...events, ...prev].slice(0, 50));
        setLastEvent(events[events.length - 1]);
        events.forEach(dispatchEventNotification);
      }

      eventStreamBackoffRef.current = MIN_POLL_INTERVAL_MS;
      setEventStreamStatus("connected");
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
      console.warn("Soroban event polling failed:", err);
      setEventStreamStatus("reconnecting");
      eventStreamBackoffRef.current = Math.min(
        eventStreamBackoffRef.current * 2,
        MAX_POLL_INTERVAL_MS,
      );
    }

    if (!eventStreamActiveRef.current) return;

    const nextDelay = isBlurred
      ? Math.max(BLURRED_POLL_INTERVAL_MS, eventStreamBackoffRef.current)
      : eventStreamBackoffRef.current;

    eventStreamTimerRef.current = setTimeout(() => {
      void pollSorobanEvents();
    }, nextDelay);
  }, [dispatchEventNotification]);

  useEffect(() => {
    if (!isConnected || !userAddress) {
      eventStreamActiveRef.current = false;
      if (eventStreamTimerRef.current) {
        clearTimeout(eventStreamTimerRef.current);
        eventStreamTimerRef.current = null;
      }
      eventStreamAbortRef.current?.abort();
      eventStreamAbortRef.current = null;
      eventCursorRef.current = null;
      eventStreamBackoffRef.current = MIN_POLL_INTERVAL_MS;
      setEventStreamStatus("idle");
      return;
    }

    eventStreamActiveRef.current = true;
    eventStreamBackoffRef.current = MIN_POLL_INTERVAL_MS;
    eventStreamAbortRef.current = new AbortController();
    setEventStreamStatus("polling");

    void pollSorobanEvents();

    const handleVisibility = () => {
      if (!eventStreamActiveRef.current) return;
      if (document.visibilityState === "visible") {
        eventStreamBackoffRef.current = MIN_POLL_INTERVAL_MS;
        if (eventStreamTimerRef.current) {
          clearTimeout(eventStreamTimerRef.current);
          eventStreamTimerRef.current = null;
        }
        void pollSorobanEvents();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      eventStreamActiveRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (eventStreamTimerRef.current) {
        clearTimeout(eventStreamTimerRef.current);
        eventStreamTimerRef.current = null;
      }
      eventStreamAbortRef.current?.abort();
      eventStreamAbortRef.current = null;
    };
  }, [isConnected, userAddress, pollSorobanEvents]);

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
    setXLmBalance("0.00");
  };

  const updateUserRole = async (role: string) => {
    setUserRole(role);
  };

  const requestFriendbotFunding = async (): Promise<boolean> => {
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
    budgetXml: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return createCampaignContractCall(
      userAddress,
      name,
      budgetXml,
      commissionRatePercent,
      clearingPeriodSecs,
    );
  };

  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXml: number,
  ) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return logSaleContractCall(userAddress, campaignId, affiliateAddress, amountXml);
  };

  const claimPayoutOnChain = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return claimPayoutContractCall(userAddress, campaignId);
  };

  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");
    return refundCampaignEscrowContractCall(userAddress, campaignId);
  };

  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const { batchClaimPayouts } = await import("../lib/batchClaim");
    return batchClaimPayouts(userAddress, campaigns);
  };

  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  };

  const switchToStellarNetwork = async () => {
    try {
      const net = await getCurrentNetwork();
      setNetwork(net);
      return true;
    } catch {
      return false;
    }
  };

  const value: Web3ContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: network === "TESTNET" || network === "PUBLIC",
    network,
    xlmBalance,
    connectorType,
    isWalletModalOpen,
    ledgerBipPath,
    eventStreamStatus,
    lastEvent,
    recentEvents,
    setLedgerBipPath,
    openWalletModal,
    closeWalletModal,
    connectWallet,
    disconnectWallet,
    updateUserRole,
    requestFriendbotFunding,
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

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3Context() {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3Context must be used within a Web3Provider");
  return ctx;
}
