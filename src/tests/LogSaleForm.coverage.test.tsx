// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Keypair, StrKey } from "@stellar/stellar-sdk";

const web3 = vi.hoisted(() => ({ current: {} as any }));
const notification = vi.hoisted(() => ({ showNotification: vi.fn() }));
const cryptoMocks = vi.hoisted(() => ({
  generateAESKey: vi.fn(),
  encryptPayload: vi.fn(),
  wrapAESKey: vi.fn(),
  getPublicKeyForAddress: vi.fn(),
}));
const webhookMocks = vi.hoisted(() => ({
  triggerConversionPostback: vi.fn(),
  dispatchWebhookEvent: vi.fn(),
}));
const telegramMocks = vi.hoisted(() => ({ notifyTelegramConversion: vi.fn() }));
const stellarMocks = vi.hoisted(() => ({
  resolveRecipient: vi.fn(),
  resolveFederatedAddress: vi.fn(),
}));

vi.mock("../hooks/useWeb3", () => ({ useWeb3: () => web3.current }));
vi.mock("../context/NotificationContext", () => ({
  useNotification: () => notification,
}));
vi.mock("../lib/crypto", () => cryptoMocks);
vi.mock("../lib/webhookEngine", () => webhookMocks);
vi.mock("../lib/telegramClient", () => telegramMocks);
vi.mock("../lib/stellar", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    resolveRecipient: stellarMocks.resolveRecipient,
    resolveFederatedAddress: stellarMocks.resolveFederatedAddress,
  };
});

import { LogSaleForm } from "../components/advertiser/LogSaleForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ADVERTISER = Keypair.random().publicKey();
const AFFILIATE = Keypair.random().publicKey();
const CAMPAIGN = StrKey.encodeContract(Buffer.alloc(32, 3));

let container: HTMLDivElement;
let root: Root;

function inputByPlaceholder(placeholder: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
  if (!input) throw new Error(`Missing input: ${placeholder}`);
  return input;
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = container.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<LogSaleForm />);
  });
}

async function fill(affiliate = AFFILIATE, amount = "100.5") {
  setInput(inputByPlaceholder("Campaign ID (e.g. 1) or CCAMPAIGN... contract address"), CAMPAIGN);
  setInput(inputByPlaceholder("GAFFILIATE... or alice*stormsale.io"), affiliate);
  setInput(inputByPlaceholder("e.g., 100.50"), amount);
}

beforeEach(() => {
  vi.clearAllMocks();
  cryptoMocks.generateAESKey.mockResolvedValue("aes-key");
  cryptoMocks.encryptPayload.mockResolvedValue("encrypted-payload");
  cryptoMocks.getPublicKeyForAddress.mockResolvedValue("public-key");
  cryptoMocks.wrapAESKey
    .mockResolvedValueOnce("advertiser-wrapped")
    .mockResolvedValueOnce("affiliate-wrapped");
  webhookMocks.triggerConversionPostback.mockResolvedValue([{ id: "hook-1" }]);
  webhookMocks.dispatchWebhookEvent.mockReturnValue(undefined);
  telegramMocks.notifyTelegramConversion.mockResolvedValue("sent");
  stellarMocks.resolveRecipient.mockResolvedValue({ status: "federated", address: AFFILIATE });
  stellarMocks.resolveFederatedAddress.mockResolvedValue({
    accountId: AFFILIATE,
    federatedAddress: "alice*stormsale.io",
  });
  web3.current = {
    getCampaignContract: vi.fn(() => ({
      logEncryptedSale: vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) }),
    })),
    userAddress: ADVERTISER,
  };
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
});

