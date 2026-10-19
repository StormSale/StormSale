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
import { shouldDeliverAffiliateNotification } from "./AffiliateSettings";

export const ClaimPayouts = () => {
  const { userAddress, batchClaimPayoutsOnChain, claimPayoutOnChain } = useWeb3();
  const { showNotification } = useNotification();

  const [campaigns, setCampaigns] = useState<ClaimableCampaignItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isBatchClaiming, setIsBatchClaiming] = useState(false);
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<BatchClaimReceipt | null>(null);
  const [optimisticClaimedIds, setOptimisticClaimedIds] = useState<number[]>([]);
  const [pendingClaimIds, setPendingClaimIds] = useState<number[]>([]);

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

    const idsToClaim = [...selectedIds];
    // Optimistic update: instantly reflect claimed state before mining
    setOptimisticClaimedIds((prev) => [...prev, ...idsToClaim]);
    setPendingClaimIds((prev) => [...prev, ...idsToClaim]);
    setSelectedIds([]);

    setIsBatchClaiming(true);
    showNotification({
      type: "info",
      title: "Assembling Batch Claim",
      message: `Bundling ${selectedCampaigns.length} Soroban invocations into a single Stellar transaction...`,
    });

    try {
      const resultReceipt = await batchClaimPayoutsOnChain(selectedCampaigns);
      setReceipt(resultReceipt);

      // Confirm claimed campaigns
      setCampaigns((prev) =>
        prev.map((c) => (idsToClaim.includes(c.campaignId) ? { ...c, status: "claimed" } : c)),
      );

      if (shouldDeliverAffiliateNotification("payout")) {
        showNotification({
          type: "success",
          title: "Batch Commission Claim Settled!",
          message: `Claimed ${resultReceipt.totalClaimedXlm} XLM across ${resultReceipt.itemizedClaims.length} campaigns in 1 transaction.`,
        });
      }
    } catch (err: any) {
      console.error("Batch claim failure:", err);
      // Revert optimistic state on failure
      setOptimisticClaimedIds((prev) => prev.filter((id) => !idsToClaim.includes(id)));
      setSelectedIds(idsToClaim);
      showNotification({
        type: "error",
        title: "Batch Claim Failed",
        message: err.message || "Failed to execute batch claim transaction.",
      });
    } finally {
      setIsBatchClaiming(false);
      setPendingClaimIds((prev) => prev.filter((id) => !idsToClaim.includes(id)));
    }
  };

  // Individual campaign claim fallback
  const handleSingleClaim = async (campaignId: number) => {
    setClaimingId(campaignId);
    // Optimistic update: instantly reflect claimed state before mining
    setOptimisticClaimedIds((prev) => [...prev, campaignId]);
    setPendingClaimIds((prev) => [...prev, campaignId]);

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
      // Revert optimistic state on failure
      setOptimisticClaimedIds((prev) => prev.filter((id) => id !== campaignId));
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
                    Claim All ({selectedCampaigns.length} Campaigns) • {" "}
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
                <TableRow className="border-b border-slate-100 dark:border-zinc-800/60">
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Matured</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {campaigns.map((campaign) => {
                    const isOptimisticClaimed = optimisticClaimedIds.includes(campaign.campaignId);
                    const isPending = pendingClaimIds.includes(campaign.campaignId);
                    const effectiveStatus = isOptimisticClaimed ? "claimed" : campaign.status;
                    const isClaimed = effectiveStatus === "claimed";
                    const isMatured = effectiveStatus === "matured";
                    const isSelected = selectedIds.includes(campaign.campaignId);
                    const isSingleClaiming = claimingId === campaign.campaignId;

                    return (
                      <motion.tr
                        key={campaign.campaignId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-slate-100 dark:border-zinc-800/60 transition-colors hover:bg-slate-50 dark:hover:bg-zinc-800/30"
                      >
                        <TableCell className="w-12">
                          {isMatured ? (
                            <button
                              type="button"
                              onClick={() => toggleSelectCampaign(campaign.campaignId)}
                              className="text-indigo-600 dark:text-indigo-400 hover:opacity-80"
                              aria-label={isSelected ? "Deselect campaign" : "Select campaign"}
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block w-5 h-5" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-zinc-900 dark:text-white">
                              {campaign.campaignName || `Campaign #${campaign.campaignId}`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isPending ? (
                            <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Pending</span>
                            </span>
                          ) : isClaimed ? (
                            <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Claimed</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Matured</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                          {campaign.maturedAt
                            ? new Date(campaign.maturedAt).toLocaleDateString()
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-zinc-900 dark:text-white">
                          {campaign.commissionXlm.toFixed(2)} XLM
                        </TableCell>
                        <TableCell className="text-right">
                          {isMatured ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSingleClaim(campaign.campaignId)}
                              disabled={isSingleClaiming || isBatchClaiming}
                              className="rounded-xl text-xs font-bold"
                            >
                              {isSingleClaiming ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                                  <span>Claiming...</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="w-3.5 h-3.5 mr-1.5" />
                                  <span>Claim</span>
                                </>
                              )}
                            </Button>
                          ) : isClaimed ? (
                            <span className="inline-flex items-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Settled
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Batch Receipt Drawer */}
      <AnimatePresence>
        {receipt && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="rounded-3xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-900/20 p-6 sm:p-8 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h4 className="font-bold text-emerald-900 dark:text-emerald-200">
                  Batch Claim Receipt
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="text-emerald-700 dark:text-emerald-300 hover:opacity-70"
                aria-label="Dismiss receipt"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-emerald-800 dark:text-emerald-300">
              Total claimed: <strong>{receipt.totalClaimedXlm} XLM</strong> across {
                receipt.itemizedClaims.length
              } campaigns.
            </div>
            {receipt.txHash && (
              <a
                href={`https://stellarexpert.org/tx/${receipt.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                <span>View transaction on Stellar Expert</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};