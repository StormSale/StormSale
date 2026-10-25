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
import {
  CheckCircle2,
  Copy,
  Check,
  Download,
  Binary,
  Code2,
  Search,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { verifyContractBytecode, type VerificationResult } from "../../lib/wasmVerification";

const DEFAULT_CONTRACT = "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1";
const DEFAULT_COMMIT = "f904fa9146e1d06d25acf8cdd0e814ba00839808";

export const VerifyContractBytecode: React.FC = () => {
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT);
  const [commitHash, setCommitHash] = useState(DEFAULT_COMMIT);
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedWat, setCopiedWat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handleVerify = async (contract: string = contractAddress, commit: string = commitHash) => {
    setIsVerifying(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      const verification = await verifyContractBytecode(contract, commit);
      setResult(verification);
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    if (type === "wat") {
      setCopiedWat(true);
      setTimeout(() => setCopiedWat(false), 2000);
    } else {
      setCopiedHash(type);
      setTimeout(() => setCopiedHash(null), 2000);
    }
  };

  const downloadWat = () => {
    if (!result) return;
    const blob = new Blob([result.wat], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.contractId.slice(0, 8)}_contract.wat`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredWat = result
    ? result.wat
        .split("\n")
        .filter((line) => line.toLowerCase().includes(searchQuery.toLowerCase()))
        .join("\n")
    : "";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center bg-white dark:bg-zinc-900/50 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              Soroban RPC Ledger Verified
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
              <Cpu className="w-3.5 h-3.5" />
              WASM / WAT Disassembly
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
            Verify Contract Bytecode
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
            Verify on-chain Soroban contract bytecode against open-source repository commit hashes
            and inspect disassembled WebAssembly Text (WAT).
          </p>
        </div>
      </div>

      {/* Verification Inputs Form */}
      <Card className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Binary className="w-5 h-5 text-indigo-500" />
            Contract & Artifact Parameters
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Specify the deployed Soroban contract address and target repository commit hash to run
            the verification comparison.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Soroban Contract Address (C...)
            </label>
            <Input
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="e.g. CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1"
              className="font-mono text-sm bg-slate-50 dark:bg-zinc-800/50"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-zinc-500 self-center">Presets:</span>
              <button
                type="button"
                onClick={() =>
                  setContractAddress("CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1")
                }
                className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
              >
                Escrow Protocol
              </button>
              <button
                type="button"
                onClick={() => setContractAddress("CB39F9AA82KLP0192STORMREGISTRYAFFILIATE22TEST")}
                className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
              >
                Affiliate Registry
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Repository Commit Hash / Release Tag
            </label>
            <Input
              value={commitHash}
              onChange={(e) => setCommitHash(e.target.value)}
              placeholder="e.g. f904fa9146e1d06d25acf8cdd0e814ba00839808"
              className="font-mono text-sm bg-slate-50 dark:bg-zinc-800/50"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-zinc-500 self-center">Test states:</span>
              <button
                type="button"
                onClick={() => setCommitHash("f904fa9146e1d06d25acf8cdd0e814ba00839808")}
                className="text-xs px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
              >
                Valid Commit (Matching)
              </button>
              <button
                type="button"
                onClick={() => setCommitHash("mismatch_dev_build_unverified")}
                className="text-xs px-2.5 py-1 rounded bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50"
              >
                Simulate Mismatch
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => handleVerify()}
              disabled={isVerifying || !contractAddress || !commitHash}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-xl flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Fetching & Verifying Bytecode...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify Bytecode & Disassemble
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Verification Status & Hash Comparison */}
      {result && (
        <div className="space-y-6">
          <Card
            className={`border shadow-sm rounded-2xl ${
              result.isMatch
                ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40"
                : "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40"
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {result.isMatch ? (
                    <div className="p-2.5 rounded-xl bg-emerald-500 text-white">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-rose-500 text-white">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-xl font-bold text-zinc-900 dark:text-white">
                      {result.isMatch
                        ? "Bytecode Verified: Match Confirmed"
                        : "Bytecode Hash Mismatch Detected"}
                    </CardTitle>
                    <CardDescription className="text-zinc-600 dark:text-zinc-300">
                      {result.isMatch
                        ? "Deployed on-chain contract bytecode exactly matches reproducible build from open-source repository commit."
                        : "Deployed contract hash does not match the build artifact from the specified commit hash."}
                    </CardDescription>
                  </div>
                </div>
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                    result.isMatch
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                      : "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
                  }`}
                >
                  {result.isMatch ? "VERIFIED MATCH" : "MISMATCH"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* On-Chain WASM Hash */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      On-Chain WASM SHA-256
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(result.onChainHash, "onChain")}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      title="Copy Hash"
                    >
                      {copiedHash === "onChain" ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-xs break-all text-zinc-900 dark:text-zinc-100 p-2.5 rounded bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800">
                    {result.onChainHash}
                  </div>
                </div>

                {/* Repo Build Hash */}
                <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Repository Release SHA-256
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(result.repoBuildHash, "repo")}
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      title="Copy Hash"
                    >
                      {copiedHash === "repo" ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <div className="font-mono text-xs break-all text-zinc-900 dark:text-zinc-100 p-2.5 rounded bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800">
                    {result.repoBuildHash}
                  </div>
                </div>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-600 dark:text-zinc-400 pt-2 border-t border-slate-200/60 dark:border-zinc-800">
                <span>
                  <strong>Bytecode Size:</strong> {result.bytecodeSizeBytes} bytes
                </span>
                <span>
                  <strong>Exported Functions:</strong> {result.exportedFunctions.join(", ")}
                </span>
                <span>
                  <strong>Compiler Toolchain:</strong> {result.compilerVersion}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* WebAssembly Text (WAT) Disassembly View */}
          <Card className="bg-white dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Code2 className="w-5 h-5 text-indigo-500" />
                    WebAssembly Text (WAT) Disassembly
                  </CardTitle>
                  <CardDescription className="text-zinc-500 dark:text-zinc-400">
                    Disassembled contract bytecode instructions and exported host interface
                    definitions.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:w-60">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter instructions..."
                      className="pl-9 text-xs h-9 bg-slate-50 dark:bg-zinc-800/50"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(result.wat, "wat")}
                    className="h-9 px-3 text-xs flex items-center gap-1.5"
                  >
                    {copiedWat ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedWat ? "Copied" : "Copy WAT"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadWat}
                    className="h-9 px-3 text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-slate-950 font-mono text-xs">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-slate-400 text-xs">
                  <span>disassembly.wat</span>
                  <span>{result.exportedFunctions.length} exports parsed</span>
                </div>
                <pre className="p-4 text-emerald-400 overflow-x-auto max-h-96 leading-relaxed select-text">
                  <code>{filteredWat || ";; No matching instructions found."}</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
