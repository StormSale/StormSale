import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import {
  formatStellarAddress,
  isFederatedAddress,
  isValidStellarAccount,
  resolveFederatedAddress,
} from "../../lib/stellar";
import type { FederatedAddressRecord, RecipientResolution } from "../../lib/stellar";

export interface FederatedAddressInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Fires whenever the resolution state changes. `null` means the field is empty
   * or still resolving. Callers can use `resolution.address` to submit the
   * resolved ed25519 key and fall back to `value` (raw public key) when the
   * status is `unresolved`.
   */
  onResolved?: (resolution: RecipientResolution | null) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Debounce before hitting the federation server (ms). */
  debounceMs?: number;
}

const INVALID_MESSAGE = "Enter a valid G... public key or name*domain.com federation address.";

export type FederationOutcome =
  | {
      key: string;
      status: "federated";
      address: string;
      federatedAddress: string;
      memoType?: string;
      memo?: string;
    }
  | { key: string; status: "unresolved"; message: string };

export type DisplayState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "raw"; address: string }
  | {
      status: "federated";
      address: string;
      federatedAddress: string;
      memoType?: string;
      memo?: string;
    }
  | { status: "unresolved"; message: string }
  | { status: "invalid"; message: string };

/**
 * Derives what the input should display from the current text and the latest
 * lookup outcome. An outcome whose key does not match the current text is
 * stale (the field was retyped), so it is ignored and the state stays
 * `resolving` until the new lookup settles.
 */
export function deriveDisplayState(
  value: string,
  outcome: FederationOutcome | null,
): DisplayState {
  const trimmed = value.trim();
  if (!trimmed) return { status: "idle" };
  if (isValidStellarAccount(trimmed)) return { status: "raw", address: trimmed };
  if (!isFederatedAddress(trimmed)) return { status: "invalid", message: INVALID_MESSAGE };
  if (outcome?.key !== trimmed) return { status: "resolving" };
  if (outcome.status === "federated") {
    return {
      status: "federated",
      address: outcome.address,
      federatedAddress: outcome.federatedAddress,
      memoType: outcome.memoType,
      memo: outcome.memo,
    };
  }
  return { status: "unresolved", message: outcome.message };
}

/**
 * Schedules a debounced federation lookup. The returned function cancels the
 * pending timer and ignores any in-flight result, so retyping can never apply
 * a stale outcome to the current input.
 */
export function scheduleFederationLookup(
  key: string,
  resolve: (address: string) => Promise<FederatedAddressRecord>,
  onResult: (outcome: FederationOutcome) => void,
  debounceMs: number,
): () => void {
  let cancelled = false;

  const timer = setTimeout(async () => {
    try {
      const record = await resolve(key);
      if (cancelled) return;
      onResult({
        key,
        status: "federated",
        address: record.accountId,
        federatedAddress: record.federatedAddress,
        memoType: record.memoType,
        memo: record.memo,
      });
    } catch (error) {
      if (cancelled) return;
      onResult({
        key,
        status: "unresolved",
        message: (error as Error)?.message || "Federation lookup failed.",
      });
    }
  }, debounceMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

/**
 * Recipient input that accepts either a raw `G...` ed25519 public key or a
 * `name*domain.com` Stellar federation address, resolving the latter in real time
 * and falling back gracefully when the federation lookup fails.
 */
export const FederatedAddressInput: React.FC<FederatedAddressInputProps> = ({
  id,
  value,
  onChange,
  onResolved,
  placeholder = "G... public key or alice*stormsale.io",
  required,
  disabled,
  className,
  inputClassName,
  debounceMs = 450,
}) => {
  const [outcome, setOutcome] = useState<FederationOutcome | null>(null);
  const onResolvedRef = useRef(onResolved);

  useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  const trimmed = value.trim();
  const isRaw = isValidStellarAccount(trimmed);
  const isFederationFormat = !isRaw && isFederatedAddress(trimmed);

  // Only the async federation lookup touches state; it runs off the effect body.
  useEffect(() => {
    if (!isFederationFormat) return;
    return scheduleFederationLookup(trimmed, resolveFederatedAddress, setOutcome, debounceMs);
  }, [trimmed, isFederationFormat, debounceMs]);

  const state = useMemo<DisplayState>(() => deriveDisplayState(value, outcome), [value, outcome]);

  const resolution = useMemo<RecipientResolution | null>(() => {
    switch (state.status) {
      case "idle":
      case "resolving":
        return null;
      case "raw":
        return { status: "raw", address: state.address };
      case "federated":
        return {
          status: "federated",
          address: state.address,
          federatedAddress: state.federatedAddress,
          memoType: state.memoType,
          memo: state.memo,
        };
      case "unresolved":
        return { status: "unresolved", error: state.message };
      case "invalid":
        return { status: "invalid", error: state.message };
      default:
        return null;
    }
  }, [state]);

  useEffect(() => {
    onResolvedRef.current?.(resolution);
  }, [resolution]);

  const variant =
    state.status === "invalid"
      ? "error"
      : state.status === "unresolved"
        ? "warning"
        : state.status === "raw" || state.status === "federated"
          ? "success"
          : "default";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          variant={variant}
          aria-invalid={state.status === "invalid" || undefined}
          className={cn(
            "h-12 pr-11 border-slate-200 dark:border-zinc-800 focus:ring-indigo-600 dark:focus:ring-indigo-500 rounded-xl bg-slate-50 dark:bg-zinc-950 font-mono text-sm",
            inputClassName,
          )}
        />
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          {state.status === "resolving" && (
            <Loader2
              className="h-4 w-4 animate-spin motion-reduce:animate-none text-indigo-500"
              aria-hidden="true"
            />
          )}
          {(state.status === "raw" || state.status === "federated") && (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          )}
          {state.status === "unresolved" && (
            <TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
          )}
          {state.status === "invalid" && (
            <XCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
          )}
        </div>
      </div>

      <div role="status" aria-live="polite">
        <FederationStatusMessage state={state} />
      </div>
    </div>
  );
};

const FederationStatusMessage: React.FC<{ state: DisplayState }> = ({ state }) => {
  switch (state.status) {
    case "idle":
      return null;
    case "resolving":
      return (
        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          Resolving federation address…
        </p>
      );
    case "raw":
      return (
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Verified Stellar public key
        </p>
      );
    case "federated":
      return (
        <div className="space-y-1">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolved {state.federatedAddress} → {formatStellarAddress(state.address)}
          </p>
          {state.memoType && state.memo !== undefined && (
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Requires a “{state.memoType}” memo: <span className="font-mono">{state.memo}</span>
            </p>
          )}
        </div>
      );
    case "unresolved":
      return (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
          <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Federation lookup failed ({state.message}). You can still paste the recipient’s raw G…
            public key.
          </span>
        </p>
      );
    case "invalid":
      return (
        <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{state.message}</span>
        </p>
      );
    default:
      return null;
  }
};
