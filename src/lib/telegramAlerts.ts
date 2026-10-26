/**
 * Telegram commission alerts (issue #163): shared, framework-free logic.
 *
 * Used by the Vercel functions in `api/telegram/*`. The bot token never
 * appears here or anywhere in the browser bundle: sending goes through a
 * `TelegramSender` the server builds from `process.env.TELEGRAM_BOT_TOKEN`.
 */
import { Address, Keypair, StrKey, hash, scValToNative, xdr } from "@stellar/stellar-sdk";

export const TELEGRAM_BOT_USERNAME = "StormSaleBot";
export const CONNECT_TOKEN_TTL_SECONDS = 15 * 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Minimal key/value surface (a subset of @upstash/redis). */
export interface TelegramStore {
  get<T>(key: string): Promise<T | null>;
  /** Atomic read-and-delete, used so a connect token can only be redeemed once. */
  getdel<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number; nx?: boolean }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export type TelegramSender = (chatId: string, html: string) => Promise<boolean>;

export interface TelegramLink {
  chatId: string;
  muted: boolean;
  connectedAt: string;
}

export interface TelegramStatus {
  connected: boolean;
  muted: boolean;
  connectedAt: string | null;
}

export interface ConversionAlert {
  campaignLabel: string;
  saleAmount: string;
  commission?: string | null;
  asset: string;
}

export type OwnershipAction = "connect" | "mute" | "unmute" | "disconnect";
export const OWNERSHIP_MAX_AGE_MS = 5 * 60 * 1000;

export interface OwnershipProof {
  wallet: string;
  action: OwnershipAction;
  timestamp: number;
  /** Base64 SEP-53 signature from the wallet (Freighter `signMessage`). */
  signature: string;
}

/** The exact message the wallet signs to prove it owns `wallet`. */
export function buildOwnershipMessage(
  action: OwnershipAction,
  wallet: string,
  timestamp: number,
): string {
  return `StormSale Telegram alerts: ${action} for ${wallet} at ${timestamp}`;
}

