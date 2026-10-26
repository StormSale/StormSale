import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  alertKey,
  buildConnectDeepLink,
  buildOwnershipMessage,
  chatKey,
  claimOwnershipProof,
  commissionForSale,
  consumeRateLimit,
  createConnectToken,
  disconnect,
  escapeHtml,
  formatConversionAlert,
  formatStroops,
  getStatus,
  handleBotCommand,
  isValidConnectToken,
  linkKey,
  parseLogSaleTransaction,
  redeemConnectToken,
  sendConversionAlert,
  sep53Digest,
  setMuted,
  verifyOwnership,
  type TelegramStore,
} from "../lib/telegramAlerts";

class MemoryStore implements TelegramStore {
  data = new Map<string, unknown>();
  async get<T>(key: string) {
    return (this.data.has(key) ? this.data.get(key) : null) as T | null;
  }
  async set(key: string, value: unknown, opts?: { nx?: boolean }) {
    if (opts?.nx && this.data.has(key)) return null;
    this.data.set(key, value);
    return "OK";
  }
  async getdel<T>(key: string) {
    const value = await this.get<T>(key);
    this.data.delete(key);
    return value;
  }
  async del(key: string) {
    this.data.delete(key);
    return 1;
  }
  async incr(key: string) {
    const next = Number(this.data.get(key) ?? 0) + 1;
    this.data.set(key, next);
    return next;
  }
  expire = vi.fn(async () => 1);
}

let seed = 0;
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i + seed++) % 256);
const WALLET = Keypair.random();
const ADDR = WALLET.publicKey();
const toB64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));

function sign(kp: Keypair, action: "connect" | "mute", ts: number) {
  return toB64(
    kp.sign(Buffer.from(sep53Digest(buildOwnershipMessage(action, kp.publicKey(), ts)))),
  );
}

async function connected(store: MemoryStore, chatId = "111") {
  const { token } = await createConnectToken(store, ADDR, bytes);
  await redeemConnectToken(store, token, chatId);
  return token;
}

describe("connect tokens and deep link", () => {
  it("builds the official bot deep link from a URL-safe token", async () => {
    const store = new MemoryStore();
    const { token, deepLink, expiresIn } = await createConnectToken(store, ADDR, bytes);
    expect(isValidConnectToken(token)).toBe(true);
    expect(deepLink).toBe(`https://t.me/StormSaleBot?start=${token}`);
    expect(expiresIn).toBe(900);
  });

  it("rejects malformed tokens", () => {
    expect(isValidConnectToken("short")).toBe(false);
    expect(isValidConnectToken("a".repeat(20) + "!")).toBe(false);
    expect(isValidConnectToken(42)).toBe(false);
    expect(() => buildConnectDeepLink("bad token")).toThrow();
  });

  it("redeems a token once and binds the chat", async () => {
    const store = new MemoryStore();
    const token = await connected(store);
    expect(await getStatus(store, ADDR)).toMatchObject({ connected: true, muted: false });
    expect(await store.get(chatKey("111"))).toBe(ADDR);
    expect(await redeemConnectToken(store, token, "222")).toBeNull();
    expect(await redeemConnectToken(store, "not valid!", "222")).toBeNull();
  });

  it("drops the old chat when the wallet reconnects from a new chat", async () => {
    const store = new MemoryStore();
    await connected(store, "111");
    await connected(store, "222");
    expect(await store.get(chatKey("111"))).toBeNull();
    expect(await store.get(chatKey("222"))).toBe(ADDR);
  });
});

describe("wallet ownership proofs", () => {
  it("accepts a fresh SEP-53 signature for the right action", () => {
    const ts = 1_000_000;
    const proof = {
      wallet: ADDR,
      action: "connect" as const,
      timestamp: ts,
      signature: sign(WALLET, "connect", ts),
    };
    expect(verifyOwnership(proof, "connect", ts + 1000)).toBe(true);
  });

  it("rejects stale, mismatched, foreign or garbage signatures", () => {
    const ts = 1_000_000;
    const good = {
      wallet: ADDR,
      action: "connect" as const,
      timestamp: ts,
      signature: sign(WALLET, "connect", ts),
    };
    expect(verifyOwnership(good, "connect", ts + 6 * 60 * 1000)).toBe(false);
    expect(verifyOwnership(good, "mute", ts)).toBe(false);
    expect(
      verifyOwnership(
        { ...good, action: "mute", signature: sign(WALLET, "connect", ts) },
        "mute",
        ts,
      ),
    ).toBe(false);
    expect(
      verifyOwnership({ ...good, signature: sign(Keypair.random(), "connect", ts) }, "connect", ts),
    ).toBe(false);
    expect(verifyOwnership({ ...good, signature: "%%%" }, "connect", ts)).toBe(false);
    expect(verifyOwnership({ ...good, signature: toB64(new Uint8Array(10)) }, "connect", ts)).toBe(
      false,
    );
    expect(verifyOwnership({ ...good, wallet: "GBAD" }, "connect", ts)).toBe(false);
    expect(verifyOwnership({ ...good, timestamp: undefined }, "connect", ts)).toBe(false);
    expect(verifyOwnership({ ...good, signature: undefined }, "connect", ts)).toBe(false);
  });
});

