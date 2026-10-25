import { useState, useEffect, useCallback, useRef } from "react";
import { useWeb3 } from "./useWeb3";

export type CampaignStatus = "Active" | "Paused" | "Completed";

export interface Campaign {
  id: string;
  onChainId?: number;
  name: string;
  status: CampaignStatus;
  commissionRate: number;
  clearingPeriod: string;
  clearingPeriodSecs?: number;
  totalSales: number;
  totalRevenue: string;
  totalCommissions: string;
  affiliates: number;
  createdAt: string;
  contractAddress: string;
  escrowInitial: number; // Initial escrow budget (XLM)
  escrowBalance: number; // Current remaining escrow balance (XLM)
  assetCode?: string; // Currency/Asset symbol (e.g. XLM, USDC, EURC)
  isRefunded?: boolean;
  advertiserAddress?: string;
  affiliateAddress?: string;
  description?: string;
  category?: string;
  currentBalanceXlm?: number;
  initialBudgetXlm?: number;
  refillThresholdPercent?: number;
  ttlRemainingLedgers?: number;
}

export type CampaignRole = "advertiser" | "affiliate" | "auditor" | "admin" | "all" | string;

export interface UseCampaignsOptions {
  role?: CampaignRole;
  status?: CampaignStatus | "All" | "LowEscrow";
  search?: string;
  advertiserAddress?: string;
  affiliateAddress?: string;
  autoRefresh?: boolean;
  pollIntervalMs?: number;
  customFetcher?: () => Promise<Campaign[]>;
}

export interface UseCampaignsResult {
  campaigns: Campaign[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const INITIAL_CAMPAIGNS: Campaign[] = [
  {
    id: "1",
    name: "Tech Gadgets Pro",
    status: "Active",
    commissionRate: 10,
    clearingPeriod: "14 Days",
    clearingPeriodSecs: 1209600,
    totalSales: 124,
    totalRevenue: "$24,800",
    totalCommissions: "$2,480",
    affiliates: 12,
    createdAt: "2026-04-01",
    contractAddress: "CA7Q...1234",
    escrowInitial: 5000,
    escrowBalance: 3250, // 65.0% - Healthy
    advertiserAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    category: "Technology",
  },
  {
    id: "2",
    name: "Web3 Masterclass",
    status: "Active",
    commissionRate: 15,
    clearingPeriod: "7 Days",
    clearingPeriodSecs: 604800,
    totalSales: 89,
    totalRevenue: "$44,500",
    totalCommissions: "$6,675",
    affiliates: 8,
    createdAt: "2026-04-15",
    contractAddress: "CB9E...5678",
    escrowInitial: 10000,
    escrowBalance: 750, // 7.5% - LOW ESCROW ALERT (< 10%)
    advertiserAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    category: "Education",
  },
  {
    id: "3",
    name: "Crypto Tools Suite",
    status: "Paused",
    commissionRate: 12,
    clearingPeriod: "30 Days",
    clearingPeriodSecs: 2592000,
    totalSales: 67,
    totalRevenue: "$33,500",
    totalCommissions: "$4,020",
    affiliates: 6,
    createdAt: "2026-03-20",
    contractAddress: "CC2K...9012",
    escrowInitial: 8000,
    escrowBalance: 680, // 8.5% - LOW ESCROW ALERT (< 10%)
    advertiserAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    category: "Software",
  },
  {
    id: "4",
    name: "DeFi Starter Pack",
    status: "Completed",
    commissionRate: 8,
    clearingPeriod: "14 Days",
    clearingPeriodSecs: 1209600,
    totalSales: 45,
    totalRevenue: "$22,500",
    totalCommissions: "$1,800",
    affiliates: 5,
    createdAt: "2026-02-10",
    contractAddress: "CD4M...3456",
    escrowInitial: 3000,
    escrowBalance: 1200, // Ended campaign with 1,200 XLM unused escrow - REFUNDABLE
    isRefunded: false,
    advertiserAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    category: "Fintech",
  },
  {
    id: "5",
    name: "Stellar MicroPay Launch",
    status: "Completed",
    commissionRate: 5,
    clearingPeriod: "7 Days",
    clearingPeriodSecs: 604800,
    totalSales: 110,
    totalRevenue: "$55,000",
    totalCommissions: "$2,750",
    affiliates: 15,
    createdAt: "2026-01-05",
    contractAddress: "CE1P...7890",
    escrowInitial: 4000,
    escrowBalance: 0,
    isRefunded: true, // Already refunded
    advertiserAddress: "GASTORMSALE7TESTNET7AFFILIATE7MERCHANT7ESCROW7XLM77777",
    category: "Payments",
  },
];

const CAMPAIGNS_STORAGE_KEY = "stormsale_campaigns_cache";

/**
 * Retrieves cached campaigns from localStorage if available, or returns an empty array.
 * Never leaks mock fallback campaigns into production flows.
 */
export function getStoredCampaigns(): Campaign[] {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = window.localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const VALID_STATUSES: CampaignStatus[] = ["Active", "Paused", "Completed"];
          return parsed.filter(
            (c): c is Campaign =>
              Boolean(
                c &&
                typeof c === "object" &&
                typeof c.id === "string" &&
                typeof c.name === "string" &&
                typeof c.contractAddress === "string" &&
                typeof c.escrowBalance === "number" &&
                Number.isFinite(c.escrowBalance) &&
                typeof c.escrowInitial === "number" &&
                Number.isFinite(c.escrowInitial) &&
                VALID_STATUSES.includes(c.status),
              ),
          );
        }
      }
    } catch {
      // Fallback on parse failure
    }
  }
  return [];
}

