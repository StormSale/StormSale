import React, { useState, useMemo, useCallback } from "react";
import {
  GitBranch,
  Users,
  TrendingUp,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronDown,
  Search,
  Calendar,
  Layers,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { useReferralTree } from "../../hooks/useReferralTree";
import {
  maskRefereeAddress,
  formatAffiliateAddress,
  buildRecursiveReferralTree,
  aggregateNetworkVolume,
  filterRefereeNetwork,
  paginateReferees,
  type AffiliateReferralRelation,
  type ReferralTreeNode,
} from "../../lib/referralTree";

export interface B2CNetworkTreeProps {
  readonly masterAddress?: string;
  readonly relations?: AffiliateReferralRelation[];
  readonly initialPageSize?: number;
  readonly defaultPrivacyMasked?: boolean;
}

export const B2CNetworkTree: React.FC<B2CNetworkTreeProps> = ({
  masterAddress,
  relations: propsRelations,
  initialPageSize = 10,
  defaultPrivacyMasked = true,
}) => {
  const context = useReferralTree();

  // Prefer props if provided, otherwise context
  const activeMaster = masterAddress || context?.tree?.address || "GAFFILIATE_MASTER_ROOT_001";
  const activeRelations = propsRelations ?? context?.relations ?? [];

  const [activeTab, setActiveTab] = useState<"tree" | "table">("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | 1 | 2>("all");
  const [isPrivacyMasked, setIsPrivacyMasked] = useState(defaultPrivacyMasked);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedNode, setSelectedNode] = useState<ReferralTreeNode | null>(null);

  // Build recursive tree
  const tree = useMemo(() => {
    return buildRecursiveReferralTree(activeMaster, activeRelations);
  }, [activeMaster, activeRelations]);

  // Aggregate network volume metrics
  const volumeAgg = useMemo(() => {
    return aggregateNetworkVolume(activeRelations);
  }, [activeRelations]);

  // Filter downstream referees
  const filteredRelations = useMemo(() => {
    return filterRefereeNetwork(activeRelations, {
      query: searchQuery,
      date: dateFilter,
      tier: tierFilter,
    });
  }, [activeRelations, searchQuery, dateFilter, tierFilter]);

  // Paginate filtered list
  const pagination = useMemo(() => {
    return paginateReferees(filteredRelations, currentPage, pageSize);
  }, [filteredRelations, currentPage, pageSize]);

  // Toggle collapse state for a specific node
  const toggleCollapse = useCallback((address: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  }, []);

  // Expand all branches
  const expandAll = useCallback(() => {
    setCollapsedNodes(new Set());
  }, []);

  // Collapse all branches that have children
  const collapseAll = useCallback(() => {
    const parentAddrs = new Set<string>();
    function collectParents(node: ReferralTreeNode) {
      if (node.children && node.children.length > 0) {
        parentAddrs.add(node.address);
        node.children.forEach(collectParents);
      }
    }
    collectParents(tree);
    setCollapsedNodes(parentAddrs);
  }, [tree]);

  // Reset search & filters
  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setDateFilter("");
    setTierFilter("all");
    setCurrentPage(1);
  }, []);

  // Format wallet address respecting privacy masking
  const formatAddress = useCallback(
    (addr: string) => {
      if (isPrivacyMasked) {
        return maskRefereeAddress(addr);
      }
      return formatAffiliateAddress(addr);
    },
    [isPrivacyMasked],
  );

  // Recursive tree node renderer
  const renderRecursiveNode = (node: ReferralTreeNode, depth: number = 0) => {
    const isRoot = node.tier === 0;
    const hasChildren = node.children && node.children.length > 0;
    const isCollapsed = collapsedNodes.has(node.address);
    const isSelected = selectedNode?.address === node.address;

    return (
      <div key={node.address} className="flex flex-col space-y-1">
        <div
          className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
            isSelected
              ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-400"
              : isRoot
                ? "bg-slate-900 text-white border-slate-800"
                : depth === 1
                  ? "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-indigo-300"
                  : "bg-slate-50 dark:bg-zinc-850/60 border-slate-200 dark:border-zinc-700 hover:border-violet-300"
          }`}
          style={{ marginLeft: `${Math.min(depth * 24, 120)}px` }}
          onClick={() => setSelectedNode(node)}
          data-testid={`tree-node-${node.address}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(node.address);
                }}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors"
                aria-expanded={!isCollapsed}
                data-testid={`collapse-toggle-${node.address}`}
                title={isCollapsed ? "Expand Branch" : "Collapse Branch"}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            ) : (
              <div className="w-6 h-6 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              </div>
            )}

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold truncate ${
                    isRoot ? "text-white" : "text-zinc-900 dark:text-white"
                  }`}
                >
                  {node.name}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    isRoot
                      ? "bg-indigo-500 text-white"
                      : node.tier === 1
                        ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                        : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                  }`}
                >
                  {isRoot ? "Master" : `Tier ${node.tier}`}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[11px] text-zinc-400" data-testid="referee-address">
                  {formatAddress(node.address)}
                </span>
                <span className="text-[10px] text-zinc-500">
                  Joined: {node.recruitedAt ? node.recruitedAt.slice(0, 10) : "N/A"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-right">
            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Volume</span>
              <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                {node.salesVolumeXlm.toLocaleString()} XLM
              </span>
            </div>

            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase text-indigo-500">Override</span>
              <span className="text-xs font-mono font-black text-indigo-600 dark:text-indigo-400">
                +{node.overrideEarningsXlm.toFixed(2)} XLM
              </span>
            </div>
          </div>
        </div>

        {/* Recursive Child Rendering */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col space-y-1">
            {node.children.map((child: ReferralTreeNode) => renderRecursiveNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-testid="b2c-network-tree-container">
      {/* Volume Aggregation Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Downstream Referees */}
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">Network Marketers</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-3xl font-black text-zinc-900 dark:text-white font-mono"
            data-testid="total-referees-count"
          >
            {volumeAgg.totalCount}
          </div>
          <div className="text-[11px] text-zinc-500">
            {volumeAgg.tier1Count} Direct (Tier 1) • {volumeAgg.tier2Count} Indirect (Tier 2)
          </div>
        </Card>

        {/* Card 2: Tier 1 Direct Volume */}
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">Tier 1 Direct Volume</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-3xl font-black text-zinc-900 dark:text-white font-mono"
            data-testid="tier1-volume"
          >
            {volumeAgg.tier1Volume.toLocaleString()}{" "}
            <span className="text-sm font-bold text-sky-500">XLM</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            +{volumeAgg.tier1Overrides.toFixed(2)} XLM Overrides
          </div>
        </Card>

        {/* Card 3: Tier 2 Downstream Volume */}
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-xs font-bold uppercase tracking-wider">
              Tier 2 Downstream Volume
            </span>
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-3xl font-black text-zinc-900 dark:text-white font-mono"
            data-testid="tier2-volume"
          >
            {volumeAgg.tier2Volume.toLocaleString()}{" "}
            <span className="text-sm font-bold text-violet-500">XLM</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            +{volumeAgg.tier2Overrides.toFixed(2)} XLM Overrides
          </div>
        </Card>

        {/* Card 4: Total Aggregated Downstream Volume */}
        <Card className="rounded-3xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
            <span className="text-xs font-extrabold uppercase tracking-wider">
              Total Downstream Volume
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono"
            data-testid="total-downstream-volume"
          >
            {volumeAgg.totalVolume.toLocaleString()} <span className="text-sm font-bold">XLM</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold">
            +{volumeAgg.totalOverrides.toFixed(2)} XLM Total Passive Overrides
          </div>
        </Card>
      </div>

      {/* Action & Filter Toolbar */}
      <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab("tree")}
              className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === "tree"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800"
              }`}
              data-testid="tab-tree-view"
            >
              Recursive Network Tree
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("table")}
              className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                activeTab === "table"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800"
              }`}
              data-testid="tab-table-view"
            >
              Referees Directory ({filteredRelations.length})
            </button>
          </div>

          {/* Privacy & Tree Collapse Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsPrivacyMasked(!isPrivacyMasked)}
              className="rounded-xl text-xs font-bold gap-1.5"
              data-testid="privacy-mask-toggle"
            >
              {isPrivacyMasked ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Privacy Mask Active (GAB...392)</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Mask Wallet Addresses</span>
                </>
              )}
            </Button>

            {activeTab === "tree" && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={expandAll}
                  className="rounded-xl text-xs font-bold"
                  data-testid="btn-expand-all"
                >
                  Expand All
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={collapseAll}
                  className="rounded-xl text-xs font-bold"
                  data-testid="btn-collapse-all"
                >
                  Collapse All
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search & Filter Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
          {/* Alias / Query search */}
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search referee by alias or address..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="referee-search-input"
            />
          </div>

          {/* Date filter */}
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter by date (YYYY-MM-DD)..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="referee-date-filter"
            />
          </div>

          {/* Tier filter */}
          <div className="relative flex items-center gap-2">
            <select
              value={tierFilter}
              onChange={(e) => {
                setTierFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as 1 | 2));
                setCurrentPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              data-testid="referee-tier-filter"
            >
              <option value="all">All Tiers</option>
              <option value="1">Tier 1 Direct</option>
              <option value="2">Tier 2 Downstream</option>
            </select>

            {(searchQuery || dateFilter || tierFilter !== "all") && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetFilters}
                className="rounded-xl text-xs text-zinc-400 hover:text-zinc-900"
                data-testid="btn-clear-filters"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* View 1: Recursive Tree View */}
      {activeTab === "tree" && (
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-6">
          <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between border-b border-slate-100 dark:border-zinc-800">
            <div>
              <CardTitle className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-indigo-500" />
                <span>Recursive Downstream Sub-Affiliate Tree</span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-0.5">
                Click nodes to expand or collapse branches. Volume and override metrics aggregate
                recursively.
              </CardDescription>
            </div>
            <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {activeRelations.length} Total Nodes
            </div>
          </CardHeader>

          <CardContent className="p-0 pt-4 space-y-2">{renderRecursiveNode(tree, 0)}</CardContent>
        </Card>
      )}

      {/* View 2: Paginated Directory Table */}
      {activeTab === "table" && (
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-zinc-900 dark:text-white">
                Downstream Referees Directory
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-1">
                Showing{" "}
                {pagination.totalItems > 0
                  ? (pagination.currentPage - 1) * pagination.pageSize + 1
                  : 0}{" "}
                to {Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)}{" "}
                of {pagination.totalItems} referees
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium">Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-xs font-medium"
                data-testid="pagination-page-size"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/50 font-extrabold text-zinc-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Referee Alias & Wallet</th>
                  <th className="py-3 px-6">Tier</th>
                  <th className="py-3 px-6">Recruitment Date</th>
                  <th className="py-3 px-6">Sales Driven</th>
                  <th className="py-3 px-6">Total Sales Volume</th>
                  <th className="py-3 px-6">Override Commission</th>
                  <th className="py-3 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {pagination.items.length > 0 ? (
                  pagination.items.map((rel) => (
                    <tr
                      key={rel.childAddress}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                      data-testid={`row-referee-${rel.childAddress}`}
                    >
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span className="font-bold text-zinc-900 dark:text-white">
                            {rel.childName}
                          </span>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400 mt-0.5">
                            <span data-testid="referee-address">
                              {formatAddress(rel.childAddress)}
                            </span>
                            <CopyButton text={rel.childAddress} label="Copy" size="sm" />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Tier {rel.tier}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-mono text-zinc-500">
                        {rel.recruitedAt ? rel.recruitedAt.slice(0, 10) : "N/A"}
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-zinc-900 dark:text-white">
                        {rel.salesCount} orders
                      </td>
                      <td className="py-4 px-6 font-mono font-bold text-zinc-900 dark:text-white">
                        {rel.totalSalesVolumeXlm.toLocaleString()} XLM
                      </td>
                      <td className="py-4 px-6 font-mono font-black text-indigo-600 dark:text-indigo-400">
                        +{rel.totalOverrideEarnedXlm.toLocaleString()} XLM
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold capitalize ${
                            rel.status === "active"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {rel.status || "Active"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-400">
                      No referees match the current search or filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-500" data-testid="pagination-page-info">
                  Page {pagination.currentPage} of {pagination.totalPages}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={!pagination.hasPrevPage}
                    className="rounded-xl text-xs font-bold"
                    data-testid="pagination-prev"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={!pagination.hasNextPage}
                    className="rounded-xl text-xs font-bold"
                    data-testid="pagination-next"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
