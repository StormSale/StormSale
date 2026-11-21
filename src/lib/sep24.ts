/**
 * SEP-0024: Hosted Deposit and Withdrawal
 *
 * Implements the client-side flow for Stellar Anchor interactive withdrawals:
 * 1. Anchor TOML discovery → TRANSFER_SERVER_SEP0024
 * 2. POST /transactions/withdraw/interactive → interactive URL + tx id
 * 3. Poll GET /transaction?id=<id> → completion + fiat payout reference
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
 */

import { STELLAR_CONFIG } from "../config/stellar";

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

/** Parameters required to initiate a SEP-0024 withdrawal. */
export interface Sep24WithdrawalParams {
  /** Stellar anchor domain, e.g. "testanchor.stellar.org". */
  anchorDomain: string;
  /** Asset code to withdraw, e.g. "USDC". */
  assetCode: string;
  /** User Stellar account address (G...). */
  account: string;
  /** Optional amount in decimal string form, e.g. "50.00". */
  amount?: string;
  /** Language code for anchor UI, e.g. "en". Defaults to "en". */
  lang?: string;
  /** Withdrawal type, e.g. "bank_account". Defaults to "bank_account". */
  type?: string;
}

/** Successful interactive withdrawal response from the anchor. */
export interface Sep24WithdrawInteractiveResponse {
  /** Anchor-assigned transaction id. */
  id: string;
  /** URL to the anchor's hosted interactive UI. */
  url: string;
}

/** Status values as defined by SEP-0024 §4.3. */
export type Sep24TransactionStatus =
  | "incomplete"
  | "pending_user_transfer_start"
  | "pending_anchor"
  | "pending_external"
  | "pending_stellar"
  | "pending_trust"
  | "pending_user"
  | "completed"
  | "refunded"
  | "expired"
  | "error";

/** A single polled transaction record from the anchor's GET /transaction endpoint. */
export interface Sep24Transaction {
  id: string;
  kind: "withdrawal" | "deposit";
  status: Sep24TransactionStatus;
  /** Human-readable status explanation. */
  message?: string;
  /** Fiat payout reference returned by the anchor upon completion (bank ref no.). */
  externalTransactionId?: string;
  /** Amount in input asset code units. */
  amountIn?: string;
  /** Amount the user will receive after anchor fees. */
  amountOut?: string;
  /** Input asset code, e.g. "USDC". */
  assetCode?: string;
  /** Output asset code (may differ from input asset, e.g. local fiat). */
  amountOutAsset?: string;
  /** ISO 8601 datetime the transaction started. */
  startedAt?: string;
  /** ISO 8601 datetime the transaction completed (if applicable). */
  completedAt?: string;
  /** URL for more info, displayed by anchor for in-progress states. */
  moreInfoUrl?: string;
}

/** Parameters for the polling helper. */
export interface PollTransactionParams {
  /** Transfer server base URL (from TOML discovery). */
  transferServerUrl: string;
  /** Anchor transaction id returned by initiation. */
  transactionId: string;
  /** Polling interval in ms. Defaults to 3 000. */
  intervalMs?: number;
  /** Maximum number of poll attempts. Defaults to 60 (≈ 3 minutes at 3 s). */
  maxAttempts?: number;
  /** Called each time a new status is received. */
  onStatusChange?: (tx: Sep24Transaction) => void;
}

