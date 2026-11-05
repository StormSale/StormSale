/**
 * Dispute Submission Portal (Issue #171)
 *
 * `DisputeEvidenceForm` is the presentational form (AC2): evidence
 * description, order-ID list, and file attachments, always displaying the
 * conversion tx hash the dispute is linked to. `DisputeSubmissionPortal`
 * owns the form state and the submit path through `submitDispute` in
 * `src/lib/affiliate/disputePortal.ts`, sealing evidence with the repo's
 * real AES-GCM envelope stack and transitioning the conversion to
 * "Under Auditor Review" with a deterministic docket ID (AC3).
 *
 * Exported as two components so the form is render-testable in the node
 * vitest environment (same pattern as CohortVisualizer).
 */
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { X, Gavel, Plus, Trash2, ShieldCheck, Lock } from "lucide-react";
import {
  submitDispute,
  createAuditorDocketQueueNotifier,
  fileToBase64,
  type DisputableConversion,
  type DisputeAttachmentInput,
  type DisputeDocket,
  type KvStore,
} from "../../lib/affiliate/disputePortal";

/** Identifier of the assigned protocol auditor role the evidence key seals to. */
export const DEFAULT_AUDITOR_IDENTIFIER = "PROTOCOL-AUDITORS";

export interface DisputeEvidenceFormProps {
  conversion: DisputableConversion;
  orderIds: string[];
  attachmentNames: string[];
  submitting: boolean;
  errorMessage: string | null;
  onDescriptionChange: (value: string) => void;
  onOrderInputChange: (value: string) => void;
  onAddOrderId: () => void;
  onRemoveOrderId: (orderId: string) => void;
  onFilesSelected: (files: File[]) => void;
  onSubmit: () => void;
}

export function DisputeEvidenceForm({
  conversion,
  orderIds,
  attachmentNames,
  submitting,
  errorMessage,
  onDescriptionChange,
  onOrderInputChange,
  onAddOrderId,
  onRemoveOrderId,
  onFilesSelected,
  onSubmit,
}: DisputeEvidenceFormProps) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/60 p-4 space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Linked conversion
        </span>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Sale #{conversion.id} · {conversion.disputeState === "rejected" ? "Rejected" : "Contested"} by merchant
          </span>
          <span
            title="On-chain transaction hash this dispute is bound to"
            className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 truncate max-w-[280px]"
          >
            tx: {conversion.txHash || "unlinked"}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dispute-evidence-description" className="font-bold">
          Evidence description
        </Label>
        <textarea
          id="dispute-evidence-description"
          name="evidenceDescription"
          rows={4}
          placeholder="Describe why this conversion is legitimate: customer journey, click order, checkout confirmations..."
          className="flex w-full rounded-xl border-2 border-slate-200 dark:border-zinc-800 bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="dispute-order-id-input" className="font-bold">
          Order IDs
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="dispute-order-id-input"
            placeholder="e.g. ORD-10239"
            onChange={(event) => onOrderInputChange(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddOrderId}
            aria-label="Add order ID"
            className="h-12 px-4 rounded-xl font-semibold border-2 border-slate-200 dark:border-zinc-800"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>
        {orderIds.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1" aria-label="Order IDs included in this dispute">
            {orderIds.map((orderId) => (
              <li
                key={orderId}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-semibold"
              >
                {orderId}
                <button
                  type="button"
                  onClick={() => onRemoveOrderId(orderId)}
                  aria-label={`Remove order ${orderId}`}
                  className="hover:text-indigo-900 dark:hover:text-white"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="dispute-attachments" className="font-bold">
          File attachments (encrypted order screenshots &amp; referral evidence)
        </Label>
        <Input
          id="dispute-attachments"
          type="file"
          multiple
          accept="image/*,application/pdf,text/csv,.log"
          onChange={(event) =>
            onFilesSelected(Array.from(event.target.files ?? []))
          }
        />
        {attachmentNames.length > 0 && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            Sealed for auditor review: {attachmentNames.join(", ")}
          </p>
        )}
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="p-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 text-sm font-medium text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Evidence is AES-GCM-256 encrypted and sealed to the assigned protocol auditor.
        </p>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-xl h-11 px-5 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          <Gavel className="w-4 h-4 mr-2" />
          {submitting ? "Submitting Dispute..." : "Submit Dispute for Auditor Review"}
        </Button>
      </div>
    </div>
  );
}

export interface DisputeSubmissionPortalProps {
  conversion: DisputableConversion;
  onClose: () => void;
  onSubmitted?: (docket: DisputeDocket) => void;
  /** Overrides the assigned auditor identity the evidence key seals to. */
  auditorIdentifier?: string;
  /** Storage seam for the dispute store + auditor queue; defaults to window.localStorage. */
  storage?: KvStore;
}

function resolveDefaultStorage(): KvStore | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export const DisputeSubmissionPortal: React.FC<DisputeSubmissionPortalProps> = ({
  conversion,
  onClose,
  onSubmitted,
  auditorIdentifier = DEFAULT_AUDITOR_IDENTIFIER,
  storage,
}) => {
  const [description, setDescription] = useState("");
  const [orderInput, setOrderInput] = useState("");
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<DisputeAttachmentInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAddOrderId = () => {
    const id = orderInput.trim();
    if (!id) return;
    setOrderIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setOrderInput("");
  };

  const handleFilesSelected = async (files: File[]) => {
    const converted = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type || "application/octet-stream",
        dataBase64: await fileToBase64(file),
      })),
    );
    setAttachments((prev) => [...prev, ...converted]);
  };

  const handleSubmit = async () => {
    const store = storage ?? resolveDefaultStorage();
    if (!store) {
      setErrorMessage(
        "Dispute storage is unavailable in this browser; no evidence was submitted. Enable local storage and retry.",
      );
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const docket = await submitDispute(
        {
          conversion,
          evidenceDescription: description,
          orderIds,
          attachments,
          auditorIdentifier,
        },
        { store, notifier: createAuditorDocketQueueNotifier(store) },
      );
      onSubmitted?.(docket);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to submit this dispute. Please retry.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispute-portal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 dark:border-zinc-800/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Gavel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3
                id="dispute-portal-title"
                className="text-lg font-bold text-zinc-900 dark:text-white"
              >
                Open Conversion Dispute
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Submit evidence for independent protocol auditor review
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dispute portal"
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">
          <DisputeEvidenceForm
            conversion={conversion}
            orderIds={orderIds}
            attachmentNames={attachments.map((a) => a.name)}
            submitting={submitting}
            errorMessage={errorMessage}
            onDescriptionChange={setDescription}
            onOrderInputChange={setOrderInput}
            onAddOrderId={handleAddOrderId}
            onRemoveOrderId={(id) => setOrderIds((prev) => prev.filter((o) => o !== id))}
            onFilesSelected={(files) => {
              void handleFilesSelected(files);
            }}
            onSubmit={() => {
              void handleSubmit();
            }}
          />
        </div>
      </div>
    </div>
  );
};
