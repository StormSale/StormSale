import React, { useState } from "react";
import {
  GitBranch,
  Users,
  DollarSign,
  TrendingUp,
  Award,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Play,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { RecruiterInviteModal } from "./RecruiterInviteModal";
import { useReferralTree } from "../../hooks/useReferralTree";
import { formatAffiliateAddress } from "../../lib/referralTree";

export const ReferralNetworkTree: React.FC = () => {
  const {
    tree,
    summary,
    relations,
    selectedNode,
    setSelectedNode,
    recordSaleAction,
  } = useReferralTree();

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"tree" | "table" | "overrides">("tree");

  // Layout calculation for the SVG Tree Graph
  const masterX = 450;
  const masterY = 75;

  const tier1Nodes = tree.children;
  const tier1Count = tier1Nodes.length;

  const nodePositions = new Map<string, { x: number; y: number }>();
  nodePositions.set(tree.address, { x: masterX, y: masterY });

  // Distribute Tier 1 nodes
  const tier1Spacing = Math.max(220, 800 / Math.max(1, tier1Count));
  const tier1StartX = masterX - ((tier1Count - 1) * tier1Spacing) / 2;

  tier1Nodes.forEach((t1, idx) => {
    const x = tier1StartX + idx * tier1Spacing;
    const y = 230;
    nodePositions.set(t1.address, { x, y });

    // Distribute Tier 2 nodes under this Tier 1 parent
    const tier2Nodes = t1.children;
    const tier2Count = tier2Nodes.length;
    if (tier2Count > 0) {
      const tier2Spacing = 160;
      const tier2StartX = x - ((tier2Count - 1) * tier2Spacing) / 2;
      tier2Nodes.forEach((t2, t2Idx) => {
        const t2X = tier2StartX + t2Idx * tier2Spacing;
        const t2Y = 380;
        nodePositions.set(t2.address, { x: t2X, y: t2Y });
      });
    }
  });

  const currentNode = selectedNode || (tier1Nodes[0] ?? tree);

  const simulateSaleForCurrent = () => {
    if (!currentNode || currentNode.tier === 0) return;
    recordSaleAction({
      saleAmountXlm: 500,
      sellingAffiliateAddress: currentNode.address,
      campaignId: 101,
    });
  };

  return (
    <div className="space-y-6" data-testid="referral-network-tree-container">
      {/* Recruiter Invite Modal */}
      <RecruiterInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
      />

      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-black text-white p-6 sm:p-8 border border-indigo-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">
              <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
              <span>Two-Tier Sub-Affiliate Referral Architecture</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Recruiter Network & Passive Overrides
            </h2>

            <p className="text-sm text-zinc-300 leading-relaxed">
              Build your marketing squad. Recruit high-velocity sub-affiliates and earn an automated{" "}
              <strong className="text-indigo-300 font-extrabold">
                2% second-tier override commission
              </strong>{" "}
              on every verified sale settled through Soroban smart contracts.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>8% Direct Seller / 2% Master Recruiter</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Atomic On-Chain Settlement</span>
              </span>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
            <Button
              size="lg"
              onClick={() => setIsInviteModalOpen(true)}
              className="h-12 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-sky-600 to-indigo-600 hover:from-indigo-500 hover:to-sky-500 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/25 transition-transform hover:scale-[1.02] flex items-center justify-center gap-2"
              data-testid="btn-open-invite-modal"
            >
              <Users className="w-4 h-4" />
              <span>Invite Marketers</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Network Size */}
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Total Marketers</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-zinc-900 dark:text-white font-mono">
            {summary.totalNetworkSize}
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {summary.directRecruitsCount} Direct (Tier 1) • {summary.secondTierRecruitsCount} Sub-Tier 2
          </div>
        </Card>

        {/* Card 2: Network Volume */}
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Network Sales Volume</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-zinc-900 dark:text-white font-mono">
            {summary.totalNetworkVolumeXlm.toLocaleString()} <span className="text-sm font-bold text-sky-500">XLM</span>
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <Zap className="w-3 h-3" />
            <span>Across all recruited marketers</span>
          </div>
        </Card>

        {/* Card 3: Passive Overrides Earned */}
        <Card className="rounded-3xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-950/20 dark:to-zinc-900 shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
            <span className="text-xs font-extrabold uppercase tracking-wider">Passive Overrides</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
            +{summary.totalOverrideEarnedXlm.toLocaleString()} <span className="text-sm font-bold">XLM</span>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
            2% override automatically credited
          </div>
        </Card>

        {/* Card 4: Top Performer */}
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-2">
          <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
            <span className="text-xs font-bold uppercase tracking-wider">Top Recruited Producer</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg font-extrabold text-zinc-900 dark:text-white truncate">
            {summary.topPerformer?.name || "No recruits yet"}
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono font-bold">
            {summary.topPerformer
              ? `Generated +${summary.topPerformer.overrideXlm} XLM override`
              : "Share recruiter link to begin"}
          </div>
        </Card>
      </div>

      {/* Tabs Switcher: Tree vs Table vs Overrides */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <button
          onClick={() => setActiveTab("tree")}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
            activeTab === "tree"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800"
          }`}
          data-testid="tab-tree-view"
        >
          Interactive Tree Visualization
        </button>
        <button
          onClick={() => setActiveTab("table")}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
            activeTab === "table"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800"
          }`}
          data-testid="tab-table-view"
        >
          Recruited Partners List ({relations.length})
        </button>
        <button
          onClick={() => setActiveTab("overrides")}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
            activeTab === "overrides"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800"
          }`}
          data-testid="tab-overrides-view"
        >
          Override Commission Receipts
        </button>
      </div>

      {/* View 1: Interactive Network Tree Chart */}
      {activeTab === "tree" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Interactive SVG Canvas */}
          <Card className="lg:col-span-2 rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-slate-100 dark:border-zinc-800/80 p-5 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-indigo-500" />
                  <span>Two-Tier Referral Topology Map</span>
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Click any marketer card to inspect direct earnings and passive 2% overrides.
                </CardDescription>
              </div>

              <div className="flex items-center gap-3 text-xs font-bold font-mono">
                <span className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Master
                </span>
                <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Tier 1
                </span>
                <span className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Tier 2
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <div className="min-w-[750px] p-4 flex justify-center">
                <svg
                  viewBox="0 0 900 480"
                  className="w-full h-auto select-none"
                  role="img"
                  aria-label="Two-Tier Referral Tree Topology Map"
                >
                  <defs>
                    <linearGradient id="masterGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                    <linearGradient id="linkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
                    </linearGradient>
                  </defs>

                  {/* Render Connecting Lines: Master to Tier 1 */}
                  {tier1Nodes.map((t1) => {
                    const p1 = nodePositions.get(tree.address)!;
                    const p2 = nodePositions.get(t1.address)!;
                    const midY = (p1.y + p2.y) / 2;
                    return (
                      <path
                        key={`link-m-${t1.address}`}
                        d={`M ${p1.x} ${p1.y + 40} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y - 35}`}
                        fill="none"
                        stroke="url(#linkGrad)"
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                        className="transition-all"
                      />
                    );
                  })}

                  {/* Render Connecting Lines: Tier 1 to Tier 2 */}
                  {tier1Nodes.flatMap((t1) =>
                    t1.children.map((t2) => {
                      const p1 = nodePositions.get(t1.address)!;
                      const p2 = nodePositions.get(t2.address)!;
                      const midY = (p1.y + p2.y) / 2;
                      return (
                        <path
                          key={`link-${t1.address}-${t2.address}`}
                          d={`M ${p1.x} ${p1.y + 35} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y - 30}`}
                          fill="none"
                          stroke="#a855f7"
                          strokeWidth="2"
                          strokeOpacity="0.5"
                        />
                      );
                    }),
                  )}

                  {/* Root Node: Master Affiliate */}
                  <g
                    transform={`translate(${masterX - 110}, ${masterY - 35})`}
                    className="cursor-pointer transition-transform hover:scale-105"
                    onClick={() => setSelectedNode(tree)}
                    data-testid="node-master"
                  >
                    <rect
                      width="220"
                      height="75"
                      rx="20"
                      className="fill-indigo-900 stroke-indigo-400 shadow-xl"
                      strokeWidth="2"
                    />
                    <text x="110" y="24" textAnchor="middle" className="fill-white font-extrabold text-xs">
                      Master Affiliate (You)
                    </text>
                    <text x="110" y="42" textAnchor="middle" className="fill-indigo-200 font-mono text-[10px]">
                      {formatAffiliateAddress(tree.address)}
                    </text>
                    <text x="110" y="60" textAnchor="middle" className="fill-emerald-400 font-bold text-[10px]">
                      +{summary.totalOverrideEarnedXlm} XLM Overrides
                    </text>
                  </g>

                  {/* Tier 1 Nodes */}
                  {tier1Nodes.map((t1) => {
                    const pos = nodePositions.get(t1.address)!;
                    const isSelected = selectedNode?.address === t1.address;
                    return (
                      <g
                        key={`node-${t1.address}`}
                        transform={`translate(${pos.x - 90}, ${pos.y - 35})`}
                        className="cursor-pointer transition-transform hover:scale-105"
                        onClick={() => setSelectedNode(t1)}
                        data-testid={`node-recruit-${t1.address}`}
                      >
                        <rect
                          width="180"
                          height="70"
                          rx="16"
                          className={`${
                            isSelected
                              ? "fill-sky-900 stroke-sky-400 stroke-2"
                              : "fill-white dark:fill-zinc-800 stroke-slate-200 dark:stroke-zinc-700"
                          }`}
                        />
                        <text
                          x="90"
                          y="22"
                          textAnchor="middle"
                          className={`font-bold text-xs ${
                            isSelected ? "fill-white" : "fill-zinc-900 dark:fill-white"
                          }`}
                        >
                          {t1.name}
                        </text>
                        <text
                          x="90"
                          y="38"
                          textAnchor="middle"
                          className="fill-zinc-400 font-mono text-[10px]"
                        >
                          {formatAffiliateAddress(t1.address)}
                        </text>
                        <text
                          x="90"
                          y="55"
                          textAnchor="middle"
                          className="fill-indigo-600 dark:fill-indigo-400 font-mono font-bold text-[10px]"
                        >
                          +{t1.overrideEarningsXlm} XLM Override
                        </text>
                      </g>
                    );
                  })}

                  {/* Tier 2 Nodes */}
                  {tier1Nodes.flatMap((t1) =>
                    t1.children.map((t2) => {
                      const pos = nodePositions.get(t2.address)!;
                      const isSelected = selectedNode?.address === t2.address;
                      return (
                        <g
                          key={`node-${t2.address}`}
                          transform={`translate(${pos.x - 75}, ${pos.y - 30})`}
                          className="cursor-pointer transition-transform hover:scale-105"
                          onClick={() => setSelectedNode(t2)}
                          data-testid={`node-recruit-${t2.address}`}
                        >
                          <rect
                            width="150"
                            height="60"
                            rx="12"
                            className={`${
                              isSelected
                                ? "fill-violet-900 stroke-violet-400 stroke-2"
                                : "fill-slate-50 dark:fill-zinc-850 stroke-slate-200 dark:stroke-zinc-700"
                            }`}
                          />
                          <text
                            x="75"
                            y="20"
                            textAnchor="middle"
                            className={`font-bold text-[11px] ${
                              isSelected ? "fill-white" : "fill-zinc-800 dark:fill-zinc-200"
                            }`}
                          >
                            {t2.name}
                          </text>
                          <text
                            x="75"
                            y="34"
                            textAnchor="middle"
                            className="fill-zinc-400 font-mono text-[9px]"
                          >
                            {formatAffiliateAddress(t2.address)}
                          </text>
                          <text
                            x="75"
                            y="49"
                            textAnchor="middle"
                            className="fill-violet-600 dark:fill-violet-400 font-mono font-bold text-[9px]"
                          >
                            +{t2.overrideEarningsXlm} XLM Override
                          </text>
                        </g>
                      );
                    }),
                  )}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* Right Col: Node Detail Inspector Card */}
          <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold tracking-wider text-indigo-600 dark:text-indigo-400">
                  {currentNode.roleLabel}
                </span>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    currentNode.isActive
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {currentNode.isActive ? "Active Network" : "Paused"}
                </span>
              </div>
              <h3 className="text-xl font-black text-zinc-900 dark:text-white mt-1">
                {currentNode.name}
              </h3>
              <div className="flex items-center gap-2 font-mono text-xs text-zinc-400 mt-1">
                <span>{currentNode.address}</span>
                <CopyButton text={currentNode.address} label="Copy" size="sm" />
              </div>
            </div>

            {/* Financial Performance Breakdown */}
            <div className="space-y-3 border-t border-slate-100 dark:border-zinc-800 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Performance & Overrides
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                    Sales Volume
                  </span>
                  <span className="text-base font-black text-zinc-900 dark:text-white font-mono">
                    {currentNode.salesVolumeXlm.toLocaleString()}{" "}
                    <span className="text-xs font-bold text-indigo-500">XLM</span>
                  </span>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/50">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                    Driven Sales
                  </span>
                  <span className="text-base font-black text-zinc-900 dark:text-white font-mono">
                    {currentNode.salesCount} Orders
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-indigo-900 dark:text-indigo-200">
                    Your Passive 2% Override
                  </span>
                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    +{currentNode.overrideEarningsXlm.toFixed(2)} XLM
                  </span>
                </div>
                <p className="text-[11px] text-indigo-800 dark:text-indigo-300 leading-snug">
                  Earned automatically on verified conversions driven by this partner.
                </p>
              </div>
            </div>

            {/* Interactive Simulation Trigger */}
            {currentNode.tier > 0 && (
              <div className="border-t border-slate-100 dark:border-zinc-800 pt-4 space-y-2">
                <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400 block">
                  Simulate Live Sale
                </span>
                <Button
                  size="sm"
                  onClick={simulateSaleForCurrent}
                  className="w-full h-9 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-zinc-900 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                  data-testid="btn-simulate-sale-override"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Log 500 XLM Sale (+10 XLM Override)</span>
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* View 2: Recruited Partners List Table */}
      {activeTab === "table" && (
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-black text-zinc-900 dark:text-white">
                Recruited Sub-Affiliates Network
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 mt-1">
                All marketers bound to your referral code receiving 8% direct / 2% override split.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setIsInviteModalOpen(true)}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
            >
              <Users className="w-3.5 h-3.5 mr-1" />
              <span>Invite New Marketer</span>
            </Button>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/50 font-extrabold text-zinc-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Marketer Alias & Wallet</th>
                  <th className="py-3 px-6">Tier Level</th>
                  <th className="py-3 px-6">Sales Driven</th>
                  <th className="py-3 px-6">Total Sales Volume</th>
                  <th className="py-3 px-6">Your 2% Override</th>
                  <th className="py-3 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {relations.map((rel) => (
                  <tr
                    key={rel.childAddress}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                    data-testid={`row-recruit-${rel.childAddress}`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-900 dark:text-white">
                          {rel.childName}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400 mt-0.5">
                          <span>{formatAffiliateAddress(rel.childAddress)}</span>
                          <CopyButton text={rel.childAddress} label="Copy" size="sm" />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Tier {rel.tier}
                      </span>
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
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* View 3: Recent Override Commission Receipts */}
      {activeTab === "overrides" && (
        <Card className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-100 dark:border-zinc-800">
            <CardTitle className="text-lg font-black text-zinc-900 dark:text-white">
              Passive Override Settlement Ledger
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 mt-1">
              Historical ledger of passive 2% override commissions settled atomically via Soroban escrow.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            {summary.recentOverrides.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-850/50 font-extrabold text-zinc-400 uppercase tracking-wider">
                    <th className="py-3 px-6">Timestamp</th>
                    <th className="py-3 px-6">Sub-Affiliate Recipient</th>
                    <th className="py-3 px-6">Sale Amount</th>
                    <th className="py-3 px-6 font-bold text-indigo-600">Passive Override (2%)</th>
                    <th className="py-3 px-6 text-right">Transaction Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 font-mono">
                  {summary.recentOverrides.map((ovr) => (
                    <tr key={ovr.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                      <td className="py-3 px-6 text-zinc-500">
                        {new Date(ovr.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-6 text-zinc-900 dark:text-white font-bold">
                        {ovr.subAffiliateName} ({formatAffiliateAddress(ovr.subAffiliateAddress)})
                      </td>
                      <td className="py-3 px-6 font-bold">{ovr.saleAmountXlm} XLM</td>
                      <td className="py-3 px-6 text-emerald-600 dark:text-emerald-400 font-black">
                        +{ovr.overrideEarnedXlm} XLM
                      </td>
                      <td className="py-3 px-6 text-right text-zinc-400 text-[10px]">
                        {ovr.txHash ? ovr.txHash.slice(0, 10) + "..." : "Simulated On-Chain"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs">
                No recent override settlements recorded. Recruited marketers will generate passive overrides here when driving sales.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