/** Result of a completed poll cycle. */
export interface PollResult {
  transaction: Sep24Transaction;
  /** True when the anchor returned status "completed". */
  completed: boolean;
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                             */
/* -------------------------------------------------------------------------- */

const DEFAULT_TIMEOUT_MS = STELLAR_CONFIG.federationTimeoutMs ?? 10_000;

/** Accepted Sep24TransactionStatus values – used for runtime validation. */
const VALID_STATUSES: Set<string> = new Set<Sep24TransactionStatus>([
  "incomplete",
  "pending_user_transfer_start",
  "pending_anchor",
  "pending_external",
  "pending_stellar",
  "pending_trust",
  "pending_user",
  "completed",
  "refunded",
  "expired",
  "error",
]);

/**
 * Fetches a URL with an AbortController-based timeout.
 * Returns the parsed JSON body and the raw Response.
 */
async function fetchWithTimeout<T>(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  init?: RequestInit,
): Promise<{ response: Response; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // For JSON responses
    const body = (await response.json().catch(() => null)) as T;
    return { response, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SEP-0024 request timed out after ${timeoutMs} ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validates that a URL string is a valid HTTPS URL.
 * Throws a descriptive error when the check fails.
 */
function requireHttpsUrl(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`${label} is missing or not a string`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL: ${raw}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS, got: ${parsed.protocol}`);
  }
  return raw;
}

/* -------------------------------------------------------------------------- */
/* Anchor TOML discovery                                                        */
/* -------------------------------------------------------------------------- */

// Matches `TRANSFER_SERVER_SEP0024 = "https://..."` or `TRANSFER_SERVER_0024 = "..."` in stellar.toml.
const TRANSFER_SERVER_SEP0024_PATTERN =
  /^\s*TRANSFER_SERVER_SEP0024\s*=\s*["']([^"']+)["']/im;
// Fallback: some anchors use the older TRANSFER_SERVER key.
const TRANSFER_SERVER_FALLBACK_PATTERN =
  /^\s*TRANSFER_SERVER\s*=\s*["']([^"']+)["']/im;

/**
 * Fetches `/.well-known/stellar.toml` from the given anchor domain and
 * extracts the `TRANSFER_SERVER_SEP0024` (or `TRANSFER_SERVER`) URL.
 *
 * @throws when the TOML cannot be fetched or does not advertise a transfer server.
 * @throws when the discovered URL is not a valid HTTPS URL.
 */
export async function discoverTransferServer(
  anchorDomain: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const tomlUrl = `https://${anchorDomain}/.well-known/stellar.toml`;

  // FIX (line 159-161): keep the timeout signal active through response.text()
  // by moving clearTimeout into a finally block that covers both the fetch and
  // the body read.
  let toml: string;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(tomlUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Could not load stellar.toml from ${anchorDomain} (HTTP ${response.status})`,
      );
    }
    toml = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`stellar.toml fetch timed out for ${anchorDomain}`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const primary = toml.match(TRANSFER_SERVER_SEP0024_PATTERN)?.[1]?.trim();
  if (primary) {
    // FIX (line 176): validate the discovered URL is HTTPS before returning it.
    return requireHttpsUrl(primary, `TRANSFER_SERVER_SEP0024 from ${anchorDomain}`);
  }

  const fallback = toml.match(TRANSFER_SERVER_FALLBACK_PATTERN)?.[1]?.trim();
  if (fallback) {
    // FIX (line 176): same validation for the fallback path.
    return requireHttpsUrl(fallback, `TRANSFER_SERVER from ${anchorDomain}`);
  }

  throw new Error(
    `stellar.toml for ${anchorDomain} does not declare TRANSFER_SERVER_SEP0024`,
  );
}

/* -------------------------------------------------------------------------- */
/* Interactive withdrawal initiation                                            */
/* -------------------------------------------------------------------------- */

/**
 * Initiates a SEP-0024 interactive withdrawal by POSTing to the anchor's
 * `POST /transactions/withdraw/interactive` endpoint.
 *
 * Returns the transaction id and the interactive URL the user must visit.
 *
 * @throws when the anchor returns a non-2xx response or an unexpected body shape.
 */
export async function initiateSep24Withdrawal(
  params: Sep24WithdrawalParams,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Sep24WithdrawInteractiveResponse> {
  const transferServerUrl = await discoverTransferServer(params.anchorDomain, timeoutMs);
  const endpoint = `${transferServerUrl.replace(/\/$/, "")}/transactions/withdraw/interactive`;

  const form = new FormData();
  form.append("asset_code", params.assetCode);
  form.append("account", params.account);
  if (params.amount) form.append("amount", params.amount);
  form.append("lang", params.lang ?? "en");
  form.append("type", params.type ?? "bank_account");

  const { response, body } = await fetchWithTimeout<{
    type?: string;
    id?: string;
    url?: string;
    error?: string;
  }>(endpoint, timeoutMs, { method: "POST", body: form });

  if (!response.ok) {
    const errMsg =
      (body as any)?.error ?? `Anchor returned HTTP ${response.status}`;
    throw new Error(`SEP-0024 withdrawal initiation failed: ${errMsg}`);
  }

  if (body?.type !== "interactive_customer_info_needed" || !body.id) {
    throw new Error(
      `Unexpected anchor response: expected type=interactive_customer_info_needed, got type=${body?.type}`,
    );
  }

  // FIX (line 231): validate body.url before returning — accept only valid HTTPS URLs.
  const validatedUrl = requireHttpsUrl(body.url, "Anchor interactive URL");

  return { id: body.id, url: validatedUrl };
}

/* -------------------------------------------------------------------------- */
/* Transaction status polling                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Parses and validates a raw anchor transaction payload into a typed
 * `Sep24Transaction`. Accepts an unknown payload, checks required fields,
 * and avoids unsafe type assertions.
 *
 * FIX (line 242-246): validate against a checked schema; remove status type
 * assertion; preserve fiat_payout_reference fallback for externalTransactionId.
 */
export function parseSep24Transaction(raw: unknown): Sep24Transaction {
  if (raw === null || typeof raw !== "object") {
    throw new Error("SEP-0024 anchor returned a non-object transaction payload");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.id !== "string" || r.id === "") {
    throw new Error("SEP-0024 transaction payload missing required field: id");
  }

  // Validate status: use "incomplete" as default only when field is absent;
  // reject unrecognised status strings rather than blindly casting.
  const rawStatus = r.status ?? "incomplete";
  if (typeof rawStatus !== "string" || !VALID_STATUSES.has(rawStatus)) {
    throw new Error(
      `SEP-0024 transaction has unrecognised status: ${String(rawStatus)}`,
    );
  }
  const status = rawStatus as Sep24TransactionStatus;

  const kind: "withdrawal" | "deposit" =
    r.kind === "deposit" ? "deposit" : "withdrawal";

  const optStr = (v: unknown): string | undefined =>
    typeof v === "string" && v !== "" ? v : undefined;

  return {
    id: r.id,
    kind,
    status,
    message: optStr(r.message) ?? optStr(r.more_info_url),
    // fiat_payout_reference is a StormSale-specific vendor extension some
    // anchors include alongside the standard external_transaction_id field.
    externalTransactionId:
      optStr(r.external_transaction_id) ?? optStr(r.fiat_payout_reference),
    amountIn: optStr(r.amount_in),
    amountOut: optStr(r.amount_out),
    // Input asset code – used for input-related displays.
    assetCode: optStr(r.amount_in_asset) ?? optStr(r.asset_code),
    // Output asset code – may differ from input (e.g. local fiat currency).
    // FIX (line 460): preserve separate output asset identifier so the receipt
    // can format amountOut with the correct currency symbol.
    amountOutAsset: optStr(r.amount_out_asset),
    startedAt: optStr(r.started_at),
    completedAt: optStr(r.completed_at),
    moreInfoUrl: optStr(r.more_info_url),
  };
}

/**
 * Fetches the current status of an anchor transaction.
 *
 * @see https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md#single-historical-transaction
 */
export async function fetchSep24Transaction(
  transferServerUrl: string,
  transactionId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Sep24Transaction> {
  const url = `${transferServerUrl.replace(/\/$/, "")}/transaction?id=${encodeURIComponent(transactionId)}`;
  const { response, body } = await fetchWithTimeout<{ transaction?: unknown }>(
    url,
    timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`SEP-0024 transaction fetch failed (HTTP ${response.status})`);
  }

  const raw = (body as any)?.transaction;
  if (!raw) {
    throw new Error("SEP-0024 anchor did not return a transaction object");
  }

  return parseSep24Transaction(raw);
}

/** Terminal statuses that stop the polling loop. */
const TERMINAL_STATUSES: Set<Sep24TransactionStatus> = new Set([
  "completed",
  "refunded",
  "expired",
  "error",
]);

/**
 * Polls an anchor transaction until it reaches a terminal status.
 *
 * Calls `onStatusChange` on every poll where the status has changed.
 * Resolves when the anchor marks the transaction terminal.
 * Rejects after `maxAttempts` without a terminal status (observation timeout).
 */
export async function pollSep24Transaction(params: PollTransactionParams): Promise<PollResult> {
  const {
    transferServerUrl,
    transactionId,
    intervalMs = 3_000,
    maxAttempts = 60,
    onStatusChange,
  } = params;

  let lastStatus: Sep24TransactionStatus | undefined;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const tx = await fetchSep24Transaction(transferServerUrl, transactionId);

    if (tx.status !== lastStatus) {
      lastStatus = tx.status;
      onStatusChange?.(tx);
    }

    if (TERMINAL_STATUSES.has(tx.status)) {
      return { transaction: tx, completed: tx.status === "completed" };
    }

    attempts++;
    if (attempts < maxAttempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // FIX: treat poll exhaustion as an observation timeout, not a confirmed failure.
  // The caller (handleInteractiveDone) now handles this as a monitoring error
  // rather than resetting the entire flow to idle.
  throw new Error(
    `SEP-0024 transaction ${transactionId} status check timed out after ${maxAttempts} attempts — please verify with your bank`,
  );
}
