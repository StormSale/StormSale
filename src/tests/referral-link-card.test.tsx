// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ReferralLinkCard } from "../components/affiliate/ReferralLinkCard";
import { NotificationProvider } from "../context/NotificationContext";

const VALID_ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const INVALID_ADDRESS = "NOT-A-VALID-ADDRESS";

const mockWeb3State = {
  current: {
    isConnected: true,
    userAddress: VALID_ADDRESS,
  },
};

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: () => mockWeb3State.current,
}));

/**
 * Helper to render ReferralLinkCard inside the NotificationProvider.
 */
function renderCard() {
  return render(
    <NotificationProvider>
      <ReferralLinkCard />
    </NotificationProvider>,
  );
}

describe("ReferralLinkCard Component (#216)", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
    mockWeb3State.current = {
      isConnected: true,
      userAddress: VALID_ADDRESS,
    };
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  it("renders referral link card with derived URL when connected with valid address", () => {
    renderCard();
    expect(screen.getByText("Your Referral Link")).toBeTruthy();
    const linkEl = screen.getByTestId("referral-link");
    expect(linkEl.textContent).toBe(`${window.location.origin}/c/1?ref=${VALID_ADDRESS}`);
    const copyButton = screen.getByRole("button", { name: /copy link/i });
    expect((copyButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("successfully copies referral link to clipboard and displays Copied state", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    renderCard();
    const copyButton = screen.getByRole("button", { name: /copy link/i });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith(`${window.location.origin}/c/1?ref=${VALID_ADDRESS}`);
    expect(screen.getByRole("button", { name: /copied/i })).toBeTruthy();
  });

  it("shows error toast notification and does not enter copied state on copy failure", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("Clipboard access denied"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    renderCard();
    const copyButton = screen.getByRole("button", { name: /copy link/i });
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalled();
    expect(screen.getByText("Copy Failed")).toBeTruthy();
    expect(screen.getByText("Failed to copy referral link to clipboard.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /copied/i })).toBeNull();
    consoleErrorSpy.mockRestore();
  });

  it("disables copy button and empties link when address is invalid", () => {
    mockWeb3State.current = {
      isConnected: true,
      userAddress: INVALID_ADDRESS,
    };

    renderCard();
    const linkEl = screen.getByTestId("referral-link");
    expect(linkEl.textContent).toBe("");
    const copyButton = screen.getByRole("button", { name: /copy link/i });
    expect((copyButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Connect a wallet with a valid Stellar address")).toBeTruthy();
  });

  it("disables copy button and shows error message when wallet is disconnected", () => {
    mockWeb3State.current = {
      isConnected: false,
      userAddress: "",
    };

    renderCard();
    const linkEl = screen.getByTestId("referral-link");
    expect(linkEl.textContent).toBe("");
    const copyButton = screen.getByRole("button", { name: /copy link/i });
    expect((copyButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Connect a wallet with a valid Stellar address")).toBeTruthy();
  });
});
