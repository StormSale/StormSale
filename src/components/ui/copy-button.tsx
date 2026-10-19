import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

/**
 * Universal clipboard copy utility with fallback for non-secure contexts,
 * older browsers, and sandboxed test environments.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Attempt modern navigator.clipboard API
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("navigator.clipboard.writeText failed, falling back to execCommand:", err);
    }
  }

  // 2. Fallback to document.execCommand('copy') via temporary off-screen textarea
  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      // Prevent scrolling to bottom of page in iOS/Safari
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "-9999px";
      textArea.style.opacity = "0";
      textArea.setAttribute("readonly", "");
      textArea.setAttribute("aria-hidden", "true");
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, text.length);

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error("document.execCommand fallback copy failed:", err);
      return false;
    }
  }

  return false;
}

const copyButtonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 shadow-sm",
        outline:
          "border border-slate-200 dark:border-zinc-800 bg-transparent hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300",
        ghost:
          "hover:bg-slate-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
        secondary:
          "bg-slate-100 text-slate-900 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
        indigo:
          "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-500/20 active:scale-[0.98]",
      },
      size: {
        default: "h-9 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm gap-2",
        sm: "h-8 px-2.5 py-1 rounded-lg text-xs gap-1.5",
        lg: "h-11 px-5 py-2 rounded-2xl text-sm gap-2.5",
        icon: "h-8 w-8 rounded-lg p-0",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  },
);

export interface CopyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof copyButtonVariants> {
  text: string;
  label?: string;
  copiedLabel?: string;
  iconOnly?: boolean;
  showToast?: boolean;
  toastMessage?: string;
  onCopySuccess?: (text: string) => void;
  onCopyError?: (error: unknown) => void;
  resetDelay?: number;
}

export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    {
      text,
      label,
      copiedLabel = "Copied!",
      iconOnly = false,
      showToast = false,
      toastMessage,
      onCopySuccess,
      onCopyError,
      resetDelay = 2000,
      variant,
      size,
      className,
      onClick,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleCopy = useCallback(
      async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (onClick) onClick(e);
        if (disabled || !text) return;

        try {
          const success = await copyToClipboard(text);
          if (success) {
            setCopied(true);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              setCopied(false);
            }, resetDelay);

            if (onCopySuccess) onCopySuccess(text);
          } else {
            throw new Error("Unable to copy text to clipboard");
          }
        } catch (err) {
          console.error("Failed to copy:", err);
          if (onCopyError) onCopyError(err);
        }
      },
      [text, disabled, onClick, resetDelay, onCopySuccess, onCopyError],
    );

    const isIconOnly = iconOnly || size === "icon" || (!label && !copiedLabel);

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={handleCopy}
        aria-label={copied ? copiedLabel : label || "Copy to clipboard"}
        title={copied ? copiedLabel : label || "Copy to clipboard"}
        className={cn(copyButtonVariants({ variant, size }), className)}
        {...props}
      >
        <span className="relative flex items-center justify-center shrink-0">
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.6, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center text-emerald-500"
              >
                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center"
              >
                <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {!isIconOnly && (
          <span className="font-semibold transition-colors truncate">
            {copied ? copiedLabel : label}
          </span>
        )}
      </button>
    );
  },
);

CopyButton.displayName = "CopyButton";
