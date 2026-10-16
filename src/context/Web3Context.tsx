import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import {
  connectFreighterWallet,
  connectAlbedoWallet,
  connectXBullWallet,
  checkFreighterInstalled,
  getCurrentNetwork,
  fetchXlmBalance,
  fundTestnetAccount,
  createCampaignContractCall,
  logSaleContractCall,
  claimPayoutContractCall,
} from "../lib/stellar";
import type { WalletType } from "../lib/stellar";
import { STELLAR_CONFIG } from "../config/stellar";
import { registerUser } from "../utils/api";

export interface SorobanResourceDiagnostics {
  minResourceFee: string;
  cpuInstructions: number;
  memoryBytes: number;
  readBytes: number;
  writeBytes: number;
  executionTimeMs: number;
  warnings: string[];
}

export interface WebContextType {
  userAddress: string | null;
  userRole: string | null;
  isConnected: boolean;
  isStellarNetwork: boolean;
  network: string;
  xlmBalance: string;
  connectorType: WalletType | null;
  isWalletModalOpen: boolean;
  openWalletModal: () => void;
  closeWalletModal: () => void;
  connectWallet: (connectorType?: WalletType, customAddress?: string) => Promise<void>;
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

  // Resource Profiling (Gas Limit & Soroban CPU/Memory Budget)
  simulateResources: (
    operation: "createCampaign" | "logSale" | "claimPayout",
    params: Record<string, any>,
  ) => Promise<SorobanResourceDiagnostics>;
  lastResourceDiagnostics: SorobanResourceDiagnostics | null;
  isDevMode: boolean;
  toggleDevMode: () => void;

  // Compatibility helpers for legacy form callers
  factoryContract: any;
  getCampaignContract: (address: string) => any;
  provider: any;
  signer: any;
  switchToStellarNetwork: () => Promise<boolean>;
}

const WebContext = createContext<WebContextType | undefined>(undefined);

// Soroban resource budget thresholds for warning generation.
const CPU_INSTRUCTIONS_WARNING = 100_000_000;
const MEMORY_BYTES_WARNING = 40_960_000;
const READ_BYTES_WARNING = 200_000;
const WRITE_BYTES_WARNING = 200_000;

function extractResourceDiagnostics(result: any): SorobanResourceDiagnostics {
  const cost = result?.cost || {};
  const cpuInstructions = Number(cost.cpuInstructions ?? result?.cpuInstructions ?? 0);
  const memoryBytes = Number(cost.memoryBytes ?? result?.memoryBytes ?? 0);
  const readBytes = Number(cost.readBytes ?? result?.readBytes ?? 0);
  const writeBytes = Number(cost.writeBytes ?? result?.writeBytes ?? 0);
  const executionTimeMs = Number(result?.executionTimeMs ?? 0);
  const minResourceFee = String(result?.minResourceFee ?? "0");

  const warnings: string[] = [];
  if (cpuInstructions > CPU_INSTRUCTIONS_WARNING) {
    warnings.push(
      `HIGH CPU: ${cpuInstructions.toLocaleString()} instructions exceeds the recommended budget. Consider optimizing contract logic or splitting into smaller invocations.`,
    );
  }
  if (memoryBytes > MEMORY_BYTES_WARNING) {
    warnings.push(
      `HIGH MEMORY: ${memoryBytes.toLocaleString()} bytes exceeds the recommended budget. Review large data structures in contract storage.`,
    );
  }
  if (readBytes > READ_BYTES_WARNING) {
    warnings.push(
      `HIGH LEDGER READS: ${readBytes.toLocaleString()} bytes. Reduce number of entry reads or page storage access.`,
    );
  }
  if (writeBytes > WRITE_BYTES_WARNING) {
    warnings.push(
      `HIGH LEDGER WRITES: ${writeBytes.toLocaleString()} bytes. Consider batching or deferring state writes.`,
    );
  }

  return {
    minResourceFee,
    cpuInstructions,
    memoryBytes,
    readBytes,
    writeBytes,
    executionTimeMs,
    warnings,
  };
}

export function Web3Provider({ children }: { children: ReactNode }) {
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [network, setNetwork] = useState<string>(STELLAR_CONFIG.network);
  const [xlmBalance, setXlmBalance] = useState<string>("0.00");
  const [connectorType, setConnectorType] = useState<WalletType | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [lastResourceDiagnostics, setLastResourceDiagnostics] =
    useState<SorobanResourceDiagnostics | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);

  const openWalletModal = () => setIsWalletModalOpen(true);
  const closeWalletModal = () => setIsWalletModalOpen(false);
  const toggleDevMode = () => setIsDevMode((prev) => !prev);

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

  // Multi-Wallet Stellar Connection: Freighter, Albedo, xBull, Mock
  const connectWallet = async (type: WalletType = "freighter", customAddress?: string) => {
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
        setNetwork&&STELLAR_CONFIG.network;
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
    setLastResourceDiagnostics(null);
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

  // Soroban: Simulate transaction to extract granular gas / CPU / memory budget
  const simulateResources = async (
    operation: "createCampaign" | "logSale" | "claimPayout",
    params: Record<string, any>,
  ): Promise<SorobanResourceDiagnostics> => {
    if (!userAddress) throw new Error("Wallet not connected");

    const rpcUrl = STELLAR_CONFIG.sorobanRpcUrl || "https://soroban-testnet.stellar.org";
    const networkPassphrase = STELLAR_CONFIG.networkPassphrase || "Test Stellar Network ; September 2015";

    // Build the invocation XDR payload for the target contract method.
    const xdr = buildInvocationXdr(operation, params, userAddress);

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: {
          transaction: constructSimulationTransactionXdr(xdr, networkPassphrase, params.feePayer ?? userAddress),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Soroban RPC simulation failed with status ${response.status}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(json.error.message || "Soroban RPC simulation error");
    }

    const result = json.result;
    if (!result) {
      throw new Error("Soroban RPC returned an empty simulation result");
    }

    const diagnostics = extractResourceDiagnostics(result);
    setLastResourceDiagnostics(diagnostics);
    return diagnostics;
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
      const res = await claimPayoutContractCall(
        userAddress,
        campaignId,
        connectorType,
      );
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

  // Compatibility helpers for legacy form callers
  const factoryContract = null as any;
  const getCampaignContract = (_address: string) => null as any;
  const provider = null as any;
  const signer = null as any;
  const switchToStellarNetwork = async () => {
    try {
      const current = await getCurrentNetwork();
      setNetwork(current);
      return true;
    } catch {
      return false;
    }
  };

  const value: WebContextType = {
    userAddress,
    userRole,
    isConnected,
    isStellarNetwork: true,
    network,
    xlmBalance,
    connectorType,
    isWalletModalOpen,
    openWalletModal,
    closeWalletModal,
    connectWallet,
    disconnectWallet,
    updateUserRole,
    requestFriendbotFunding,
    createCampaignOnChain,
    logSaleOnChain,
    claimPayoutOnChain,
    simulateResources,
    lastResourceDiagnostics,
    isDevMode,
    toggleDevMode,
    factoryContract,
    getCampaignContract,
    provider,
    signer,
    switchToStellarNetwork,
  };

  return <WebContext.Provider value={value}>{children}</WebContext.Provider>;
}

export function useWeb3() {
  const context = useContext(WebContext);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}

export function useWebContext() {
  return useWeb3();
}

function buildInvocationXdr(operation: string, params: Record<string, any>, source: string): string {
  return JSON.stringify({ operation, params, source });
}

function constructSimulationTransactionXdr(xdr: string, _networkPassphrase: string, _feePayer: string): string {
  return xdr;
}