describe("preferences", () => {
  it("mutes, unmutes and disconnects", async () => {
    const store = new MemoryStore();
    expect(await setMuted(store, ADDR, true)).toEqual({
      connected: false,
      muted: false,
      connectedAt: null,
    });
    await connected(store);
    expect((await setMuted(store, ADDR, true)).muted).toBe(true);
    expect((await setMuted(store, ADDR, false)).muted).toBe(false);
    expect(await disconnect(store, ADDR)).toMatchObject({ connected: false });
    expect(await store.get(linkKey(ADDR))).toBeNull();
    expect(await store.get(chatKey("111"))).toBeNull();
  });
});

describe("conversion alerts", () => {
  const alert = {
    campaignLabel: "Spring <Sale>",
    saleAmount: "120.5",
    commission: "12.05",
    asset: "XLM",
  };

  it("formats a celebratory HTML message and escapes user text", () => {
    const text = formatConversionAlert(alert);
    expect(text).toContain("🎉");
    expect(text).toContain("Spring &lt;Sale&gt;");
    expect(text).toContain("120.5 XLM");
    expect(text).toContain("💰 Commission earned: <b>12.05 XLM</b>");
    expect(formatConversionAlert({ ...alert, commission: null })).not.toContain("Commission");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("sends once per transaction and respects mute and disconnect", async () => {
    const store = new MemoryStore();
    const send = vi.fn().mockResolvedValue(true);
    expect(await sendConversionAlert(store, send, ADDR, "AB", alert)).toBe("not_connected");
    await connected(store);
    expect(await sendConversionAlert(store, send, ADDR, "AB", alert)).toBe("sent");
    expect(send).toHaveBeenCalledWith("111", expect.stringContaining("New sale"));
    expect(await sendConversionAlert(store, send, ADDR, "ab", alert)).toBe("duplicate");
    await setMuted(store, ADDR, true);
    expect(await sendConversionAlert(store, send, ADDR, "CD", alert)).toBe("muted");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("releases the claim when Telegram rejects the send so it can retry", async () => {
    const store = new MemoryStore();
    await connected(store);
    const send = vi.fn().mockResolvedValue(false);
    expect(await sendConversionAlert(store, send, ADDR, "EF", alert)).toBe("send_failed");
    expect(await store.get(alertKey("EF"))).toBeNull();
  });
});

describe("bot commands", () => {
  it("handles /start with and without a token", async () => {
    const store = new MemoryStore();
    expect(await handleBotCommand(store, "1", "/start")).toContain("Settings");
    const { token } = await createConnectToken(store, ADDR, bytes);
    expect(await handleBotCommand(store, "1", `/start ${token}`)).toContain("Connected");
    expect(await handleBotCommand(store, "1", `/start ${token}`)).toContain("expired");
  });

  it("handles /mute, /unmute, /stop and unknown commands", async () => {
    const store = new MemoryStore();
    expect(await handleBotCommand(store, "9", "/mute")).toContain("isn't connected");
    expect(await handleBotCommand(store, "9", "/stop")).toContain("isn't connected");
    await connected(store, "9");
    expect(await handleBotCommand(store, "9", "/mute")).toContain("muted");
    expect((await getStatus(store, ADDR)).muted).toBe(true);
    expect(await handleBotCommand(store, "9", "/unmute")).toContain("back on");
    expect(await handleBotCommand(store, "9", "hello")).toContain("Commands");
    expect(await handleBotCommand(store, "9", "/stop")).toContain("Disconnected");
    expect((await getStatus(store, ADDR)).connected).toBe(false);
  });
});

describe("rate limits and proof replay", () => {
  it("allows `limit` calls per window and sets the expiry once", async () => {
    const store = new MemoryStore();
    expect(await consumeRateLimit(store, "ip", 2, 60)).toBe(true);
    expect(await consumeRateLimit(store, "ip", 2, 60)).toBe(true);
    expect(await consumeRateLimit(store, "ip", 2, 60)).toBe(false);
    expect(store.expire).toHaveBeenCalledTimes(1);
    expect(store.expire).toHaveBeenCalledWith("tg:rl:ip", 60);
  });

  it("accepts each ownership signature once", async () => {
    const store = new MemoryStore();
    const proof = { wallet: ADDR, action: "mute" as const, timestamp: 1, signature: "sig" };
    expect(await claimOwnershipProof(store, proof)).toBe(true);
    expect(await claimOwnershipProof(store, proof)).toBe(false);
  });
});

describe("log_sale transactions", () => {
  const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 7));
  const OTHER = StrKey.encodeContract(Buffer.alloc(32, 9));
  const ADVERTISER = Keypair.random().publicKey();

  function envelope(contractId: string, fn: string, args: xdr.ScVal[], feeBump = false): string {
    const source = Keypair.random();
    const tx = new TransactionBuilder(new Account(source.publicKey(), "1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(contractId).call(fn, ...args))
      .setTimeout(30)
      .build();
    if (!feeBump) return tx.toEnvelope().toXDR("base64");
    return TransactionBuilder.buildFeeBumpTransaction(source, "200", tx, Networks.TESTNET)
      .toEnvelope()
      .toXDR("base64");
  }

  const saleArgs = (amount: bigint, affiliate = ADDR) => [
    new Address(ADVERTISER).toScVal(),
    nativeToScVal(4, { type: "u32" }),
    new Address(affiliate).toScVal(),
    nativeToScVal(amount, { type: "i128" }),
  ];

  it("reads the affiliate, campaign and amount from the contract call", () => {
    const expected = { advertiser: ADVERTISER, campaignId: 4, affiliate: ADDR, amount: 1_234_567n };
    expect(
      parseLogSaleTransaction(envelope(CONTRACT, "log_sale", saleArgs(1_234_567n)), CONTRACT),
    ).toEqual(expected);
    expect(
      parseLogSaleTransaction(envelope(CONTRACT, "log_sale", saleArgs(1_234_567n), true), CONTRACT),
    ).toEqual(expected);
  });

  it("rejects other contracts, functions, malformed args and garbage", () => {
    expect(
      parseLogSaleTransaction(envelope(OTHER, "log_sale", saleArgs(10n)), CONTRACT),
    ).toBeNull();
    expect(
      parseLogSaleTransaction(envelope(CONTRACT, "claim_payout", saleArgs(10n)), CONTRACT),
    ).toBeNull();
    expect(
      parseLogSaleTransaction(envelope(CONTRACT, "log_sale", saleArgs(10n).slice(0, 3)), CONTRACT),
    ).toBeNull();
    expect(
      parseLogSaleTransaction(envelope(CONTRACT, "log_sale", saleArgs(0n)), CONTRACT),
    ).toBeNull();
    expect(
      parseLogSaleTransaction(envelope(CONTRACT, "log_sale", saleArgs(10n, OTHER)), CONTRACT),
    ).toBeNull();
    expect(parseLogSaleTransaction("not-xdr", CONTRACT)).toBeNull();
    const classic = new TransactionBuilder(new Account(ADVERTISER, "1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination: ADDR, asset: Asset.native(), amount: "1" }))
      .addOperation(Operation.uploadContractWasm({ wasm: Buffer.from([0, 97, 115, 109]) }))
      .setTimeout(30)
      .build();
    expect(parseLogSaleTransaction(classic.toEnvelope().toXDR("base64"), CONTRACT)).toBeNull();
  });

  it("computes the escrowed commission and formats stroops exactly", () => {
    expect(commissionForSale(1_000n, 500)).toBe(50n);
    expect(commissionForSale(10_000n, 1_000)).toBe(1_000n);
    expect(formatStroops(10_000n)).toBe("0.001");
    expect(formatStroops(1_000n)).toBe("0.0001");
    expect(formatStroops(1_205_000_000n)).toBe("120.5");
    expect(formatStroops(50_000_000n)).toBe("5");
    expect(formatStroops(-15_000_000n)).toBe("-1.5");
  });
});
