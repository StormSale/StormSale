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
  Lock,
} from "lucide-react";
import {
  type ClaimableCampaignItem,
  type BatchClaimReceipt,
  fetchAffiliateMaturedClaims,
  calculateTotalClaimableXlm,
} from "../../lib/batchClaim";
import { loadAffiliatePreferences, shouldDeliverAffiliateNotification } from "./AffiliateSettings";
import { resolveActiveSplitPlan, formatStroopsAsXlm } from "../../lib/commissionSplit";
import {
  type AutoSwapConfig,
  type SwapToken,
  quoteSwap,
  toBaseUnits,
  formatBaseUnits,
} from "../../lib/sorobanDex";
import { isAffiliatePaused, fetchAuthoritativeAffiliatePauseState } from "../../lib/fraudRiskEngine";
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
  const [pendingClaimIds, setPendingClaimIds] = useState<number[]>([]);
  const [pendingBatchIds, setPendingBatchIds] = useState<number[]>([]);

  const [isFrozen, setIsFrozen] = useState(() => (userAddress ? isAffiliatePaused(userAddress) : false));

  useEffect(() => {
    let active = true;
    if (!userAddress) {
      setIsFrozen(false);
      return;
    }
    setIsFrozen(isAffiliatePaused(userAddress));
    fetchAuthoritativeAffiliatePauseState(userAddress).then((paused) => {
      if (active) setIsFrozen(paused);
    });
    return () => {
      active = false;
    };
  }, [userAddress]);

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

    if (isFrozen) {
      showNotification({
        type: "error",
        title: "Payout Claims Frozen",
        message: "Your affiliate account is paused pending fraud risk review by the advertiser.",
      });
      return;
    }

    // Optimistic UI: instantly mark selected campaigns as claimed (<50ms feedback)
    const idsToClaim = selectedCampaigns.map((c) => c.campaignId);
    const previousStatuses = new Map(selectedCampaigns.map((c) => [c.campaignId, c.status]));
    setPendingBatchIds(idsToClaim);
    setCampaigns((prev) =>
      prev.map((c) => (idsToClaim.includes(c.campaignId) ? { ...c, status: "claimed" } : c)),
    );
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
      // Revert optimistic state on failure
      setCampaigns((prev) =>
        prev.map((c) =>
          idsToClaim.includes(c.campaignId)
            ? { ...c, status: previousStatuses.get(c.campaignId) ?? "matured" }
            : c,
        ),
      );
      setSelectedIds(idsToClaim);
      showNotification({
        type: "error",
        title: "Batch Claim Failed",
        message: err.message || "Failed to execute batch claim transaction.",
      });
    } finally {
      setIsBatchClaiming(false);
      setPendingBatchIds([]);
    }
  };

  // Individual campaign claim fallback
  const handleSingleClaim = async (campaignId: number) => {
    if (isFrozen) {
      showNotification({
        type: "error",
        title: "Payout Claims Frozen",
        message: "Your affiliate account is paused pending fraud risk review by the advertiser.",
      });
      return;
    }

    setClaimingId(campaignId);
    const previousStatus = campaigns.find((c) => c.campaignId === campaignId)?.status;
    // Optimistic UI: instantly mark campaign as claimed (<50ms feedback)
    setPendingClaimIds((prev) => [...prev, campaignId]);
    setCampaigns((prev) =>
      prev.map((c) => (c.campaignId === campaignId ? { ...c, status: "claimed" } : c)),
    );
    showNotification({
      type: "info",
      title: "Claiming Commission",
      message: `Submitting Soroban claim_payout for Campaign #${campaignId}...`,
    });

    try {
      const target = campaigns.find((c) => c.campaignId === campaignId);
      const res = await claimPayoutOnChain(campaignId, target?.assetCode);
      if (shouldDeliverAffiliateNotification("payout")) {
        showNotification({
          type: "success",
          title: "Commission Paid Out!",
          message: `Settled on Stellar ledger. Tx: ${res.txHash ? res.txHash.slice(0, 10) + "..." : "Confirmed"}`,
        });
      }
    } catch (err: any) {
      // Revert optimistic state on failure
      setCampaigns((prev) =>
        prev.map((c) =>
          c.campaignId === campaignId
            ? { ...c, status: previousStatus ?? "matured" }
            : c,
        ),
      );
      showNotification({
        type: "error",
        title: "Claim Failed",
        message: err.message || "Failed to claim commission.",
      });
    } finally {
      setClaimingId(null);
      setPendingClaimIds((prev) => prev.filter((id) => id !== campaignId));
    }
  };

  return (
    <div className="space-y-8 pb-12" data-testid="claim-payouts-view">
      {/* Page Title */}
      <div>
        <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Commission Claims & Payouts
        </h2>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium">
          Matured commissions cleared by Soroban smart contract escrow are ready to withdraw.
        </p>
      </div>

      {/* Frozen Alert Banner (#152) */}
      {isFrozen && (
        <div
          role="alert"
          className="p-5 rounded-3xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100 flex items-start gap-3 shadow-md"
          data-testid="banner-affiliate-frozen"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm">Commission Payouts Frozen Pending Review</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 leading-relaxed">
              Your wallet has been paused from withdrawing or claiming commission payouts by the
              advertiser due to statistical conversion velocity anomalies or click injection flags.
              Please reach out to campaign compliance to request an unfreeze review.
            </p>
          </div>
        </div>
      )}

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
              loading={isBatchClaiming}
              cooldown
              disabled={isBatchClaiming || selectedCampaigns.length === 0 || isFrozen}
              className={`w-full rounded-2xl text-white font-extrabold text-sm h-13 px-6 transition-transform border-0 ${
                isFrozen
                  ? "bg-zinc-800 text-zinc-400 cursor-not-allowed opacity-70"
                  : "bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-600 hover:from-indigo-400 hover:to-sky-400 shadow-xl shadow-indigo-500/30 hover:scale-[1.02]"
              }`}
              data-testid="btn-batch-claim"
            >
              {isBatchClaiming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span>Signing Single Envelope...</span>
                </>
              ) : isFrozen ? (
                <>
                  <Lock className="w-4 h-4 mr-2 text-rose-400" />
                  <span>Payouts Frozen (Review Pending)</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  <span>
                    Claim All ({selectedCampaigns.length} Campaigns) • {" "}
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
            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1.5"
          >
            {selectedIds.length === maturedCount && maturedCount > 0 ? (
              <>
                <CheckSquare className="w-4 h-4" />
                <span>Deselect All</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" />
                <span>Select All Matured</span>
              </>
            )}
          </button>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Maturity</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {campaigns.map((campaign) => {
                  const isSelected = selectedIds.includes(campaign.campaignId);
                  const isPending =
                    pendingClaimIds.includes(campaign.campaignId) ||
                    pendingBatchIds.includes(campaign.campaignId);
                  const isClaimed = campaign.status === "claimed";
                  const isMatured = campaign.status === "matured";

                  return (
                    <motion.tr
                      key={campaign.campaignId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-slate-100 dark:border-zinc-800/60 transition-colors hover:bg-slate-50/90 dark:hover:bg-zinc-800/30"
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleSelectCampaign(campaign.campaignId)}
                          disabled={!isMatured || isPending}
                          className="text-indigo-600 disabled:opacity-40"
                          aria-label={isSelected ? "Deselect campaign" : "Select campaign"}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold text-zinc-900 dark:text-white">
                          {campaign.campaignName}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Campaign #{campaign.campaignId}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Settling
                          </span>
                        ) : isClaimed ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Claimed
                          </span>
                        ) : isMatured ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                            <Zap className="w-3.5 h-3.5" />
                            Matured
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                            <Clock className="w-3.5 h-3.5" />
                            Locked
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-semibold text-zinc-900 dark:text-white">
                          {campaign.claimableXlm.toFixed(2)} <span className="text-xs text-zinc-500">XLM</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-zinc-500">
                          {campaign.maturesAt
                            ? new Date(campaign.maturesAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSingleClaim(campaign.campaignId)}
                          disabled={!isMatured || isPending || isClaimed || isBatchClaiming || isFrozen}
                          loading={claimingId === campaign.campaignId}
                          cooldown
                          className={`rounded-xl text-xs font-bold ${
                            isFrozen
                              ? "bg-zinc-800 text-zinc-400 cursor-not-allowed opacity-70"
                              : ""
                          }`}
                          data-testid={`btn-claim-single-${campaign.campaignId}`}
                        >
                          {isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isFrozen ? (
                            <>
                              <Lock className="w-3 h-3 mr-1 text-rose-400" />
                              <span>Frozen</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5 mr-1" />
                              <span>
                                {claimingId === campaign.campaignId ? "Claiming..." : "Claim"}
                              </span>
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>

          {campaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <Layers className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-500">
                No claimable commissions yet. Keep referring to earn more.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settlement Receipt */}
      <AnimatePresence>
        {receipt && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="relative rounded-3xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-6 sm:p-8"
          >
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
              aria-label="Dismiss receipt"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-300">
                Batch Claim Settled
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  Total Claimed
                </div>
                <div className="font-mono font-bold text-zinc-900 dark:text-white">
                  {receipt.totalClaimedXlm} XLM
                </div>
              </div>
              <div>
                <div className="text-xs uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  Campaigns
                </div>
                <div className="font-mono font-bold text-zinc-900 dark:text-white">
                  {receipt.itemizedClaims.length}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase font-bold text-emerald-700 dark:text-emerald-400">
                  Transaction
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
                  href={receipt.txHash ? `https://stellarchain.org/tx/${receipt.txHash}` : "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono font-bold text-indigo-600 hover:underline"
                >
                  {receipt.txHash ? `${receipt.txHash.slice(0, 10)}...` : "Confirmed"}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};