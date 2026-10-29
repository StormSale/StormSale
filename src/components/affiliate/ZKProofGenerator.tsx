import React, { useState } from "react";
import {
  ShieldCheck,
  Award,
  Sparkles,
  Lock,
  Share2,
  CheckCircle2,
  DollarSign,
  Layers,
  Database,
  EyeOff,
  RefreshCw,
  FileCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { useZKProof } from "../../hooks/useZKProof";
import { VerifiedRevenueBadge } from "./VerifiedRevenueBadge";
import { ZKProofVerifierModal } from "./ZKProofVerifierModal";
import { REVENUE_TIERS } from "../../lib/zkProofEngine";

export const ZKProofGenerator: React.FC = () => {
  const {
    conversions,
    totalCompiledRevenueUsd,
    qualifiedTier,
    proofs,
    activeBadgeProof,
    isGenerating,
    generateProof,
    setActiveBadge,
    openVerifierModal,
    closeVerifierModal,
    verifierModalOpen,
    selectedProofForVerification,
    getVerificationUrl,
  } = useZKProof();

  const [selectedThreshold, setSelectedThreshold] = useState<number>(50_000);
  const [activeTab, setActiveTab] = useState<"generator" | "proofs" | "conversions">("generator");

  const thresholds = [
    { amount: 10_000, label: "$10K (Bronze)", tier: "BRONZE" },
    { amount: 25_000, label: "$25K (Silver)", tier: "SILVER" },
    { amount: 50_000, label: "$50K (Gold - Recommended)", tier: "GOLD" },
    { amount: 100_000, label: "$100K (Diamond)", tier: "DIAMOND" },
    { amount: 250_000, label: "$250K (Elite)", tier: "ELITE" },
  ];

  const handleGenerate = async () => {
    await generateProof(selectedThreshold);
    setActiveTab("proofs");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-zinc-950 text-white relative overflow-hidden border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Zero-Knowledge Private Affiliate Portfolio (#174)</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Proof of Revenue Generator
          </h2>

          <p className="text-zinc-300 text-xs sm:text-sm leading-relaxed">
            Apply to exclusive private brands with cryptographic certainty. Generate a mathematically
            verifiable zero-knowledge proof proving you have driven over $50,000+ in verified sales,
            with <strong>zero customer identities, buyer wallets, or individual order amounts leaked</strong>.
          </p>
        </div>

        <div className="relative z-10 flex flex-col items-start md:items-end gap-2 shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            Public Profile Badge
          </span>
          <VerifiedRevenueBadge onOpenVerifier={() => openVerifierModal(activeBadgeProof || undefined)} />
          <span className="text-[10px] text-zinc-500">Click badge to verify attestation</span>
        </div>
      </div>

      {/* Bento Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Compiled Volume */}
        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span>Total Compiled Volume</span>
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              ${totalCompiledRevenueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Historic on-chain sales compiled</span>
            </CardDescription>
          </CardContent>
        </Card>

        {/* Card 2: Total Verified Transactions */}
        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span>Verified On-Chain Sales</span>
              <Layers className="w-4 h-4 text-indigo-500" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {conversions.length} <span className="text-sm font-semibold text-zinc-500">orders</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Across escrow clearing ledgers
            </CardDescription>
          </CardContent>
        </Card>

        {/* Card 3: Qualified Revenue Tier */}
        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span>Qualified Tier</span>
              <Award className="w-4 h-4 text-amber-500" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-amber-600 dark:text-amber-400">
              {totalCompiledRevenueUsd >= REVENUE_TIERS.BRONZE.minThresholdUsd
                ? qualifiedTier.label
                : "Not yet qualified"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Qualifies for exclusive brands
            </CardDescription>
          </CardContent>
        </Card>

        {/* Card 4: Active ZK Proofs */}
        <Card className="rounded-2xl border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-500 dark:text-zinc-400">
              <span>Active Attestations</span>
              <FileCheck className="w-4 h-4 text-cyan-500" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {proofs.length} <span className="text-sm font-semibold text-zinc-500">proofs</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1">
              <Share2 className="w-3.5 h-3.5" />
              <span>Ready for third-party verifiers</span>
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 p-1 bg-slate-200/60 dark:bg-zinc-800/60 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("generator")}
          data-testid="tab-zk-generator"
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "generator"
              ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Generate Proof of Revenue
        </button>
        <button
          onClick={() => setActiveTab("proofs")}
          data-testid="tab-zk-proofs"
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "proofs"
              ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Attestations & Badges ({proofs.length})
        </button>
        <button
          onClick={() => setActiveTab("conversions")}
          data-testid="tab-zk-conversions"
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === "conversions"
              ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          Historic Conversions ({conversions.length})
        </button>
      </div>

      {/* Tab 1: Proof Generator */}
      {activeTab === "generator" && (
        <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden bg-white dark:bg-zinc-900">
          <CardHeader className="bg-slate-50 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <CardTitle className="text-lg font-black tracking-tight">
                Compile & Attest Historic Revenue
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              Select the volume threshold you wish to prove. The cryptographic engine will compute
              blinded Merkle commitments over your historic on-chain transactions.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Threshold Selector */}
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block">
                Target Revenue Threshold
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {thresholds.map((t) => {
                  const isEligible = totalCompiledRevenueUsd >= t.amount;
                  const isSelected = selectedThreshold === t.amount;

                  return (
                    <button
                      key={t.amount}
                      type="button"
                      disabled={!isEligible}
                      onClick={() => setSelectedThreshold(t.amount)}
                      data-testid={`btn-threshold-${t.amount}`}
                      className={`p-3.5 rounded-2xl border text-left transition-all ${
                        isSelected
                          ? "bg-indigo-500/10 border-indigo-500 text-indigo-600 dark:text-indigo-300 ring-2 ring-indigo-500/20"
                          : isEligible
                          ? "bg-white dark:bg-zinc-800/60 border-slate-200 dark:border-zinc-700/60 hover:border-slate-300 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-200"
                          : "bg-slate-100 dark:bg-zinc-800/20 border-slate-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {t.tier}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
                      </div>
                      <p className="text-lg font-black mt-1">
                        ${(t.amount / 1000).toFixed(0)}K+
                      </p>
                      <span className="text-[10px] opacity-75 font-medium">
                        {isEligible ? "Eligible" : "Needs more volume"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Zero-Knowledge Privacy Guarantees Box */}
            <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-800/40 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-bold text-xs">
                <Lock className="w-4 h-4 text-indigo-500" />
                <span>Zero-Knowledge Privacy Safeguards</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-zinc-700 dark:text-zinc-300">
                <div className="flex items-start gap-2">
                  <EyeOff className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Zero Customer PII</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Customer wallets and buyer hashes never leave your device.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Database className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Blinded Merkle Leaves</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Individual sales amounts are hashed with high-entropy cryptographic salt.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Verifiable Attestation</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Third-party brands can verify your $50K+ status in 1 click without trust.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Compiles <strong>{conversions.length} historic conversions</strong> into Merkle root commitment.
              </div>

              <Button
                variant="default"
                size="lg"
                disabled={isGenerating || totalCompiledRevenueUsd < selectedThreshold}
                onClick={handleGenerate}
                data-testid="btn-generate-proof"
                className="w-full sm:w-auto font-black text-xs uppercase tracking-wide gap-2 shadow-lg shadow-indigo-500/20 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Compiling ZK Attestation...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Proof of Revenue (${(selectedThreshold / 1000).toFixed(0)}K+)</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Attestations & Badges */}
      {activeTab === "proofs" && (
        <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden bg-white dark:bg-zinc-900">
          <CardHeader className="bg-slate-50 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-black tracking-tight">
                  Cryptographic Attestations & Public Badges
                </CardTitle>
                <CardDescription className="text-xs">
                  Active ZK revenue proofs generated for your affiliate profile. Share verification links
                  with private advertiser brands or set which badge appears publicly.
                </CardDescription>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab("generator")}
                className="gap-1.5 text-xs font-bold"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span>New Proof</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {proofs.length === 0 ? (
              <div className="text-center py-12 space-y-3">
                <ShieldCheck className="w-10 h-10 text-zinc-400 mx-auto" />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  No proofs generated yet.
                </p>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setActiveTab("generator")}
                  className="text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Generate Your First Proof
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                {proofs.map((p) => {
                  const isActiveBadge = activeBadgeProof?.proofId === p.proofId;
                  const tierConf = REVENUE_TIERS[p.revenueTier];
                  const verificationUrl = getVerificationUrl(p);

                  return (
                    <div
                      key={p.proofId}
                      className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                      data-testid={`proof-card-${p.proofId}`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${tierConf.badgeColor}`}
                          >
                            {p.revenueTier} VERIFIED (${(p.claimedThresholdUsd / 1000).toFixed(0)}K+)
                          </span>

                          {isActiveBadge && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active Public Badge</span>
                            </span>
                          )}

                          <span className="text-[11px] font-mono text-zinc-500">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-zinc-500 block font-medium">Merkle Root:</span>
                            <span className="font-mono text-zinc-800 dark:text-zinc-200 text-[11px] select-all">
                              {p.merkleRoot.slice(0, 24)}...
                            </span>
                          </div>

                          <div>
                            <span className="text-zinc-500 block font-medium">Conversions Batched:</span>
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">
                              {p.totalConversionsCount} historic orders (0 PII leaked)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => openVerifierModal(p)}
                          data-testid={`btn-verify-${p.proofId}`}
                          className="gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>1-Click Verify</span>
                        </Button>

                        <CopyButton
                          text={verificationUrl}
                          label="Copy Share Link"
                          size="sm"
                          variant="outline"
                        />

                        {!isActiveBadge && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveBadge(p.proofId)}
                            data-testid={`btn-set-badge-${p.proofId}`}
                            className="text-xs font-semibold"
                          >
                            Set as Profile Badge
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Historic Conversions Ledger */}
      {activeTab === "conversions" && (
        <Card className="rounded-3xl border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden bg-white dark:bg-zinc-900">
          <CardHeader className="bg-slate-50 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-black tracking-tight">
                  Historic On-Chain Conversions
                </CardTitle>
                <CardDescription className="text-xs">
                  Raw on-chain transactions compiled on your local device. These records are kept 100%
                  private and are blinded before proof generation.
                </CardDescription>
              </div>

              <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
                {conversions.length} Verified Records
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 text-zinc-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Transaction Hash</th>
                    <th className="py-3 px-4">Campaign</th>
                    <th className="py-3 px-4">Volume (USD)</th>
                    <th className="py-3 px-4">Volume (XLM)</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Clearing Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                  {conversions.slice(0, 10).map((c) => (
                    <tr key={c.conversionId} className="hover:bg-slate-50/40 dark:hover:bg-zinc-800/20">
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                        {c.txHash.slice(0, 14)}...{c.txHash.slice(-6)}
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200">
                        {c.campaignName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${c.amountUsd.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                        {c.amountXlm.toFixed(2)} XLM
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                        {new Date(c.timestamp).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          {c.clearingStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {conversions.length > 10 && (
              <div className="p-3 text-center text-xs text-zinc-500 border-t border-slate-100 dark:border-zinc-800">
                Showing top 10 of {conversions.length} compiled transactions.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Verifier Modal */}
      <ZKProofVerifierModal
        isOpen={verifierModalOpen}
        onClose={closeVerifierModal}
        proof={selectedProofForVerification}
      />
    </div>
  );
};
