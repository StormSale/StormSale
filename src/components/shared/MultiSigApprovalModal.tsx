import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Download,
  Share2,
  AlertCircle,
  Loader2,
  Key,
  FileText,
  Send,
  Users,
} from "lucide-react";
import { useWeb3 } from "../../hooks/useWeb3";
import { Button } from "../ui/button";
import {
  type MultiSigAccountInfo,
  type SignatureProgress,
  type Sep30CoordinationSession,
  inspectMultiSigAccount,
  parseMultiSigTransaction,
  coSignTransaction,
  submitMultiSigTransaction,
  createSep30CoordinationSession,
  getSep30CoordinationSession,
} from "../../lib/multisig";

export const MultiSigApprovalModal: React.FC = () => {
  const {
    isMultiSigModalOpen,
    closeMultiSigModal,
    userAddress,
    connectorType,
    multiSigInfo,
    activeMultiSigXdr,
    activeMultiSigDescription,
    refreshMultiSigInfo,
  } = useWeb3();

  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [userEditedXdr, setUserEditedXdr] = useState<string | null>(null);
  const [importXdrInput, setImportXdrInput] = useState<string>("");
  const [sep30SessionIdInput, setSep30SessionIdInput] = useState<string>("");

  const currentXdr = userEditedXdr ?? (activeMultiSigXdr || "");

  // Local accountInfo fallback when not present in Web3Context
  const [localAccountInfo, setLocalAccountInfo] = useState<MultiSigAccountInfo | null>(null);
  const accountInfo = multiSigInfo || localAccountInfo;

  useEffect(() => {
    let isMounted = true;
    if (!multiSigInfo && userAddress) {
      inspectMultiSigAccount(userAddress)
        .then((info) => {
          if (isMounted) setLocalAccountInfo(info);
        })
        .catch(console.error);
    }
    return () => {
      isMounted = false;
    };
  }, [multiSigInfo, userAddress]);

  const [sep30Session, setSep30Session] = useState<Sep30CoordinationSession | null>(null);

  // Interaction states
  const [copiedXdr, setCopiedXdr] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSubmitOnThreshold, setAutoSubmitOnThreshold] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    txHash: string;
    ledger?: number;
  } | null>(null);

  // Parse current active XDR via useMemo
  const parsedTx = useMemo(() => {
    if (!currentXdr || !currentXdr.trim()) {
      return null;
    }
    try {
      return parseMultiSigTransaction(currentXdr, accountInfo || undefined);
    } catch {
      return null;
    }
  }, [currentXdr, accountInfo]);

  // Parse imported XDR input via useMemo
  const parsedImportTx = useMemo(() => {
    if (!importXdrInput || !importXdrInput.trim()) {
      return null;
    }
    try {
      return parseMultiSigTransaction(importXdrInput, accountInfo || undefined);
    } catch {
      return null;
    }
  }, [importXdrInput, accountInfo]);

  // Handle Tab Switch reset errors
  const handleTabChange = (tab: "export" | "import") => {
    setActiveTab(tab);
    setErrorMessage(null);
  };

  // Copy helper
  const handleCopy = (text: string, type: "xdr" | "session" | "key") => {
    navigator.clipboard.writeText(text);
    if (type === "xdr") {
      setCopiedXdr(true);
      setTimeout(() => setCopiedXdr(false), 2000);
    } else if (type === "session") {
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    } else {
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // Download XDR file helper
  const handleDownloadXdr = () => {
    const xdrToDownload = activeTab === "export" ? currentXdr : importXdrInput;
    if (!xdrToDownload) return;
    const blob = new Blob([xdrToDownload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stormsale-multisig-${Date.now()}.xdr`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Initialize or fetch SEP-0030 Coordination Session
  const handleCreateSep30Session = () => {
    if (!currentXdr || !accountInfo) return;
    try {
      const session = createSep30CoordinationSession(
        accountInfo,
        currentXdr,
        "escrow_deposit",
        activeMultiSigDescription || "Campaign Escrow Multi-Sig Approval",
      );
      setSep30Session(session);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to create SEP-0030 session");
    }
  };

  // Load an existing SEP-0030 Coordination Session by ID
  const handleLoadSep30Session = () => {
    const trimmed = sep30SessionIdInput.trim();
    if (!trimmed) return;
    const session = getSep30CoordinationSession(trimmed);
    if (!session) {
      setErrorMessage(`SEP-0030 session '${trimmed}' was not found.`);
      return;
    }
    setSep30Session(session);
    setImportXdrInput(session.currentXdr);
    setErrorMessage(null);
  };

  // Submit transaction helper
  const executeSubmission = useCallback(
    async (xdrToSubmit: string) => {
      setIsSubmitting(true);
      setErrorMessage(null);
      try {
        const res = await submitMultiSigTransaction(xdrToSubmit);
        setSuccessResult({ txHash: res.txHash, ledger: res.ledger });
        if (refreshMultiSigInfo) {
          refreshMultiSigInfo();
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Transaction submission to Stellar failed.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshMultiSigInfo],
  );

  // Co-sign action
  const handleCoSign = async () => {
    const targetXdr = activeTab === "export" ? currentXdr : importXdrInput;
    if (!targetXdr || !accountInfo) {
      setErrorMessage("Please provide a valid transaction envelope to co-sign.");
      return;
    }

    setIsSigning(true);
    setErrorMessage(null);

    try {
      const activeWalletType = connectorType || "mock";
      const result = await coSignTransaction(targetXdr, activeWalletType, accountInfo);

      // Update both current and import views with the newly signed XDR
      setUserEditedXdr(result.signedXdr);
      setImportXdrInput(result.signedXdr);

      // If threshold weight is met and auto-submit is enabled, trigger network submission
      if (result.isComplete && autoSubmitOnThreshold) {
        await executeSubmission(result.signedXdr);
      }
    } catch (err: any) {
      console.error("Co-signing failed:", err);
      setErrorMessage(err.message || "Co-signing failed. Please check your wallet.");
    } finally {
      setIsSigning(false);
    }
  };

  if (!isMultiSigModalOpen) return null;

  const activeProgress: SignatureProgress | undefined =
    activeTab === "export" ? parsedTx?.progress : parsedImportTx?.progress;

  const currentDisplayWeight = activeProgress?.currentWeight ?? accountInfo?.masterKeyWeight ?? 1;
  const requiredDisplayWeight = activeProgress?.requiredWeight ?? accountInfo?.requiredWeight ?? 2;
  const progressPercent =
    activeProgress?.progressPercent ??
    Math.min(100, Math.round((currentDisplayWeight / requiredDisplayWeight) * 100));
  const isThresholdSatisfied =
    activeProgress?.isThresholdMet ?? currentDisplayWeight >= requiredDisplayWeight;

  const formatKey = (key: string) => `${key.slice(0, 6)}...${key.slice(-6)}`;

  return (
    <AnimatePresence>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="multisig-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 overflow-hidden my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2
                  id="multisig-modal-title"
                  className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
                >
                  Multi-Signature Campaign Escrow Approval
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Stellar SEP-0030 Multi-Party Coordination & Approval Protocol
                </p>
              </div>
            </div>
            <button
              onClick={closeMultiSigModal}
              aria-label="Close modal"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Success Banner */}
          {successResult && (
            <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
              <div className="flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-600 shrink-0" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold">Transaction Successfully Submitted!</h4>
                  <p className="text-xs mt-1 text-emerald-700 dark:text-emerald-400">
                    The required signature threshold was satisfied and the escrow transaction has
                    been recorded on the Stellar ledger.
                  </p>
                  <div className="mt-2 text-xs font-mono break-all flex items-center space-x-1">
                    <span>Tx Hash: {successResult.txHash}</span>
                  </div>
                  {successResult.ledger && (
                    <div className="text-xs mt-0.5">Ledger: #{successResult.ledger}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 mt-0.5 text-rose-600 shrink-0" />
              <div className="text-xs flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Visual Signing Progress Indicator */}
          <div className="mt-4 p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-xl border border-slate-200 dark:border-zinc-800">
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-zinc-700 dark:text-zinc-300 flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-amber-500" />
                <span>Signing Progress:</span>
                <span className="font-bold text-zinc-900 dark:text-white">
                  {currentDisplayWeight} / {requiredDisplayWeight} Required Weight
                </span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  isThresholdSatisfied
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                }`}
              >
                {isThresholdSatisfied ? "Threshold Satisfied" : `${progressPercent}% Completed`}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2.5 bg-slate-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isThresholdSatisfied ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Signers Checklist */}
            {accountInfo && accountInfo.signers && accountInfo.signers.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-700/60">
                <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  Registered Account Signers ({accountInfo.signers.length})
                </div>
                <div className="space-y-1.5">
                  {accountInfo.signers.map((signer) => {
                    const isSigned = activeProgress?.signedSigners.some(
                      (s) => s.key === signer.key,
                    );
                    const isUser = userAddress === signer.key;

                    return (
                      <div
                        key={signer.key}
                        className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800 text-xs"
                      >
                        <div className="flex items-center space-x-2">
                          {isSigned ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                          )}
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">
                            {formatKey(signer.key)}
                          </span>
                          {isUser && (
                            <span className="px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded">
                              You
                            </span>
                          )}
                          <span className="text-zinc-400 text-[10px]">
                            (weight: {signer.weight})
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleCopy(signer.key, "key")}
                            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                            title="Copy full public key"
                          >
                            {copiedKey === signer.key ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isSigned
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                                : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {isSigned ? "Signed" : "Pending"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-2 mt-4 border-b border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => handleTabChange("export")}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 ${
                activeTab === "export"
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Export & SEP-0030 Share</span>
            </button>
            <button
              onClick={() => handleTabChange("import")}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center space-x-1.5 ${
                activeTab === "import"
                  ? "border-amber-500 text-amber-600 dark:text-amber-400"
                  : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Import & Co-Sign XDR</span>
            </button>
          </div>

          {/* TAB 1: EXPORT & SEP-0030 SHARE */}
          {activeTab === "export" && (
            <div className="mt-4 space-y-4">
              {parsedTx ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-slate-200 dark:border-zinc-800">
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Source Account</span>
                    <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                      {formatKey(parsedTx.sourceAccount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Operations</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {parsedTx.operationsCount} op ({parsedTx.operationTypes.join(", ")})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Fee</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {parsedTx.fee} stroops
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Type</span>
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                      {parsedTx.isSoroban ? "Soroban Smart Contract" : "Stellar Classic"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-500 italic p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-xl">
                  {currentXdr
                    ? "Decoding transaction XDR envelope..."
                    : "No active transaction in context. You can prepare an escrow operation or paste an XDR in the Import tab."}
                </div>
              )}

              {/* Raw XDR Textarea & Actions */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Unsigned / Partially Signed Transaction Envelope (XDR)
                </label>
                <textarea
                  readOnly
                  rows={4}
                  value={currentXdr}
                  placeholder="Transaction XDR will appear here when an escrow operation is initiated..."
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                />

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(currentXdr, "xdr")}
                    disabled={!currentXdr}
                    className="h-8 text-xs font-semibold"
                  >
                    {copiedXdr ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" /> Copied XDR
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy XDR
                      </>
                    )}
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadXdr}
                    disabled={!currentXdr}
                    className="h-8 text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" /> Download .xdr File
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateSep30Session}
                    disabled={!currentXdr}
                    className="h-8 text-xs font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                  >
                    <Share2 className="w-3.5 h-3.5 mr-1" /> Create SEP-0030 Session
                  </Button>
                </div>
              </div>

              {/* SEP-0030 Coordination Details */}
              {sep30Session && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      SEP-0030 Coordination Session Active
                    </span>
                    <button
                      onClick={() => handleCopy(sep30Session.sessionId, "session")}
                      className="text-xs font-mono text-amber-600 dark:text-amber-400 hover:underline flex items-center space-x-1"
                    >
                      <span>{sep30Session.sessionId}</span>
                      {copiedSessionId ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    Share this session ID with your co-signers. Co-signers can import this session
                    ID in the &ldquo;Import &amp; Co-Sign&rdquo; tab to view the escrow details and
                    attach their signature.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT & CO-SIGN */}
          {activeTab === "import" && (
            <div className="mt-4 space-y-4">
              {/* Load from SEP-0030 Session ID */}
              <div className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-slate-200 dark:border-zinc-800">
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Load from Stellar SEP-0030 Session ID
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={sep30SessionIdInput}
                    onChange={(e) => setSep30SessionIdInput(e.target.value)}
                    placeholder="e.g. sep30_abc12345"
                    className="flex-1 text-xs font-mono p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none"
                  />
                  <Button
                    size="sm"
                    onClick={handleLoadSep30Session}
                    disabled={!sep30SessionIdInput.trim()}
                    className="h-8 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    Load Session
                  </Button>
                </div>
              </div>

              {/* Paste Raw XDR Input */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Paste Partially Signed Transaction Envelope (XDR)
                </label>
                <textarea
                  rows={4}
                  value={importXdrInput}
                  onChange={(e) => setImportXdrInput(e.target.value)}
                  placeholder="Paste transaction XDR here (e.g. AAAA...)"
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              {/* Parsed Inspection of Imported Transaction */}
              {parsedImportTx && (
                <div className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs space-y-2">
                  <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                    <span>Parsed Transaction Details</span>
                    <span className="font-mono text-[11px] text-zinc-500">
                      Seq: {parsedImportTx.sequenceNumber}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-zinc-400">Source:</span>{" "}
                      <span className="font-mono">{formatKey(parsedImportTx.sourceAccount)}</span>
                    </div>
                    <div>
                      <span className="text-zinc-400">Fee:</span> {parsedImportTx.fee} stroops
                    </div>
                    <div>
                      <span className="text-zinc-400">Operations:</span>{" "}
                      {parsedImportTx.operationTypes.join(", ")}
                    </div>
                    <div>
                      <span className="text-zinc-400">Signatures Present:</span>{" "}
                      {parsedImportTx.progress.signaturesCount}
                    </div>
                  </div>
                </div>
              )}

              {/* Auto-Submit Toggle */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="autoSubmitToggle"
                  checked={autoSubmitOnThreshold}
                  onChange={(e) => setAutoSubmitOnThreshold(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="autoSubmitToggle"
                  className="text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer select-none"
                >
                  Automatically submit transaction to Stellar network when threshold weight is
                  satisfied
                </label>
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Active Wallet:{" "}
              <span className="font-semibold capitalize text-zinc-800 dark:text-zinc-200">
                {connectorType || "Not Connected"}
              </span>
            </div>

            <div className="flex items-center space-x-2.5 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={closeMultiSigModal}
                className="h-9 px-4 text-xs font-semibold"
              >
                Close
              </Button>

              {/* Co-Sign Button */}
              <Button
                size="sm"
                onClick={handleCoSign}
                disabled={
                  isSigning ||
                  isSubmitting ||
                  (activeTab === "export" ? !currentXdr : !importXdrInput)
                }
                className="h-9 px-4 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-md flex items-center space-x-1.5"
              >
                {isSigning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Signing with Wallet...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    <span>Sign with Connected Wallet</span>
                  </>
                )}
              </Button>

              {/* Submit to Network Button (shown if threshold satisfied) */}
              {isThresholdSatisfied && !successResult && (
                <Button
                  size="sm"
                  onClick={() =>
                    executeSubmission(activeTab === "export" ? currentXdr : importXdrInput)
                  }
                  disabled={isSubmitting}
                  className="h-9 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center space-x-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit to Stellar</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
