import { Networks } from "@stellar/stellar-sdk";

export interface Sep24TomlInfo {
  assetCode: string;
  assetIssuer?: string;
  transferServerSep24?: string;
  webAuthEndpoint?: string;
  signingKey?: string;
  fees?: {
    enabled: boolean;
    withdrawal?: Record<string, number>;
  };
  features?: {
    withdrawal?: {
      enabled: boolean;
      authenticationRequired: boolean;
      types?: Record<string, { enabled: boolean }>;
    };
  };
}

export interface Sep24WithdrawalRequest {
  account: string;
  assetCode: string;
  assetIssuer?: string;
  amount?: string;
  walletUrl?: string;
  language?: string;
  onChangeCallback?: string;
}

export interface Sep24TransactionRecord {
  id: string;
  kind: "deposit" | "withdrawal";
  status: string;
  status_eta?: string;
  more_info_url?: string;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  asset_code?: string;
  deposit_memo?: string;
  withdraw_anchor_account?: string;
  external_transaction_id?: string;
  started_at?: string;
  completed_at?: string;
  updated_at?: string;
  message?: string;
  refund_memo?: string;
  refund_memo_type?: string;
}

export interface Sep24InteractiveResponse {
  type: "interactive_customer_info_updated" | "transactions";
  url?: string;
  id?: string;
  transactions?: Sep24TransactionRecord[];
}

const HORIZON_URLS = {
  testnet: "https://horizon-testnet.stellar.org",
  public: "https://horizon.stellar.org",
} as const;

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!trimmed) throw new Error("Anchor domain is required");
  return trimmed;
}

function parseTomlValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseStellarToml(toml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentSection: Record<string, unknown> | null = null;
  const lines = toml.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      const path = sectionMatch[1].split(".");
      let node = result;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (typeof node[key] !== "object" || node[key] === null) {
          node[key] = {};
        }
        node = node[key] as Record<string, unknown>;
      }
      const leaf = path[path.length - 1];
      if (typeof node[leaf] !== "object" || node[leaf] === null) {
        node[leaf] = {};
      }
      currentSection = node[leaf] as Record<string, unknown>;
      continue;
    }
    const keyValue = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    if (!keyValue || !currentSection) continue;
    const key = keyValue[1];
    const value = keyValue[2];
    currentSection[key] = parseTomlValue(value);
  }
  return result;
}

function tomlSectionToString(section: Record<string, unknown> | undefined): string | undefined {
  if (!section) return undefined;
  const value = section["transfer_server_sep24"];
  return typeof value === "string" ? value : undefined;
}

function tomlSectionToWebAuth(section: Record<string, unknown> | undefined): string | undefined {
  if (!section) return undefined;
  const value = section["web_auth_endpoint"];
  return typeof value === "string" ? value : undefined;
}

function tomlSectionToSigningKey(section: Record<string, unknown> | undefined): string | undefined {
  if (!section) return undefined;
  const value = section["signing_key"];
  return typeof value === "string" ? value : undefined;
}

function tomlSectionToFees(section: Record<string, unknown> | undefined): Sep24TomlInfo["fees"] {
  if (!section) return undefined;
  const enabled = section["enabled"];
  if (typeof enabled !== "string") return undefined;
  const withdrawalRaw = section["withdrawal"];
  const withdrawal: Record<string, number> = {};
  if (withdrawalRaw && typeof withdrawalRaw === "object") {
    for (const [key, value] of Object.entries(withdrawalRaw as Record<string, unknown>)) {
      const num = Number(value);
      if (Number.isFinite(num)) withdrawal[key] = num;
    }
  }
  return { enabled: enabled === "true", withdrawal };
}

function tomlSectionToFeatures(
  section: Record<string, unknown> | undefined,
): Sep24TomlInfo["features"] {
  if (!section) return undefined;
  const withdrawalSection = section["withdrawal"] as Record<string, unknown> | undefined;
  if (!withdrawalSection) return undefined;
  const enabled = withdrawalSection["enabled"];
  const authRequired = withdrawalSection["authentication_required"];
  const typesRaw = withdrawalSection["types"] as Record<string, Record<string, unknown>> | undefined;
  const types: Record<string, { enabled: boolean }> = {};
  if (typesRaw) {
    for (const [key, value] of Object.entries(typesRaw)) {
      types[key] = { enabled: value["enabled"] === "true" };
    }
  }
  return {
    withdrawal: {
      enabled: enabled === "true",
      authenticationRequired: authRequired === "true",
      types,
    },
  };
}