describe("LogSaleForm coverage", () => {
  it("rejects incomplete submissions", async () => {
    await render();
    await submit();

    expect(container.textContent).toContain("Must be a valid");
    expect(cryptoMocks.generateAESKey).not.toHaveBeenCalled();
  });

  it("requires a connected wallet", async () => {
    web3.current.userAddress = null;
    await render();
    await fill();
    await submit();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Wallet Not Connected" }),
    );
    expect(cryptoMocks.generateAESKey).not.toHaveBeenCalled();
  });

  it("encrypts the sale, logs it on-chain, and dispatches webhooks", async () => {
    const logEncryptedSale = vi.fn().mockResolvedValue({ wait: vi.fn().mockResolvedValue({}) });
    web3.current.getCampaignContract.mockReturnValue({ logEncryptedSale });

    await render();
    await fill();
    await submit();

    expect(logEncryptedSale).toHaveBeenCalledWith(
      AFFILIATE,
      "100.5",
      "encrypted-payload",
      "advertiser-wrapped",
      "affiliate-wrapped",
    );
    expect(webhookMocks.triggerConversionPostback).toHaveBeenCalledWith(
      expect.objectContaining({ affiliateAddress: AFFILIATE, campaignAddress: CAMPAIGN }),
    );
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Webhooks Dispatched" }),
    );
    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Sale Logged Successfully!" }),
    );
  });

  it("resolves a federation address on submit", async () => {
    await render();
    await fill("alice*stormsale.io");
    await submit();

    expect(stellarMocks.resolveRecipient).toHaveBeenCalledWith("alice*stormsale.io");
    expect(cryptoMocks.getPublicKeyForAddress).toHaveBeenCalledWith(AFFILIATE);
  });

  it("blocks submission when the recipient cannot be resolved", async () => {
    stellarMocks.resolveRecipient.mockResolvedValue({
      status: "unresolved",
      error: "lookup failed",
    });

    await render();
    await fill("alice*stormsale.io");
    await submit();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Recipient Not Verified", message: "lookup failed" }),
    );
    expect(cryptoMocks.generateAESKey).not.toHaveBeenCalled();
  });

  it("warns when webhook dispatch fails after the sale is confirmed", async () => {
    webhookMocks.triggerConversionPostback.mockRejectedValue(new Error("hook down"));

    await render();
    await fill();
    await submit();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Postback Notice" }),
    );
  });

  it("surfaces contract failures", async () => {
    web3.current.getCampaignContract.mockReturnValue({
      logEncryptedSale: vi.fn().mockRejectedValue(new Error("simulation failed")),
    });

    await render();
    await fill();
    await submit();

    expect(notification.showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Logging Failed", message: "simulation failed" }),
    );
  });
  describe("Telegram conversion alerts", () => {
    const HASH = "ab".repeat(32);
    const confirmWith = (txHash: string) =>
      web3.current.getCampaignContract.mockReturnValue({
        logEncryptedSale: vi.fn().mockResolvedValue({
          wait: vi.fn().mockResolvedValue({ txHash }),
        }),
      });

    it("asks the server to alert the affiliate with the confirmed hash only", async () => {
      confirmWith(HASH);
      await render();
      await fill();
      await submit();

      expect(telegramMocks.notifyTelegramConversion).toHaveBeenCalledWith(HASH);
      expect(notification.showNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "Telegram Alert Not Sent" }),
      );
    });

    it("skips the alert when there is no real transaction hash", async () => {
      await render();
      await fill();
      await submit();

      expect(telegramMocks.notifyTelegramConversion).not.toHaveBeenCalled();
    });

    it("warns the advertiser when the affiliate's alert could not be delivered", async () => {
      confirmWith(HASH);
      telegramMocks.notifyTelegramConversion.mockResolvedValue("send_failed");
      await render();
      await fill();
      await submit();

      expect(notification.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "warning", title: "Telegram Alert Not Sent" }),
      );
      expect(notification.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Sale Logged Successfully!" }),
      );
    });

    it("only logs request failures", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      confirmWith(HASH);
      telegramMocks.notifyTelegramConversion.mockResolvedValue("error");
      await render();
      await fill();
      await submit();

      expect(warn).toHaveBeenCalledWith("Telegram alert request failed.");
      expect(notification.showNotification).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: "Telegram Alert Not Sent" }),
      );
      warn.mockRestore();
    });
  });
});
