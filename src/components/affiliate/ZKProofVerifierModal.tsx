import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Download,
  Lock,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import type { ZKRevenueProof, ZKVerificationResult } from "../../types/zkProof";
import {
  verifyZKRevenueProof,
  verifyZKRevenueProofSync,
  generateProofVerificationUrl,
} from "../../lib/zkProofEngine";
import { formatAffiliateAddress } from "../../lib/referralTree";

export interface ZKProofVerifierModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly proof?: ZKRevenueProof | null;
  readonly portalled?: boolean;
}

export const ZKProofVerifierModal: React.FC<ZKProofVerifierModalProps> = ({
  isOpen,
  onClose,
  proof,
  portalled = false,
}) => {
  const [result, setResult] = useState<ZKVerificationResult | null>(() =>
    proof ? verifyZKRevenueProofSync(proof) : null,
  );
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (proof) {
      setResult(verifyZKRevenueProofSync(proof));
    } else {
      setResult(null);
    }
  }, [proof]);

  const handleManualReverify = async () => {
    if (!proof) return;
    setIsVerifying(true);
    const res = await verifyZKRevenueProof(proof);
    setResult(res);
    setIsVerifying(false);
  };

  const handleDownloadCertificate = () => {
    if (!proof) return;
    const cert = {
      certificateTitle: "StormSale Zero-Knowledge Proof of Revenue Certificate",
      verifiedAt: result?.verifiedAt || new Date().toISOString(),
      status: result?.isValid ? "VERIFIED" : "UNVERIFIED",
      proofPayload: proof,
      cryptographicAudit: result,
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cert, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `zk-revenue-certificate-${proof.proofId}.json`);
    dlAnchor.click();
  };

  const verificationUrl = proof ? generateProofVerificationUrl(proof) : "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        portalled={portalled}
        className="max-w-2xl p-0 overflow-hidden rounded-3xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 pb-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-zinc-950 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex items-start justify-between">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Zero-Knowledge Cryptographic Verifier</span>
              </div>
              <DialogTitle className="text-2xl font-black tracking-tight text-white mt-1">
                Verifiable Proof of Revenue Attestation
              </DialogTitle>
              <DialogDescription className="text-zinc-300 text-xs leading-relaxed max-w-lg">
                Independent 1-click verification of historic on-chain affiliate revenue. Proves volume
                threshold without disclosing customer identities, transaction amounts, or buyer addresses.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {!proof ? (
            <div className="text-center py-10 space-y-3">
              <Lock className="w-10 h-10 text-zinc-400 mx-auto animate-pulse" />
              <p className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                No proof selected for verification. Please select or paste a proof.
              </p>
            </div>
          ) : (
            <>
              {/* Primary Verification Result Hero */}
              <div
                data-testid="verification-status-banner"
                className={`p-5 rounded-2xl border transition-all ${
                  result?.isValid
                    ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-100"
                    : "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/80 text-rose-900 dark:text-rose-100"
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                        result?.isValid
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                          : "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                      }`}
                    >
                      {result?.isValid ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : (
                        <XCircle className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-lg tracking-tight">
                          {result?.isValid
                            ? `Cryptographically Verified: $${proof.claimedThresholdUsd.toLocaleString()}+ USD`
                            : "Attestation Verification Failed"}
                        </h4>
                        <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-white/60 dark:bg-zinc-900/60 border border-current">
                          {proof.revenueTier}
                        </span>
                      </div>
                      <p className="text-xs opacity-90 mt-0.5">
                        {result?.isValid
                          ? `Affiliate ${formatAffiliateAddress(proof.affiliateAddress)} successfully verified across ${proof.totalConversionsCount} historic on-chain transactions.`
                          : result?.failureReason || "Proof does not meet cryptographic integrity criteria."}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={result?.isValid ? "default" : "outline"}
                    onClick={handleManualReverify}
                    disabled={isVerifying}
                    data-testid="btn-reverify-proof"
                    className={`shrink-0 gap-1.5 text-xs font-bold ${
                      result?.isValid ? "bg-emerald-600 hover:bg-emerald-500 text-white" : ""
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? "animate-spin" : ""}`} />
                    <span>{isVerifying ? "Verifying..." : "1-Click Re-Verify"}</span>
                  </Button>
                </div>
              </div>

              {/* Cryptographic Proof Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block uppercase">
                    Affiliate Public Key
                  </span>
                  <span className="font-mono text-xs font-extrabold text-zinc-800 dark:text-zinc-200 break-all select-all">
                    {proof.affiliateAddress}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block uppercase">
                    Merkle Commitment Root
                  </span>
                  <span className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400 break-all select-all">
                    {proof.merkleRoot}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block uppercase">
                    Nullifier Hash
                  </span>
                  <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300 break-all select-all">
                    {proof.nullifierHash}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-700/60">
                  <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 block uppercase">
                    Attestation Authority
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      {proof.issuer}
                    </span>
                  </div>
                </div>
              </div>

              {/* 5-Step Independent Verification Audit */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Cryptographic Verification Steps</span>
                </h5>

                <div className="space-y-2">
                  {result?.verificationSteps?.map((step) => (
                    <div
                      key={step.step}
                      className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5">
                        {step.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <p className="font-bold text-zinc-900 dark:text-zinc-100">
                            {step.description}
                          </p>
                          {step.details && (
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                              {step.details}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          step.passed
                            ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                            : "bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800"
                        }`}
                      >
                        {step.passed ? "Passed" : "Failed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Share & Download Actions */}
              <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Shareable Verification Link
                  </label>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Third-party brands can verify with 1 click
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={verificationUrl}
                    className="flex-1 px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 select-all"
                    data-testid="input-verification-url"
                  />
                  <CopyButton text={verificationUrl} label="Copy Link" size="default" variant="indigo" />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadCertificate}
                    data-testid="btn-download-cert"
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON Certificate</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onClose}
                    className="text-xs font-bold px-4 bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
