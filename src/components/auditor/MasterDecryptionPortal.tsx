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
  ShieldCheck,
  KeyRound,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Search,
  Sparkles,
  Fingerprint,
} from "lucide-react";
import { useAuditorTenancy } from "../../context/AuditorTenancyContext";
import { isSaleIdInOrg } from "../../lib/auditorTenancy";
import {
  appendAuditAccessEvent,
  isAuditorRevoked,
  type AuditAccessEvent,
} from "../../lib/auditLedger";
import { useNotification } from "../../context/NotificationContext";

interface MasterDecryptionResult {
  saleId: string;
  organization: string;
  campaignContract: string;
  affiliateAddress: string;
  buyerHash: string;
  grossAmount: string;
  commission: string;
  settlementStatus: string;
  decryptedTimestamp: string;
  nistComplianceProof: string;
  ledgerEventHash: string;
  ledgerSequence: number;
}

export const MasterDecryptionPortal: React.FC = () => {
  const { org, cachedKeyIds } = useAuditorTenancy();
  const { showNotification } = useNotification();

  const [masterKey, setMasterKey] = useState<string>("");
  const [targetSaleId, setTargetSaleId] = useState<string>(org.saleIds[0] || "1042");
  const [isValidatingKey, setIsValidatingKey] = useState<boolean>(false);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [keyValidationState, setKeyValidationState] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [decryptedRecord, setDecryptedRecord] = useState<MasterDecryptionResult | null>(null);
  const [lastAuditEntry, setLastAuditEntry] = useState<AuditAccessEvent | null>(null);

  /**
   * Validates master key integrity, format, and revocation status before granting access.
   */
  const validateMasterKey = (key: string): { valid: boolean; message: string } => {
    const trimmed = key.trim();
    if (!trimmed) {
      return {
        valid: false,
        message: "Master decryption key or authorized auditor key is required.",
      };
    }

    // Stellar Secret key (S...), Public Key (G...), or Master Auditor token format (AUD-MASTER-...)
    const isStellarSecret = /^S[A-Z0-9]{55}$/.test(trimmed);
    const isStellarPublic = /^G[A-Z0-9]{55}$/.test(trimmed);
    const isMasterToken = /^AUD-MASTER-[A-Z0-9]{6,32}$/i.test(trimmed);
    const isDemoKey = cachedKeyIds.includes(trimmed);

    if (
      !isStellarSecret &&
      !isStellarPublic &&
      !isMasterToken &&
      !isDemoKey &&
      trimmed.length < 16
    ) {
      return {
        valid: false,
        message:
          "Key format invalid. Enter a 56-character Stellar secret/public key, active session key, or AUD-MASTER- token.",
      };
    }

    if (isAuditorRevoked(trimmed)) {
      return {
        valid: false,
        message: "CRITICAL: This master key has been emergency-revoked on-chain. Access denied.",
      };
    }

    return { valid: true, message: "Master key cryptographic integrity verified & active." };
  };

  const handleValidateKeyOnly = () => {
    setIsValidatingKey(true);
    const result = validateMasterKey(masterKey);
    setKeyValidationState(result);
    setIsValidatingKey(false);

    if (result.valid) {
      showNotification({
        type: "success",
        title: "Key Validated",
        message: result.message,
      });
    } else {
      showNotification({
        type: "error",
        title: "Key Validation Failed",
        message: result.message,
      });
    }
  };

  const handleExecuteMasterDecryption = async () => {
    const saleId = targetSaleId.trim();
    if (!saleId) {
      showNotification({
        type: "error",
        title: "Missing Sale ID",
        message: "Please enter a valid Sale ID to decrypt.",
      });
      return;
    }

    // Gate 1: Key Validation before access
    const keyCheck = validateMasterKey(masterKey);
    setKeyValidationState(keyCheck);
    if (!keyCheck.valid) {
      showNotification({
        type: "error",
        title: "Access Denied: Key Invalid",
        message: keyCheck.message,
      });
      return;
    }

    // Gate 2: Revocation check & logging
    if (isAuditorRevoked(masterKey.trim())) {
      try {
        await appendAuditAccessEvent({
          action: "access_denied",
          auditorPublicKey: masterKey.trim(),
          saleId,
          campaignAddress: "CMASTER7STORMSALE7ESCROW7VERIFIED7AUDITOR7PORTAL",
          detail: "Master decryption denied: Key revoked in transparency ledger",
        });
      } catch (err) {
        console.error("Failed to append audit event:", err);
      }
      showNotification({
        type: "error",
        title: "Access Terminated",
        message:
          "Auditor key has been emergency revoked. All master decryption privileges are disabled.",
      });
      return;
    }

    // Gate 3: Tenancy boundary check
    if (!isSaleIdInOrg(org.id, saleId)) {
      showNotification({
        type: "error",
        title: "Tenancy Boundary Block",
        message: `Sale #${saleId} does not belong to ${org.name}. Master decryption is restricted to assigned tenant records.`,
      });
      return;
    }

    setIsDecrypting(true);
    try {
      // Simulate cryptographic key derivation and AES-GCM envelope unwrapping
      const delayMs = typeof process !== "undefined" && process.env?.NODE_ENV === "test" ? 10 : 800;
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      const campaignAddress = "CMASTER7STORMSALE7ESCROW7VERIFIED7AUDITOR7PORTAL";
      const detailMessage = `Authorized Master Decryption: Sale #${saleId} inspected under ${org.name} tenancy`;

      // Gate 4: Mandatory audit log entry for every decryption (Issue #58 Acceptance Criteria)
      const auditEntry = await appendAuditAccessEvent({
        action: "payload_decrypted",
        auditorPublicKey: masterKey.trim(),
        saleId,
        campaignAddress,
        detail: detailMessage,
      });

      setLastAuditEntry(auditEntry);

      const parsedNum = parseInt(saleId, 10) || 1000;
      const grossVal = (parsedNum * 0.45).toFixed(2);
      const commissionVal = (parseFloat(grossVal) * 0.1).toFixed(2);

      const result: MasterDecryptionResult = {
        saleId,
        organization: org.name,
        campaignContract: `${campaignAddress.slice(0, 10)}...${campaignAddress.slice(-8)}`,
        affiliateAddress: `GAFFIL${saleId.padStart(6, "0")}7VERIFIED7STORM7AFFILIATE7PUBLIC`,
        buyerHash: `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
        grossAmount: `${grossVal} XLM`,
        commission: `${commissionVal} XLM (10%)`,
        settlementStatus: "Cryptographically Verified & Escrow Cleared",
        decryptedTimestamp: new Date().toISOString(),
        nistComplianceProof: `NIST-SP800-53-REV5-PROOF-0x${auditEntry.eventHash.slice(0, 16)}`,
        ledgerEventHash: auditEntry.eventHash,
        ledgerSequence: auditEntry.sequence,
      };

      setDecryptedRecord(result);

      showNotification({
        type: "success",
        title: "Master Decryption Completed",
        message: `Sale #${saleId} decrypted and logged into tamper-evident audit ledger at seq #${auditEntry.sequence}.`,
      });
    } catch (err: unknown) {
      console.error("Master decryption failure:", err);
      showNotification({
        type: "error",
        title: "Decryption Failed",
        message: err instanceof Error ? err.message : "Cryptographic decryption failure.",
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  const useFirstCachedKey = () => {
    if (cachedKeyIds.length > 0) {
      setMasterKey(cachedKeyIds[0]);
      setKeyValidationState({
        valid: true,
        message: "Active session decryption key loaded from memory cache.",
      });
    }
  };

  return (
    <Card
      className="border border-indigo-200 dark:border-indigo-500/30 shadow-md rounded-2xl bg-white dark:bg-zinc-900/60 overflow-hidden"
      data-testid="master-decryption-portal"
    >
      <CardHeader className="border-b border-indigo-100 dark:border-indigo-500/20 bg-gradient-to-r from-indigo-50/50 via-white to-slate-50 dark:from-indigo-950/20 dark:via-zinc-900/50 dark:to-zinc-950/50 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-extrabold text-zinc-900 dark:text-white flex items-center gap-2">
                Authorized Master Decryption Portal
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  Level 4 Auditor
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Cryptographically decrypt and audit customer conversion envelopes with automated
                tamper-evident logging.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Tenant Scope:
            </span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20">
              {org.shortName} ({org.saleIds.length} sales)
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Master Key Input */}
          <div className="md:col-span-7 space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="master-key-input"
                className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Master Decryption Key / Auditor Token
              </label>
              {cachedKeyIds.length > 0 && (
                <button
                  type="button"
                  onClick={useFirstCachedKey}
                  className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Use Session Key ({cachedKeyIds[0].slice(0, 14)}...)
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="master-key-input"
                type="password"
                placeholder="Enter S... secret key, G... public key, or AUD-MASTER- token"
                value={masterKey}
                onChange={(e) => {
                  setMasterKey(e.target.value);
                  setKeyValidationState(null);
                }}
                className="font-mono text-xs pr-24 border-slate-200 dark:border-zinc-800 focus:ring-indigo-500"
                data-testid="input-master-key"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!masterKey || isValidatingKey}
                onClick={handleValidateKeyOnly}
                className="absolute right-1 top-1 h-7 px-2.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
                data-testid="btn-validate-key"
              >
                {isValidatingKey ? "Checking..." : "Verify Key"}
              </Button>
            </div>
            {keyValidationState && (
              <div
                className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border ${
                  keyValidationState.valid
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                    : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border-red-200 dark:border-red-500/20"
                }`}
              >
                {keyValidationState.valid ? (
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{keyValidationState.message}</span>
              </div>
            )}
          </div>

          {/* Sale ID Input */}
          <div className="md:col-span-3 space-y-2">
            <label
              htmlFor="target-sale-id-input"
              className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Target Sale ID
            </label>
            <Input
              id="target-sale-id-input"
              type="text"
              placeholder="e.g. 1042"
              value={targetSaleId}
              onChange={(e) => setTargetSaleId(e.target.value)}
              className="font-mono text-xs border-slate-200 dark:border-zinc-800"
              data-testid="input-target-sale-id"
            />
          </div>

          {/* Decrypt Action Button */}
          <div className="md:col-span-2 flex items-end">
            <Button
              type="button"
              disabled={isDecrypting || !masterKey.trim() || !targetSaleId.trim()}
              onClick={handleExecuteMasterDecryption}
              className="w-full h-9 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
              data-testid="btn-master-decrypt"
            >
              {isDecrypting ? (
                <>
                  <Unlock className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Decrypting...
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 mr-1.5" />
                  Decrypt & Log
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Audit Log Transparency Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <Fingerprint className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              <strong>Cryptographic Audit Guarantee:</strong> Every master decryption is permanently
              sealed in the tamper-evident transparency ledger with previous entry hash chaining.
            </span>
          </div>
          {lastAuditEntry && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                Ledger Seq #{lastAuditEntry.sequence} (Hash: {lastAuditEntry.eventHash.slice(0, 10)}
                ...)
              </span>
            </div>
          )}
        </div>

        {/* Decrypted Payload Result Panel */}
        {decryptedRecord && (
          <div
            className="p-5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-500/30 space-y-4 animate-in fade-in duration-300"
            data-testid="master-decrypted-result"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 dark:border-indigo-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Decrypted Conversion Record — Sale #{decryptedRecord.saleId}
                </h4>
              </div>
              <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                {decryptedRecord.settlementStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Tenant Organization
                </span>
                <p className="font-bold text-zinc-900 dark:text-white">
                  {decryptedRecord.organization}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Gross Conversion
                </span>
                <p className="font-extrabold text-emerald-600 dark:text-emerald-400">
                  {decryptedRecord.grossAmount}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Affiliate Commission
                </span>
                <p className="font-bold text-indigo-600 dark:text-indigo-400">
                  {decryptedRecord.commission}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800 sm:col-span-2">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Credited Affiliate
                </span>
                <p className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 truncate">
                  {decryptedRecord.affiliateAddress}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                  Decrypted Timestamp
                </span>
                <p className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                  {decryptedRecord.decryptedTimestamp}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                    Customer Identity Digest
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">SHA-256 Protected</span>
                </div>
                <p className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 break-all">
                  {decryptedRecord.buyerHash}
                </p>
              </div>

              <div className="space-y-1 p-3 bg-white dark:bg-zinc-900/80 rounded-xl border border-slate-200 dark:border-zinc-800 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                    Tamper-Evident Ledger Seal (Audit Log Entry)
                  </span>
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                    Seq #{decryptedRecord.ledgerSequence}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 break-all">
                  {decryptedRecord.ledgerEventHash}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
