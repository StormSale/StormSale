import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { useWeb3 } from "../../hooks/useWeb3";
import { useNotification } from "../../context/NotificationContext";
import { getExportAuditHistory, type ExportAuditEvent } from "../../lib/auditor/exportService";
import { verifyEvidenceZip, getAuthorizedAuditorKeys } from "../../lib/auditor/verifier";
import type { PackVerificationResult } from "../../lib/auditor/types";
import {
  ShieldCheck,
  Download,
  Key,
  FileCheck2,
  Lock,
  Cpu,
  Server,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileArchive,
} from "lucide-react";

export const Soc2EvidenceExport: React.FC = () => {
  const { userRole, updateUserRole, isConnected } = useWeb3();
  const { showNotification } = useNotification();

  const [lastExport] = useState<ExportAuditEvent | null>(() => {
    const history = getExportAuditHistory();
    return history.length > 0 ? history[0] : null;
  });

  // In-browser pack verification states
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<PackVerificationResult | null>(null);
  const [verifiedFileName, setVerifiedFileName] = useState<string>("");

  const isAuditorOrAdmin =
    userRole?.toUpperCase() === "AUDITOR" || userRole?.toUpperCase() === "ADMIN";

  const handleExport = async () => {
    showNotification({
      type: "warning",
      title: "Server / CI Signing Required",
      message:
        "Cryptographic auditor signing is restricted to server-side or CI environments to protect platform keys. Use the CI pipeline or verify-evidence-pack.mjs script.",
    });
  };

  const handleVerifyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsVerifying(true);
      setVerifiedFileName(file.name);
      setVerificationResult(null);

      const arrayBuffer = await file.arrayBuffer();
      const result = await verifyEvidenceZip(arrayBuffer, {
        authorizedKeys: getAuthorizedAuditorKeys(),
      });
      setVerificationResult(result);

      if (result.valid) {
        showNotification({
          type: "success",
          title: "Cryptographic Verification Passed",
          message: `All ${result.verifiedFilesCount} files and auditor signature verified successfully.`,
        });
      } else {
        showNotification({
          type: "error",
          title: "Verification Failed",
          message: result.errors[0] || "Evidence pack has been tampered with or is invalid.",
        });
      }
    } catch (err: unknown) {
      showNotification({
        type: "error",
        title: "Verification Error",
        message: err instanceof Error ? err.message : "Could not inspect evidence pack archive.",
      });
    } finally {
      setIsVerifying(false);
      // Reset input value so same file can be re-selected if needed
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <Card className="border border-indigo-200 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 dark:from-zinc-900 dark:via-zinc-900/90 dark:to-indigo-950/20 shadow-md rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-indigo-100/80 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30 rounded-full">
                <ShieldCheck className="w-4 h-4 text-indigo-700 dark:text-indigo-400" />
                <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 tracking-wide uppercase">
                  Enterprise Auditor Tooling · SOC 2 Type II
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Automated SOC 2 Evidence Packager
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed">
                Compile an immutable evidence pack covering Confidentiality, Processing Integrity,
                and Availability controls. Bundles contract snapshots, CI logs, test receipts, and
                is cryptographically signed with an authorized Ed25519 auditor key.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto shrink-0">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 max-w-sm text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Server / CI Signing Required:</strong> Cryptographic auditor key signing
                  is restricted to server-side or CI environments to prevent private key exposure in
                  client bundles.
                </span>
              </div>

              <Button
                onClick={handleExport}
                disabled={true}
                className="h-12 px-6 rounded-2xl bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold cursor-not-allowed flex items-center justify-center gap-2.5 transition-all shadow-none"
                title="Cryptographic signing is restricted to server-side or CI environments."
              >
                <Download className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                <span>Export SOC 2 Pack (Server / CI Only)</span>
              </Button>

              {!isAuditorOrAdmin && isConnected && (
                <Button
                  variant="outline"
                  onClick={() => updateUserRole("AUDITOR")}
                  className="h-10 text-xs rounded-xl border-amber-300 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 font-semibold"
                >
                  <Key className="w-3.5 h-3.5 mr-1.5" />
                  Assume Auditor Role
                </Button>
              )}
            </div>
          </div>

          {/* Last export pill */}
          {lastExport && (
            <div className="mt-6 pt-5 border-t border-slate-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                <FileArchive className="w-4 h-4 text-indigo-500" />
                <span>
                  Latest Pack:{" "}
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {lastExport.filename}
                  </strong>
                </span>
                <span className="text-zinc-400 dark:text-zinc-600">·</span>
                <span>{lastExport.totalFiles} files bundled</span>
              </div>
              <div className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                Root: {lastExport.rootDigest.slice(0, 16)}...
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trust Services Criteria Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Lock className="w-4 h-4" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                Compliant
              </span>
            </div>
            <CardTitle className="text-base font-bold text-zinc-900 dark:text-white mt-3">
              Confidentiality Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5">
            <p>• Client-side AES-256-GCM encryption</p>
            <p>• Wrapped keys stored on-chain (NIST SP 800-53)</p>
            <p>• RBAC restricted to verified Auditor keys</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                Compliant
              </span>
            </div>
            <CardTitle className="text-base font-bold text-zinc-900 dark:text-white mt-3">
              Processing Integrity
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5">
            <p>• Deterministic commission basis points math</p>
            <p>• On-chain XLM escrow locking guarantees</p>
            <p>• SHA-256 Merkle root receipts for all files</p>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/80 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                <Server className="w-4 h-4" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                Compliant
              </span>
            </div>
            <CardTitle className="text-base font-bold text-zinc-900 dark:text-white mt-3">
              Availability Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1.5">
            <p>• Stellar Consensus Protocol (SCP) quorum</p>
            <p>• Multi-node Soroban RPC with failover</p>
            <p>• Soroban storage TTL auto-bump persistence</p>
          </CardContent>
        </Card>
      </div>

      {/* In-Browser Evidence Verifier Tool */}
      <Card className="border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/50 shadow-sm">
        <CardHeader className="pt-6 px-6 sm:px-8 pb-4 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Independent Pack Verification Suite
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Upload any exported evidence pack ZIP to verify its Ed25519 auditor signature and
                re-compute file SHA-256 hashes client-side.
              </CardDescription>
            </div>
            <label className="cursor-pointer inline-flex items-center justify-center h-9 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-750 text-xs font-bold text-zinc-800 dark:text-zinc-200 transition-colors">
              <Upload className="w-3.5 h-3.5 mr-2" />
              Upload ZIP to Verify
              <input
                type="file"
                accept=".zip"
                onChange={handleVerifyUpload}
                disabled={isVerifying}
                className="hidden"
              />
            </label>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8">
          {isVerifying ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                Verifying digital signature and re-computing file digests...
              </p>
              <p className="text-xs text-zinc-500 font-mono">{verifiedFileName}</p>
            </div>
          ) : verificationResult ? (
            <div
              className={`p-6 rounded-2xl border ${
                verificationResult.valid
                  ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40"
                  : "bg-red-50/70 border-red-200 dark:bg-red-950/20 dark:border-red-800/40"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    verificationResult.valid
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                  }`}
                >
                  {verificationResult.valid ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <AlertTriangle className="w-6 h-6" />
                  )}
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                      {verificationResult.valid
                        ? "Evidence Bundle Successfully Verified"
                        : "Verification Failed - Security Alert"}
                    </h4>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                        verificationResult.valid
                          ? "bg-emerald-200/80 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-red-200/80 text-red-800 dark:bg-red-500/20 dark:text-red-300"
                      }`}
                    >
                      {verificationResult.valid ? "Cryptographically Valid" : "Tamper Detected"}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    File: <span className="font-mono font-semibold">{verifiedFileName}</span> ·
                    Auditor Key:{" "}
                    <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {verificationResult.auditorKeyId}
                    </span>
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          verificationResult.signatureValid ? "text-emerald-600" : "text-red-600"
                        }
                      >
                        {verificationResult.signatureValid ? "✓" : "✗"}
                      </span>
                      <span>Auditor Ed25519 Signature</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          verificationResult.manifestHashValid ? "text-emerald-600" : "text-red-600"
                        }
                      >
                        {verificationResult.manifestHashValid ? "✓" : "✗"}
                      </span>
                      <span>Merkle Root Digest Consistency</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-600">✓</span>
                      <span>{verificationResult.verifiedFilesCount} File Hashes Matched</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={
                          verificationResult.tamperedFiles.length === 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }
                      >
                        {verificationResult.tamperedFiles.length === 0 ? "✓" : "✗"}
                      </span>
                      <span>Tampered Files: {verificationResult.tamperedFiles.length}</span>
                    </div>
                  </div>

                  {verificationResult.errors.length > 0 && (
                    <div className="mt-3 p-3 bg-red-100/50 dark:bg-red-900/20 rounded-xl text-xs text-red-700 dark:text-red-300 space-y-1">
                      {verificationResult.errors.map((err, i) => (
                        <p key={i}>• {err}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-center text-zinc-500 dark:text-zinc-400">
              <Upload className="w-8 h-8 text-zinc-400 dark:text-zinc-600" />
              <p className="text-xs font-semibold">
                Drag and drop or upload an exported evidence pack (.zip) here to verify
              </p>
              <p className="text-[11px] text-zinc-400">
                Runs complete offline verification: Ed25519 digital signature + SHA-256 checksums
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
