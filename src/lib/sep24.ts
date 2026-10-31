import { StellarToml } from "@stellar/stellar-sdk";

export interface AnchorToml {
  transferServerSep24?: string;
  networkPassphrase?: string;
  displayName?: string;
  assets?: Array<{ code: string; issuer: string }>;
}

export interface WithdrawalAsset {
  code: string;
  issuer: string;
}

export interface WithdrawalTransferResponse {
  id: string;
  type: "withdrawal";
  url?: string;
  url_interactive?: string;
}

export interface TransferStatus {
  id: string;
  status: "incomplete" | "pending_user" | "pending_anchor" | "pending_stellar" | "completed" | "error" | "refunded" | "expired" | "noon" | "canceled";
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  stellar_transaction_id?: string;
  external_transaction_id?: string;
  message?: string;
  more_info_url?: string;
  started_at?: string;
  updated_at?: string;
  completed_at?: string;
  refunded?: boolean;
}

export interface WithdrawalRequestParams {
  assetCode: string;
  assetIssuer: string;
  amount: string;
  account: string;
  language?: string;
  onChangeCallback?: string;
}

export interface InteractivePopupOptions {
  width?: number;
  height?: number;
  features?: string;
  onClose?: () => void;
  onMessage?: (event: MessageEvent) => void;
}

export interface WithdrawalReceipt {
  transactionId: string;
  status: TransferStatus["status"];
  amountIn: string;
  amountOut: string;
  amountFee: string;
  fiatReference: string;
  completedAt?: string;
}

export interface RunWithdrawalFlowOptions {
  token: string;
  language?: string;
  onChangeCallback?: string;
  pollingIntervalMs?: number;
  pollingTimeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: TransferStatus) => void;
}

export interface RunWithdrawalFlowResult {
  transfer: WithdrawalTransferResponse;
  status: TransferStatus;
  receipt: WithdrawalReceipt;
}

const SEP24_ENDPOINT = "/sep24";

export class Sep24Error extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "Sep24Error";
  }
}

function normalizeUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${p}`;
}

export async function fetchAnchorToml(homeDomain: string): Promise<AnchorToml> {
  if (!homeDomain) {
    throw new Sep24Error("Anchor home domain is required", "invalid_domain");
  }
  const url = normalizeUrl(homeDomain, "/.full-toml");
  const response = await fetch(url, {
    headers: { Accept: "application/toml-json" },
    redirect: "error",
  });
  if (!response.ok) {
    throw new Sep24Error(
      `Failed to fetch anchor TOML from ${url} (${response.status})`,
      "toml_fetch_failed",
    );
  }
  const json = (await response.json()) as Record<string, unknown>;
  const toml = StellarToml.fromJSON(json);
  const transferServerSep24 = toml.documents.TRANSFER_SERVER_SEP24;
  if (!transferServerSep24) {
    throw new Sep24Error(
      "Anchor TOML does not declare TRANSFER_SERVER_SEP24",
      "sep24_not_supported",
    );
  }
  const currencies = toml.data.CURRENCIES as Array<Record<string, unknown>> | undefined;
  const assets = currencies
    ?.filter((a) => a.status === "tradeable")
    .map((a) => ({ code: String(a.code), issuer: String(a.issuer) }));
  return {
    transferServerSep24,
    networkPassphrase: toml.data.NETWORK_PASSPHRASE as string | undefined,
    displayName: toml.data.DOCUMENTATION as string | undefined,
    assets,
  };
}

export async function discoverWithdrawalAssets(homeDomain: string): Promise<WithdrawalAsset[]> {
  const toml = await fetchAnchorToml(homeDomain);
  return toml.assets ?? [];
}

export async function startInteractiveWithdrawal(
  transferServerSep24: string,
  params: WithdrawalRequestParams,
  token: string,
): Promise<WithdrawalTransferResponse> {
  if (!token) {
    throw new Sep24Error("Auth token is required for SEP-24 withdrawal", "missing_token");
  }
  const body = new URLSearchParams({
    asset_code: params.assetCode,
    asset_issuer: params.assetIssuer,
    amount: params.amount,
    account: params.account,
  });
  if (params.language) body.set("lang", params.language);
  if (params.onChangeCallback) body.set("on_change_callback", params.onChangeCallback);
  const url = normalizeUrl(transferServerSep24, `${SEP24_ENDPOINT}/transactions/withdraw/interactive`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${token}`,
    },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Sep24Error(
      `SEP-24 withdrawal initiation failed (${response.status}): ${text}`,
      "withdrawal_init_failed",
    );
  }
  const json = (await response.json()) as Record<string, unknown>;
  if (!json.id || !json.type) {
    throw new Sep24Error("SEP-24 withdrawal response missing id/type", "invalid_response");
  }
  return {
    id: String(json.id),
    type: "withdrawal",
    url: typeof json.url === "string" ? json.url : undefined,
    url_interactive:
      typeof json.url_interactive === "string" ? json.url_interactive : undefined,
  };
}

