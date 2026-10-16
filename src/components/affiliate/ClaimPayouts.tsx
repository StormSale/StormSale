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
} from "lucide-react";
import {
  type ClaimableCampaignItem,
  type BatchClaimReceipt,
  fetchAffiliateMaturedClaims,
  calculateTotalClaimableXlm,
} from "../../lib/batchClaim";
import { motion, AnimatePresence } from "framer-motion";

export const ClaimPayouts = () => {
  const { userAddress, batchClaimPayoutsOnChain, claimPayoutOnChain } = useWeb3();
  const { showNotification } = useNotification();

  const [campaigns, setCampaigns] = useState<ClaimableCampaignItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBatchClaiming, setIsBatchClaiming] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<BatchClaimReceipt | null>(null);

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
      const resultReceipt = await batchClaimPayoutsOnChain(selectedCampaigns);
      setReceipt(resultReceipt);

      // Mark claimed campaigns
      setCampaigns((prev) =>
        prev.map((c) => (selectedIds.includes(c.campaignId) ? { ...c, status: "claimed" } : c)),
      );
      setSelectedIds([]);

      showNotification({
        type: "success",
        title: "Batch Commission Claim Settled!",
        message: `Claimed ${resultReceipt.totalClaimedXlm} XLM across ${resultReceipt.itemizedClaims.length} campaigns in 1 transaction.`,
      });
    } catch (err: unknown) {
      console.error("Batch claim failure:", err);
      showNotification({
        type: "error",
        title: "Batch Claim Failed",
        message: err instanceof Error ? err.message : "Failed to execute batch claim transaction.",
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
      const res = await claimPayoutOnChain(campaignId);
      setCampaigns((prev) =>
        prev.map((c) => (c.campaignId === campaignId ? { ...c, status: "claimed" } : c)),
      );
      showNotification({
        type: "success",
        title: "Commission Paid Out!",
        message: `Settled on Stellar ledger. Tx: ${res.txHash ? res.txHash.slice(0, 10) + "..." : "Confirmed"}`,
      });
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Claim Failed",
        message: err instanceof Error ? err.message : "Failed to claim commission.",
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
              disabled={isBatchClaiming || selectedCampaigns.length === 0}
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
                          disabled={!isMatured || claimingId === camp.campaignId || isBatchClaiming}
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
