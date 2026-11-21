import React, { useState, useEffect, useMemo } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Search, ArrowUpDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

export interface MarketplaceCampaign {
  id: string;
  title: string;
  category: "DeFi" | "E-Commerce" | "Fintech" | "Gaming";
  commissionRate: number; // in percent
  budget: string;
  advertiser: string;
  createdAt: string;
  description: string;
}

export const MOCK_MARKETPLACE_CAMPAIGNS: MarketplaceCampaign[] = [
  {
    id: "m-101",
    title: "Soroban Liquid Staking Pool",
    category: "DeFi",
    commissionRate: 15,
    budget: "50,000 USDC",
    advertiser: "Stellar Yield Alliance",
    createdAt: "2026-06-01",
    description: "Earn affiliate commissions on native Soroban liquid staking deposits.",
  },
  {
    id: "m-102",
    title: "Global Web3 Merchant Gateway",
    category: "E-Commerce",
    commissionRate: 10,
    budget: "25,000 USDC",
    advertiser: "CheckoutStellar Inc",
    createdAt: "2026-05-20",
    description: "High-volume e-commerce checkout integration on Stellar.",
  },
  {
    id: "m-103",
    title: "Cross-Border Remittance Rail",
    category: "Fintech",
    commissionRate: 12,
    budget: "30,000 EURC",
    advertiser: "EuroPay Stellar",
    createdAt: "2026-05-15",
    description: "Sub-cent European remittances backed by Circle EURC.",
  },
  {
    id: "m-104",
    title: "Decentralized NFT Gaming Arena",
    category: "Gaming",
    commissionRate: 8,
    budget: "100,000 XLM",
    advertiser: "MetaArena Games",
    createdAt: "2026-04-10",
    description: "Play-to-earn tournament platform on Stellar testnet.",
  },
  {
    id: "m-105",
    title: "DeFi AMM Liquidity Incentives",
    category: "DeFi",
    commissionRate: 18,
    budget: "80,000 USDC",
    advertiser: "Soroswap Protocols",
    createdAt: "2026-06-10",
    description: "Incentivize liquidity providers for high-volume automated market makers.",
  },
  {
    id: "m-106",
    title: "Luxury Goods Escrow Marketplace",
    category: "E-Commerce",
    commissionRate: 5,
    budget: "200,000 USDC",
    advertiser: "Aura Luxury",
    createdAt: "2026-03-01",
    description: "Escrow-protected multi-sig luxury items on Stellar.",
  },
];

const CATEGORIES = ["All", "DeFi", "E-Commerce", "Fintech", "Gaming"] as const;

export const MarketplaceExplorer: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [sortOption, setSortOption] = useState<"comm_desc" | "newest">("comm_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 2;

  // Read initial filters from URL query parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("cat");
    if (cat) {
      const matched = CATEGORIES.find((c) => c.toLowerCase() === cat.toLowerCase());
      if (matched) setSelectedCategory(matched);
    }
    const sort = params.get("sort");
    if (sort === "comm_desc" || sort === "newest") {
      setSortOption(sort);
    }
    const q = params.get("q");
    if (q) {
      setSearchQuery(q);
      setDebouncedQuery(q);
    }
  }, []);

  // Debounce search query update
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync state to URL query parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (selectedCategory !== "All") {
      params.set("cat", selectedCategory.toLowerCase());
    }
    if (sortOption) {
      params.set("sort", sortOption);
    }
    if (debouncedQuery.trim()) {
      params.set("q", debouncedQuery.trim());
    }

    const newUrl = `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
    window.history.pushState({}, "", newUrl);
  }, [selectedCategory, sortOption, debouncedQuery]);

  const filteredCampaigns = useMemo(() => {
    return MOCK_MARKETPLACE_CAMPAIGNS.filter((c) => {
      const matchesCategory = selectedCategory === "All" || c.category === selectedCategory;
      const matchesSearch =
        !debouncedQuery.trim() ||
        c.title.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        c.description.toLowerCase().includes(debouncedQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    }).sort((a, b) => {
      if (sortOption === "comm_desc") {
        return b.commissionRate - a.commissionRate;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [selectedCategory, debouncedQuery, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / itemsPerPage));
  const paginatedCampaigns = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCampaigns.slice(start, start + itemsPerPage);
  }, [filteredCampaigns, currentPage, itemsPerPage]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8" data-testid="marketplace-explorer">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl">
            <Sparkles className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 dark:text-white">Affiliate Marketplace</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Discover and promote top-tier Soroban smart contract campaigns with guaranteed escrow commissions.
            </p>
          </div>
        </div>
      </div>

      {/* Controls: Search, Category Chips & Sort */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm">
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                data-testid="marketplace-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search campaigns by keyword..."
                className="pl-10 h-11 rounded-xl"
              />
            </div>

            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-zinc-400" />
              <select
                aria-label="Sort campaigns"
                data-testid="marketplace-sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="h-11 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-600 cursor-pointer"
              >
                <option value="comm_desc">Highest Commission</option>
                <option value="newest">Newest Campaigns</option>
              </select>
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="marketplace-category-chips">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  data-testid={`category-chip-${cat.toLowerCase()}`}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setCurrentPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6" data-testid="marketplace-campaigns-list">
        {paginatedCampaigns.length === 0 ? (
          <div className="col-span-full p-12 text-center text-zinc-400 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800">
            No campaigns found matching your query and category filter.
          </div>
        ) : (
          paginatedCampaigns.map((camp) => (
            <Card key={camp.id} className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800 flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      {camp.category}
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">#{camp.id}</span>
                  </div>
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                    {camp.title}
                  </CardTitle>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {camp.commissionRate}%
                  </div>
                  <div className="text-[10px] font-bold text-zinc-400 uppercase">Commission</div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2">
                  {camp.description}
                </p>
                <div className="flex items-center justify-between text-xs text-zinc-500 pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <span>Pool: <strong className="text-zinc-900 dark:text-white">{camp.budget}</strong></span>
                  <span>By: <strong className="text-zinc-900 dark:text-white">{camp.advertiser}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-sm" data-testid="marketplace-pagination">
        <div className="text-xs text-zinc-500">
          Showing page <strong className="text-zinc-900 dark:text-white">{currentPage}</strong> of <strong className="text-zinc-900 dark:text-white">{totalPages}</strong>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="pagination-prev"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="h-8 px-2.5 rounded-lg text-xs font-bold"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <button
              key={pageNum}
              type="button"
              data-testid={`pagination-page-${pageNum}`}
              onClick={() => setCurrentPage(pageNum)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                currentPage === pageNum
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-slate-200"
              }`}
            >
              {pageNum}
            </button>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="pagination-next"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="h-8 px-2.5 rounded-lg text-xs font-bold"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};
