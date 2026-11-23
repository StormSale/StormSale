import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button } from "../ui/button";

export interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const modalRef = useFocusTrap<HTMLDivElement>({
    isOpen,
    onClose: onCancel,
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        <div className="fixed inset-0" onClick={onCancel} aria-hidden="true" />
        <motion.div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby="confirm-modal-desc"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-6 z-10"
        >
          <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center space-x-3">
              <div
                className={`p-2.5 rounded-xl ${
                  variant === "danger"
                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                }`}
              >
                <AlertCircle className="w-5 h-5" />
              </div>
              <h2
                id="confirm-modal-title"
                className="text-lg font-bold text-zinc-900 dark:text-zinc-100"
              >
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Close confirmation dialog"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p id="confirm-modal-desc" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </p>

          <div className="mt-6 flex items-center justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === "danger" ? "destructive" : "default"}
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Processing..." : confirmLabel}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
