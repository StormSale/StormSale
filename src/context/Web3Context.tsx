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

export type SorobanConnectionStatus = "Connected" | "Polling" | "Reconnecting" | "Disconnected";

export interface SorobanEventPayload {
  topic: string;
  contractId: string;
  txHash: string;
  ledger: number;
  values: unknown[];
  rawEvent: unknown;
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

  // Soroban real-time event streaming
  sorobanStatus: SorobanConnectionStatus;
  lastSorobanEvent: SorobanEventPayload | null;
  sorobanEventCount: number;
  sorobanPollIntervalMs: number;
  subscribeToSorobanEvents: (
    handler: (event: SorobanEventPayload) => void,
  ) => (() => void);

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

const SOROBAN_TOPICS = ["create_campaign", "log_sale", "claim_payout"] as const;
const BASE_POLL_INTERVAL_MS = 5000;
const MAX_POLL_INTERVAL_MS = 30000;
const MAX_BACKOFF_MS = 30000;
const PAGE_SIZE = 25;

function toTopicString(topic: unknown): string | null {
  if (typeof topic === "string") return topic;
  if (topic && typeof topic === "object") {
    const cast = topic as { switch?: { value?: unknown }; value?: unknown };
    if (cast.switch && cast.switch.value !== undefined) {
      return String(cast.switch.value);
    }
    if (cast.value !== undefined) return String(cast.value);
  }
  return null;
}

function extractEventPayload(event: any): SorobanEventPayload | null {
  if (!event) return null;
  const topics: unknown[] = Array.isArray(event.topic) ? event.topic : [];
  const matchedTopic = topics.map(toTopicString).find((t) => t && SOROBAN_TOPICS.includes(t as any));
  if (!matchedTopic) return null;
  const values: unknown[] = Array.isArray(event.value) ? event.value : [];
  return {
    topic: matchedTopic,
    contractId: String(event.contractId ?? ""),
    txHash: String(event.txHash ?? ""),
    ledger: Number(event.ledger ?? 0),
    values,
    rawEvent: event,
  };
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [ledgerBipPath, setLedgerBipPath] = useState<string>("44'/148/0'");
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const [sorobanStatus, setSorobanStatus] = useState<SorobanConnectionStatus>("Disconnected");
  const [lastSorobanEvent, setLastSorobanEvent] = useState<SorobanEventPayload | null>(null);
  const [sorobanEventCount, setSorobanEventCount] = useState(0);
  const [sorobanPollIntervalMs, setSorobanPollIntervalMs] = useState(BASE_POLL_INTERVAL_MS);

  const eventListenersRef = useRef<Set<(event: SorobanEventPayload) => void>>(new Set());
  const cursorRef = useRef<string | null>(null);
  const backoffRef = useRef(BASE_POLL_INTERVAL_MS);
  const blurredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const inFlightRef = useRef(false);

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

    console.log(`[Soroban] Claiming payout for Campaign #${campaignId}`);

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

  // Soroban: Refund Expired Campaign Escrow
  const refundCampaignEscrow = async (campaignId: number) => {
    if (!userAddress) throw new Error("Wallet not connected");

    console.log(`[Soroban] Refunding Campaign #${campaignId}`);

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

  // Soroban: Batch Claim Payouts
  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const receipts: BatchClaimReceipt["receipts"] = [];
    for (const c of campaigns) {
      try {
        const res = await claimPayoutOnChain(c.campaignId);
        receipts.push({ campaignId: c.campaignId, success: res.success, txHash: res.txHash });
      } catch (err) {
        receipts.push({
          campaignId: c.campaignId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { receipts };
  };

  // Soroban: Register Passkey Account
  const registerPasskeyAccount = async (userName?: string) => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  };

  // Soroban: Real-time event subscription
  const subscribeToSorobanEvents = (
    handler: (event: SorobanEventPayload) => void,
  ) => {
    eventListenersRef.current.add(handler);
    return () => {
      eventListenersRef.current.delete(handler);
    };
  };

  // Soroban event polling worker with exponential backoff
  useEffect(() => {
    activeRef.current = true;
    setSorobanStatus("Polling");

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const computeDelay = () => {
      const base = blurredRef.current ? MAX_POLL_INTERVAL_MS : BASE_POLL_INTERVAL_MS;
      return Math.min(Math.max(backoffRef.current, base), MAX_BACKOFF_MS);
    };

    const scheduleNext = (delay: number) => {
      clearTimer();
      if (!activeRef.current) return;
      setSorobanPollIntervalMs(delay);
      timerRef.current = setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (!activeRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const server = getSorobanServer();
        const response = await server.getEvents({
          filters: [
            {
              type: "contract",
              contractIds: [STELLAR_CONFIG.contractId],
              topics: [[...SOROBAN_TOPICS]],
            },
          ],
          cursor: cursorRef.current ?? undefined,
          limit: PAGE_SIZE,
        });

        const events = Array.isArray(response.events) ? response.events : [];
        for (const raw of events) {
          const payload = extractEventPayload(raw);
          if (!payload) continue;
          setLastSorobanEvent(payload);
          setSorobanEventCount((count) => count + 1);
          for (const listener of Array.from(eventListenersRef.current)) {
            try {
              listener(payload);
            } catch (listenerErr) {
              console.warn("[Soroban] Event listener error:", listenerErr);
            }
          }
        }

        if (response.cursor) {
          cursorRef.current = response.cursor;
        }

        backoffRef.current = BASE_POLL_INTERVAL_MS;
        setSorobanStatus("Connected");
        scheduleNext(computeDelay());
      } catch (err) {
        console.warn("[Soroban] Poll failed, backing off:", err);
        setSorobanStatus("Reconnecting");
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        scheduleNext(computeDelay());
      } finally {
        inFlightRef.current = false;
      }
    };

    const handleVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      blurredRef.current = hidden;
      if (!hidden && activeRef.ref) {
        // Nothing to do here; the next scheduled poll will use the blurred backoff.
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    blurredRef.current = document.visibilityState === "hidden";

    void poll();

    return () => {
      activeRef.current = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Compatibility helpers for legacy form callers
  const factoryContract = null;
  const getCampaignContract = (_address: string) => null;
  const provider = null;
  const signer = null;
  const switchToStellarNetwork = async () => true;

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
    sorobanStatus,
    lastSorobanEvent,
    sorobanEventCount,
    sorobanPollIntervalMs,
    subscribeToSorobanEvents,
    factoryContract,
    getCampaignContract,
    provider,
    signer,
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
