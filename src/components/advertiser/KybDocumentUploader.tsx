import React, { useState } from "react";
import { UploadCloud, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { ALLOWED_KYB_MIME_TYPES } from "../../types/kyb";

export interface KybDocumentUploaderProps {
  onUpload?: (encryptedData: unknown, fileName: string) => Promise<void> | void;
  encryptFn?: (fileBytes: Uint8Array) => Promise<unknown> | unknown;
  allowedTypes?: readonly string[];
  className?: string;
  onError?: (errorMessage: string) => void;
}

const isMimeTypeAllowed = (type: string, allowed: readonly string[]): boolean => {
  return allowed.includes(type.toLowerCase());
};

const extractMimeTypes = (dt: DataTransfer | null): string[] => {
  if (!dt?.types) return [];
  return Array.from(dt.types)
    .filter((t) => t && t.includes("/"))
    .map((t) => t.toLowerCase());
};

export const KybDocumentUploader: React.FC<KybDocumentUploaderProps> = ({
  onUpload,
  encryptFn,
  allowedTypes = ALLOWED_KYB_MIME_TYPES,
  className = "",
  onError,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragAccepted, setIsDragAccepted] = useState(false);
  const [isDragRejected, setIsDragRejected] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const types = extractMimeTypes(e.dataTransfer);
    const hasValidType = types.some((t) => isMimeTypeAllowed(t, allowedTypes));
    setIsDragOver(true);
    setIsDragAccepted(hasValidType);
    setIsDragRejected(types.length > 0 && !hasValidType);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsDragAccepted(false);
    setIsDragRejected(false);
  };

  const handleFile = async (file: File) => {
    setError(null);

    if (!isMimeTypeAllowed(file.type, allowedTypes)) {
      const errMsg = `File type '${file.type || "unknown"}' is not allowed. Allowed types: ${allowedTypes.join(", ")}`;
      setError(errMsg);
      onError?.(errMsg);
      return;
    }

    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(buffer);

      const encrypted = encryptFn ? await encryptFn(fileBytes) : fileBytes;
      if (onUpload) {
        await onUpload(encrypted, file.name);
      }
      setUploadedFileName(file.name);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Failed to encrypt and upload document.";
      setError(errMsg);
      onError?.(errMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsDragAccepted(false);
    setIsDragRejected(false);

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    await handleFile(files[0]);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div
        role="region"
        aria-label="Encrypted Document Upload Dropzone"
        data-testid="kyb-upload-dropzone"
        data-active={isDragAccepted}
        data-accept={isDragAccepted}
        data-reject={isDragRejected}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
          isDragAccepted
            ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md"
            : isDragRejected
              ? "border-rose-500 bg-rose-50/50 dark:bg-rose-950/20"
              : isDragOver
                ? "border-indigo-400 bg-slate-50 dark:bg-zinc-800/40"
                : "border-slate-300 dark:border-zinc-700 hover:border-indigo-400 bg-white/50 dark:bg-zinc-900/40"
        }`}
      >
        <div className="flex flex-col items-center justify-center space-y-3">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
              isDragAccepted
                ? "bg-indigo-600 text-white border-indigo-500"
                : isDragRejected
                  ? "bg-rose-600 text-white border-rose-500"
                  : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20"
            }`}
          >
            <UploadCloud className="w-6 h-6" />
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              {isUploading
                ? "Encrypting and Uploading..."
                : isDragAccepted
                  ? "Drop Document to Encrypt and Upload"
                  : isDragRejected
                    ? "Unsupported File Type"
                    : "Drag & drop compliance document here, or browse"}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Supported: PDF, PNG, JPEG · All documents encrypted client-side prior to upload
            </p>
          </div>
        </div>
      </div>

      {uploadedFileName && (
        <div
          data-testid="uploaded-file-banner"
          className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span>Encrypted and uploaded: {uploadedFileName}</span>
        </div>
      )}

      {error && (
        <div
          data-testid="upload-error"
          role="alert"
          className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold"
        >
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
