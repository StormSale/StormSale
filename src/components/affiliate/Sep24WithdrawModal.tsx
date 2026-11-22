/**
 * Sep24WithdrawModal
 *
 * Interactive SEP-0024 anchor withdrawal modal.
 * Guides the affiliate through three phases:
 *   1. LAUNCH   – opens the anchor-hosted interactive popup in an iframe
 *   2. PENDING  – polls the anchor until the transaction reaches a terminal status
 *   3. RECEIPT  – renders the fiat payout confirmation receipt
 *
 * Acceptance Criteria (Issue #137):
 *  AC1 – "Withdraw to Local Bank (SEP-0024)" button (rendered by parent ClaimPayouts)
 *  AC2 – Interactive anchor popup guides user through bank account details  ← this component
 *  AC3 – Confirmation receipt displays fiat payout reference                ← this component
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Building2,
  ArrowDownToLine,
} from "lucide-react";
import { Button } from "../ui/button";
import {
  discoverTransferServer,
  initiateSep24Withdrawal,
  pollSep24Transaction,
  type Sep24Transaction,
  type Sep24TransactionStatus,
} from "../../lib/sep24";

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

/** Phase of the SEP-0024 interactive flow. */
type WithdrawPhase =
  | "idle"
  | "initiating"
  | "interactive"
  | "polling"
  | "completed"
  | "error";

/**
 * When in the "error" phase, tracks whether the error came from initiation
 * (before the anchor's interactive form opened) or from monitoring (after the
 * user submitted their details). Monitoring errors preserve the transaction
 * context so the user can still see what happened.
 *
 * FIX (line 504-507): distinguish initiation errors from monitoring errors.
 */
type ErrorOrigin = "initiation" | "monitoring";

export interface Sep24WithdrawModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Close / dismiss handler. */
  onClose: () => void;
  /** Affiliate's Stellar account address (G...). */
  userAddress: string;
  /**
   * Stellar anchor domain, e.g. "testanchor.stellar.org".
   * Defaults to the testnet public anchor when not provided.
   */
  anchorDomain?: string;
  /**
   * Asset code to withdraw. Defaults to "USDC".
   * Affiliates earn USDC commissions per Issue #137 requirements.
   */
  assetCode?: string;
  /** Pre-filled withdrawal amount (optional). */
  amount?: string;
}

/* -------------------------------------------------------------------------- */
/* Status badge helper                                                          */
/* -------------------------------------------------------------------------- */

const STATUS_LABELS: Partial<Record<Sep24TransactionStatus, string>> = {
  incomplete: "Waiting for anchor…",
  pending_user_transfer_start: "Awaiting your bank transfer",
  pending_anchor: "Anchor is processing",
  pending_external: "Pending external transfer",
  pending_stellar: "Pending Stellar ledger",
  completed: "Completed",
  error: "Error",
  refunded: "Refunded",
  expired: "Expired",
};

