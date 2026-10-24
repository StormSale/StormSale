// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AffiliateOverview } from "../components/affiliate/AffiliateOverview";

const mocks = vi.hoisted(() => ({
  useWeb3: vi.fn(),
  toDataURL: vi.fn(),
}));

vi.mock("../context/Web3Context", () => ({ useWeb3: mocks.useWeb3 }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.toDataURL } }));

describe("AffiliateOverview", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useWeb3.mockReturnValue({ userAddress: "Gaffiliate-wallet" });
    mocks.toDataURL.mockResolvedValue("data:image/png;base64,qr");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
      subtle: {
        generateKey: vi.fn().mockResolvedValue({}),
        encrypt: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
        exportKey: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders affiliate metrics and navigates through every quick action", () => {
    const onNavigate = vi.fn();
    render(<AffiliateOverview onNavigate={onNavigate} />);

    expect(screen.getByText("Affiliate Dashboard")).toBeTruthy();
    expect(screen.getByText("Recent Payouts")).toBeTruthy();
    expect(screen.getByText("Performance Tips")).toBeTruthy();
    expect(screen.getByText("Your QR code appears here")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Custom Short Links/ }));
    fireEvent.click(screen.getByRole("button", { name: /Join New Campaign/ }));
    fireEvent.click(screen.getByRole("button", { name: /Track Performance/ }));
    fireEvent.click(screen.getByRole("button", { name: /Withdraw Earnings/ }));
    expect(onNavigate.mock.calls).toEqual([
      ["custom-links"],
      ["join-campaign"],
      ["my-sales"],
      ["claim-payouts"],
    ]);
  });

  it("creates an encrypted link, displays the QR code, and handles clipboard feedback", async () => {
    render(<AffiliateOverview />);
    fireEvent.click(screen.getByRole("button", { name: "Generate link & QR code" }));
    expect(
      screen.getByText("Enter an affiliate wallet and campaign ID to create a link."),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Affiliate wallet"), {
      target: { value: "Gcustom-wallet" },
    });
    fireEvent.change(screen.getByLabelText("Campaign ID"), {
      target: { value: "campaign-42" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate link & QR code" }));
    await screen.findByAltText("QR code for encrypted affiliate tracking link");
    expect(screen.getByText("Encrypted link and QR code are ready.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Download QR/ }).getAttribute("download")).toBe(
      "stormsale-affiliate-qr.png",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy affiliate link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Link copied to clipboard.")).toBeTruthy();
  });

  it("reports secure-context, QR creation, and clipboard errors", async () => {
    const cryptoWithoutSubtle = {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
    };
    vi.stubGlobal("crypto", cryptoWithoutSubtle);
    render(<AffiliateOverview />);
    fireEvent.change(screen.getByLabelText("Campaign ID"), { target: { value: "campaign-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate link & QR code" }));
    await waitFor(() => expect(screen.getByText(/Use a secure \(HTTPS\) connection/)).toBeTruthy());

    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(1),
      subtle: {
        generateKey: vi.fn().mockResolvedValue({}),
        encrypt: vi.fn().mockResolvedValue(new Uint8Array([1]).buffer),
        exportKey: vi.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
    });
    mocks.toDataURL.mockRejectedValueOnce(new Error("QR unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Generate link & QR code" }));
    await waitFor(() => expect(screen.getByText(/Could not create your link/)).toBeTruthy());

    mocks.toDataURL.mockResolvedValueOnce("data:image/png;base64,qr");
    fireEvent.click(screen.getByRole("button", { name: "Generate link & QR code" }));
    await screen.findByAltText("QR code for encrypted affiliate tracking link");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy affiliate link" }));
    await waitFor(() =>
      expect(
        screen.getByText("Clipboard access is unavailable. Select and copy the link below."),
      ).toBeTruthy(),
    );
  });
});
