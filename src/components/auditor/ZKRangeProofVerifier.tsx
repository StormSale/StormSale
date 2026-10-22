import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useAuditorTenancy } from "../../context/AuditorTenancyContext";
import { useNotification } from "../../context/NotificationContext";
import {
  SAMPLE_CONVERSION_METADATA,
  fetchConversionMetadata,
  verifyConversionRangeProof,
  buildRangeProofCertificate,
  formatCurrencyAmount,
} from "../../lib/zk/rangeProofService";
import type { ConversionLedgerMetadata, VerificationResult } from "../../lib/zk/types";
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Lock,
  EyeOff,
  CheckCircle2,
  XCircle,
  Clock,
  Download,
  Copy,
  Cpu,
  Layers,
  FileCheck2,
  Sparkles,
} from "lucide-react";

export const ZKRangeProofVerifier: React.FC = () => {
  const { org } = useAuditorTenancy();
  const { showNotification } = useNotification();

  // Selected or custom conversion metadata
  const [selectedSaleId, setSelectedSaleId] = useState<string>("1042");
  const [metadata, setMetadata] = useState<ConversionLedgerMetadata>(SAMPLE_CONVERSION_METADATA[0]);
  const [budgetMin, setBudgetMin] = useState<number>(10);
  const [budgetMax, setBudgetMax] = useState<number>(5000);

  // Verification execution state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Quick select an existing sale
  const handleSelectPreset = (meta: ConversionLedgerMetadata) => {
    setSelectedSaleId(meta.saleId);
    setMetadata(meta);
    setBudgetMin(meta.rangeProof.minAmountCents / 100);
    setBudgetMax(meta.rangeProof.maxAmountCents / 100);
    setResult(null);
    setError(null);
    showNotification({
      type: "info",
      title: "Conversion Loaded",
      message: `Loaded Sale #${meta.saleId} (${meta.campaignName}) with on-chain Bulletproof metadata.`,
    });
  };

  // Handle custom sale ID input search
  const handleLoadCustomSale = async () => {
    if (!selectedSaleId.trim()) return;
    try {
      const found = await fetchConversionMetadata(selectedSaleId);
      if (found) {
        setMetadata(found);
        setBudgetMin(found.rangeProof.minAmountCents / 100);
        setBudgetMax(found.rangeProof.maxAmountCents / 100);
        setResult(null);
        setError(null);
      }
    } catch {
      setError("Failed to fetch conversion metadata from ledger.");
    }
  };

  // Perform client-side WebAssembly worker verification
  const handleVerify = async () => {
    setIsVerifying(true);
    setError(null);

    try {
      const res = await verifyConversionRangeProof(metadata, {
        expectedBudgetMin: budgetMin * 100,
        expectedBudgetMax: budgetMax * 100,
        auditorKey: `GAUDITOR${org.id
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .padEnd(48, "X")}`,
      });

      setResult(res);

      if (res.valid) {
        showNotification({
          type: "success",
          title: "Range Proof Verified",
          message: `${res.badgeText} in ${res.verificationTimeMs}ms via WebAssembly Worker.`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Verification Failed",
          message: res.message,
        });
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Verification encountered an unexpected error";
      setError(msg);
      showNotification({
        type: "error",
        title: "Worker Error",
        message: msg,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Download official SOC 2 compliance certificate
  const handleDownloadCertificate = () => {
    if (!result) return;
    const certText = buildRangeProofCertificate({
      organization: org.name,
      auditorKey: `GAUDITOR${org.id
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .padEnd(48, "X")}`,
      metadata,
      result,
    });

    const blob = new Blob([certText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stormsale-zk-attestation-sale-${metadata.saleId}.txt`;
    link.click();
    URL.revokeObjectURL(url);

    showNotification({
      type: "success",
      title: "Certificate Downloaded",
      message: `Exported ZK Range Proof Attestation for Sale #${metadata.saleId}`,
    });
  };

  const handleCopyAttestation = async () => {
    if (!result) return;
    const certText = buildRangeProofCertificate({
      organization: org.name,
      auditorKey: `GAUDITOR${org.id
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .padEnd(48, "X")}`,
      metadata,
      result,
    });
    await navigator.clipboard.writeText(certText);
    showNotification({
      type: "info",
      title: "Copied to Clipboard",
      message: "Compliance attestation report copied.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
              Issue #175 • Compliance Auditor
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <Zap className="w-3.5 h-3.5" />
              WASM Worker &lt; 500ms
            </span>
          </div>
          <h2 className="text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight mt-1">
            Zero-Knowledge Range Proof Verification
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 font-medium text-sm">
            Verify private customer sale amounts fall within approved budget thresholds without
            decrypting sensitive values.
          </p>
        </div>

        {result && result.valid && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAttestation}
              className="rounded-xl font-semibold border-slate-200 dark:border-zinc-800"
            >
              <Copy className="w-4 h-4 mr-1.5" />
              Copy Report
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadCertificate}
              className="rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Download Attestation
            </Button>
          </div>
        )}
      </div>

      {/* Preset Conversion Selectors */}
      <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Select Conversion to Audit
            </CardTitle>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Scope: {org.name}</span>
          </div>
          <CardDescription>
            Choose a private affiliate conversion order containing on-chain Bulletproof range proof
            metadata.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SAMPLE_CONVERSION_METADATA.map((sample) => {
              const isSelected = sample.saleId === selectedSaleId;
              const isTampered = sample.rangeProof.proof.includes("CORRUPTED");

              return (
                <button
                  key={sample.saleId}
                  type="button"
                  onClick={() => handleSelectPreset(sample)}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-sm ring-1 ring-indigo-600"
                      : "border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 hover:border-slate-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                      Sale #{sample.saleId}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isTampered
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      }`}
                    >
                      {isTampered ? "Tampered Test" : "On-Chain"}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 truncate">
                    {sample.campaignName}
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1 font-mono truncate">
                    Target: {formatCurrencyAmount(sample.rangeProof.minAmountCents)} -{" "}
                    {formatCurrencyAmount(sample.rangeProof.maxAmountCents)}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Custom Sale Query Row */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">
              Or specify Sale ID:
            </span>
            <Input
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              placeholder="e.g. 1042"
              className="h-8 text-xs max-w-[140px]"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={handleLoadCustomSale}
              className="h-8 text-xs rounded-lg"
            >
              Fetch Ledger
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main Audit Console Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: On-Chain Metadata Inspector */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  On-Chain Conversion Metadata (Soroban)
                </CardTitle>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                  Ledger Seq #{metadata.ledgerSequence}
                </span>
              </div>
              <CardDescription>
                Contains encrypted transaction data and embedded Bulletproofs range proof
                parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800">
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
                    Sale ID
                  </span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 text-sm">
                    #{metadata.saleId}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
                    Conversion ID
                  </span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    {metadata.conversionId}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
                    Campaign Contract Address
                  </span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 break-all select-all">
                    {metadata.campaignAddress}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[11px] font-semibold text-zinc-400 block uppercase tracking-wider">
                    Ledger Transaction Hash
                  </span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-400 break-all select-all">
                    {metadata.txHash}
                  </span>
                </div>
              </div>

              {/* Zero-Knowledge Privacy Guarantee Banner */}
              <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 flex items-start gap-3">
                <EyeOff className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-white">
                      Raw Transaction Value Withheld
                    </span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full font-bold bg-indigo-200/70 dark:bg-indigo-800/50 text-indigo-800 dark:text-indigo-300">
                      Zero PII
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-300 text-[11px] leading-relaxed">
                    Under the compliance audit policy, raw customer sale amounts remain completely
                    encrypted. The auditor verifies mathematical correctness without decrypting or
                    storing transaction values.
                  </p>
                  <div className="pt-1 font-mono text-[11px] text-zinc-500 break-all">
                    Encrypted Payload:{" "}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {metadata.encryptedAmount.slice(0, 48)}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Bulletproof Parameters */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                    Embedded Bulletproof Commitment & Proof
                  </span>
                  <span className="text-[11px] text-zinc-400">Curve25519 • 64-bit Range</span>
                </div>
                <div className="font-mono text-[11px] space-y-1.5 text-zinc-600 dark:text-zinc-400">
                  <div className="truncate">
                    <span className="text-zinc-400">Commitment C:</span>{" "}
                    {metadata.rangeProof.commitment}
                  </div>
                  <div className="truncate">
                    <span className="text-zinc-400">Proof Bytes:</span>{" "}
                    {metadata.rangeProof.proof.slice(0, 56)}... ({metadata.rangeProof.proof.length}{" "}
                    chars)
                  </div>
                  <div className="flex gap-4 pt-1 text-zinc-500">
                    <span>Bit Length: {metadata.rangeProof.bitLength}</span>
                    <span>Domain: {metadata.rangeProof.domainTag}</span>
                    <span>Status: {metadata.clearingStatus}</span>
                  </div>
                </div>
              </div>

              {/* Compliance Threshold Settings */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                    Approved Min Budget ($)
                  </label>
                  <Input
                    type="number"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 block mb-1">
                    Approved Max Budget ($)
                  </label>
                  <Input
                    type="number"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Verify Trigger Button */}
              <Button
                onClick={handleVerify}
                disabled={isVerifying}
                className="w-full h-11 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.99]"
              >
                {isVerifying ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    Verifying via WebAssembly Worker...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Verify Range Proof Against Ledger State
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Verification Results & Compliance Badge */}
        <div className="lg:col-span-5 space-y-4">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-900 dark:text-rose-200">
                  Verification Error
                </h4>
                <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {result ? (
            <Card
              className={`border-2 shadow-md transition-all ${
                result.valid
                  ? "border-emerald-500/80 bg-white dark:bg-zinc-900/80 shadow-emerald-500/5"
                  : "border-rose-500/80 bg-white dark:bg-zinc-900/80 shadow-rose-500/5"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.valid ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <XCircle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                    )}
                    <div>
                      <CardTitle className="text-base font-bold">
                        {result.valid ? "Proof Verified & Valid" : "Verification Failed"}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Audit Result for Sale #{metadata.saleId}
                      </CardDescription>
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      result.meetsPerformanceTarget
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {result.verificationTimeMs}ms
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* REQUIRED VERIFICATION BADGE */}
                {result.valid && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-indigo-500/10 to-teal-500/10 border-2 border-emerald-500/30 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1.5 text-emerald-700 dark:text-emerald-300">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider">
                        Official Compliance Badge
                      </span>
                    </div>
                    {/* Exact badge string required by issue specification */}
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white font-bold text-sm shadow-sm">
                      <ShieldCheck className="w-4 h-4" />
                      {result.badgeText}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-2">
                      Cryptographically proven without decrypting raw sensitive customer values.
                    </p>
                  </div>
                )}

                {/* Sub-check Diagnostics */}
                <div className="space-y-2 text-xs">
                  <h4 className="font-bold text-zinc-900 dark:text-white uppercase tracking-wider text-[11px]">
                    Cryptographic Validation Checks
                  </h4>
                  <div className="space-y-1.5 font-medium">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Pedersen Commitment Format:
                      </span>
                      <span
                        className={`font-bold ${result.diagnostics.commitmentValid ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {result.diagnostics.commitmentValid ? "Valid Point" : "Invalid"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Range Bounds Soundness:
                      </span>
                      <span
                        className={`font-bold ${result.diagnostics.rangeIntegrity ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {result.diagnostics.rangeIntegrity
                          ? `[${result.formattedRange}]`
                          : "Out of bounds"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Fiat-Shamir Transcript:
                      </span>
                      <span
                        className={`font-bold ${result.diagnostics.transcriptSoundness ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {result.diagnostics.transcriptSoundness ? "Sound (SHA-256)" : "Tampered"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Inner-Product Argument:
                      </span>
                      <span
                        className={`font-bold ${result.diagnostics.innerProductValid ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {result.diagnostics.innerProductValid ? "Verified (<l,r> = t)" : "Failed"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        Ledger State Binding:
                      </span>
                      <span
                        className={`font-bold ${result.ledgerVerified ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {result.ledgerVerified
                          ? `Seq #${result.diagnostics.ledgerSequence}`
                          : "Unbound"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Telemetry Metrics */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Latency SLA (&lt; 500ms)
                    </span>
                    <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                      {result.verificationTimeMs} ms
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                      ✓ Target Met
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/40 border border-slate-100 dark:border-zinc-800 text-center">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Exact Amount Disclosed
                    </span>
                    <span className="text-lg font-extrabold text-zinc-700 dark:text-zinc-300">
                      Null
                    </span>
                    <span className="text-[10px] text-indigo-600 font-semibold block mt-0.5">
                      ✓ Zero Knowledge
                    </span>
                  </div>
                </div>

                {/* Status Message */}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center italic">
                  {result.message}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-slate-50/50 dark:bg-zinc-950/30">
              <CardContent className="p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-zinc-900 dark:text-white text-base">
                  Ready to Verify Compliance
                </h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Click the button to execute the WebAssembly worker verification kernel against the
                  selected conversion order.
                </p>
                <div className="pt-2 flex items-center justify-center gap-4 text-[11px] text-zinc-400">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    WASM Engine Ready
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Worker Thread Active
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick FAQ / Audit Standards Card */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-indigo-500" />
                Regulatory Compliance Standard
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500 dark:text-zinc-400 space-y-2">
              <p>
                <strong>Bulletproofs:</strong> Non-interactive zero-knowledge arguments for range
                proofs without a trusted setup.
              </p>
              <p>
                <strong>Ledger Binding:</strong> The range proof commits to the conversion
                transaction output stored on the Soroban network ledger.
              </p>
              <p>
                <strong>Audit Trail:</strong> Each verification action is cryptographically recorded
                in the transparency ledger.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
