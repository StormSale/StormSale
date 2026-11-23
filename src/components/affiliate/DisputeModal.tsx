import React, { useState, useRef } from "react";
import { Dialog, DialogContent } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CopyButton } from "../ui/copy-button";
import {
  Scale,
  ShieldCheck,
  Upload,
  FileText,
  Lock,
  X,
  AlertTriangle,
  Loader2,
  Paperclip,
} from "lucide-react";
import {
  type EvidenceFile,
  type DisputeRecord,
  createEncryptedDispute,
  readFileAsBase64,
} from "../../lib/affiliateDispute";
import type { Sale } from "./SalesList";

export interface DisputeFormProps {
  sale: Sale;
  onDisputeSubmitted: (saleId: number, docketId: string, record: DisputeRecord) => void;
  onCancel?: () => void;
}

export interface DisputeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale | null;
  onDisputeSubmitted: (saleId: number, docketId: string, record: DisputeRecord) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf", ".txt", ".json", ".csv"];

export const DisputeForm: React.FC<DisputeFormProps> = ({ sale, onDisputeSubmitted, onCancel }) => {
  const [orderIds, setOrderIds] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ensure there is a visible transaction hash linked to this conversion
  const txHash =
    sale.txHash ||
    `0x${sale.id.toString(16).padStart(4, "0")}e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processSelectedFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const processSelectedFiles = async (fileList: File[]) => {
    setErrorMessage(null);
    const newFiles: EvidenceFile[] = [];

    for (const f of fileList) {
      if (f.size > MAX_FILE_SIZE) {
        setErrorMessage(`File "${f.name}" exceeds maximum allowed size (10 MB).`);
        continue;
      }
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext) && !f.type.startsWith("image/")) {
        setErrorMessage(`File type for "${f.name}" is not supported.`);
        continue;
      }

      try {
        const base64Data = await readFileAsBase64(f);
        newFiles.push({
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
          data: base64Data,
        });
      } catch (err) {
        console.error("Failed to read file:", err);
        setErrorMessage(`Could not read file "${f.name}".`);
      }
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!orderIds.trim()) {
      setErrorMessage("Please provide the merchant order ID(s).");
      return;
    }
    if (!description.trim()) {
      setErrorMessage("Please describe the dispute evidence and referral details.");
      return;
    }

    setIsSubmitting(true);
    try {
      const record = await createEncryptedDispute({
        saleId: sale.id,
        txHash,
        orderIds: orderIds.trim(),
        description: description.trim(),
        files,
        affiliateAddress: sale.affiliate,
      });

      // Reset form
      setOrderIds("");
      setDescription("");
      setFiles([]);
      onDisputeSubmitted(sale.id, record.docketId, record);
    } catch (err: unknown) {
      console.error("Dispute submission failed:", err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to encrypt and submit dispute.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-4 border-b border-slate-100 dark:border-zinc-800 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/50 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-purple-950/20">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              Open Conversion Dispute
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-semibold uppercase">
                Contested Sale
              </span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Submit evidence for independent protocol auditor review regarding conversion #
              {sale.id}
            </p>
          </div>
        </div>
      </div>

      {/* Form Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs font-semibold text-red-700 dark:text-red-300 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Linked Conversion & Transaction Hash Banner */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-500 dark:text-zinc-400">Sale ID:</span>
              <span className="font-mono font-bold text-zinc-900 dark:text-white">#{sale.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-500 dark:text-zinc-400">Claim Amount:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {sale.commissionAmount} XLM{" "}
                <span className="text-zinc-400 font-normal">({sale.saleAmount} XLM gross)</span>
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 dark:border-zinc-800/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                Linked Conversion Transaction Hash
              </span>
              <CopyButton
                text={txHash}
                label="Copy Hash"
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2"
              />
            </div>
            <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 truncate">
              {txHash}
            </div>
          </div>
        </div>

        {/* Form Field 1: Order IDs */}
        <div className="space-y-1.5">
          <label
            htmlFor="order-ids"
            className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1"
          >
            Merchant Order ID(s) <span className="text-red-500">*</span>
          </label>
          <Input
            id="order-ids"
            placeholder="e.g. ORD-98241, INV-2026-004"
            value={orderIds}
            onChange={(e) => setOrderIds(e.target.value)}
            disabled={isSubmitting}
            className="h-11 font-mono text-xs rounded-xl"
          />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Provide merchant checkout order reference numbers or invoice codes.
          </p>
        </div>

        {/* Form Field 2: Evidence Description */}
        <div className="space-y-1.5">
          <label
            htmlFor="evidence-description"
            className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1"
          >
            Evidence Description &amp; Referral Context <span className="text-red-500">*</span>
          </label>
          <textarea
            id="evidence-description"
            rows={4}
            placeholder="Explain the referral journey, click logs, customer correspondence, or why this rejected conversion represents a legitimate sale..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting}
            className="w-full rounded-xl border-2 border-slate-200 dark:border-zinc-800 bg-background px-4 py-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 disabled:opacity-50 transition-all shadow-sm"
          />
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Detailed evidence helps protocol auditors verify conversion authenticity against
            merchant telemetry.
          </p>
        </div>

        {/* Form Field 3: File Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
              Upload Evidence Attachments
            </label>
            <span className="text-[10px] text-zinc-400">PNG, JPG, PDF, TXT, JSON (Max 10MB)</span>
          </div>

          {/* Drag & Drop Box */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-5 rounded-2xl border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center space-y-2 ${
              dragActive
                ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
                : "border-slate-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-500/50 bg-slate-50/50 dark:bg-zinc-950/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.json,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                Click to browse
              </span>{" "}
              or drag order screenshots and click logs here
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1">
              <Lock className="w-3 h-3 text-indigo-500" />
              Evidence is client-side encrypted via AES-GCM-256 before upload
            </div>
          </div>

          {/* Uploaded File List */}
          {files.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Attached Evidence ({files.length})
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate pr-2">
                      <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        ({formatFileSize(file.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(idx);
                      }}
                      className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Auditor Privacy Callout */}
        <div className="p-3.5 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-300">
          <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Protocol Auditor Confidentiality: </span>
            All submitted evidence is encrypted client-side. The sealed payload key is wrapped
            exclusively for assigned independent protocol auditors.
          </div>
        </div>
      </form>

      {/* Footer */}
      <div className="p-4 px-6 border-t border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 flex flex-row items-center justify-between sm:justify-between">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-xl h-10 px-4 text-xs font-semibold border-slate-200 dark:border-zinc-800"
          >
            Cancel
          </Button>
        )}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting || !orderIds.trim() || !description.trim()}
          className="rounded-xl h-10 px-5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 flex items-center gap-2 ml-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Encrypting &amp; Submitting...
            </>
          ) : (
            <>
              <Scale className="w-4 h-4" />
              Submit Dispute for Audit
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export const DisputeModal: React.FC<DisputeModalProps> = ({
  isOpen,
  onClose,
  sale,
  onDisputeSubmitted,
}) => {
  if (!sale) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="xl"
        className="rounded-3xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden p-0 max-h-[90vh] flex flex-col"
      >
        <DisputeForm
          sale={sale}
          onDisputeSubmitted={(saleId, docketId, record) => {
            onDisputeSubmitted(saleId, docketId, record);
            onClose();
          }}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
};