function StatusBadge({ status }: { status: Sep24TransactionStatus }) {
  const label = STATUS_LABELS[status] ?? status;
  const isOk = status === "completed";
  const isErr = status === "error" || status === "expired" || status === "refunded";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
        isOk
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : isErr
            ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
      }`}
      data-testid="sep24-status-badge"
    >
      {isOk ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : isErr ? (
        <AlertCircle className="w-3 h-3" />
      ) : (
        <Loader2 className="w-3 h-3 animate-spin" />
      )}
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal component                                                              */
/* -------------------------------------------------------------------------- */

/** Default testnet anchor for development / staging environments. */
const DEFAULT_ANCHOR_DOMAIN = "testanchor.stellar.org";

export function Sep24WithdrawModal({
  open,
  onClose,
  userAddress,
  anchorDomain = DEFAULT_ANCHOR_DOMAIN,
  assetCode = "USDC",
  amount,
}: Sep24WithdrawModalProps) {
  const [phase, setPhase] = useState<WithdrawPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorOrigin, setErrorOrigin] = useState<ErrorOrigin>("initiation");

  // Anchor-returned interactive URL & transaction id
  const [interactiveUrl, setInteractiveUrl] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [transferServerUrl, setTransferServerUrl] = useState<string | null>(null);

  // Polled transaction state
  const [transaction, setTransaction] = useState<Sep24Transaction | null>(null);

  // FIX (line 134-140): session identifier. Incremented whenever the modal
  // closes or the account identity changes. Every async continuation checks
  // that its captured sessionId still matches before updating state.
  const sessionIdRef = useRef(0);

  // FIX (line 225-230): focus management – ref to the element that triggered
  // the modal so we can restore focus on close.
  const triggerRef = useRef<Element | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Guard against state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset state and advance session whenever the modal opens or the account changes.
  useEffect(() => {
    if (open) {
      // Invalidate any in-flight async work from a prior session.
      sessionIdRef.current += 1;

      setPhase("idle");
      setErrorMessage(null);
      setErrorOrigin("initiation");
      setInteractiveUrl(null);
      setTransactionId(null);
      setTransferServerUrl(null);
      setTransaction(null);

      // FIX (line 225-230): record the element that had focus before we opened,
      // then move focus into the modal panel after the next paint.
      triggerRef.current = document.activeElement;
      requestAnimationFrame(() => {
        panelRef.current?.focus();
      });
    } else {
      // Restore focus to the element that opened the modal.
      if (triggerRef.current && triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    }
  }, [open, userAddress]);

  // FIX (line 225-230): dismiss on Escape and contain focus within the panel.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      // Basic focus trap: redirect Tab/Shift+Tab back inside the panel.
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.closest("[aria-hidden]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  /* ---------------------------------------------------------------------- */
  /* Step 1: Initiate interactive withdrawal                                   */
  /* ---------------------------------------------------------------------- */

  const handleInitiate = useCallback(async () => {
    if (!userAddress) return;
    // Capture session at call time; abandon if it changes before we finish.
    const sessionId = sessionIdRef.current;

    setPhase("initiating");
    setErrorMessage(null);

    try {
      const tsUrl = await discoverTransferServer(anchorDomain);
      if (!mountedRef.current || sessionIdRef.current !== sessionId) return;
      setTransferServerUrl(tsUrl);

      const { id, url } = await initiateSep24Withdrawal({
        anchorDomain,
        assetCode,
        account: userAddress,
        ...(amount ? { amount } : {}),
      });

      if (!mountedRef.current || sessionIdRef.current !== sessionId) return;
      setTransactionId(id);
      setInteractiveUrl(url);
      setPhase("interactive");
    } catch (err: any) {
      if (!mountedRef.current || sessionIdRef.current !== sessionId) return;
      setErrorMessage(err?.message ?? "Failed to contact anchor. Please try again.");
      setErrorOrigin("initiation");
      setPhase("error");
    }
  }, [anchorDomain, assetCode, userAddress, amount]);

  /* ---------------------------------------------------------------------- */
  /* Step 2: User completes anchor interactive UI → start polling            */
  /* ---------------------------------------------------------------------- */

  const handleInteractiveDone = useCallback(async () => {
    if (!transactionId || !transferServerUrl) return;
    // FIX (line 134-140): capture session so stale continuations cannot affect
    // the current session's state.
    const sessionId = sessionIdRef.current;

    setPhase("polling");

    try {
      const result = await pollSep24Transaction({
        transferServerUrl,
        transactionId,
        intervalMs: 3_000,
        maxAttempts: 60,
        onStatusChange: (tx) => {
          // FIX (line 134-140): only update state when this session is still active.
          if (mountedRef.current && sessionIdRef.current === sessionId) {
            setTransaction(tx);
          }
        },
      });

      if (!mountedRef.current || sessionIdRef.current !== sessionId) return;

      // FIX (line 208): check result.completed before transitioning to the
      // "completed" phase. Terminal non-success results stay in "polling" with
      // the transaction visible (the status badge signals the outcome), then
      // fall through to the error display showing the actual terminal status.
      setTransaction(result.transaction);
      if (result.completed) {
        setPhase("completed");
      } else {
        // The transaction reached a terminal status that is not "completed"
        // (e.g. "refunded", "expired", "error"). Show the actual status in the
        // error panel rather than a generic green receipt.
        const terminalLabel =
          STATUS_LABELS[result.transaction.status] ?? result.transaction.status;
        setErrorMessage(
          result.transaction.message
            ? `${terminalLabel}: ${result.transaction.message}`
            : terminalLabel,
        );
        // FIX (line 504-507): monitoring error – the transaction context is
        // preserved in `transaction` state; the error origin is "monitoring"
        // so the retry button resumes the correct phase.
        setErrorOrigin("monitoring");
        setPhase("error");
      }
    } catch (err: any) {
      if (!mountedRef.current || sessionIdRef.current !== sessionId) return;
      // poll exhaustion or network error after the interactive form was submitted
      setErrorMessage(
        err?.message ?? "Status check timed out. Please check your bank statement.",
      );
      // FIX (line 504-507): this is a monitoring error, not an initiation error.
      setErrorOrigin("monitoring");
      setPhase("error");
    }
  }, [transactionId, transferServerUrl]);

  /* ---------------------------------------------------------------------- */
  /* Render helpers                                                            */
  /* ---------------------------------------------------------------------- */

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        // FIX (line 225-230): native dialog semantics via role="dialog" with
        // aria-modal. Focus is moved inside on open (useEffect above) and
        // returned to trigger on close. Escape is handled by the keydown listener.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          data-testid="sep24-withdraw-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Withdraw to Local Bank via SEP-0024"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Modal panel – receives programmatic focus on open */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            className="relative w-full max-w-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6 z-10 my-auto focus:outline-none"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                    Withdraw to Local Bank
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    SEP-0024 Hosted Fiat Payout Bridge • {anchorDomain}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close withdrawal modal"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                data-testid="sep24-modal-close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── PHASE: idle ─────────────────────────────────────────── */}
            {phase === "idle" && (
              <div className="space-y-5">
                <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Withdraw your earned{" "}
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    USDC commissions
                  </span>{" "}
                  directly to your local bank account via your region's Stellar anchor. The anchor
                  will guide you through entering your bank account details in a secure, hosted
                  flow.
                </p>

                {/* Info row */}
                <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-4 space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>
                      Asset:{" "}
                      <span className="font-bold font-mono text-zinc-900 dark:text-white">
                        {assetCode}
                      </span>
                    </span>
                  </div>
                  {amount && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>
                        Amount:{" "}
                        <span className="font-bold font-mono text-zinc-900 dark:text-white">
                          {amount} {assetCode}
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span>
                      Anchor:{" "}
                      <span className="font-mono text-zinc-900 dark:text-white">
                        {anchorDomain}
                      </span>
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleInitiate}
                  className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-extrabold text-sm h-12"
                  data-testid="sep24-start-btn"
                >
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  Start Bank Withdrawal
                </Button>
              </div>
            )}

            {/* ── PHASE: initiating ───────────────────────────────────── */}
            {phase === "initiating" && (
              <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
                <Loader2
                  className="w-10 h-10 text-indigo-500 animate-spin"
                  data-testid="sep24-initiating-spinner"
                />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                  Contacting anchor…
                </p>
                <p className="text-xs text-zinc-400">
                  Fetching {anchorDomain}/.well-known/stellar.toml
                </p>
              </div>
            )}

            {/* ── PHASE: interactive ──────────────────────────────────── */}
            {phase === "interactive" && interactiveUrl && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-amber-100 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5 text-xs text-amber-800 dark:text-amber-300 font-medium">
                  Complete the bank account form in the anchor popup, then click{" "}
                  <strong>"I've submitted my details"</strong> below.
                </div>

                {/* Anchor interactive iframe.
                    FIX (line 352-357): add a restrictive sandbox policy that
                    allows only the capabilities the anchor form needs:
                      - allow-scripts: required for the anchor's interactive form
                      - allow-forms: required for bank-detail submission
                      - allow-same-origin: required so the anchor can access its
                        own storage and cookies
                      - allow-popups: some anchors open a confirmation window
                    top-navigation (allow-top-navigation) is intentionally
                    excluded to prevent the anchor from redirecting the parent
                    frame. The external-tab fallback below serves anchors that
                    cannot operate within these restrictions. */}
                <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                  <iframe
                    src={interactiveUrl}
                    title="Anchor interactive withdrawal form"
                    className="w-full h-80"
                    allow="payment"
                    sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                    data-testid="sep24-iframe"
                  />
                </div>

                {/* Fallback: open in new tab (for anchors that cannot work
                    within the sandbox restrictions above) */}
                <a
                  href={interactiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  data-testid="sep24-open-external"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open anchor form in a new tab
                </a>

                <Button
                  onClick={handleInteractiveDone}
                  className="w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-extrabold text-sm h-12"
                  data-testid="sep24-submitted-btn"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  I've Submitted My Bank Details
                </Button>
              </div>
            )}

            {/* ── PHASE: polling ──────────────────────────────────────── */}
            {phase === "polling" && (
              <div className="space-y-5">
                <div className="flex flex-col items-center py-6 space-y-4 text-center">
                  <Loader2
                    className="w-10 h-10 text-indigo-500 animate-spin"
                    data-testid="sep24-polling-spinner"
                  />
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    Waiting for anchor confirmation…
                  </p>
                  <p className="text-xs text-zinc-400">
                    Polling every 3 seconds. This may take a few minutes.
                  </p>
                </div>

                {transaction && (
                  <div className="p-4 rounded-2xl border border-slate-100 dark:border-zinc-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Status</span>
                      <StatusBadge status={transaction.status} />
                    </div>
                    {transaction.message && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500">Message</span>
                        <span className="text-zinc-700 dark:text-zinc-300 max-w-[55%] text-right">
                          {transaction.message}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── PHASE: completed ────────────────────────────────────── */}
            {phase === "completed" && transaction && (
              <div className="space-y-5" data-testid="sep24-receipt">
                {/* Success hero */}
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-center space-y-1">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <div className="text-xs uppercase font-extrabold text-emerald-700 dark:text-emerald-400">
                    Fiat Payout Initiated
                  </div>
                  {transaction.amountOut && (
                    <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200">
                      {transaction.amountOut}{" "}
                      {/* FIX (line 460): use the output asset currency (amountOutAsset)
                          for the received-amount display. Fall back to the input
                          assetCode only when the anchor doesn't return an output asset. */}
                      <span className="text-base font-bold">
                        {transaction.amountOutAsset ?? transaction.assetCode ?? assetCode}
                      </span>
                    </div>
                  )}
                </div>

                {/* Receipt details */}
                <div className="rounded-2xl border border-slate-100 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800">
                  <ReceiptRow
                    label="Anchor Transaction ID"
                    value={transaction.id}
                    mono
                    testId="sep24-receipt-tx-id"
                  />
                  {transaction.externalTransactionId && (
                    <ReceiptRow
                      label="Fiat Payout Reference"
                      value={transaction.externalTransactionId}
                      mono
                      highlight
                      testId="sep24-receipt-fiat-ref"
                    />
                  )}
                  {transaction.amountIn && (
                    <ReceiptRow
                      label="Amount Sent"
                      value={`${transaction.amountIn} ${transaction.assetCode ?? assetCode}`}
                      mono
                    />
                  )}
                  {transaction.amountOut && (
                    <ReceiptRow
                      label="Amount Received"
                      value={`${transaction.amountOut} ${transaction.amountOutAsset ?? transaction.assetCode ?? assetCode}`}
                      mono
                    />
                  )}
                  {transaction.completedAt && (
                    <ReceiptRow
                      label="Completed At"
                      value={new Date(transaction.completedAt).toLocaleString()}
                    />
                  )}
                </div>

                <Button
                  onClick={onClose}
                  className="w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white font-extrabold text-sm h-12"
                  data-testid="sep24-done-btn"
                >
                  Done
                </Button>
              </div>
            )}

            {/* ── PHASE: error ────────────────────────────────────────── */}
            {phase === "error" && (
              <div className="space-y-5">
                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 space-y-2">
                  <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {/* FIX (line 504-507): title changes based on error origin */}
                    {errorOrigin === "monitoring" ? "Withdrawal Status Problem" : "Withdrawal Failed"}
                  </div>
                  <p
                    className="text-xs text-rose-600 dark:text-rose-300"
                    data-testid="sep24-error-msg"
                  >
                    {errorMessage}
                  </p>
                  {/* Show last-known transaction status when a monitoring error
                      preserved the transaction context */}
                  {errorOrigin === "monitoring" && transaction && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                      <span>Last status:</span>
                      <StatusBadge status={transaction.status} />
                    </div>
                  )}
                </div>

                {/* FIX (line 504-507): monitoring errors resume polling; initiation
                    errors restart from idle.
                    Note: check errorOrigin only — not transaction — so that a
                    poll rejection that fired before any onStatusChange callback
                    (transaction still null) still shows "Resume Checking". */}
                {errorOrigin === "monitoring" ? (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1 rounded-2xl text-sm h-10"
                    >
                      Close
                    </Button>
                    <Button
                      onClick={handleInteractiveDone}
                      className="flex-1 rounded-2xl bg-zinc-900 dark:bg-indigo-600 text-white text-sm h-10"
                      data-testid="sep24-retry-btn"
                    >
                      Resume Checking
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1 rounded-2xl text-sm h-10"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setPhase("idle");
                        setErrorMessage(null);
                      }}
                      className="flex-1 rounded-2xl bg-zinc-900 dark:bg-indigo-600 text-white text-sm h-10"
                      data-testid="sep24-retry-btn"
                    >
                      Try Again
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-component: receipt row                                                   */
/* -------------------------------------------------------------------------- */

function ReceiptRow({
  label,
  value,
  mono = false,
  highlight = false,
  testId,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  testId?: string;
}) {
  return (
    <div className="p-3.5 flex items-center justify-between gap-3 text-xs">
      <span className="text-zinc-500 dark:text-zinc-400 shrink-0">{label}</span>
      <span
        className={`text-right break-all ${
          highlight
            ? "font-black font-mono text-indigo-600 dark:text-indigo-400"
            : mono
              ? "font-mono text-zinc-700 dark:text-zinc-300"
              : "text-zinc-700 dark:text-zinc-300"
        }`}
        data-testid={testId}
      >
        {value}
      </span>
    </div>
  );
}