/** SEP-53 digest: sha256("Stellar Signed Message:\n" + message). */
export function sep53Digest(message: string): Uint8Array {
  return hash(new TextEncoder().encode(`Stellar Signed Message:\n${message}`) as never);
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Verify a fresh, correctly signed ownership proof for the given action. */
export function verifyOwnership(
  proof: Partial<OwnershipProof>,
  expected: OwnershipAction,
  now: number = Date.now(),
): proof is OwnershipProof {
  if (proof.action !== expected || !isValidWallet(proof.wallet)) return false;
  if (
    typeof proof.timestamp !== "number" ||
    Math.abs(now - proof.timestamp) > OWNERSHIP_MAX_AGE_MS
  ) {
    return false;
  }
  if (typeof proof.signature !== "string") return false;
  const sig = base64ToBytes(proof.signature);
  if (!sig || sig.length !== 64) return false;
  const digest = sep53Digest(buildOwnershipMessage(expected, proof.wallet, proof.timestamp));
  try {
    return Keypair.fromPublicKey(proof.wallet).verify(digest as never, sig as never);
  } catch {
    return false;
  }
}

export const linkKey = (wallet: string) => `tg:wallet:${wallet}`;
export const tokenKey = (token: string) => `tg:token:${token}`;
export const chatKey = (chatId: string) => `tg:chat:${chatId}`;
export const alertKey = (txHash: string) => `tg:alert:${txHash.toLowerCase()}`;
export const proofKey = (signature: string) => `tg:proof:${signature}`;
export const rateLimitKey = (bucket: string) => `tg:rl:${bucket}`;

/**
 * Fixed-window rate limit. Returns true while `bucket` has made at most
 * `limit` calls in the current `windowSeconds` window.
 */
export async function consumeRateLimit(
  store: TelegramStore,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = rateLimitKey(bucket);
  const count = await store.incr(key);
  if (count === 1) await store.expire(key, windowSeconds);
  return count <= limit;
}

/**
 * Mark a verified ownership proof as used. A signature is accepted once, so a
 * captured request cannot be replayed inside its freshness window.
 */
export async function claimOwnershipProof(
  store: TelegramStore,
  proof: OwnershipProof,
): Promise<boolean> {
  const claimed = await store.set(proofKey(proof.signature), proof.wallet, {
    nx: true,
    ex: Math.ceil((OWNERSHIP_MAX_AGE_MS * 2) / 1000),
  });
  return claimed !== null;
}

export function isValidWallet(wallet: unknown): wallet is string {
  return typeof wallet === "string" && StrKey.isValidEd25519PublicKey(wallet.trim());
}

export function isValidConnectToken(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

export function buildConnectDeepLink(token: string): string {
  if (!isValidConnectToken(token)) throw new Error("Invalid Telegram connect token");
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`;
}

/** URL-safe random token (base64url, 32 bytes → 43 chars). */
export function generateConnectToken(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(32);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram HTML message for a confirmed conversion. */
export function formatConversionAlert(alert: ConversionAlert): string {
  const asset = escapeHtml(alert.asset);
  const lines = [
    "🎉 <b>New sale on StormSale!</b>",
    "",
    `📣 Campaign: <b>${escapeHtml(alert.campaignLabel)}</b>`,
    `🛒 Sale value: <b>${escapeHtml(alert.saleAmount)} ${asset}</b>`,
  ];
  if (alert.commission) {
    lines.push(`💰 Commission earned: <b>${escapeHtml(alert.commission)} ${asset}</b>`);
  }
  lines.push("", "🚀 Keep sharing your link!");
  return lines.join("\n");
}

export async function createConnectToken(
  store: TelegramStore,
  wallet: string,
  randomBytes: (n: number) => Uint8Array,
): Promise<{ token: string; deepLink: string; expiresIn: number }> {
  const token = generateConnectToken(randomBytes);
  await store.set(tokenKey(token), wallet, { ex: CONNECT_TOKEN_TTL_SECONDS, nx: true });
  return { token, deepLink: buildConnectDeepLink(token), expiresIn: CONNECT_TOKEN_TTL_SECONDS };
}

/** Bind a Telegram chat to the wallet that minted `token`. Single use. */
export async function redeemConnectToken(
  store: TelegramStore,
  token: string,
  chatId: string,
  now: () => Date = () => new Date(),
): Promise<string | null> {
  if (!isValidConnectToken(token)) return null;
  const wallet = await store.getdel<string>(tokenKey(token));
  if (!wallet) return null;
  const previous = await store.get<TelegramLink>(linkKey(wallet));
  if (previous && previous.chatId !== chatId) await store.del(chatKey(previous.chatId));
  const link: TelegramLink = { chatId, muted: false, connectedAt: now().toISOString() };
  await store.set(linkKey(wallet), link);
  await store.set(chatKey(chatId), wallet);
  return wallet;
}

export async function getStatus(store: TelegramStore, wallet: string): Promise<TelegramStatus> {
  const link = await store.get<TelegramLink>(linkKey(wallet));
  return link
    ? { connected: true, muted: link.muted, connectedAt: link.connectedAt }
    : { connected: false, muted: false, connectedAt: null };
}

export async function setMuted(
  store: TelegramStore,
  wallet: string,
  muted: boolean,
): Promise<TelegramStatus> {
  const link = await store.get<TelegramLink>(linkKey(wallet));
  if (!link) return { connected: false, muted: false, connectedAt: null };
  await store.set(linkKey(wallet), { ...link, muted });
  return { connected: true, muted, connectedAt: link.connectedAt };
}

export async function disconnect(store: TelegramStore, wallet: string): Promise<TelegramStatus> {
  const link = await store.get<TelegramLink>(linkKey(wallet));
  if (link) await store.del(chatKey(link.chatId));
  await store.del(linkKey(wallet));
  return { connected: false, muted: false, connectedAt: null };
}

export async function walletForChat(store: TelegramStore, chatId: string): Promise<string | null> {
  return store.get<string>(chatKey(chatId));
}

/** Stroops per whole unit of a 7-decimal Stellar asset. */
const STROOPS = 10_000_000n;

/** A `log_sale(advertiser, campaign_id, affiliate, amount)` call read from a transaction. */
export interface LoggedSale {
  advertiser: string;
  campaignId: number;
  affiliate: string;
  /** Sale amount in stroops, exactly as passed to the contract. */
  amount: bigint;
}

function envelopeOperations(envelope: xdr.TransactionEnvelope): readonly xdr.Operation[] {
  switch (envelope.type) {
    case "envelopeTypeTx":
      return envelope.v1.tx.operations;
    case "envelopeTypeTxFeeBump":
      return envelope.feeBump.tx.innerTx.v1.tx.operations;
    default:
      return [];
  }
}

/**
 * Find the StormSale `log_sale` invocation in a transaction envelope (base64
 * XDR). Returns null unless the transaction calls `log_sale` on `contractId`
 * with a well-formed advertiser, campaign id, wallet affiliate and amount.
 */
export function parseLogSaleTransaction(
  envelopeXdr: string,
  contractId: string,
): LoggedSale | null {
  let operations: readonly xdr.Operation[];
  try {
    operations = envelopeOperations(xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64"));
  } catch {
    return null;
  }
  for (const op of operations) {
    if (op.body.type !== "invokeHostFunction") continue;
    const fn = op.body.invokeHostFunctionOp.hostFunction;
    if (fn.type !== "hostFunctionTypeInvokeContract") continue;
    const call = fn.invokeContract;
    if (Address.fromScAddress(call.contractAddress).toString() !== contractId) continue;
    if (String(call.functionName) !== "log_sale") continue;
    if (call.args.length !== 4) return null;
    const [advertiser, campaignId, affiliate, amount] = call.args.map((arg) => scValToNative(arg));
    if (
      typeof advertiser !== "string" ||
      typeof campaignId !== "number" ||
      !isValidWallet(affiliate) ||
      typeof amount !== "bigint" ||
      amount <= 0n
    ) {
      return null;
    }
    return { advertiser, campaignId, affiliate, amount };
  }
  return null;
}

/** Commission the contract escrows for a sale: amount × rate / 10 000 (rate in basis points). */
export function commissionForSale(amount: bigint, commissionRateBps: number): bigint {
  return (amount * BigInt(commissionRateBps)) / 10_000n;
}

/** Format stroops as a decimal amount with up to 7 places, without float rounding. */
export function formatStroops(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS;
  const fraction = (abs % STROOPS).toString().padStart(7, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export type AlertOutcome = "sent" | "duplicate" | "not_connected" | "muted" | "send_failed";

/**
 * Send one alert per transaction hash. The hash is claimed with SET NX first,
 * so retries and replays of the same sale never message the affiliate twice.
 */
export async function sendConversionAlert(
  store: TelegramStore,
  send: TelegramSender,
  wallet: string,
  txHash: string,
  alert: ConversionAlert,
): Promise<AlertOutcome> {
  const link = await store.get<TelegramLink>(linkKey(wallet));
  if (!link) return "not_connected";
  if (link.muted) return "muted";
  const claimed = await store.set(alertKey(txHash), wallet, { nx: true, ex: 30 * 24 * 3600 });
  if (claimed === null) return "duplicate";
  const ok = await send(link.chatId, formatConversionAlert(alert));
  if (!ok) {
    await store.del(alertKey(txHash));
    return "send_failed";
  }
  return "sent";
}

/** Reply text for a bot command from Telegram, after applying its effect. */
export async function handleBotCommand(
  store: TelegramStore,
  chatId: string,
  text: string,
): Promise<string> {
  const [command, arg] = text.trim().split(/\s+/, 2);
  switch (command) {
    case "/start": {
      if (!arg)
        return "👋 Open StormSale → Settings → Connect Telegram Alerts to link your account.";
      const wallet = await redeemConnectToken(store, arg, chatId);
      return wallet
        ? "✅ Connected! You'll get a message here every time a referral converts. Send /mute to pause or /stop to disconnect."
        : "⚠️ That link has expired or was already used. Generate a new one from your StormSale settings.";
    }
    case "/mute":
    case "/unmute": {
      const wallet = await walletForChat(store, chatId);
      if (!wallet) return "This chat isn't connected to a StormSale account.";
      await setMuted(store, wallet, command === "/mute");
      return command === "/mute"
        ? "🔕 Alerts muted. Send /unmute to turn them back on."
        : "🔔 Alerts are back on.";
    }
    case "/stop": {
      const wallet = await walletForChat(store, chatId);
      if (!wallet) return "This chat isn't connected to a StormSale account.";
      await disconnect(store, wallet);
      return "👋 Disconnected. You won't receive any more alerts.";
    }
    default:
      return "Commands: /mute, /unmute, /stop";
  }
}
