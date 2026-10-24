import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@stellar/freighter-api", () => ({ signMessage: vi.fn() }));

import { signMessage } from "@stellar/freighter-api";
import {
  fetchTelegramStatus,
  freighterSigner,
  notifyTelegramConversion,
  requestTelegramConnectLink,
  signOwnership,
  updateTelegramAlerts,
} from "../lib/telegramClient";

const W = "GABC";
const signer = vi.fn(async () => "c2ln");
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("telegramClient", () => {
  it("signs the ownership message with the given clock", async () => {
    const proof = await signOwnership("mute", W, signer, () => 42);
    expect(proof).toEqual({ wallet: W, action: "mute", timestamp: 42, signature: "c2ln" });
    expect(signer).toHaveBeenCalledWith("StormSale Telegram alerts: mute for GABC at 42", W);
  });

  it("uses Freighter signMessage and handles both response shapes", async () => {
    vi.mocked(signMessage).mockResolvedValueOnce({ signedMessage: "YQ==", signerAddress: W });
    expect(await freighterSigner("m", W)).toBe("YQ==");
    vi.mocked(signMessage).mockResolvedValueOnce({
      signedMessage: Buffer.from("a"),
      signerAddress: W,
    } as never);
    expect(await freighterSigner("m", W)).toBe("YQ==");
    vi.mocked(signMessage).mockResolvedValueOnce({ signedMessage: null, signerAddress: W });
    await expect(freighterSigner("m", W)).rejects.toThrow("rejected");
  });

  it("fetches status and surfaces server errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ connected: true, muted: false }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchTelegramStatus(W)).toMatchObject({ connected: true });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/telegram/settings?wallet=GABC");
    fetchMock.mockResolvedValueOnce(json({ error: "nope" }, false));
    await expect(fetchTelegramStatus(W)).rejects.toThrow("nope");
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => Promise.reject(new Error("x")),
    });
    await expect(fetchTelegramStatus(W)).rejects.toThrow("Could not load");
  });

  it("posts a signed proof to get the deep link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ deepLink: "https://t.me/StormSaleBot?start=x" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestTelegramConnectLink(W, signer)).toContain("t.me/StormSaleBot");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ wallet: W, action: "connect", signature: "c2ln" });
    fetchMock.mockResolvedValueOnce(json({}));
    await expect(requestTelegramConnectLink(W, signer)).rejects.toThrow("Could not create");
  });

  it("posts signed mute/disconnect updates", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ connected: true, muted: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await updateTelegramAlerts(W, "mute", signer)).muted).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe("mute");
  });

  it("notifies conversions without ever throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ outcome: "sent" })));
    const notice = { affiliateWallet: W, txHash: "h", campaignName: "c", saleAmount: "1" };
    expect(await notifyTelegramConversion(notice)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    expect(await notifyTelegramConversion(notice)).toBe(false);
  });
});
