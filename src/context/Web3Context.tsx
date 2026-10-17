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
  contractId: string;
  ledger: number;
  txHash?: string;
  value?: unknown;
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

  // Real-time Soroban event streaming
  sorobanConnectionStatus: SorobanConnectionStatus;
  latestSorobanEvents: SorobanEvent[];
  sorobanEventVersion: number;
  subscribeToSorobanEvents: (listener: (version: number) => void) => () => void;

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

const WEB3Context = createContext<Web3ContextType | undefined>(undefined);

const SUBSCRIBED_TOPICS = ["create_campaign", "log_sale", "claim_payout"] as const;
const BASE_POLL_MS = 5_000;
const MAX_BACKOFF_MS = 30_000;
const BLUR_POLL_MS = 30_000;
const MAX_EVENTS_KEEP = 50;

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
  const [latestSorobanEvents, setLatestSorobanEvents] = useState<SorobanEvent[]>([]);
  const [sorobanEventVersion, setSorobanEventVersion] = useState(0);

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

  // --------------------------------------------------------------------------
  // Real-Time Soroban REC Event Streaming (exponential backoff polling worker)
  // --------------------------------------------------------------------------
  const listenersRef = useRef<Set<(version: number) => void>>(new Set());
  const cursorRef = useRef<string | null>(null);
  const backoffRef = useRef(BASE_POLL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurredRef = useRef(typeof document !== "undefined" && document.hidden);
  const runningRef = useRef(false);
  const stoppedRef = useRef(false);

  const notifyListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(sorobanEventVersionRef.current);
      } catch (err) {
        console.warn("Soroban event listener failed:", err);
      }
    });
  }, []);

  const subscribeToSorobanEvents = useCallback((listener: (version: number) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const sorobanEventVersionRef = useRef(0);

  const scheduleNextPoll = useCallback((delayMs: number) => {
    if (stoppedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void pollSorobanEvents();
    }, delayMs);
  }, []);

  const pollSorobanEvents = useCallback(async () => {
    if (stoppedRef.current || runningRef.current) return;
    runningRef.current = true;
    try {
      const server = getSorobanServer();
      const contractId = STELLAR_CONFIG.contractId;
      if (!contractId) {
        setSorobanConnectionStatus("Polling");
        scheduleNextPoll(BLUR_POLL_MS);
        return;
      }

      const page = await server.getEvents({
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
            topics: [SUBSCRIBED_TOPICS as unknown as string[]],
          },
        ],
        cursor: cursorRef.current ?? undefined,
        limit: 20,
      });

      const rawEvents = (page.events || []) as Array<{
        id?: string;
        topic?: string[];
        contractId?: string;
        ledger?: number;
        txHash?: string;
        value?: unknown;
      }>;

      const normalized = rawEvents.map((ev, idx) => {
        const topicRaw = Array.isArray(ev.topic) ? ev.topic[0] : ev.topic;
        const topic = typeof topicRaw === "string" ? topicRaw : "unknown";
        return {
          id: ev.id || `${ev.txHash ?? "no-tx-"}-${ev.ledger ?? 0}-${idx}`,
          topic,
          contractId: ev.contractId || contractId,
          ledger: ev.ledger ?? 0,
          txHash: ev.txHash,
          value: ev.value,
          receivedAt: Date.now(),
        } as SorobanEvent;
      });

      if (page.cursor) cursorRef.current = page.cursor;

      if (normalized.length > 0) {
        setLatestSorobanEvents((prev) => {
          const merged = [...normalized, ...prev];
          const seen = new Set<string>();
          const deduped = merged.filter((event) => {
            if (seen.has(event.id)) return false;
            seen.add(event.id);
            return true;
          });
          return deduped.slice(0, MAX_EVENTS_KEEP);
        });
        sorobanEventVersionRef.current += 1;
        setSorobanEventVersion(sorobanEventVersionRef.current);
        notifyListeners();
      }

      backoffRef.current = BASE_POLL_MS;
      setSorobanConnectionStatus("Connected");
      scheduleNextPoll(blurredRef.current ? BLUR_POLL_MS : BASE_POLL_MS);
    } catch (err) {
      console.warn("Soroban event poll failed:", err);
      setSorobanConnectionStatus("Reconnecting");
      const next = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      backoffRef.current = next;
      scheduleNextPoll(blurredRef.current ? Math.max(next, BLUR_POLL_MS) : next);
    } finally {
      runningRef.current = false;
    }
  }, [notifyListeners, scheduleNextPoll]);

  useEffect(() => {
    stoppedRef.current = false;
    void pollSorobanEvents();

    const handleVisibility = () => {
      const isHidden = typeof document !== "undefined" && document.hidden;
      blurredRef.current = isHidden;
      if (isHidden) {
        backoffRef.current = Math.max(backoffRef.current, BLUR_POLL_MS);
        scheduleNextPoll(BLUR_POLL_MS);
      } else {
        backoffRef.current = BASE_POLL_MS;
        scheduleNextPoll(0);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibility);
    }

    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibility);
      }
    };
  }, [pollSorobanEvents, scheduleNextPoll]);

  // --------------------------------------------------------------------------
  // Soroban Smart Contract Operations
  // --------------------------------------------------------------------------
  const createCampaignOnChain = async (
    name: string,
    budgetXml: number,
    commissionRatePercent: number,
    clearingPeriodSecs: number,
  ): Promise<{ success: boolean; campaignId: number; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const result = await createCampaignContractCall(userAddress, {
      name,
      budgetXml,
      commissionRatePercent,
      clearingPeriodSecs,
    });
    return result;
  };

  const logSaleOnChain = async (
    campaignId: number,
    affiliateAddress: string,
    amountXml: number,
  ): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    return logSaleContractCall(userAddress, { campaignId, affiliateAddress, amountXml });
  };

  const claimPayoutOnChain = async (campaignId: number): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    return claimPayoutContractCall(userAddress, campaignId);
  };

  const refundCampaignEscrow = async (campaignId: number): Promise<{ success: boolean; txHash?: string }> => {
    if (!userAddress) throw new Error("Wallet not connected");
    return refundCampaignEscrowContractCall(userAddress, campaignId);
  };

  const batchClaimPayoutsOnChain = async (
    campaigns: ClaimableCampaignItem[],
  ): Promise<BatchClaimReceipt> => {
    if (!userAddress) throw new Error("Wallet not connected");
    const receipts = [];
    for (const campaign of campaigns) {
      try {
        const result = await claimPayoutContractCall(userAddress, campaign.campaignId);
        receipts.push({ campaignId: campaign.campaignId, success: result.success, txHash: result.txHash });
      } catch (err) {
        receipts.push({ campaignId: campaign.campaignId, success: false, error: String(err) });
      }
    }
    return { receipts } as BatchClaimReceipt;
  };

  const registerPasskeyAccount = async (userName?: string): Promise<PasskeyCredentialRecord> => {
    const { registerPasskey } = await import("../lib/passkeySigner");
    return registerPasskey(userName || "Affiliate User");
  };

  const switchToStellarNetwork = async (): Promise<boolean> => {
    try {
      const current = await getCurrentNetwork();
      setNetwork(current);
      return true;
    } catch (err) {
      console.warn("Failed to switch Stellar network:", err);
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
    setLedgerBipPath,
    openWalletModal,
    closeWalletModal,
    connectWallet,
    disconnectWallet,
    updateUserRole,
    requestFriendbotFunding,
    sorobanConnectionStatus,
    latestSorobanEvents,
    sorobanEventVersion,
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

  return <WEB3Context.Provider value={value}>{children}</WEB3Context.Provider>;
}

export function useWeb3(): Web3ContextType {
  const ctx = useContext(WEB3Context);
  if (!ctx) throw new Error("useWeb3 must be used within a Web3Provider");
  return ctx;
}