export async function fetchAnchorToml(domain: string): Promise<Record<string, unknown>> {
  const host = normalizeDomain(domain);
  const url = `https://${host}/.stellar.toml`;
  const response = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch stellar.toml for ${host} (${response.status})`);
  }
  const text = await response.text();
  return parseStellarToml(text);
}

export function extractSep24Info(
  toml: Record<string, unknown>,
  assetCode: string,
  assetIssuer?: string,
): Sep24TomlInfo {
  const currencies = toml["CURRENCIES"] as Record<string, Record<string, unknown>> | undefined;
  if (!currencies) throw new Error("Toml does not declare CURRENCIES");
  const matching = Object.entries(currencies).find(([, currency]) => {
    const code = currency["code"];
    const issuer = currency["issuer"];
    if (code !== assetCode) return false;
    if (assetIssuer && issuer && issuer !== assetIssuer) return false;
    return true;
  });
  if (!matching) {
    throw new Error(`Toml does not declare currency ${assetCode}`);
  }
  const currency = matching[1];
  const issuer = typeof currency["issuer"] === "string" ? currency["issuer"] : undefined;
  const transferServer = tomlSectionToString(currency["transfer_server_sep24"] as Record<string, unknown> | undefined);
  const webAuth = tomlSectionToWebAuth(currency["web_auth_endpoint"] as Record<string, unknown> | undefined);
  const signingKey = tomlSectionToSigningKey(currency["signing_key"] as Record<string, unknown> | undefined);
  const fees = tomlSectionToFees(currency["fees"] as Record<string, unknown> | undefined);
  const features = tomlSectionToFeatures(currency["features"] as Record<string, unknown> | undefined);
  if (!transferServer) {
    throw new Error(`Currency ${assetCode} does not declare transfer_server_sep24`);
  }
  if (features?.withdrawal && !features.withdrawal.enabled) {
    throw new Error(`Anchor disables SEP-024 withdrawal for ${assetCode}`);
  }
  return {
    assetCode,
    assetIssuer: issuer,
    transferServerSep24: transferServer,
    webAuthEndpoint: webAuth,
    signingKey: signingKey,
    fees,
    features,
  };
}

export async function discoverSep24Withdrawal(
  domain: string,
  assetCode: string,
  assetIssuer?: string,
): Promise<Sep24TomlInfo> {
  const toml = await fetchAnchorToml(domain);
  return extractSep24Info(toml, assetCode, assetIssuer);
}

export function buildSep24WithdrawUrl(
  info: Sep24TomlInfo,
  request: Sep24WithdrawalRequest,
): string {
  if (!info.transferServerSep24) throw new Error("Missing transfer server for SEP-24");
  const base = info.transferServerSep24.replace(/\/+$/, "");
  const url = new URL(`${base}/withdraw/interactive`);
  url.searchParams.set("account", request.account);
  url.searchParams.set("asset_code", request.assetCode);
  if (request.assetIssuer) url.searchParams.set("asset_issuer", request.assetIssuer);
  if (request.amount) url.searchParams.set("amount", request.amount);
  if (request.walletUrl) url.searchParams.set("wallet_url", request.walletUrl);
  if (request.language) url.searchParams.set("lang", request.language);
  if (request.onChangeCallback) url.searchParams.set("onchange_callback", request.onChangeCallback);
  return url.toString();
}

export async function requestSep24Withdrawal(
  info: Sep24TomlInfo,
  request: Sep24WithdrawalRequest,
): Promise<Sep24InteractiveResponse> {
  if (!info.transferServerSep24) throw new Error("Missing transfer server for SEP-24");
  const base = info.transferServerSep24.replace(/\/+$/, "");
  const url = new URL(`${base}/withdraw/interactive`);
  const body = new URLSearchParams();
  body.set("account", request.account);
  body.set("asset_code", request.assetCode);
  if (request.assetIssuer) body.set("asset_issuer", request.assetIssuer);
  if (request.amount) body.set("amount", request.amount);
  if (request.walletUrl) body.set("wallet_url", request.walletUrl);
  if (request.language) body.set("lang", request.language);
  if (request.onChangeCallback) body.set("onchange_callback", request.onChangeCallback);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`SEP-24 withdrawal request failed (${response.status})${text ? `: ${text}` : ""}`);
  }
  const json = (await response.json()) as Sep24InteractiveResponse;
  if (!json.type) {
    throw new Error("SEP-24 withdrawal response missing type");
  }
  return json;
}

export async function fetchSep24Transaction(
  info: Sep24TomlInfo,
  transactionId: string,
): Promise<Sep24TransactionRecord> {
  if (!info.transferServerSep24) throw new Error("Missing transfer server for SEP-24");
  const base = info.transferServerSep24.replace(/\/+$/, "");
  const url = new URL(`${base}/transaction`);
  url.searchParams.set("id", transactionId);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch SEP-24 transaction ${transactionId} (${response.status})`);
  }
  const json = (await response.json()) as { transaction: Sep24TransactionRecord };
  if (!json.transaction) throw new Error("SEP-24 transaction response missing transaction");
  return json.transaction;
}

export interface PollSep24TransactionOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onUpdate?: (tx: Sep24TransactionRecord) => void;
  signal?: AbortSignal;
}

const TERMINAL_STATUSES = new Set([
  "completed",
  "refunded",
  "expired",
  "error",
  "no_market",
  "no_anchor",
  "pending_user",
]);

export async function pollSep24Transaction(
  info: Sep24TomlInfo,
  transactionId: string,
  options: PollSep24TransactionOptions = {},
): Promise<Sep24TransactionRecord> {
  const interval = options.intervalMs ?? 3000;
  const timeout = options.timeoutMs ?? 30 * 60 * 1000;
  const deadline = Date.now() + timeout;
  let last: Sep24TransactionRecord | undefined;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) throw new DOMException("Polling aborted", "AbortError");
    const tx = await fetchSep24Transaction(info, transactionId);
    last = tx;
    options.onUpdate?.(tx);
    if (TERMINAL_STATUSES.has(tx.status)) return tx;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  if (last) return last;
  throw new Error(`Timed out polling SEP-24 transaction ${transactionId}`);
}

export function getSep24HorizonUrl(networkPassphrase: string): string {
  return networkPassphrase === Networks.PUBLIC_NETWORK
    ? HORIZON_URLS.public
    : HORIZON_URLS.testnet;
}
