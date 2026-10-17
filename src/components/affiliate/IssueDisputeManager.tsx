import React, { useState, useEffect, useRef } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  AlertTriangle,
  UploadCloud,
  FileCheck,
  CheckCircle2,
  Clock,
  Search,
  XCircle,
  X,
  FileText,
  Plus,
} from "lucide-react";
import {
  fetchDisputes,
  submitDisputeReport,
  validateDisputeAttachment,
  validateDisputeSaleAmount,
  type DisputeReport,
  type DisputeCategory,
  type DisputeStatus,
} from "../../utils/disputes";

export function handleDisputeFileProcessing(
  file: File,
  callbacks: {
    onError: (errorMsg: string) => void;
    onSuccess: (validatedFile: File, previewUrl: string | null) => void;
  },
  customFileReader?: FileReader,
): boolean {
  const sizeValidation = validateDisputeAttachment(file.size);
  if (!sizeValidation.valid) {
    callbacks.onError(sizeValidation.error || "File size exceeds 5MB limit.");
    return false;
  }

  if (file.type.startsWith("image/")) {
    const reader = customFileReader || new FileReader();
    reader.onload = () => {
      callbacks.onSuccess(file, reader.result as string);
    };
    reader.readAsDataURL(file);
  } else {
    callbacks.onSuccess(file, null);
  }
  return true;
}

