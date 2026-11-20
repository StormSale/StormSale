import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  NotificationProvider,
  useNotification,
  buildClaimSuccessNotification,
  ConfettiBurst,
} from "../context/NotificationContext";

const TestClaimTrigger = ({ onReceiptClick }: { onReceiptClick?: () => void }) => {
  const { notifyClaimSuccess, showNotification } = useNotification();

  return (
    <div>
      <button
        data-testid="trigger-claim-success"
        onClick={() =>
          notifyClaimSuccess({
            amountXlm: "150.00",
            txHash: "c7b52123490df1a88b14e39a174c8b2d3e9112998f4be63c7d64817a402367d0",
            campaignName: "Black Friday Sale",
            onViewReceipt: onReceiptClick,
          })
        }
      >
        Trigger Claim
      </button>

      <button
        data-testid="trigger-generic-claim"
        onClick={() =>
          showNotification({
            type: "success",
            title: "Commission Paid Out!",
            message: "Single claim settled on Stellar testnet.",
            confetti: true,
            receiptUrl: "https://stellar.expert/explorer/testnet/tx/abc123",
            actionLabel: "View Receipt",
            onViewReceipt: onReceiptClick,
          })
        }
      >
        Trigger Generic Claim
      </button>
    </div>
  );
};

describe("[Affiliate] Claim Confirmation & Reward Toasts Suite (#53)", () => {
  it("builds a structured claim confirmation notification with confetti and receipt button", () => {
    const notif = buildClaimSuccessNotification({
      amountXlm: "250.50",
      txHash: "e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2",
      campaignName: "Crypto Summit",
    });

    expect(notif.type).toBe("success");
    expect(notif.title).toBe("Commission Claim Confirmed!");
    expect(notif.message).toContain("250.50 XLM");
    expect(notif.message).toContain("Crypto Summit");
    expect(notif.confetti).toBe(true);
    expect(notif.actionLabel).toBe("View Receipt");
    expect(notif.receiptUrl).toContain("stellar.expert/explorer/testnet/tx/");
    expect(notif.receiptTxHash).toBe(
      "e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2e6571a2",
    );
  });

  it("renders ConfettiBurst celebratory animation component", () => {
    render(<ConfettiBurst />);
    const confettiEl = screen.getByTestId("toast-confetti-animation");
    expect(confettiEl).toBeTruthy();
  });

  it("displays celebratory toast with confetti and View Receipt button on claim success", () => {
    const receiptSpy = vi.fn();

    render(
      <NotificationProvider>
        <TestClaimTrigger onReceiptClick={receiptSpy} />
      </NotificationProvider>,
    );

    const triggerBtn = screen.getByTestId("trigger-claim-success");
    fireEvent.click(triggerBtn);

    // Toast title & message rendered
    expect(screen.getByText("Commission Claim Confirmed!")).toBeTruthy();
    expect(screen.getByText(/150.00 XLM/)).toBeTruthy();

    // Confetti animation active
    expect(screen.getByTestId("toast-confetti-animation")).toBeTruthy();

    // View Receipt button present
    const receiptBtn = screen.getByTestId("toast-view-receipt-btn");
    expect(receiptBtn).toBeTruthy();
    expect(receiptBtn.getAttribute("target")).toBe("_blank");
    expect(receiptBtn.getAttribute("href")).toContain("stellar.expert");

    // Clicking View Receipt calls callback
    fireEvent.click(receiptBtn);
    expect(receiptSpy).toHaveBeenCalledTimes(1);
  });

  it("handles generic claim notifications with confetti and receipt action", () => {
    const receiptSpy = vi.fn();

    render(
      <NotificationProvider>
        <TestClaimTrigger onReceiptClick={receiptSpy} />
      </NotificationProvider>,
    );

    const triggerBtn = screen.getByTestId("trigger-generic-claim");
    fireEvent.click(triggerBtn);

    expect(screen.getByText("Commission Paid Out!")).toBeTruthy();
    expect(screen.getByTestId("toast-confetti-animation")).toBeTruthy();

    const receiptBtn = screen.getByTestId("toast-view-receipt-btn");
    expect(receiptBtn.getAttribute("href")).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc123",
    );
  });

  it("omits View Receipt action when no receipt URL or callback is available", () => {
    const notif = buildClaimSuccessNotification({
      amountXlm: "50.00",
    });

    expect(notif.actionLabel).toBeUndefined();
    expect(notif.receiptUrl).toBeUndefined();
    expect(notif.confetti).toBe(true);
    expect(notif.message).toContain("50.00 XLM");
  });

  it("resolves receiptUrl from actionUrl fallback when receiptTxHash and receiptUrl are absent", () => {
    const TestActionUrlFallback = () => {
      const { showNotification } = useNotification();
      return (
        <button
          data-testid="trigger-fallback"
          onClick={() =>
            showNotification({
              type: "success",
              title: "Claim Fallback",
              message: "Testing actionUrl fallback",
              actionLabel: "View Receipt",
              actionUrl: "https://custom-receipt.stellar.org/tx/999",
            })
          }
        >
          Fallback
        </button>
      );
    };

    render(
      <NotificationProvider>
        <TestActionUrlFallback />
      </NotificationProvider>,
    );

    fireEvent.click(screen.getByTestId("trigger-fallback"));
    const receiptBtn = screen.getByTestId("toast-view-receipt-btn");
    expect(receiptBtn.getAttribute("href")).toBe("https://custom-receipt.stellar.org/tx/999");
  });
});
