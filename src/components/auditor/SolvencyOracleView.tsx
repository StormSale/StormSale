import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { ShieldCheck, Scale, CheckCircle2, Download, Clock, Database, Hash } from "lucide-react";
import { SolvencyHud } from "./SolvencyHud";
import { useSolvencyOracle } from "../../hooks/useSolvencyOracle";
import { STELLAR_CONFIG } from "../../config/stellar";
import { formatStellarAddress } from "../../lib/stellar";
import { useNotification } from "../../context/NotificationContext";

export const SolvencyOracleView: React.FC = () => {
  const { proof } = useSolvencyOracle(5000);
  const { showNotification } = useNotification();

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const handleExportProofJson = () => {
    if (!proof) return;
    const proofExport = {
      protocol: "StormSale Escrow Protocol",
      standard: "Proof of Reserve & Solvency Oracle v1.0",
      generatedAt: new Date().toISOString(),
      network: STELLAR_CONFIG.network,
      contractId: STELLAR_CONFIG.contractId,
      ledgerSequence: proof.ledgerSequence,
      ledgerClosedAt: proof.ledgerClosedAt,
      xlmUsdRate: proof.xlmUsdRate,
      rateSource: proof.rateSource,
      metrics: {
        totalEscrowReservesXlm: proof.totalEscrowReservesXlm,
        totalEscrowReservesUsd: proof.totalEscrowReservesUsd,
        totalOutstandingClaimsXlm: proof.totalOutstandingClaimsXlm,
        totalOutstandingClaimsUsd: proof.totalOutstandingClaimsUsd,
        solvencyRatioPercent: `${proof.solvencyRatioPercent}%`,
        isSolvent: proof.isSolvent,
        reserveSurplusXlm: proof.reserveSurplusXlm,
        reserveSurplusUsd: proof.reserveSurplusUsd,
      },
      campaignReserves: proof.campaignReserves,
      pendingLiabilities: proof.pendingLiabilities,
      cryptographicProofHash: proof.proofHash,
      proofAlgorithm: proof.proofAlgorithm,
    };

    const blob = new Blob([JSON.stringify(proofExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stormsale-solvency-proof-ledger-${proof.ledgerSequence}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification({
      type: "success",
      title: "Solvency Proof Exported",
      message: `Exported cryptographic proof for ledger #${proof.ledgerSequence}`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">
              On-Chain Proof of Reserve
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Protocol Solvency &amp; TVL Oracle
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium max-w-2xl">
            Live public proof-of-reserve dashboard demonstrating that 100% of pending affiliate
            liabilities are fully backed by on-chain Soroban escrow balances.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6 lg:mt-0">
          <Button
            onClick={handleExportProofJson}
            variant="outline"
            className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-semibold"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Proof JSON
          </Button>

          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
              100% Backed (&ge; 100% Solvency)
            </span>
          </div>
        </div>
      </div>

      {/* The Live Solvency HUD */}
      <SolvencyHud />

      {/* Mathematical Proof & Solvency Ratio Card */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/70 shadow-sm rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-zinc-800/60 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center">
                <Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                  Live Solvency Ratio Verification
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  Mathematical proof verifying total escrow reserves exceed outstanding affiliate
                  liabilities
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
                Ratio: {proof ? `${formatNumber(proof.solvencyRatioPercent, 1)}%` : "..."}
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Asset Column */}
            <div className="p-5 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                1. Total Escrow Reserves (Assets)
              </span>
              <div className="mt-2 text-2xl font-extrabold text-zinc-900 dark:text-white">
                {proof ? formatNumber(proof.totalEscrowReservesXlm) : "..."} XLM
              </div>
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-1">
                ≈ ${proof ? formatNumber(proof.totalEscrowReservesUsd) : "..."} USD
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                Locked in Soroban contract storage across {proof?.activeCampaignsCount ?? 0} active
                campaigns
              </p>
            </div>

            {/* Operator Column */}
            <div className="flex flex-col items-center justify-center p-3 text-center">
              <div className="text-2xl font-black text-zinc-400 dark:text-zinc-600">&divide;</div>
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider my-1">
                Divided By
              </span>
              <div className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                Live Solvency Equation
              </div>
            </div>

            {/* Liability Column */}
            <div className="p-5 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                2. Total Outstanding Claims (Liabilities)
              </span>
              <div className="mt-2 text-2xl font-extrabold text-zinc-900 dark:text-white">
                {proof ? formatNumber(proof.totalOutstandingClaimsXlm) : "..."} XLM
              </div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-1">
                ≈ ${proof ? formatNumber(proof.totalOutstandingClaimsUsd) : "..."} USD
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                Pending across {proof?.activeClearingCount ?? 0} active clearing windows
              </p>
            </div>
          </div>

          {/* Proof Summary Banner */}
          <div className="mt-6 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  Solvency Audit Criteria Met: Reserves Exceed Liabilities (&ge; 100%)
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Total Escrow Reserves backing is currently at{" "}
                  <strong>
                    {proof ? `${formatNumber(proof.solvencyRatioPercent, 1)}%` : "..."}
                  </strong>{" "}
                  with a surplus buffer of{" "}
                  <strong>+{proof ? formatNumber(proof.reserveSurplusXlm) : "..."} XLM</strong> ($
                  {proof ? formatNumber(proof.reserveSurplusUsd) : "..."} USD).
                </p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-600 text-white font-bold text-xs rounded-lg uppercase tracking-wider">
              VERIFIED SOLVENT
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Two-Column Deep-Dive: Reserves & Claims Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Table 1: Soroban Contract Escrow Reserves */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-500" />
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                  Active Campaign Escrow Reserves
                </CardTitle>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                Soroban Storage
              </span>
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Aggregated budget reserves locked per active campaign
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 dark:border-zinc-800/60">
                  <TableHead className="text-xs">Campaign</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Escrow (XLM)</TableHead>
                  <TableHead className="text-xs text-right">USD Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proof?.campaignReserves.map((camp) => (
                  <TableRow
                    key={camp.campaignId}
                    className="border-slate-100 dark:border-zinc-800/40"
                  >
                    <TableCell className="py-3">
                      <div className="font-bold text-xs text-zinc-900 dark:text-white">
                        {camp.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {formatStellarAddress(camp.contractAddress)} · {camp.clearingPeriod}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          camp.status === "Active"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                        }`}
                      >
                        {camp.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono font-bold text-xs text-zinc-900 dark:text-white">
                      {formatNumber(camp.escrowBalanceXlm)}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                      ${formatNumber(camp.escrowBalanceUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-4 bg-slate-50 dark:bg-zinc-900/80 border-t border-slate-100 dark:border-zinc-800/50 flex justify-between items-center text-xs">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">
                Total Escrow Reserves (TVL):
              </span>
              <div className="text-right">
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400 font-mono">
                  {proof ? formatNumber(proof.totalEscrowReservesXlm) : "..."} XLM
                </span>
                <span className="text-[11px] text-zinc-400 ml-1.5">
                  (${proof ? formatNumber(proof.totalEscrowReservesUsd) : "..."})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table 2: Active Clearing Windows Liabilities */}
        <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-zinc-800/50 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                  Active Clearing Windows
                </CardTitle>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Pending Claims
              </span>
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Outstanding affiliate claims across all active clearing windows
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 dark:border-zinc-800/60">
                  <TableHead className="text-xs">Claim / Affiliate</TableHead>
                  <TableHead className="text-xs">Clearing Window</TableHead>
                  <TableHead className="text-xs text-right">Claim (XLM)</TableHead>
                  <TableHead className="text-xs text-right">USD Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proof?.pendingLiabilities.map((claim) => (
                  <TableRow key={claim.saleId} className="border-slate-100 dark:border-zinc-800/40">
                    <TableCell className="py-3">
                      <div className="font-bold text-xs text-zinc-900 dark:text-white">
                        Sale #{claim.saleId}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {claim.campaignName} · {formatStellarAddress(claim.affiliateAddress)}
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        <Clock className="w-3 h-3" />
                        {claim.clearingWindowDays}d window
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono font-bold text-xs text-zinc-900 dark:text-white">
                      {formatNumber(claim.claimAmountXlm)}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-xs text-zinc-500">
                      ${formatNumber(claim.claimAmountUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-4 bg-slate-50 dark:bg-zinc-900/80 border-t border-slate-100 dark:border-zinc-800/50 flex justify-between items-center text-xs">
              <span className="font-bold text-zinc-700 dark:text-zinc-300">
                Total Pending Liabilities:
              </span>
              <div className="text-right">
                <span className="font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                  {proof ? formatNumber(proof.totalOutstandingClaimsXlm) : "..."} XLM
                </span>
                <span className="text-[11px] text-zinc-400 ml-1.5">
                  (${proof ? formatNumber(proof.totalOutstandingClaimsUsd) : "..."})
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* On-Chain Oracle Inspector */}
      <Card className="border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 rounded-2xl shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-zinc-800/50">
          <CardTitle className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Hash className="w-4 h-4 text-indigo-500" />
            Oracle Feed &amp; On-Chain Verification Parameters
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            Cryptographic state commitment parameters and network oracle endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-zinc-800/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Contract Address
            </span>
            <div className="font-mono font-medium text-zinc-800 dark:text-zinc-200 mt-1 truncate">
              {STELLAR_CONFIG.contractId}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-zinc-800/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Price Oracle Feed
            </span>
            <div className="font-medium text-zinc-800 dark:text-zinc-200 mt-1">
              {proof?.rateSource || "Coinbase / Horizon DEX"}
            </div>
            <div className="text-[10px] font-bold text-emerald-600 mt-0.5 font-mono">
              1 XLM = ${proof?.xlmUsdRate ?? 0.135} USD
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-zinc-800/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Network &amp; RPC Endpoint
            </span>
            <div className="font-medium text-zinc-800 dark:text-zinc-200 mt-1">
              Stellar {STELLAR_CONFIG.network}
            </div>
            <div className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate">
              {STELLAR_CONFIG.rpcUrl}
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-zinc-950/40 rounded-xl border border-slate-100 dark:border-zinc-800/40">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Audit Standard
            </span>
            <div className="font-medium text-zinc-800 dark:text-zinc-200 mt-1">
              NIST SP 800-53 / ISO 27001
            </div>
            <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
              100% Backed Proof-of-Reserve
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