export async function fetchTransferStatus(
  transferServerSep24: string,
  transactionId: string,
  token: string,
): Promise<TransferStatus> {
  if (!transactionId) {
    throw new Sep24Error("Transaction ID is required", "missing_transaction_id");
  }
  const url = normalizeUrl(
    transferServerSep24,
    `${SEP24_ENDPOINT}/transaction?id=${encodeURIComponent(transactionId)}`,
  );
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Sep24Error(
      `Failed to fetch transfer status (${response.status})`,
      "status_fetch_failed",
    );
  }
  const json = (await response.json()) as Record<string, unknown>;
  const tx = json.transaction as Record<string, unknown> | undefined;
  if (!tx || !tx.id || !tx.status) {
    throw new Sep24Error("Transfer status response malformed", "invalid_response");
  }
  return {
    id: String(tx.id),
    status: tx.status as TransferStatus["status"],
    amount_in: tx.amount_in as string | undefined,
    amount_out: tx.amount_out as string | undefined,
    amount_fee: tx.amount_fee as string | undefined,
    stellar_transaction_id: tx.stellar_transaction_id as string | undefined,
    external_transaction_id: tx.external_transaction_id as string | undefined,
    message: tx.message as string | undefined,
    more_info_url: tx.more_info_url as string | undefined,
    started_at: tx.started_at as string | undefined,
    updated_at: tx.updated_at as string | undefined,
    completed_at: tx.completed_at as string | undefined,
    refunded: Boolean(tx.refunded),
  };
}

export interface PollingOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const TERMINAL_STATUSES: ReadonlySet<TransferStatus["status"]> = new Set([
  "completed",
  "error",
  "refunded",
  "expired",
  "canceled",
]);

export function isTerminalStatus(status: TransferStatus["status"]): boolean {
  return TERMINAL_STATUSES.has(status);
}

export async function pollTransferStatus(
  transferServerSep24: string,
  transactionId: string,
  token: string,
  onUpdate: (status: TransferStatus) => void,
  options: PollingOptions = {},
): Promise<TransferStatus> {
  const intervalMs = options.intervalMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  let last: TransferStatus;
  while (true) {
    if (options.signal?.aborted) {
      throw new Sep24Error("Polling aborted", "aborted");
    }
    last = await fetchTransferStatus(transferServerSep24, transactionId, token);
    onUpdate(last);
    if (isTerminalStatus(last.status)) {
      return last;
    }
    if (Date.now() + intervalMs > deadline) {
      throw new Sep24Error(
        `Transfer polling timed out after ${timeoutMs}ms (last status: ${last.status})`,
        "polling_timeout",
      );
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Sep24Error("Polling aborted", "aborted"));
        },
        { once: true },
      );
    });
  }
}

export function openInteractivePopup(
  url: string,
  options: InteractivePopupOptions = {},
): Window {
  if (!url) {
    throw new Sep24Error("Interactive URL is required", "missing_interactive_url");
  }
  const width = options.width ?? 480;
  const height = options.height ?? 720;
  const features = [
    "width=" + width,
    "height=" + height,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
    options.features ?? "",
  ]
    .filter(Boolean)
    .join(",");
  const popup = window.open(url, "sep24-interactive", features);
  if (!popup) {
    throw new Sep24Error(
      "Unable to open anchor interactive popup (popup blocked)",
      "popup_blocked",
    );
  }
  if (options.onMessage || options.onClose) {
    const cleanup = () => {
      if (options.onMessage) {
        window.removeEventListener("message", messageHandler);
      }
      window.clearInterval(interval);
    };
    const messageHandler = (event: MessageEvent) => {
      if (event.source !== popup) return;
      options.onMessage?.(event);
    };
    if (options.onMessage) {
      window.addEventListener("message", messageHandler);
    }
    const interval = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        options.onClose?.();
      }
    }, 500);
  }
  return popup;
}

export function buildWithdrawalReceipt(status: TransferStatus): WithdrawalReceipt {
  if (status.status === "completed" && !status.external_transaction_id) {
    throw new Sep24Error(
      "Completed withdrawal is missing a fiat payout reference",
      "missing_fiat_reference",
    );
  }
  return {
    transactionId: status.id,
    status: status.status,
    amountIn: status.amount_in ?? "0",
    amountOut: status.amount_out ?? "0",
    amountFee: status.amount_fee ?? "0",
    fiatReference: status.external_transaction_id ?? "",
    completedAt: status.completed_at,
  };
}

export async function runWithdrawalFlow(
  homeDomain: string,
  params: WithdrawalRequestParams,
  options: RunWithdrawalFlowOptions,
): Promise<RunWithdrawalFlowResult> {
  const toml = await fetchAnchorToml(homeDomain);
  if (!toml.transferServerSep24) {
    throw new Sep24Error(
      "Anchor TOML does not declare TRANSFER_SERVER_SEP24",
      "sep24_not_supported",
    );
  }
  const transfer = await startInteractiveWithdrawal(
    toml.transferServerSep24,
    {
      ...params,
      language: params.language ?? options.language,
      onChangeCallback: params.onChangeCallback ?? options.onChangeCallback,
    },
    options.token,
  );
  const interactiveUrl = transfer.url_interactive ?? transfer.url;
  if (!interactiveUrl) {
    throw new Sep24Error(
      "SEP-24 withdrawal response did not include an interactive URL",
      "missing_interactive_url",
    );
  }
  const popup = openInteractivePopup(interactiveUrl);
  try {
    const status = await pollTransferStatus(
      toml.transferServerSep24,
      transfer.id,
      options.token,
      (statusUpdate) => options.onStatus?.(statusUpdate),
      {
        intervalMs: options.pollingIntervalMs,
        timeoutMs: options.pollingTimeoutMs,
        signal: options.signal,
      },
    );
    return {
      transfer,
      status,
      receipt: buildWithdrawalReceipt(status),
    };
  } finally {
    popup.close();
  }
}
