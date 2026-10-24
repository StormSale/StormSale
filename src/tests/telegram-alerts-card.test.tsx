// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const web3 = { userAddress: "GABC" as string | null, connectorType: "freighter" as string | null };
vi.mock("../context/Web3Context", () => ({ useWeb3: () => web3 }));
vi.mock("../lib/telegramClient", () => ({
  fetchTelegramStatus: vi.fn(),
  requestTelegramConnectLink: vi.fn(),
  updateTelegramAlerts: vi.fn(),
}));

import { TelegramAlertsCard } from "../components/affiliate/TelegramAlertsCard";
import {
  fetchTelegramStatus,
  requestTelegramConnectLink,
  updateTelegramAlerts,
} from "../lib/telegramClient";

const off = { connected: false, muted: false, connectedAt: null };
const on = { connected: true, muted: false, connectedAt: "2026-10-24T00:00:00Z" };

beforeEach(() => {
  web3.userAddress = "GABC";
  web3.connectorType = "freighter";
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TelegramAlertsCard", () => {
  it("shows a one-click connect button that opens the bot deep link", async () => {
    vi.mocked(fetchTelegramStatus).mockResolvedValue(off);
    vi.mocked(requestTelegramConnectLink).mockResolvedValue("https://t.me/StormSaleBot?start=tok");
    const openLink = vi.fn();
    render(<TelegramAlertsCard openLink={openLink} />);
    expect(screen.getByText("Connect Telegram Alerts")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Connect Telegram/ }));
    await waitFor(() =>
      expect(openLink).toHaveBeenCalledWith("https://t.me/StormSaleBot?start=tok"),
    );
    expect(screen.getByText("Open @StormSaleBot").getAttribute("href")).toContain("start=tok");
    vi.mocked(fetchTelegramStatus).mockResolvedValue(on);
    fireEvent.click(screen.getByText("I've connected"));
    expect(await screen.findByTestId("telegram-status")).toBeTruthy();
  });

  it("mutes, unmutes and disconnects", async () => {
    vi.mocked(fetchTelegramStatus).mockResolvedValue(on);
    vi.mocked(updateTelegramAlerts).mockResolvedValueOnce({ ...on, muted: true });
    render(<TelegramAlertsCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Mute alerts/ }));
    expect((await screen.findByTestId("telegram-status")).textContent).toContain("muted");
    vi.mocked(updateTelegramAlerts).mockResolvedValueOnce(on);
    fireEvent.click(screen.getByRole("button", { name: /Unmute alerts/ }));
    await screen.findByRole("button", { name: /Mute alerts/ });
    vi.mocked(updateTelegramAlerts).mockResolvedValueOnce(off);
    fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));
    expect(await screen.findByRole("button", { name: /Connect Telegram/ })).toBeTruthy();
    expect(vi.mocked(updateTelegramAlerts).mock.calls.map((c) => c[1])).toEqual([
      "mute",
      "unmute",
      "disconnect",
    ]);
  });

  it("shows errors from the server", async () => {
    vi.mocked(fetchTelegramStatus).mockRejectedValue(new Error("down"));
    render(<TelegramAlertsCard />);
    expect((await screen.findByRole("alert")).textContent).toBe("down");
  });

  it("shows action errors", async () => {
    vi.mocked(fetchTelegramStatus).mockResolvedValue(off);
    vi.mocked(requestTelegramConnectLink).mockRejectedValue(new Error("rejected"));
    render(<TelegramAlertsCard openLink={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Connect Telegram/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("rejected");
  });

  it("asks for a wallet, or for Freighter when the wallet can't sign", () => {
    web3.userAddress = null;
    const { rerender } = render(<TelegramAlertsCard />);
    expect(screen.getByText(/Connect your wallet/)).toBeTruthy();
    web3.userAddress = "GABC";
    web3.connectorType = "ledger";
    vi.mocked(fetchTelegramStatus).mockResolvedValue(off);
    rerender(<TelegramAlertsCard />);
    expect(screen.getByText(/Freighter signature/)).toBeTruthy();
  });
});
