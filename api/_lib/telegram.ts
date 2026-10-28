/**
 * Server-only Telegram helpers for the /api/telegram/* functions.
 *
 * Environment:
 *   TELEGRAM_BOT_TOKEN         — token from @BotFather (never exposed to the client)
 *   TELEGRAM_WEBHOOK_SECRET    — secret_token passed to setWebhook; checked on every update
 *   STORMSALE_CONTRACT_ID      — StormSale Soroban contract (falls back to VITE_STORMSALE_CONTRACT_ID)
 *   STELLAR_RPC_URL            — Soroban RPC used to confirm sales and read campaign terms
 *                                (falls back to VITE_STELLAR_RPC_URL, then the public testnet RPC)
 *   STELLAR_NETWORK_PASSPHRASE — network passphrase for read-only simulations
 *                                (falls back to VITE_STELLAR_NETWORK_PASSPHRASE, then testnet)
 */
import { timingSafeEqual } from "node:crypto";
import {
  Account,
  BASE_FEE,
  Contract,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import type { TelegramSender } from "../../src/lib/telegramAlerts";

const TELEGRAM_TIMEOUT_MS = 8_000;
const RPC_TIMEOUT_MS = 8_000;
const DEFAULT_RPC_URL = "https://soroban-testnet.stellar.org";
const DEFAULT_PASSPHRASE = "Test SDF Network ; September 2015";
/** Any funded-or-not G-address works as the source of a read-only simulation. */
const SIMULATION_SOURCE = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function getTelegramSender(): TelegramSender {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return async (chatId, html) => {
    try {
      const res = await fetchWithTimeout(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: html,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        },
        TELEGRAM_TIMEOUT_MS,
      );
      return res.ok;
    } catch {
      return false;
    }
  };
}

/** Constant-time comparison for the webhook secret header. */
export function secretsMatch(received: unknown, expected: string | undefined): boolean {
  if (!expected || typeof received !== "string") return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Best-effort caller address for rate limiting (Vercel sets x-forwarded-for). */
export function clientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

/** The configured StormSale contract id, or null when it is missing or malformed. */
export function getContractId(): string | null {
  const id = process.env.STORMSALE_CONTRACT_ID || process.env.VITE_STORMSALE_CONTRACT_ID;
  return id && StrKey.isValidContract(id) ? id : null;
}

function rpcUrl(): string {
  return process.env.STELLAR_RPC_URL || process.env.VITE_STELLAR_RPC_URL || DEFAULT_RPC_URL;
}

async function rpcCall<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
  const res = await fetchWithTimeout(
    rpcUrl(),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    },
    RPC_TIMEOUT_MS,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { result?: T };
  return data.result ?? null;
}

export interface ConfirmedTransaction {
  envelopeXdr: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Look up `txHash` on Soroban RPC. Returns its envelope only when the ledger
 * reports SUCCESS. NOT_FOUND is retried briefly because the advertiser's
 * client calls this right after the transaction is confirmed.
 */
export async function fetchConfirmedTransaction(
  txHash: string,
  { attempts = 3, delayMs = 1_000 }: { attempts?: number; delayMs?: number } = {},
): Promise<ConfirmedTransaction | null> {
  if (!/^[0-9a-f]{64}$/i.test(txHash)) return null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await rpcCall<{ status?: string; envelopeXdr?: string }>("getTransaction", {
      hash: txHash.toLowerCase(),
    });
    if (result?.status === "SUCCESS" && typeof result.envelopeXdr === "string") {
      return { envelopeXdr: result.envelopeXdr };
    }
    if (result?.status !== "NOT_FOUND" || attempt === attempts) return null;
    await sleep(delayMs);
  }
  return null;
}

/**
 * Read a campaign's commission rate (basis points) with a read-only
 * `get_campaign` simulation. Returns null if the campaign cannot be read.
 */
export async function fetchCommissionRateBps(
  contractId: string,
  campaignId: number,
): Promise<number | null> {
  const passphrase =
    process.env.STELLAR_NETWORK_PASSPHRASE ||
    process.env.VITE_STELLAR_NETWORK_PASSPHRASE ||
    DEFAULT_PASSPHRASE;
  const tx = new TransactionBuilder(new Account(SIMULATION_SOURCE, "0"), {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(
      new Contract(contractId).call("get_campaign", nativeToScVal(campaignId, { type: "u32" })),
    )
    .setTimeout(30)
    .build();
  try {
    const result = await rpcCall<{ results?: { xdr?: string }[]; error?: string }>(
      "simulateTransaction",
      { transaction: tx.toXDR() },
    );
    const retval = result?.error ? undefined : result?.results?.[0]?.xdr;
    if (!retval) return null;
    const campaign = scValToNative(xdr.ScVal.fromXDR(retval, "base64")) as {
      commission_rate?: unknown;
    } | null;
    const rate = campaign?.commission_rate;
    return typeof rate === "number" && Number.isInteger(rate) && rate >= 0 && rate <= 10_000
      ? rate
      : null;
  } catch {
    return null;
  }
}
