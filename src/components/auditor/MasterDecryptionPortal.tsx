import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useNotification } from "../../context/NotificationContext";
import type {
  AuditorMasterKey,
  DecryptedSaleEnvelope,
  DecryptionAuditLogEntry,
} from "../../types/masterDecryption";
import {
  validateMasterKey,
  decryptAndVerifySale,
  getDecryptionAuditLogs,
  exportAuditLogsAsCSV,
  PRESET_KEYS_SECRET_MAP,
  AUDIT_LOG_EVENT,
} from "../../lib/masterDecryptionService";
import {
  Key,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck,
  Database,
  History,
} from "lucide-react";

interface MasterDecryptionPortalProps {
  initialSaleId?: string;
  onAuditLogged?: (log: DecryptionAuditLogEntry) => void;
  className?: string;
}

export const MasterDecryptionPortal: React.FC<MasterDecryptionPortalProps> = ({
  initialSaleId = "1042",
  onAuditLogged,
  className = "",
}) => {
  const { showNotification } = useNotification();

  // Master Key Authorization State
  const [masterKeyInput, setMasterKeyInput] = useState<string>(
    PRESET_KEYS_SECRET_MAP.ENTERPRISE_MASTER,
  );
  const [showKeyText, setShowKeyText] = useState(false);
  const [authorizedKey, setAuthorizedKey] = useState<AuditorMasterKey | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isValidatingKey, setIsValidatingKey] = useState(false);

  // Decryption Target State
  const [saleId, setSaleId] = useState(initialSaleId);
  const [campaignAddress, setCampaignAddress] = useState(
    "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
  );
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedEnvelope, setDecryptedEnvelope] = useState<DecryptedSaleEnvelope | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<DecryptionAuditLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"portal" | "logs">("portal");

  // Load audit logs on mount and listen to broadcast events
  useEffect(() => {
    setAuditLogs(getDecryptionAuditLogs());

    const handleLogUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<DecryptionAuditLogEntry | null>;
      if (customEvent.detail) {
        setAuditLogs((prev) => [customEvent.detail!, ...prev.filter((l) => l.id !== customEvent.detail!.id)]);
      } else {
        setAuditLogs(getDecryptionAuditLogs());
      }
    };

    window.addEventListener(AUDIT_LOG_EVENT, handleLogUpdate);
    return () => window.removeEventListener(AUDIT_LOG_EVENT, handleLogUpdate);
  }, []);

  // Validate initial key on mount
  useEffect(() => {
    handleKeyValidation(masterKeyInput, false);
  }, []);

  const handleKeyValidation = (keyString: string, notify = true) => {
    setIsValidatingKey(true);
    setKeyError(null);

    const result = validateMasterKey(keyString);

    if (result.isValid && result.key) {
      setAuthorizedKey(result.key);
      setKeyError(null);
      if (notify) {
        showNotification({
          type: "success",
          title: "Master Key Authorized",
          message: `${result.key.label} validated. Master decryption unlocked.`,
        });
      }
    } else {
      setAuthorizedKey(null);
      setKeyError(result.error || "Key validation failed.");
      if (notify) {
        showNotification({
          type: "error",
          title: "Authorization Denied",
          message: result.error || "Invalid auditor master key.",
        });
      }
    }

    setIsValidatingKey(false);
  };

  const handleSelectPresetKey = (presetName: keyof typeof PRESET_KEYS_SECRET_MAP) => {
    const keyVal = PRESET_KEYS_SECRET_MAP[presetName];
    setMasterKeyInput(keyVal);
    handleKeyValidation(keyVal, true);
  };

  const handleSelectPresetSale = (
    presetSaleId: string,
    presetCampaignAddress = "",
  ) => {
    setSaleId(presetSaleId);
    if (presetCampaignAddress) {
      setCampaignAddress(presetCampaignAddress);
    }
    setDecryptedEnvelope(null);
  };

  const handleDecrypt = async () => {
    if (!authorizedKey) {
      showNotification({
        type: "warning",
        title: "Key Required",
        message: "Please validate and authorize a Master Decryption Key first.",
      });
      return;
    }

    if (!saleId.trim()) {
      showNotification({
        type: "warning",
        title: "Sale ID Required",
        message: "Enter a valid Sale ID to decrypt.",
      });
      return;
    }

    setIsDecrypting(true);
    try {
      const { envelope, auditLog } = await decryptAndVerifySale(
        saleId,
        campaignAddress,
        authorizedKey,
      );

      setDecryptedEnvelope(envelope);
      setAuditLogs((prev) => [auditLog, ...prev.filter((l) => l.id !== auditLog.id)]);
      onAuditLogged?.(auditLog);

      showNotification({
        type: "success",
        title: `Sale #${envelope.saleId.replace("#", "")} Decrypted`,
        message: `Cryptographic envelope unwrapped & audit log #${auditLog.id} logged.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Decryption failed";
      showNotification({
        type: "error",
        title: "Decryption Failed",
        message,
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleExportCSV = () => {
    const csvContent = exportAuditLogsAsCSV(auditLogs);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `auditor_decryption_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showNotification({
      type: "info",
      title: "Audit Log Exported",
      message: `${auditLogs.length} audit entries exported to CSV.`,
    });
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Top Banner / Portal Header */}
      <Card className="border-2 border-indigo-200/80 dark:border-indigo-900/60 shadow-lg bg-gradient-to-br from-white via-indigo-50/30 to-purple-50/20 dark:from-zinc-900/90 dark:via-indigo-950/20 dark:to-zinc-900/90 rounded-3xl overflow-hidden">
        <CardHeader className="p-6 md:p-8 border-b border-indigo-100/60 dark:border-indigo-900/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    NIST SP 800-38D AES-GCM
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Audit Ledger
                  </span>
                </div>
                <CardTitle className="text-2xl md:text-3xl font-extrabold text-zinc-900 dark:text-white mt-1">
                  Authorized Master Decryption Portal
                </CardTitle>
                <CardDescription className="text-zinc-600 dark:text-zinc-400 mt-1 max-w-2xl font-medium">
                  Cryptographically decrypt, inspect, and verify any on-chain sale. Every access
                  attempt and decryption is immutably recorded in the compliance audit ledger.
                </CardDescription>
              </div>
            </div>

            {/* Quick Navigation Tabs */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800/80 p-1.5 rounded-2xl border border-slate-200 dark:border-zinc-700 shrink-0 self-start md:self-auto">
              <button
                onClick={() => setActiveTab("portal")}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  activeTab === "portal"
                    ? "bg-white dark:bg-indigo-600 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                Decryption Portal
              </button>
              <button
                onClick={() => setActiveTab("logs")}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 ${
                  activeTab === "logs"
                    ? "bg-white dark:bg-indigo-600 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Audit Logs ({auditLogs.length})
              </button>
            </div>
          </div>
        </CardHeader>

        {activeTab === "portal" ? (
          <CardContent className="p-6 md:p-8 space-y-8">
            {/* Step 1: Master Key Validation Gate */}
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                      Master Key Validation & Access Gate
                      <span className="text-[10px] text-zinc-500 font-normal">
                        (Mandatory for Decryption)
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Supply an authorized Ed25519 secret key or regulatory certificate to unlock
                      decryption capabilities.
                    </p>
                  </div>
                </div>

                {/* Authorization Status Badge */}
                {authorizedKey ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-700 dark:text-emerald-300 text-xs font-bold shrink-0">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Access Granted ({authorizedKey.role})</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-red-700 dark:text-red-400 text-xs font-bold shrink-0">
                    <Lock className="w-4 h-4 text-red-500" />
                    <span>Access Locked</span>
                  </div>
                )}
              </div>

              {/* Master Key Input Form */}
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    type={showKeyText ? "text" : "password"}
                    value={masterKeyInput}
                    onChange={(e) => setMasterKeyInput(e.target.value)}
                    placeholder="Enter 56-char Stellar secret key (S...) or 64-char Hex master key"
                    className="font-mono text-xs pr-24 h-12 rounded-xl bg-slate-50 dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-700"
                  />
                  <div className="absolute right-2 top-2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKeyText(!showKeyText)}
                      className="h-8 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                      title={showKeyText ? "Hide key" : "Show key"}
                    >
                      {showKeyText ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleKeyValidation(masterKeyInput, true)}
                      disabled={isValidatingKey}
                      className="h-8 px-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold"
                    >
                      {isValidatingKey ? "Validating..." : "Validate Key"}
                    </Button>
                  </div>
                </div>

                {/* Key presets for rapid evaluation */}
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400 font-semibold text-[11px]">
                    Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetKey("ENTERPRISE_MASTER")}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-[11px] font-semibold transition-colors"
                  >
                    Enterprise Master (Valid)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetKey("REGULATORY_COMPLIANCE")}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 text-[11px] font-semibold transition-colors"
                  >
                    ISO Compliance Hex (Valid)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetKey("RESTRICTED_INSPECTOR")}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-[11px] font-semibold transition-colors"
                  >
                    Inspector Token
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectPresetKey("REVOKED_KEY")}
                    className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 text-[11px] font-semibold transition-colors"
                  >
                    Revoked/Expired Key
                  </button>
                </div>

                {/* Feedback state */}
                {keyError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <span>{keyError}</span>
                  </div>
                )}

                {authorizedKey && (
                  <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold">
                        Key Fingerprint
                      </span>
                      <span className="font-mono font-bold text-zinc-900 dark:text-white">
                        {authorizedKey.fingerprint}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold">
                        Auditor Role
                      </span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {authorizedKey.role}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] uppercase font-bold">
                        Algorithm / Standard
                      </span>
                      <span className="font-mono text-zinc-700 dark:text-zinc-300">
                        {authorizedKey.algorithm}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Sale Decryption Console */}
            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-zinc-900 dark:text-white">
                    Select & Decrypt Sale Envelope
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Input any Sale ID or contract address to cryptographically unwrap the private
                    conversion record.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 block">
                    Sale ID
                  </label>
                  <Input
                    value={saleId}
                    onChange={(e) => setSaleId(e.target.value)}
                    placeholder="e.g. 1042 or 1100"
                    className="font-mono text-sm h-11 rounded-xl bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1 block">
                    Campaign Contract Address (Optional)
                  </label>
                  <Input
                    value={campaignAddress}
                    onChange={(e) => setCampaignAddress(e.target.value)}
                    placeholder="CA7Q... or contract identifier"
                    className="font-mono text-xs h-11 rounded-xl bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Quick Sale Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold text-[11px]">
                  Quick Presets:
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPresetSale(
                      "1042",
                      "CA7QW5KXGPTR4N2K9J2L77XLMESCROW9999STORMTESTNET1",
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-200 text-[11px] font-mono transition-colors"
                >
                  Sale #1042 (Tech Gadgets)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPresetSale(
                      "1100",
                      "CB9E88LMNPQR5TUV2WXY4444ESCROW8888STORMTESTNET2",
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-200 text-[11px] font-mono transition-colors"
                >
                  Sale #1100 (Summer Sale)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPresetSale(
                      "1089",
                      "CD4M11STORM22ESCROW33SOROBAN44AFFILIATE55XLM6",
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-200 text-[11px] font-mono transition-colors"
                >
                  Sale #1089 (NFT Drop)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleSelectPresetSale(
                      "776",
                      "CC2K99STORM33ESCROW44SOROBAN55AFFILIATE66XLM7",
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-slate-200 text-[11px] font-mono transition-colors"
                >
                  Sale #776 (Disputed Sale)
                </button>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-indigo-500" />
                  <span>
                    Decryption automatically writes a permanent on-chain audit record.
                  </span>
                </div>

                <Button
                  onClick={handleDecrypt}
                  disabled={isDecrypting || !authorizedKey}
                  className="w-full sm:w-auto h-12 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                >
                  {isDecrypting ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Unwrapping Envelope & Logging Audit...</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-4 h-4" />
                      <span>Decrypt & Verify Sale #{saleId.replace("#", "")}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Decrypted Payload Result Display */}
            {decryptedEnvelope && (
              <div className="p-6 md:p-8 rounded-3xl bg-slate-900 text-white shadow-xl border border-indigo-500/30 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-lg text-white">
                          Sale {decryptedEnvelope.saleId} Decrypted
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Integrity Verified
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Campaign: {decryptedEnvelope.campaign} · Contract:{" "}
                        <span className="font-mono text-zinc-300">
                          {decryptedEnvelope.campaignAddress.slice(0, 10)}...
                          {decryptedEnvelope.campaignAddress.slice(-8)}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] text-zinc-400 block font-mono">
                      Decrypted By Fingerprint
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-400">
                      {decryptedEnvelope.decryptedByFingerprint}
                    </span>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-zinc-800/80 border border-zinc-700/60">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Gross Conversion
                    </span>
                    <span className="text-xl font-extrabold text-white mt-1 block">
                      {decryptedEnvelope.grossConversion.toFixed(2)}{" "}
                      {decryptedEnvelope.currency}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-800/80 border border-zinc-700/60">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Affiliate Commission
                    </span>
                    <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
                      {decryptedEnvelope.commissionAmount.toFixed(2)}{" "}
                      {decryptedEnvelope.currency} ({decryptedEnvelope.commissionRate}%)
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-800/80 border border-zinc-700/60">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Settlement Status
                    </span>
                    <span
                      className={`text-sm font-bold mt-1.5 inline-block ${
                        decryptedEnvelope.settlementStatus === "Escrow Cleared & Released"
                          ? "text-emerald-400"
                          : decryptedEnvelope.settlementStatus === "Disputed"
                            ? "text-red-400"
                            : "text-amber-400"
                      }`}
                    >
                      {decryptedEnvelope.settlementStatus}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-zinc-800/80 border border-zinc-700/60">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                      Ledger Timestamp
                    </span>
                    <span className="text-xs font-mono text-zinc-300 mt-2 block">
                      {new Date(decryptedEnvelope.decryptedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                {/* Technical Cryptographic Envelope Breakdown */}
                <div className="space-y-3 p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 font-mono text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800/80">
                    <span className="text-zinc-500">Buyer Pseudonym Hash:</span>
                    <span className="text-indigo-300 break-all">
                      {decryptedEnvelope.buyerHash}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800/80">
                    <span className="text-zinc-500">SHA-256 State Integrity Hash:</span>
                    <span className="text-emerald-400 break-all">
                      {decryptedEnvelope.integrityHash}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800/80">
                    <span className="text-zinc-500">On-Chain Ed25519 Signature:</span>
                    <span className="text-purple-300 break-all">
                      {decryptedEnvelope.onChainSignature}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-zinc-400">
                    <span className="text-zinc-500">NIST SP 800-38D Proof:</span>
                    <span className="text-amber-300 break-all">
                      {decryptedEnvelope.nistComplianceProof}
                    </span>
                  </div>
                </div>

                {/* Audit notification banner */}
                <div className="flex items-center justify-between p-3 bg-indigo-950/50 border border-indigo-500/30 rounded-xl text-xs text-indigo-300">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    <span>
                      Audit Record logged to ledger for Sale #{saleId.replace("#", "")}.
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className="font-bold underline hover:text-white"
                  >
                    View in Audit Log →
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        ) : (
          /* Step 3: Decryption Audit Log Feed */
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Decryption Audit Ledger
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Full cryptographic trail of all master decryption events for regulatory review.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="rounded-xl border-slate-200 dark:border-zinc-700 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("portal")}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                >
                  + New Decryption
                </Button>
              </div>
            </div>

            {/* Audit Log Table */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950/50">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-zinc-900/80 border-b border-slate-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">Log ID</th>
                      <th className="p-4">Sale ID</th>
                      <th className="p-4">Campaign</th>
                      <th className="p-4">Auditor Key Fingerprint</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-medium">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-zinc-500">
                          No master decryption records logged yet.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                        >
                          <td className="p-4 font-mono font-bold text-zinc-900 dark:text-white">
                            {log.id}
                          </td>
                          <td className="p-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {log.saleId}
                          </td>
                          <td className="p-4">
                            <div className="font-bold text-zinc-900 dark:text-white">
                              {log.campaign}
                            </div>
                            <div className="text-[10px] font-mono text-zinc-400">
                              {log.campaignAddress.slice(0, 8)}...
                              {log.campaignAddress.slice(-6)}
                            </div>
                          </td>
                          <td className="p-4 font-mono text-zinc-600 dark:text-zinc-400">
                            <div>{log.auditorKeyFingerprint}</div>
                            <div className="text-[10px] text-zinc-500">{log.auditorRole}</div>
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              {log.status}
                            </span>
                          </td>
                          <td className="p-4 font-mono text-zinc-500 text-[11px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
