import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import {
  Zap,
  Clock,
  CheckCircle2,
  Layers,
  ExternalLink,
  ShieldCheck,
  CheckSquare,
  Square,
  Sparkles,
  Loader2,
  X,
  Repeat,
} from "lucide-react";
import {
  type ClaimableCampaignItem,
  type BatchClaimReceipt,
  fetchAffiliateMaturedClaims,
  calculateTotalClaimableXlm,
} from "../../lib/batchClaim";
import {
  loadAffiliatePreferences,
  shouldDeliverAffiliateNotification,
} from "./AffiliateSettings";
import { resolveActiveSplitPlan, formatStroopsAsXlm } from "../../lib/commissionSplit";
import {
  type AutoSwapConfig,
  type SwapToken,
  quoteSwap,
  toBaseUnits,
  formatBaseUnits,
} from "../../lib/sorobanDex";
import { motion, AnimatePresence } from "framer-motion";

const SWAP_TARGET_TOKENS: SwapToken[] = ["USDC", "EURC", "XLM"];
const SLIPPAGE_PRESETS = [50, 100, 300];

export const ClaimPayouts = () => {
  const { userAddress, batchClaimPayoutsOnChain, claimPayoutOnChain } = useWeb3();
  const { showNotification } = useNotification();

  const [campaigns, setCampaigns] = useState<ClaimableCampaignItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBatchClaiming, setIsBatchClaiming] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<BatchClaimReceipt | null>(null);

  // Auto-Swap on Claim (Issue #127)
  const [autoSwapEnabled, setAutoSwapEnabled] = useState(false);
  const [targetToken, setTargetToken] = useState<SwapToken>("USDC");
  const [maxSlippageBps, setMaxSlippageBps] = useState(100);

  useEffect(() => {
    async function loadClaims() {
      const data = await fetchAffiliateMaturedClaims(userAddress || "");
      setCampaigns(data);
      // Select all matured campaigns by default
      const matured = data.filter((c) => c.status === "matured").map((c) => c.campaignId);
      setSelectedIds(matured);
    }
    loadClaims();
  }, [userAddress]);

  const selectedCampaigns = campaigns.filter((c) => selectedIds.includes(c.campaignId));
  const totalWithdrawableXlm = calculateTotalClaimableXlm(selectedCampaigns);
  const maturedCount = campaigns.filter((c) => c.status === "matured").length;

  // Build the auto-swap config from current selections. Disabled when the
  // affiliate targets XLM (their native payout) or has the toggle off.
  const autoSwapConfig: AutoSwapConfig | null =
    autoSwapEnabled && targetToken !== "XLM"
      ? { enabled: true, tokenIn: "XLM", targetToken, maxSlippageBps }
      : null;

  // Live quote preview for the currently selected claim total.
  const swapQuote = (() => {
    if (!autoSwapConfig || totalWithdrawableXlm <= 0) return null;
    try {
      return quoteSwap(
        toBaseUnits(totalWithdrawableXlm, "XLM"),
        "XLM",
        targetToken,
        maxSlippageBps,
      );
    } catch {
      return null;
    }
  })();

  const toggleSelectAll = () => {
    if (selectedIds.length === maturedCount) {
      setSelectedIds([]);
    } else {
      setSelectedIds(campaigns.filter((c) => c.status === "matured").map((c) => c.campaignId));
    }
  };

  const toggleSelectCampaign = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // 1-Click Automated Batch Claim Dispatcher
  const handleBatchClaim = async () => {
    if (selectedCampaigns.length === 0) return;

    setIsBatchClaiming(true);
    showNotification({
      type: "info",
      title: "Assembling Batch Claim",
      message: `Bundling ${selectedCampaigns.length} Soroban invocations into a single Stellar transaction...`,
    });

    try {
      // Apply the affiliate's auto-split plan (if enabled & valid) so the claimed
      // total is routed across vault destinations inside the same atomic envelope.
      const splitPlan = resolveActiveSplitPlan(loadAffiliatePreferences());
      const resultReceipt = await batchClaimPayoutsOnChain(selectedCampaigns, splitPlan, autoSwapConfig);
      setReceipt(resultReceipt);

      // Mark claimed campaigns
      setCampaigns((prev) =>
        prev.map((c) => (selectedIds.includes(c.campaignId) ? { ...c, status: "claimed" } : c)),
      );
      setSelectedIds([]);

      if (shouldDeliverAffiliateNotification("payout")) {
        const swapNote = resultReceipt.autoSwap
          ? ` Auto-swapped ≈ ${resultReceipt.autoSwap.expectedOut} ${resultReceipt.autoSwap.tokenOut} via ${resultReceipt.autoSwap.routerName}.`
          : "";
        showNotification({
          type: "success",
          title: "Batch Commission Claim Settled!",
          message: `Claimed ${resultReceipt.totalClaimedXlm} XLM across ${resultReceipt.itemizedClaims.length} campaigns in 1 transaction.${swapNote}`,
        });
      }
    } catch (err: any) {
      console.error("Batch claim failure:", err);
      showNotification({
        type: "error",
        title: "Batch Claim Failed",
        message: err.message || "Failed to execute batch claim transaction.",
      });
    } finally {
      setIsBatchClaiming(false);
    }
  };

  // Individual campaign claim fallback
  const handleSingleClaim = async (campaignId: number) => {
    setClaimingId(campaignId);
    showNotification({
      type: "info",
      title: "Claiming Commission",
      message: `Submitting Soroban claim_payout for Campaign #${campaignId}...`,
    });

    try {
      const target = campaigns.find((c) => c.campaignId === campaignId);
      const res = await claimPayoutOnChain(campaignId, target?.assetCode);
      setCampaigns((prev) =>
        prev.map((c) => (c.campaignId === campaignId ? { ...c, status: "claimed" } : c)),
      );
      if (shouldDeliverAffiliateNotification("payout")) {
        showNotification({
          type: "success",
          title: "Commission Paid Out!",
          message: `Settled on Stellar ledger. Tx: ${res.txHash ? res.txHash.slice(0, 10) + "..." : "Confirmed"}`,
        });
      }
    } catch (err: any) {
      showNotification({
        type: "error",
        title: "Claim Failed",
        message: err.message || "Failed to claim commission.",
      });
    } finally {
      setClaimingId(null);
    }
  };
  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Commission Claims & Payouts
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
          Matured commissions cleared by Soroban smart contract escrow are ready to withdraw.
        </p>
      </div>

      {/* Hero Dispatcher Card: Automated Batch Claim Dispatcher */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-zinc-900 to-black text-white p-6 sm:p-8 shadow-2xl border border-indigo-500/20"
      >
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-xs font-bold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Automated 1-Click Multi-Campaign Dispatcher</span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black tracking-tight">
              Batch Claim All Matured Commissions
            </h3>

            <p className="text-sm text-zinc-300 leading-relaxed">
              Bundle multiple <code className="font-mono text-indigo-300">claim_payout</code>{" "}
              Soroban contract calls into a single Stellar transaction. Sign once and withdraw all
              eligible XLM directly to your wallet without separate prompts.
            </p>

            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-zinc-400">
              <span className="flex items-center">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Single Transaction Envelope
              </span>
              <span className="flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                Atomic Ledger Settlement
              </span>
              <span className="flex items-center">
                <Zap className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Zero Multiple Approval Hassle
              </span>
            </div>
          </div>

          {/* Right Action Box */}
          <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 flex flex-col items-center justify-center text-center min-w-[280px] space-y-4">
            <div>
              <div className="text-xs uppercase font-extrabold tracking-wider text-indigo-300">
                Total Withdrawable
              </div>
              <div className="text-3xl sm:text-4xl font-black text-white mt-1">
                {totalWithdrawableXlm.toFixed(2)}{" "}
                <span className="text-lg font-bold text-indigo-400">XLM</span>
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                {selectedCampaigns.length} Campaign{selectedCampaigns.length !== 1 ? "s" : ""}{" "}
                Selected
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleBatchClaim}
              disabled={selectedCampaigns.length === 0}
              loading={isBatchClaiming}
              cooldown
              className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-600 hover:from-indigo-400 hover:to-sky-400 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/30 h-13 px-6 transition-transform hover:scale-[1.02] border-0"
            >
              {isBatchClaiming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>Signing Single Envelope...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  <span>
                    Claim All ({selectedCampaigns.length} Campaigns) •{" "}
                    {totalWithdrawableXlm.toFixed(2)} XLM
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Auto-Swap on Claim configuration (#127) */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-sky-600/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                <Repeat className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Auto-Swap on Claim
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 max-w-md">
                  Route claimed XLM through Soroban DEX pools (Soroswap / Phoenix) into your target
                  token atomically — the swap settles in the same transaction as the claim.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={autoSwapEnabled}
              data-testid="auto-swap-toggle"
              onClick={() => setAutoSwapEnabled((v) => !v)}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                autoSwapEnabled ? "bg-sky-600" : "bg-slate-200 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  autoSwapEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {autoSwapEnabled && (
            <div className="grid md:grid-cols-2 gap-5 pt-2 border-t border-slate-100 dark:border-zinc-800">
              {/* Target token */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Target token
                </div>
                <div className="flex flex-wrap gap-2">
                  {SWAP_TARGET_TOKENS.map((token) => {
                    const isActive = targetToken === token;
                    return (
                      <button
                        key={token}
                        type="button"
                        onClick={() => setTargetToken(token)}
                        aria-pressed={isActive}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          isActive
                            ? "bg-sky-600 border-sky-600 text-white"
                            : "bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-sky-300"
                        }`}
                      >
                        {token}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slippage tolerance */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                  Max slippage tolerance
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {SLIPPAGE_PRESETS.map((bps) => {
                    const isActive = maxSlippageBps === bps;
                    return (
                      <button
                        key={bps}
                        type="button"
                        onClick={() => setMaxSlippageBps(bps)}
                        aria-pressed={isActive}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          isActive
                            ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent"
                            : "bg-slate-50 dark:bg-zinc-950/50 border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {(bps / 100).toFixed(2)}%
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    aria-label="Custom slippage percent"
                    value={(maxSlippageBps / 100).toFixed(2)}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value);
                      if (Number.isFinite(pct)) {
                        setMaxSlippageBps(Math.max(0, Math.min(10000, Math.round(pct * 100))));
                      }
                    }}
                    className="w-24 h-8 rounded-lg border-2 border-slate-200 dark:border-zinc-800 bg-background px-2 text-xs font-mono text-right"
                  />
                </div>
              </div>

              {/* Quote preview */}
              <div className="md:col-span-2 rounded-2xl border border-sky-100 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/10 p-4">
                {targetToken === "XLM" ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Targeting XLM means no swap — commissions settle in their native payout asset.
                  </p>
                ) : swapQuote ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="text-[11px] uppercase font-bold tracking-wider text-sky-700 dark:text-sky-300">
                        You will receive (estimated)
                      </div>
                      <div className="text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                        {formatBaseUnits(swapQuote.expectedOut, swapQuote.to)} {swapQuote.to}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        Min. out after {maxSlippageBps} bps slippage:{" "}
                        <span className="font-mono font-bold">
                          {formatBaseUnits(swapQuote.minimumOut, swapQuote.to)} {swapQuote.to}
                        </span>
                      </div>
                    </div>
                    <div className="text-left sm:text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                      <div>
                        Router:{" "}
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">
                          {swapQuote.routerName}
                        </span>
                      </div>
                      <div>Hops: {swapQuote.route.hops.length}</div>
                      <div>
                        Price impact:{" "}
                        <span className="font-mono font-bold">
                          {(swapQuote.priceImpactBps / 100).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Select at least one matured campaign to preview a swap quote.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
        <CardHeader className="pt-6 px-6 sm:px-8 pb-4 border-b border-slate-100 dark:border-zinc-800/60 flex flex-row items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-500/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                Active Campaign Clearing Escrow
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Select campaigns to include in your 1-click batch withdrawal.
              </CardDescription>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1.5"
          >
            {selectedIds.length === maturedCount ? (
              <>
                <CheckSquare className="w-4 h-4" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" />
                <span>Select All ({maturedCount})</span>
              </>
            )}
          </button>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 dark:border-zinc-800/60 bg-slate-50 dark:bg-zinc-950/50">
                  <TableHead className="w-12 pl-6 py-4">
                    <span className="sr-only">Select</span>
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 py-4">
                    Campaign
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 py-4">
                    Matured Sales
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 py-4">
                    Claimable Commission
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 py-4">
                    Status
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-zinc-500 py-4 pr-6 text-right">
                    Individual Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((camp) => {
                  const isMatured = camp.status === "matured";
                  const isClaimed = camp.status === "claimed";
                  const isSelected = selectedIds.includes(camp.campaignId);

                  return (
                    <TableRow
                      key={camp.campaignId}
                      className={`border-b border-slate-50 dark:border-zinc-900 transition-colors ${
                        isSelected
                          ? "bg-indigo-50/40 dark:bg-indigo-950/20"
                          : "hover:bg-slate-50/50 dark:hover:bg-zinc-900/30"
                      }`}
                    >
                      <TableCell className="pl-6 py-4">
                        <button
                          type="button"
                          disabled={!isMatured}
                          onClick={() => toggleSelectCampaign(camp.campaignId)}
                          className={`p-1 rounded-md transition-colors ${
                            !isMatured
                              ? "opacity-30 cursor-not-allowed text-zinc-400"
                              : isSelected
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-zinc-400 hover:text-zinc-600"
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </TableCell>

                      <TableCell className="py-4">
                        <div className="font-bold text-sm text-zinc-900 dark:text-white">
                          {camp.campaignName}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                          ID #{camp.campaignId} • Clearing: {camp.clearingPeriodDays}d window
                        </div>
                      </TableCell>

                      <TableCell className="py-4 font-semibold text-xs text-zinc-700 dark:text-zinc-300">
                        {camp.maturedSalesCount} Verified Sales
                      </TableCell>

                      <TableCell className="py-4">
                        <span className="font-black text-sm text-indigo-600 dark:text-indigo-400 font-mono">
                          {camp.claimableXlm.toFixed(2)} XLM
                        </span>
                      </TableCell>

                      <TableCell className="py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isClaimed
                              ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                              : isMatured
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                          }`}
                        >
                          {isClaimed ? (
                            <CheckCircle2 className="w-3 h-3 text-zinc-500" />
                          ) : isMatured ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Clock className="w-3 h-3 text-amber-500" />
                          )}
                          {isClaimed ? "Claimed" : isMatured ? "Matured • Cleared" : "In Clearing"}
                        </span>
                      </TableCell>

                      <TableCell className="py-4 pr-6 text-right">
                        <Button
                          size="sm"
                          disabled={!isMatured || isBatchClaiming}
                          loading={claimingId === camp.campaignId}
                          cooldown
                          onClick={() => handleSingleClaim(camp.campaignId)}
                          className={`rounded-xl text-xs font-semibold h-8 px-3 transition-colors ${
                            isMatured
                              ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white"
                              : "bg-slate-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed"
                          }`}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          {claimingId === camp.campaignId ? "Claiming..." : "Claim Single"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Success Modal Itemizing Claimed Amounts */}
      <AnimatePresence>
        {receipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReceipt(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-md"
            />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 z-10 my-auto"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                      Batch Payout Complete!
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Settled on Stellar Ledger in a single transaction.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Total Summary */}
              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-center space-y-1">
                <div className="text-xs uppercase font-extrabold text-emerald-700 dark:text-emerald-400">
                  Total Commission Received
                </div>
                <div className="text-3xl font-black text-emerald-900 dark:text-emerald-200">
                  +{receipt.totalClaimedXlm.toFixed(2)} XLM
                </div>
                <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                  Transaction: {receipt.txHash.slice(0, 12)}...{receipt.txHash.slice(-8)}
                </div>
              </div>

              {/* Itemized Breakdown Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Itemized Campaign Breakdown ({receipt.itemizedClaims.length} Campaigns)
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-zinc-800 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                  {receipt.itemizedClaims.map((item) => (
                    <div
                      key={item.campaignId}
                      className="p-3.5 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-zinc-900/50"
                    >
                      <div>
                        <div className="font-bold text-zinc-900 dark:text-white">
                          {item.campaignName}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-500">
                          Campaign #{item.campaignId}
                        </div>
                      </div>
                      <div className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400">
                        +{item.claimedXlm.toFixed(2)} XLM
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-Split Payment Operations Breakdown (#167) */}
              {receipt.splitAllocations && receipt.splitAllocations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Auto-Split Payment Operations ({receipt.paymentOperationCount} ops • same
                    transaction)
                  </div>
                  <div className="rounded-2xl border border-sky-100 dark:border-sky-900/50 overflow-hidden divide-y divide-sky-100 dark:divide-sky-900/40 bg-sky-50/40 dark:bg-sky-950/10">
                    {receipt.splitAllocations.map((alloc, i) => (
                      <div
                        key={`${alloc.address}-${i}`}
                        className="p-3.5 flex items-center justify-between text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                              Op #{receipt.itemizedClaims.length + i + 1}
                            </span>
                            <span className="truncate">{alloc.label || "Destination"}</span>
                          </div>
                          <div className="text-[11px] font-mono text-zinc-500 mt-1">
                            {alloc.address.slice(0, 6)}...{alloc.address.slice(-4)} •{" "}
                            {alloc.percentage}% • balance after payout:{" "}
                            {formatStroopsAsXlm(BigInt(alloc.amountStroops))} XLM
                          </div>
                        </div>
                        <div className="font-mono font-black text-sm text-sky-700 dark:text-sky-300 ml-3 shrink-0">
                          +{alloc.amountXlm.toFixed(2)} XLM
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-Swap on Claim settlement breakdown (#127) */}
              {receipt.autoSwap && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Atomic Cross-DEX Swap ({receipt.autoSwap.routerName} •{" "}
                    {receipt.autoSwap.hopCount} hop{receipt.autoSwap.hopCount === 1 ? "" : "s"})
                  </div>
                  <div className="rounded-2xl border border-sky-100 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/10 p-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">Swapped in</span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white">
                        {receipt.autoSwap.amountIn} {receipt.autoSwap.tokenIn}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">Received (est.)</span>
                      <span className="font-mono font-black text-sky-700 dark:text-sky-300">
                        {receipt.autoSwap.expectedOut} {receipt.autoSwap.tokenOut}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Minimum out ({(receipt.autoSwap.maxSlippageBps / 100).toFixed(2)}% slippage)
                      </span>
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                        {receipt.autoSwap.minimumOut} {receipt.autoSwap.tokenOut}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 pt-1 border-t border-sky-100 dark:border-sky-900/40">
                      Path: {receipt.autoSwap.footprint.join(" → ")}
                    </div>
                  </div>
                </div>
              )}

              {/* Explorer Link & Close Button */}
              <div className="pt-2 flex items-center justify-between">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${receipt.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center"
                >
                  <span>Verify on Stellar Expert</span>
                  <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </a>

                <Button
                  onClick={() => setReceipt(null)}
                  className="rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold px-5 h-9"
                >
                  Done
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