/**
 * Updates stored campaigns in cache and dispatches an event for local sync.
 */
export function setStoredCampaigns(campaigns: Campaign[]): void {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
      window.dispatchEvent(new Event("stormsale:campaigns-updated"));
    } catch {
      // Graceful fallback if storage quota exceeded
    }
  }
}

/**
 * Determines whether a campaign has an escrow balance under the 10% threshold.
 */
export function isLowEscrowCampaign(c: Campaign): boolean {
  if (c.status === "Completed" || c.escrowInitial <= 0) return false;
  return c.escrowBalance / c.escrowInitial < 0.1 && c.escrowBalance > 0;
}

/**
 * Filter helper according to role, status, search, and addresses.
 */
export function filterCampaigns(
  campaigns: Campaign[],
  options: UseCampaignsOptions = {},
): Campaign[] {
  let list = [...campaigns];

  // 1. Role-based filtering
  const normalizedRole = options.role?.toLowerCase();
  if (normalizedRole === "affiliate") {
    // Affiliates view active campaigns or campaigns matching affiliate address
    list = list.filter((c) => {
      if (options.affiliateAddress && c.affiliateAddress) {
        return c.affiliateAddress.toLowerCase() === options.affiliateAddress.toLowerCase();
      }
      return c.status === "Active" || c.status === "Paused";
    });
  } else if (normalizedRole === "advertiser") {
    if (options.advertiserAddress) {
      list = list.filter(
        (c) =>
          !c.advertiserAddress ||
          c.advertiserAddress.toLowerCase() === options.advertiserAddress?.toLowerCase(),
      );
    }
  } else if (normalizedRole === "auditor") {
    // Auditors have visibility into all campaigns for compliance checking
    // No role truncation
  }

  // Explicit advertiserAddress filter (outside role or when role is not advertiser)
  if (normalizedRole !== "advertiser" && options.advertiserAddress) {
    list = list.filter(
      (c) =>
        c.advertiserAddress &&
        c.advertiserAddress.toLowerCase() === options.advertiserAddress?.toLowerCase(),
    );
  }

  // 2. Status filtering
  if (options.status && options.status !== "All") {
    if (options.status === "LowEscrow") {
      list = list.filter(isLowEscrowCampaign);
    } else {
      list = list.filter((c) => c.status === options.status);
    }
  }

  // 3. Search query
  if (options.search && options.search.trim() !== "") {
    const q = options.search.trim().toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.contractAddress.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.category && c.category.toLowerCase().includes(q)),
    );
  }

  return list;
}

/**
 * Centralized useCampaigns hook for campaign data fetching across all roles.
 *
 * Features:
 * - Fully typed `Campaign` return shape
 * - Auto-refreshes on new block/ledger events from Web3 provider and periodic polling
 * - Clean listener removal on unmount
 * - Role-aware data filtering (advertiser, affiliate, auditor, admin)
 * - Race-condition safe with requestIdRef
 * - Error and loading states
 * - Imperative `refetch()` trigger
 */