export const IssueDisputeManager: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onReportSubmitted?: () => void;
  initialTab?: "form" | "tracker";
}> = ({ isOpen, onClose, onReportSubmitted, initialTab = "form" }) => {
  const [disputes, setDisputes] = useState<DisputeReport[]>([]);
  const [activeTab, setActiveTab] = useState<"form" | "tracker">(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  // Form Fields
  const [campaignId, setCampaignId] = useState<number>(1);
  const [campaignName, setCampaignName] = useState("Tech Gadgets Pro");
  const [orderReference, setOrderReference] = useState("");
  const [referralLinkUsed, setReferralLinkUsed] = useState(
    "https://stormsale.xyz/c/1?ref=GBBD5678",
  );
  const [estimatedSaleAmountXlm, setEstimatedSaleAmountXlm] = useState<string>("100.0");
  const [category, setCategory] = useState<DisputeCategory>("missing_attribution");
  const [description, setDescription] = useState("");

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentFileRef = useRef<File | null>(null);

  const campaigns = [
    { id: 1, name: "Tech Gadgets Pro", link: "https://stormsale.xyz/c/1?ref=GBBD5678" },
    { id: 2, name: "Web3 Masterclass 2026", link: "https://stormsale.xyz/c/2?ref=GBBD5678" },
    { id: 3, name: "Crypto Security Hardware", link: "https://stormsale.xyz/c/3?ref=GBBD5678" },
    { id: 4, name: "DeFi Yield Aggregator", link: "https://stormsale.xyz/c/4?ref=GBBD5678" },
  ];

  useEffect(() => {
    fetchDisputes().then((data) => setDisputes(data));
  }, []);

  const handleCampaignChange = (cId: number) => {
    setCampaignId(cId);
    const selected = campaigns.find((c) => c.id === cId);
    if (selected) {
      setCampaignName(selected.name);
      setReferralLinkUsed(selected.link);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleDisputeFileProcessing(file, {
        onError: (errMsg) => {
          setUploadError(errMsg);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        },
        onSuccess: (validatedFile, preview) => {
          setUploadedFile(validatedFile);
          currentFileRef.current = validatedFile;
          setPreviewUrl(preview);
        },
      });
    }
  };

  const removeFile = () => {
    currentFileRef.current = null;
    setUploadedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderReference.trim() || !description.trim()) {
      setUploadError("Please provide an order reference and detailed description.");
      return;
    }

    setIsSubmitting(true);
    setUploadError(null);

    const saleValidation = validateDisputeSaleAmount(estimatedSaleAmountXlm);
    if (!saleValidation.valid || saleValidation.value === undefined) {
      setIsSubmitting(false);
      setUploadError(saleValidation.error || "Please enter a valid, positive sale amount in XLM.");
      return;
    }
    const saleAmount = saleValidation.value;
    const commissionAmount = saleAmount * 0.1; // 10% commission

    try {
      const newReport = await submitDisputeReport({
        campaignId,
        campaignName,
        orderReference,
        referralLinkUsed,
        estimatedSaleAmountXlm: saleAmount,
        expectedCommissionXlm: commissionAmount,
        category,
        description,
        attachmentName: uploadedFile ? uploadedFile.name : undefined,
        attachmentSize: uploadedFile ? `${(uploadedFile.size / 1024).toFixed(0)} KB` : undefined,
        attachmentPreview: previewUrl || undefined,
      });

      setDisputes((prev) => [newReport, ...prev]);
      setSuccessMsg(`Dispute #${newReport.id} submitted successfully to advertiser.`);
      setActiveTab("tracker");

      // Reset form
      setOrderReference("");
      setDescription("");
      removeFile();

      if (onReportSubmitted) onReportSubmitted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit dispute report";
      setUploadError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: DisputeStatus) => {
    switch (status) {
      case "submitted":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            <Clock className="w-3.5 h-3.5" />
            Submitted
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300">
            <Search className="w-3.5 h-3.5" />
            Under Review
          </span>
        );
      case "investigating":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300">
            <Clock className="w-3.5 h-3.5" />
            Investigating
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approved & Credited
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
            <XCircle className="w-3.5 h-3.5" />
            Rejected
          </span>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <DialogHeader className="pb-4 border-b border-slate-100 dark:border-zinc-800/60">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-md shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-zinc-900 dark:text-white">
                Affiliate Dispute & Issue Reporting
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                Submit standardized reports for missing conversions or uncredited commissions
              </DialogDescription>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex bg-slate-100 dark:bg-zinc-800 p-1 rounded-xl mt-4">
            <button
              onClick={() => setActiveTab("form")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "form"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              Report Missing Sale
            </button>
            <button
              onClick={() => setActiveTab("tracker")}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "tracker"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <span>Dispute Tracker</span>
              <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 text-[10px] flex items-center justify-center font-black">
                {disputes.length}
              </span>
            </button>
          </div>
        </DialogHeader>

        {/* Tab 1: Standardized Dispute Form */}
        {activeTab === "form" && (
          <form onSubmit={handleSubmit} className="py-4 space-y-4">
            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{successMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMsg(null)}
                  className="p-1 hover:text-emerald-950"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {uploadError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Campaign Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Target Campaign
                </label>
                <select
                  value={campaignId}
                  onChange={(e) => handleCampaignChange(parseInt(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dispute Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Dispute Reason
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DisputeCategory)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="missing_attribution">Missing Attribution / Cookie</option>
                  <option value="uncredited_sale">Uncredited Direct Conversion</option>
                  <option value="incorrect_commission">Incorrect Commission Rate</option>
                  <option value="delayed_clearing">Delayed Clearing Settlement</option>
                  <option value="other">Other Dispute</option>
                </select>
              </div>
            </div>

            {/* Order Reference & Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Order / Tx Reference ID *
                </label>
                <input
                  type="text"
                  placeholder="e.g. ORD-98421 or Tx Hash"
                  value={orderReference}
                  onChange={(e) => setOrderReference(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  Estimated Sale Amount (XLM)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={estimatedSaleAmountXlm}
                    onChange={(e) => setEstimatedSaleAmountXlm(e.target.value)}
                    className="w-full h-10 pl-3 pr-16 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400">
                    XLM
                  </span>
                </div>
              </div>
            </div>

            {/* Expected Commission Display */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-950/60 border border-slate-100 dark:border-zinc-800/60 flex justify-between items-center text-xs">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                Calculated Expected Commission (10% rate)
              </span>
              <span className="font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                {(parseFloat(estimatedSaleAmountXlm || "0") * 0.1).toFixed(2)} XLM
              </span>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Dispute Explanation & Context *
              </label>
              <textarea
                rows={3}
                placeholder="Describe when the conversion occurred, proof of referral attribution, or why this sale is missing..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs font-medium text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />
            </div>

            {/* File / Screenshot Upload Support */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Proof Attachment (Screenshot or Invoice)
              </label>

              {!uploadedFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-zinc-950/30 group focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <UploadCloud className="w-8 h-8 mx-auto text-zinc-400 group-hover:text-indigo-600 transition-colors" />
                  <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mt-2">
                    Click to select screenshot or proof file
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                    PNG, JPG, or PDF up to 5MB
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </button>
              ) : (
                <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/30 flex items-center justify-between">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Proof preview"
                        className="w-12 h-12 object-cover rounded-xl border border-indigo-200 dark:border-indigo-700 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-800/40 rounded-xl flex items-center justify-center shrink-0">
                        <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {uploadedFile.name}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {(uploadedFile.size / 1024).toFixed(1)} KB • Attached
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-white dark:hover:bg-zinc-800 transition-colors"
                    title="Remove attachment"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl px-5 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl px-6 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white shadow-md transition-all"
              >
                {isSubmitting ? "Submitting..." : "Submit Dispute Report"}
              </Button>
            </div>
          </form>
        )}

        {/* Tab 2: Status Tracker for Reports */}
        {activeTab === "tracker" && (
          <div className="py-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Active & Past Disputes ({disputes.length})
              </span>
              <button
                onClick={() => setActiveTab("form")}
                className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Dispute</span>
              </button>
            </div>

            {disputes.length === 0 ? (
              <div className="p-8 text-center border rounded-2xl border-dashed border-slate-200 dark:border-zinc-800 text-zinc-400 text-xs">
                No disputes filed yet.
              </div>
            ) : (
              <div className="space-y-3">
                {disputes.map((dispute) => (
                  <div
                    key={dispute.id}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/40 space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-xs text-zinc-900 dark:text-white">
                          #{dispute.id}
                        </span>
                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          {dispute.campaignName}
                        </span>
                      </div>
                      {getStatusBadge(dispute.status)}
                    </div>

                    {/* Progress Bar Lifecycle Tracker */}
                    <div className="pt-2">
                      <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 dark:text-zinc-500 mb-1.5">
                        <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                          1. Submitted
                        </span>
                        <span
                          className={
                            dispute.status !== "submitted"
                              ? "text-indigo-600 dark:text-indigo-400 font-extrabold"
                              : ""
                          }
                        >
                          2. Under Review
                        </span>
                        <span
                          className={
                            dispute.status === "investigating" ||
                            dispute.status === "approved" ||
                            dispute.status === "rejected"
                              ? "text-indigo-600 dark:text-indigo-400 font-extrabold"
                              : ""
                          }
                        >
                          3. Advertiser Audit
                        </span>
                        <span
                          className={
                            dispute.status === "approved"
                              ? "text-emerald-600 dark:text-emerald-400 font-extrabold"
                              : dispute.status === "rejected"
                                ? "text-rose-600 font-extrabold"
                                : ""
                          }
                        >
                          4. Resolution
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${
                            dispute.status === "approved"
                              ? "w-full bg-emerald-500"
                              : dispute.status === "rejected"
                                ? "w-full bg-rose-500"
                                : dispute.status === "investigating"
                                  ? "w-3/4 bg-purple-500"
                                  : dispute.status === "under_review"
                                    ? "w-1/2 bg-blue-500"
                                    : "w-1/4 bg-amber-500"
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                      <div>
                        <span className="text-[10px] text-zinc-400 font-medium">Order Ref</span>
                        <p className="font-mono font-semibold text-zinc-700 dark:text-zinc-300 truncate">
                          {dispute.orderReference}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-medium">Missing Sale</span>
                        <p className="font-bold text-zinc-900 dark:text-white">
                          {dispute.estimatedSaleAmountXlm} XLM
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-medium">
                          Expected Commission
                        </span>
                        <p className="font-bold text-indigo-600 dark:text-indigo-400">
                          {dispute.expectedCommissionXlm} XLM
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 font-medium">Date Filed</span>
                        <p className="text-zinc-600 dark:text-zinc-400 font-medium">
                          {dispute.submittedAt}
                        </p>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-850 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      <span className="font-bold text-zinc-900 dark:text-white block mb-0.5">
                        Reason & Notes:
                      </span>
                      {dispute.description}
                    </div>

                    {dispute.attachmentName && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <FileCheck className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Attached Proof: {dispute.attachmentName}</span>
                        {dispute.attachmentSize && (
                          <span className="text-[10px] bg-slate-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-400">
                            {dispute.attachmentSize}
                          </span>
                        )}
                      </div>
                    )}

                    {dispute.advertiserResponse && (
                      <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-500/30 text-xs text-emerald-900 dark:text-emerald-300">
                        <span className="font-bold block mb-0.5">Advertiser Response:</span>
                        {dispute.advertiserResponse}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
