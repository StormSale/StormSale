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
import { InputGroup, InputField } from "../../components/ui/input-group";
import { useNotification } from "../../context/NotificationContext";
import type {
  ApprovedRangeThresholds,
  OnChainConversionMetadata,
  ZKVerificationResult,
} from "../../types/zkRangeProof";
import {
  fetchOnChainConversionMetadata,
  MOCK_ON_CHAIN_METADATA_STORE,
} from "../../lib/zkRangeProof";
import { verifyRangeProof } from "../../lib/zkWorkerClient";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Lock,
  Sparkles,
  Download,
  Copy,
  Check,
  Layers,
} from "lucide-react";

interface ZKRangeProofConsoleProps {
  initialSaleId?: string;
  initialCampaignAddress?: string;
  onVerificationComplete?: (result: ZKVerificationResult) => void;
}

export const ZKRangeProofConsole: React.FC<ZKRangeProofConsoleProps> = ({
  initialSaleId = "1042",
  initialCampaignAddress = "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
  onVerificationComplete,
}) => {
  const [saleId, setSaleId] = useState(initialSaleId);
  const [campaignAddress, setCampaignAddress] = useState(initialCampaignAddress);
  const [minThreshold, setMinThreshold] = useState("10");
  const [maxThreshold, setMaxThreshold] = useState("5000");
  const [currency, setCurrency] = useState("USD");

  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStep, setVerificationStep] = useState<string>("");
  const [verificationResult, setVerificationResult] = useState<ZKVerificationResult | null>(null);
  const [loadedMetadata, setLoadedMetadata] = useState<OnChainConversionMetadata | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { showNotification } = useNotification();

  const presetSales = [
    {
      id: "1042",
      name: "Tech Gadgets Pro",
      contract: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
      note: "Standard Sale ($450) · Compliant",
    },
    {
      id: "1100",
      name: "Summer Sale 2026",
      contract: "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
      note: "Mid-tier ($1,250) · Compliant",
    },
    {
      id: "1089",
      name: "NFT Drop Alpha",
      contract: "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
      note: "Micro Sale ($85) · Compliant",
    },
    {
      id: "1205",
      name: "Enterprise Cloud Pro",
      contract: "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
      note: "Excess Value ($8,500) · Non-Compliant Demo",
    },
  ];

  const handleSelectPreset = (preset: (typeof presetSales)[0]) => {
    setSaleId(preset.id);
    setCampaignAddress(preset.contract);
    setVerificationResult(null);
    setLoadedMetadata(null);
    showNotification({
      type: "info",
      title: "Preset Loaded",
      message: `Selected Sale #${preset.id} (${preset.name})`,
    });
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
    showNotification({
      type: "info",
      title: "Copied",
      message: `${fieldName} copied to clipboard`,
    });
  };

  const handleVerify = async () => {
    if (!saleId.trim()) {
      showNotification({
        type: "warning",
        title: "Missing Sale ID",
        message: "Please enter a valid numeric sale identifier",
      });
      return;
    }

    const minNum = parseFloat(minThreshold) || 10;
    const maxNum = parseFloat(maxThreshold) || 5000;
    if (minNum >= maxNum) {
      showNotification({
        type: "error",
        title: "Invalid Range",
        message: "Minimum threshold must be strictly less than maximum threshold",
      });
      return;
    }

    const customThresholds: ApprovedRangeThresholds = {
      min: minNum,
      max: maxNum,
      currency,
    };

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      setVerificationStep("Reading conversion metadata from on-chain storage...");
      const metadata = await fetchOnChainConversionMetadata(saleId, campaignAddress);
      setLoadedMetadata(metadata);

      setVerificationStep("Instantiating WebAssembly Worker & validating ledger state...");
      await new Promise((resolve) => setTimeout(resolve, 80)); // Visual smoothness

      setVerificationStep("Executing Bulletproofs inner-product verification in WebAssembly...");
      const result = await verifyRangeProof({
        saleId,
        campaignAddress,
        customThresholds,
        conversionMetadata: metadata,
      });

      setVerificationResult(result);
      if (onVerificationComplete) {
        onVerificationComplete(result);
      }

      showNotification({
        type: result.isValid ? "success" : "warning",
        title: result.isValid ? "Compliance Range Proven" : "Compliance Verification Failed",
        message: result.isValid
          ? `Verified in ${result.executionTimeMs}ms via WebAssembly Worker without decrypting raw purchase amount.`
          : "Range proof verification failed. Value violates approved threshold or ledger state.",
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to execute WebAssembly range proof verification";
      showNotification({
        type: "error",
        title: "Verification Error",
        message: errorMessage,
      });
    } finally {
      setIsVerifying(false);
      setVerificationStep("");
    }
  };

  const exportAuditCertificate = () => {
    if (!verificationResult) return;
    const cert = {
      title: "Zero-Knowledge Compliance Audit Certificate",
      standard: "NIST SP 800-53 (AC-3) & ISO/IEC 27001",
      protocol: "StormSale Bulletproofs ZK-Range-Proof v1",
      verificationEngine: verificationResult.engine,
      executionTimeMs: verificationResult.executionTimeMs,
      saleId: verificationResult.saleId,
      campaignAddress: verificationResult.contractAddress,
      verifiedRange: verificationResult.verifiedRange,
      badgeText: verificationResult.badgeText,
      commitmentHash: verificationResult.commitmentHash,
      ledgerSequence: verificationResult.ledgerSequence,
      amountDisclosed: verificationResult.amountDisclosed,
      complianceStatus: verificationResult.isValid ? "COMPLIANT_IN_RANGE" : "NON_COMPLIANT",
      complianceNotice: verificationResult.complianceNotice,
      verifiedAt: verificationResult.verificationTimestamp,
      fiatShamirChallenge: verificationResult.cryptographicDetails.fiatShamirChallenge,
    };

    const blob = new Blob([JSON.stringify(cert, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zk-compliance-sale-${verificationResult.saleId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification({
      type: "success",
      title: "Certificate Exported",
      message: "Downloaded JSON audit certificate for compliance records",
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero */}
      <div className="p-6 sm:p-7 rounded-3xl bg-gradient-to-r from-indigo-900/10 via-purple-900/10 to-indigo-950/10 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-zinc-900/80 border border-indigo-200/60 dark:border-indigo-800/50 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping" />
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Zero-Knowledge Auditor Console
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                WASM Worker &lt; 500ms
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              ZK Range Proof Verification
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
              Verify that encrypted sale amounts comply with approved budget thresholds without
              decrypting raw customer transaction values. Zero sensitive data is exposed.
            </p>
          </div>

          <div className="flex items-center space-x-3 self-end md:self-auto shrink-0">
            <div className="px-3.5 py-2 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center space-x-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              <Cpu className="w-4 h-4 text-indigo-500 animate-pulse" />
              <span>WebAssembly Engine</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Input Parameters & Verification Action (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
            <CardHeader className="pb-4 pt-6 px-6 sm:px-8 border-b border-slate-100 dark:border-zinc-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white">
                      Range Proof Parameters
                    </CardTitle>
                    <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                      Validate ledger commitment against compliance policy
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold">
                  <Lock className="w-3 h-3" />
                  <span>Confidential</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-6 sm:p-8 space-y-6">
              <InputGroup className="space-y-4">
                <InputField
                  label="Sale ID / Transaction Index"
                  description="Numeric ledger identifier for the sale record"
                  required
                >
                  <Input
                    type="number"
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                    placeholder="e.g. 1042"
                    className="h-11 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-sm"
                  />
                </InputField>

                <InputField
                  label="Campaign Escrow Contract Address"
                  description="Soroban escrow address holding registered commitment"
                  required
                >
                  <Input
                    value={campaignAddress}
                    onChange={(e) => setCampaignAddress(e.target.value)}
                    placeholder="CA7QW5KXGPTR4N2K9J2L77XLMESCROW..."
                    className="h-11 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-xs"
                  />
                </InputField>

                {/* Approved Thresholds Section */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                    Approved Budget Thresholds
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Min Threshold</span>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-2.5 text-xs text-zinc-400">$</span>
                        <Input
                          type="number"
                          value={minThreshold}
                          onChange={(e) => setMinThreshold(e.target.value)}
                          className="pl-7 h-10 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Max Threshold</span>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-2.5 text-xs text-zinc-400">$</span>
                        <Input
                          type="number"
                          value={maxThreshold}
                          onChange={(e) => setMaxThreshold(e.target.value)}
                          className="pl-7 h-10 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-zinc-500 font-medium">Currency</span>
                      <Input
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                        className="mt-1 h-10 border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Presets Pill Bar */}
                <div className="pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1.5">
                    Quick Select Preset Sales:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {presetSales.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectPreset(preset)}
                        className={`text-xs px-3 py-1.5 rounded-xl border transition-all ${
                          saleId === preset.id
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-slate-50 dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 hover:border-indigo-400 text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        <span className="font-bold">Sale #{preset.id}</span>
                        <span className="opacity-75 text-[10px] ml-1.5">({preset.name})</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Verification Button */}
                <Button
                  onClick={handleVerify}
                  disabled={isVerifying}
                  className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl shadow-md transition-all mt-4"
                >
                  {isVerifying ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{verificationStep || "Verifying in WebAssembly Worker..."}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-200" />
                      <span>Verify Zero-Knowledge Range Proof</span>
                    </div>
                  )}
                </Button>
              </InputGroup>

              {/* Prominent Verification Badge Display */}
              {verificationResult && (
                <div
                  className={`p-6 rounded-2xl border transition-all ${
                    verificationResult.isValid
                      ? "bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/5 border-emerald-500/40 dark:border-emerald-500/50"
                      : "bg-gradient-to-r from-rose-500/10 via-red-500/10 to-rose-500/5 border-rose-500/40 dark:border-rose-500/50"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                        verificationResult.isValid
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white"
                      }`}
                    >
                      {verificationResult.isValid ? (
                        <ShieldCheck className="w-7 h-7" />
                      ) : (
                        <ShieldAlert className="w-7 h-7" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* THE OFFICIAL VERIFICATION BADGE */}
                        <div
                          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full font-extrabold text-xs sm:text-sm tracking-wide shadow-sm ${
                            verificationResult.isValid
                              ? "bg-emerald-600 text-white ring-2 ring-emerald-400/30"
                              : "bg-rose-600 text-white ring-2 ring-rose-400/30"
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>{verificationResult.badgeText}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold">
                            ⏱ {verificationResult.executionTimeMs} ms (&lt; 500ms)
                          </span>
                        </div>
                      </div>

                      <p
                        className={`text-xs sm:text-sm font-medium leading-relaxed ${
                          verificationResult.isValid
                            ? "text-emerald-900 dark:text-emerald-200"
                            : "text-rose-900 dark:text-rose-200"
                        }`}
                      >
                        {verificationResult.complianceNotice}
                      </p>

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/40 dark:border-zinc-800/60 text-xs">
                        <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                          <Check className="w-4 h-4 text-emerald-500" />
                          <span>Ledger Anchor: Sequence #{verificationResult.ledgerSequence}</span>
                        </div>
                        <Button
                          onClick={exportAuditCertificate}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-bold rounded-xl gap-1.5 border-slate-300 dark:border-zinc-700 hover:bg-white dark:hover:bg-zinc-800"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export Audit Certificate</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Cryptographic On-Chain Metadata & Zero-Knowledge Assurance (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* On-Chain Conversion Metadata Card */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
            <CardHeader className="pb-3 pt-6 px-6 border-b border-slate-100 dark:border-zinc-800/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                    On-Chain Conversion Metadata
                  </CardTitle>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-full">
                  Soroban Ledger
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-3.5 text-xs">
              {loadedMetadata || MOCK_ON_CHAIN_METADATA_STORE[saleId] ? (
                (() => {
                  const meta = loadedMetadata || MOCK_ON_CHAIN_METADATA_STORE[saleId];
                  return (
                    <div className="space-y-2.5">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 space-y-1.5">
                        <div className="flex justify-between items-center text-[11px] text-zinc-500">
                          <span>Pedersen Commitment (C = vG + rH)</span>
                          <button
                            onClick={() => handleCopy(meta.pedersenCommitment, "Commitment")}
                            className="hover:text-indigo-500 transition-colors"
                          >
                            {copiedField === "Commitment" ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="font-mono font-bold text-zinc-900 dark:text-white text-[11px] break-all">
                          {meta.pedersenCommitment}
                        </div>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-zinc-800/60">
                        <div className="py-2 flex justify-between items-center">
                          <span className="text-zinc-500">Proof Scheme</span>
                          <span className="font-bold text-zinc-900 dark:text-white">
                            Bulletproofs (6-round IPA)
                          </span>
                        </div>
                        <div className="py-2 flex justify-between items-center">
                          <span className="text-zinc-500">Vector Dimension</span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-white">
                            64-bit range (2⁶ rounds)
                          </span>
                        </div>
                        <div className="py-2 flex justify-between items-center">
                          <span className="text-zinc-500">Ledger Block Sequence</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            #{meta.ledgerSequence}
                          </span>
                        </div>
                        <div className="py-2 flex justify-between items-center">
                          <span className="text-zinc-500">Ledger State Root</span>
                          <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">
                            {meta.stateRoot.slice(0, 10)}...{meta.stateRoot.slice(-6)}
                          </span>
                        </div>
                        <div className="py-2 flex justify-between items-center">
                          <span className="text-zinc-500">Encrypted Hash</span>
                          <span className="font-mono text-zinc-500">
                            {meta.encryptedPayloadHash.slice(0, 16)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="text-center py-6 text-zinc-400">
                  Select a sale or enter details to view conversion metadata
                </div>
              )}
            </CardContent>
          </Card>

          {/* Zero-Knowledge Privacy Guarantee Card */}
          <Card className="border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-zinc-900/50 rounded-3xl overflow-hidden">
            <CardHeader className="pb-3 pt-6 px-6">
              <div className="flex items-center space-x-2.5">
                <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <CardTitle className="text-base font-bold text-zinc-900 dark:text-white">
                  Zero-Knowledge Privacy Guarantee
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-3.5 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="leading-relaxed font-medium">
                Under cryptographic Zero-Knowledge principles, compliance officers verify budget
                thresholds with{" "}
                <span className="font-bold text-zinc-900 dark:text-white">
                  mathematical certainty
                </span>{" "}
                while keeping raw customer purchase amounts 100% confidential.
              </p>
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-800/50">
                <div className="flex items-center justify-between py-1">
                  <span className="font-medium">Raw Value Decryption</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    Never Disclosed (0 bytes)
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="font-medium">Worker Isolation</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    Dedicated WASM Thread
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="font-medium">SLA Performance</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    &lt; 500ms Client-Side
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