export function useCampaigns(
  optionsOrRole?: UseCampaignsOptions | CampaignRole,
): UseCampaignsResult {
  const options: UseCampaignsOptions =
    typeof optionsOrRole === "string" ? { role: optionsOrRole } : optionsOrRole || {};

  const {
    role,
    status,
    search,
    advertiserAddress,
    affiliateAddress,
    autoRefresh = true,
    pollIntervalMs = 15000,
  } = options;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep customFetcher reference stable to avoid infinite loops
  const customFetcherRef = useRef(options.customFetcher);
  useEffect(() => {
    customFetcherRef.current = options.customFetcher;
  }, [options.customFetcher]);

  // Race condition guard
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const isInitialLoadRef = useRef(true);

  // Read Web3 context (provider, userAddress, etc.)
  let web3Context: ReturnType<typeof useWeb3> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    web3Context = useWeb3();
  } catch {
    // Allow hook usage outside Web3Provider (e.g. standalone views or tests)
    web3Context = null;
  }

  const provider = web3Context?.provider;

  // Fetch campaign data
  const fetchData = useCallback(async () => {
    if (!isMountedRef.current) return;
    const currentRequestId = ++requestIdRef.current;
    if (isInitialLoadRef.current) {
      setIsLoading(true);
    }
    setError(null);

    try {
      let rawData: Campaign[];

      if (customFetcherRef.current) {
        rawData = await customFetcherRef.current();
      } else {
        rawData = getStoredCampaigns();
      }

      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        const filtered = filterCampaigns(rawData, {
          role,
          status,
          search,
          advertiserAddress:
            advertiserAddress ||
            (role === "advertiser" ? web3Context?.userAddress || undefined : undefined),
          affiliateAddress:
            affiliateAddress ||
            (role === "affiliate" ? web3Context?.userAddress || undefined : undefined),
        });
        setCampaigns((prev) =>
          JSON.stringify(prev) === JSON.stringify(filtered) ? prev : filtered,
        );
        isInitialLoadRef.current = false;
        setIsLoading(false);
      }
    } catch (err: unknown) {
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        const errObj = err instanceof Error ? err : new Error(String(err));
        setError(errObj);
        isInitialLoadRef.current = false;
        setIsLoading(false);
      }
    }
  }, [
    role,
    status,
    search,
    advertiserAddress,
    affiliateAddress,
    web3Context?.userAddress,
  ]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    void fetchData();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  // Subscribe to new block / ledger events and periodic polling
  useEffect(() => {
    if (!autoRefresh) return;

    let cleanupFn: (() => void) | undefined;
    let timerId: ReturnType<typeof setInterval> | undefined;

    // 1. Subscribe via Web3 provider (ethers, viem, wagmi, or custom EventEmitter)
    if (provider && typeof provider.on === "function") {
      const handleBlock = () => {
        void fetchData();
      };

      provider.on("block", handleBlock);
      if (typeof provider.on === "function") {
        provider.on("ledger", handleBlock);
      }

      cleanupFn = () => {
        if (typeof provider.removeListener === "function") {
          provider.removeListener("block", handleBlock);
          provider.removeListener("ledger", handleBlock);
        } else if (typeof provider.off === "function") {
          provider.off("block", handleBlock);
          provider.off("ledger", handleBlock);
        }
      };
    } else if (typeof window !== "undefined") {
      // 2. Window / custom block event fallback
      const handleCustomBlock = () => {
        void fetchData();
      };

      window.addEventListener("block", handleCustomBlock);
      window.addEventListener("stormsale:block", handleCustomBlock);
      window.addEventListener("stormsale:campaigns-updated", handleCustomBlock);

      cleanupFn = () => {
        window.removeEventListener("block", handleCustomBlock);
        window.removeEventListener("stormsale:block", handleCustomBlock);
        window.removeEventListener("stormsale:campaigns-updated", handleCustomBlock);
      };
    }

    // 3. Periodic ledger polling timer
    if (pollIntervalMs > 0) {
      timerId = setInterval(() => {
        void fetchData();
      }, pollIntervalMs);
    }

    return () => {
      if (cleanupFn) cleanupFn();
      if (timerId) clearInterval(timerId);
    };
  }, [provider, autoRefresh, pollIntervalMs, fetchData]);

  return {
    campaigns,
    isLoading,
    error,
    refetch: fetchData,
  };
}
