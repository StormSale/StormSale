// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useEffect } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("../components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => open ? <div data-testid="mock-dialog">{children}</div> : null,
  DialogContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogTitle: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogDescription: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogFooter: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

vi.mock("../config/stellar", () => ({
  STELLAR_CONFIG: {
    network: "TESTNET",
    networkPassphrase: "Test SDF Network ; September 2015",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
    contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    nativeAsset: "XLM",
    nativeDecimals: 7,
  },
  ISSUERS: {
    TESTNET: { USDC: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", EURC: "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO" },
    PUBLIC: { USDC: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", EURC: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2" },
  },
  NETWORK_ESCROW_ASSETS: {
    TESTNET: { USDC: { contractAddress: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" } },
    PUBLIC: { USDC: { contractAddress: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75", issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" } },
  },
  ESCROW_ASSETS: [],
  SUPPORTED_ESCROW_ASSETS: [],
  getSupportedEscrowAssets: vi.fn().mockReturnValue([]),
  getEscrowAssetByCode: vi.fn(),
}));
import { getStellarExplorerLink } from "../utils/network";
import {
  isRewardTitle,
  NotificationProvider,
  useNotification,
  NotificationWrapper,
  withNotification,
  ToastItem,
  ReceiptModal,
  NotificationContainer,
  evaluateCampaignEscrowLevel,
  buildLowEscrowNotification,
  type Notification,
  type NotificationReceipt,
} from "../context/NotificationContext";
import { Confetti } from "../components/shared/Confetti";

describe("Affiliate Claim Confirmation & Reward Toasts Suite (#53)", () => {
  describe("Receipt Data Modeling & Explorer Link Integration", () => {
    it("generates correct Stellar Expert explorer URL for claim transaction receipts", () => {
      const mockTxHash = "e2d8479e0a811c759f2a969df2011b6fa2e7dcb46a9a3b6db4237f37f3a8b412";
      const receiptUrl = getStellarExplorerLink("tx", mockTxHash);

      expect(receiptUrl).toBe(`https://stellar.expert/explorer/testnet/tx/${mockTxHash}`);
    });

    it("creates complete NotificationReceipt payload for commission payout claims", () => {
      const receipt: NotificationReceipt = {
        txHash: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        amount: "25.0 XLM",
        saleId: 2,
        campaign: "CB4RN8XJLP8M1K3V6P7...",
        date: "10/15/2026, 4:30:00 PM",
        explorerUrl:
          "https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        confirmed: true,
      };

      expect(receipt.txHash).toHaveLength(64);
      expect(receipt.amount).toContain("XLM");
      expect(receipt.saleId).toBe(2);
      expect(receipt.explorerUrl).toContain("stellar.expert");
      expect(receipt.confirmed).toBe(true);
    });
  });

  describe("Claim Confirmation Notification Structure", () => {
    it("supports confetti flag and receipt metadata in notification objects", () => {
      const notification: Notification = {
        id: "test-claim-notif",
        type: "success",
        title: "Commission Paid Out!",
        message: "Settled on Stellar ledger. Tx: e2d8479e0a...",
        confetti: true,
        receiptUrl: "https://stellar.expert/explorer/testnet/tx/e2d8479e0a...",
        receipt: {
          txHash: "e2d8479e0a811c759f2a969df2011b6fa2e7dcb46a9a3b6db4237f37f3a8b412",
          amount: "10.0 XLM",
          saleId: 1,
          confirmed: true,
        },
      };

      expect(notification.confetti).toBe(true);
      expect(notification.receipt).toBeDefined();
      expect(notification.receipt?.amount).toBe("10.0 XLM");
      expect(notification.receiptUrl).toBeDefined();
    });

    it("correctly identifies reward/claim toast characteristics using exported isRewardTitle", () => {
      expect(isRewardTitle("Commission Paid Out!")).toBe(true);
      expect(isRewardTitle("commission earned")).toBe(true);
      expect(isRewardTitle("Claim Successful")).toBe(true);
      expect(isRewardTitle("CLAIM PROCESSED")).toBe(true);
      expect(isRewardTitle("Payout Settled")).toBe(true);
      expect(isRewardTitle("Reward Unlocked")).toBe(true);
      expect(isRewardTitle("Normal Information")).toBe(false);
      expect(isRewardTitle("System Error")).toBe(false);
    });
  });

  describe("Escrow Evaluation Helpers in NotificationContext", () => {
    it("evaluates low escrow levels accurately", () => {
      const normal = evaluateCampaignEscrowLevel({
        id: "1",
        name: "Test Campaign",
        escrowInitial: 1000,
        escrowBalance: 500,
      });
      expect(normal.isLowEscrow).toBe(false);
      expect(normal.percentageRemaining).toBe(50);

      const low = evaluateCampaignEscrowLevel({
        id: "2",
        name: "Low Campaign",
        escrowInitial: 1000,
        escrowBalance: 50,
      });
      expect(low.isLowEscrow).toBe(true);
      expect(low.percentageRemaining).toBe(5);

      const completed = evaluateCampaignEscrowLevel({
        id: "3",
        name: "Done Campaign",
        escrowInitial: 1000,
        escrowBalance: 20,
        status: "Completed",
      });
      expect(completed.isLowEscrow).toBe(false);
    });

    it("builds low escrow notification correctly", () => {
      const notif = buildLowEscrowNotification({
        campaignName: "Promo #1",
        remainingXlm: 80,
        percentageRemaining: 8,
        campaignId: "camp-123",
      });

      expect(notif.type).toBe("warning");
      expect(notif.title).toContain("Low Escrow Alert");
      expect(notif.persistent).toBe(true);
      expect(notif.actionLabel).toBe("Top Up Escrow");
    });
  });

  describe("ReceiptModal Component Rendering & Ledger State", () => {
    it("returns null when receipt is null", () => {
      const html = renderToString(<ReceiptModal receipt={null} isOpen={true} onClose={vi.fn()} />);
      expect(html).toBe("");
    });

    it("renders confirmed receipt with Soroban settlement badge and explorer link", () => {
      const receipt: NotificationReceipt = {
        txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        amount: "50.00 XLM",
        saleId: 42,
        campaign: "Spring Launch SuperSale",
        date: "2026-10-21 12:00:00",
        confirmed: true,
      };

      const html = renderToString(<ReceiptModal receipt={receipt} isOpen={true} onClose={vi.fn()} />);
      expect(html).toContain("Commission Payout Receipt");
      expect(html).toContain("Settled on Soroban Smart Contract");
      expect(html).toContain("Confirmed");
      expect(html).toContain("50.00 XLM");
      expect(html.replace(/<!-- -->/g, "")).toContain("#42");
      expect(html).toContain("Spring Launch SuperSale");
      expect(html).toContain("View in Stellar Expert");
      expect(html).toContain("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890");
    });

    it("renders unconfirmed receipt with simulated badge", () => {
      const receipt: NotificationReceipt = {
        amount: "15.00 XLM",
        campaign: "Mock Campaign",
        confirmed: false,
      };

      const html = renderToString(<ReceiptModal receipt={receipt} isOpen={true} onClose={vi.fn()} />);
      expect(html).toContain("Simulated / Unconfirmed");
      expect(html).toContain("Simulated");
      expect(html).toContain("15.00 XLM");
    });
  });

  describe("ToastItem Component Rendering", () => {
    it("renders success toast with View Receipt button", () => {
      const notification: Notification = {
        id: "toast-1",
        type: "success",
        title: "Commission Paid Out!",
        message: "Settled on Soroban smart contract.",
        receipt: {
          txHash: "0x123",
          amount: "10 XLM",
          confirmed: true,
        },
      };

      const html = renderToString(
        <ToastItem notification={notification} onDismiss={vi.fn()} onReceiptClick={vi.fn()} />,
      );

      expect(html).toContain("Commission Paid Out!");
      expect(html).toContain("Settled on Soroban smart contract.");
      expect(html).toContain("View Receipt");
      expect(html).toContain("On-chain Verified");
    });

    it("renders error, warning, info, and pending notification types with progress bar", () => {
      const types: Notification["type"][] = ["success", "error", "warning", "info", "pending"];
      for (const t of types) {
        const notif: Notification = {
          id: `toast-${t}`,
          type: t,
          title: `Plain Title ${t}`,
          message: `Message for ${t}`,
          duration: 3000,
        };
        const html = renderToString(<ToastItem notification={notif} onDismiss={vi.fn()} />);
        expect(html).toContain(`Plain Title ${t}`);
        expect(html).toContain(`Message for ${t}`);
        expect(html).toContain("toast-progress-bar");
      }

      // Default/fallback branch
      const unknownNotif = {
        id: "toast-unknown",
        type: "unknown" as any,
        title: "Unknown type",
        duration: 3000,
      };
      const htmlUnknown = renderToString(<ToastItem notification={unknownNotif} onDismiss={vi.fn()} />);
      expect(htmlUnknown).toContain("Unknown type");
    });

    it("renders action button and action anchor link", () => {
      const buttonNotif: Notification = {
        id: "btn-notif",
        type: "warning",
        title: "Action Required",
        actionLabel: "Click Me",
        onAction: vi.fn(),
      };
      const htmlBtn = renderToString(<ToastItem notification={buttonNotif} onDismiss={vi.fn()} />);
      expect(htmlBtn).toContain("Click Me");

      const linkNotif: Notification = {
        id: "link-notif",
        type: "info",
        title: "Link Available",
        actionLabel: "Visit Site",
        actionUrl: "https://stellar.org",
      };
      const htmlLink = renderToString(<ToastItem notification={linkNotif} onDismiss={vi.fn()} />);
      expect(htmlLink).toContain("Visit Site");
      expect(htmlLink).toContain('href="https://stellar.org"');
    });
  });

  describe("NotificationProvider & Context Hooks", () => {
    it("renders children with NotificationProvider and NotificationWrapper", () => {
      const html = renderToString(
        <NotificationProvider>
          <div data-testid="child-content">Child Content Inside Provider</div>
        </NotificationProvider>,
      );
      expect(html).toContain("Child Content Inside Provider");

      const wrapperHtml = renderToString(
        <NotificationWrapper>
          <span>Wrapped Content</span>
        </NotificationWrapper>,
      );
      expect(wrapperHtml).toContain("Wrapped Content");
    });

    it("works with withNotification HOC", () => {
      const InnerComp: React.FC<{ text: string }> = ({ text }) => <div>{text}</div>;
      const EnhancedComp = withNotification(InnerComp);

      const html = renderToString(<EnhancedComp text="HOC Wrapped Text" />);
      expect(html).toContain("HOC Wrapped Text");
    });

    it("executes context actions through consumer", async () => {
      let capturedActions: any = null;

      const TestConsumer = () => {
        const ctx = useNotification();
        capturedActions = ctx;
        return <div>Test Consumer</div>;
      };

      renderToString(
        <NotificationProvider>
          <TestConsumer />
        </NotificationProvider>,
      );

      expect(capturedActions).toBeDefined();

      // Execute all provider methods
      const id1 = capturedActions.showNotification({
        type: "success",
        title: "Test Claim Success",
        message: "Claimed commission payout",
        confetti: true,
        duration: 3000,
        receipt: {
          txHash: "0x123",
          amount: "10 XLM",
          confirmed: true,
        },
      });
      expect(id1).toBeDefined();

      const id2 = capturedActions.showNotification({
        type: "warning",
        title: "Persistent Alert",
        persistent: true,
      });
      expect(id2).toBeDefined();

      capturedActions.triggerConfetti();
      capturedActions.openReceiptModal({
        txHash: "0x999",
        amount: "50 XLM",
        confirmed: true,
      });

      const lowEscrowId = capturedActions.notifyLowEscrowBalance({
        campaignName: "Test Escrow",
        remainingXlm: 20,
        percentageRemaining: 2,
        campaignId: "esc-1",
      });
      expect(lowEscrowId).toBeDefined();

      capturedActions.checkEscrowBalances([
        { id: "e1", name: "Low Escrow", escrowInitial: 1000, escrowBalance: 40 },
        { id: "e2", name: "Healthy Escrow", escrowInitial: 1000, escrowBalance: 900 },
      ]);

      capturedActions.dismissNotification(id1);
      capturedActions.clearAllNotifications();
    });

    it("renders NotificationContainer when notifications are present", () => {
      const TestContainerHarness = () => {
        const { showNotification } = useNotification();
        useEffect(() => {
          showNotification({
            type: "success",
            title: "Container Test Notification",
            receipt: { txHash: "0xcontainer", confirmed: true },
          });
        }, [showNotification]);
        return <NotificationContainer />;
      };

      const html = renderToString(
        <NotificationProvider>
          <TestContainerHarness />
        </NotificationProvider>,
      );
      expect(html).toBeDefined();
    });

    it("throws when useNotification is called outside NotificationProvider", () => {
      const BadConsumer = () => {
        useNotification();
        return null;
      };

      expect(() => renderToString(<BadConsumer />)).toThrow(
        "useNotification must be used within a NotificationProvider",
      );
    });

    it("handles all notification types (success, error, info, warning, pending, and reward with receipt)", () => {
      let context: any;
      const Consumer = () => {
        context = useNotification();
        return <NotificationContainer />;
      };

      render(
        <NotificationProvider>
          <Consumer />
        </NotificationProvider>,
      );

      act(() => {
        context.showNotification({ type: "success", title: "All Types - Success", message: "Success message" });
        context.showNotification({ type: "error", title: "All Types - Error", message: "Error message" });
        context.showNotification({ type: "info", title: "All Types - Info", message: "Info message" });
        context.showNotification({ type: "warning", title: "All Types - Warning", message: "Warning message" });
        context.showNotification({ type: "pending", title: "All Types - Pending", message: "Pending message" });
        context.showNotification({
          type: "success",
          title: "All Types - 50 XLM Claimed",
          message: "Settled on chain",
          confetti: true,
          receipt: { txHash: "0xhash123", amount: "50 XLM", confirmed: true },
        });
      });

      expect(screen.getAllByText("All Types - Success").length).toBeGreaterThan(0);
      expect(screen.getAllByText("All Types - Error").length).toBeGreaterThan(0);
      expect(screen.getAllByText("All Types - Info").length).toBeGreaterThan(0);
      expect(screen.getAllByText("All Types - Warning").length).toBeGreaterThan(0);
      expect(screen.getAllByText("All Types - Pending").length).toBeGreaterThan(0);
      expect(screen.getAllByText("All Types - 50 XLM Claimed").length).toBeGreaterThan(0);
    });

    it("handles interactive actions and hover states on ToastItem", () => {
      const onDismiss = vi.fn();
      const onReceiptClick = vi.fn();
      const onAction = vi.fn();
      const onActionClick = vi.fn();

      const notifWithAction: Notification = {
        id: "action-toast-1",
        type: "info",
        title: "Action Required",
        message: "Please confirm your email",
        actionLabel: "Verify",
        onAction,
        action: {
          label: "Verify",
          onClick: onActionClick,
        },
      };

      const { unmount } = render(
        <ToastItem
          notification={notifWithAction}
          onDismiss={onDismiss}
          onReceiptClick={onReceiptClick}
        />,
      );

      const toast = screen.getByTestId("notification-toast");

      // Hover to pause / resume
      fireEvent.mouseEnter(toast);
      fireEvent.mouseLeave(toast);

      // Click action button
      const actionBtn = screen.getByRole("button", { name: /Verify/i });
      fireEvent.click(actionBtn);
      expect(onAction).toHaveBeenCalled();
      expect(onActionClick).toHaveBeenCalled();
      expect(onDismiss).toHaveBeenCalledWith("action-toast-1");

      unmount();
    });

    it("handles ToastItem with link action and close button", () => {
      const onDismiss = vi.fn();
      const notifWithLink: Notification = {
        id: "link-toast-2",
        type: "warning",
        title: "Explorer Link",
        actionLabel: "View Online",
        actionUrl: "https://stellar.org",
        persistent: true,
      };

      render(
        <ToastItem
          notification={notifWithLink}
          onDismiss={onDismiss}
        />,
      );

      const link = screen.getByRole("link", { name: /View Online/i });
      expect(link.getAttribute("href")).toBe("https://stellar.org");
      fireEvent.click(link);
      expect(onDismiss).toHaveBeenCalledWith("link-toast-2");

      const closeBtn = screen.getByRole("button", { name: /Close notification/i });
      fireEvent.click(closeBtn);
      expect(onDismiss).toHaveBeenCalledWith("link-toast-2");
    });

    it("handles ToastItem receipt button click", () => {
      const onReceiptClick = vi.fn();
      const notif: Notification = {
        id: "receipt-toast-3",
        type: "success",
        title: "Reward Paid",
        receipt: {
          txHash: "0xabc",
          amount: "100 XLM",
          confirmed: true,
        },
      };

      render(
        <ToastItem
          notification={notif}
          onDismiss={vi.fn()}
          onReceiptClick={onReceiptClick}
        />,
      );

      const viewReceiptBtn = screen.getByRole("button", { name: /View Receipt/i });
      fireEvent.click(viewReceiptBtn);
      expect(onReceiptClick).toHaveBeenCalledWith(notif);
    });

    it("handles NotificationContainer receipt click variants", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      let context: any;
      const onViewReceipt = vi.fn();

      const Consumer = () => {
        context = useNotification();
        return <NotificationContainer />;
      };

      render(
        <NotificationProvider>
          <Consumer />
        </NotificationProvider>,
      );

      act(() => {
        context.showNotification({
          id: "custom-handler-notif",
          type: "success",
          title: "Custom Receipt Handler",
          onViewReceipt,
          receipt: { txHash: "0x123", confirmed: true },
        });
        context.showNotification({
          id: "url-only-notif",
          type: "info",
          title: "URL Only Receipt",
          receiptUrl: "https://stellar.expert/tx/0x999",
        });
      });

      const buttons = screen.getAllByRole("button", { name: /View Receipt/i });
      fireEvent.click(buttons[0]);
      expect(onViewReceipt).toHaveBeenCalled();

      fireEvent.click(buttons[1]);
      expect(openSpy).toHaveBeenCalledWith("https://stellar.expert/tx/0x999", "_blank", "noopener,noreferrer");

      openSpy.mockRestore();
    });

    it("handles ReceiptModal copy to clipboard success and failure states", async () => {
      const onClose = vi.fn();
      const receipt: NotificationReceipt = {
        txHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        amount: "75.00 XLM",
        saleId: 99,
        campaign: "Test Campaign",
        date: "2026-10-21",
        confirmed: true,
      };

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const { rerender, unmount } = render(
        <ReceiptModal receipt={receipt} isOpen={true} onClose={onClose} />,
      );

      // Copy transaction hash
      const copyBtns = screen.getAllByRole("button");
      const copyTxBtn = copyBtns.find((b) => b.querySelector("svg"));
      if (copyTxBtn) {
        await act(async () => {
          fireEvent.click(copyTxBtn);
        });
        expect(writeTextMock).toHaveBeenCalledWith(receipt.txHash);
      }

      // Copy failure state
      writeTextMock.mockRejectedValueOnce(new Error("Clipboard permission denied"));
      if (copyTxBtn) {
        await act(async () => {
          fireEvent.click(copyTxBtn);
        });
      }

      // Close modal
      rerender(<ReceiptModal receipt={receipt} isOpen={false} onClose={onClose} />);
      expect(screen.queryByTestId("mock-dialog")).toBeNull();

      unmount();
    });
  });

  describe("Confetti Celebratory Animation Component", () => {
    let mockCtx: any;
    let originalRequestAnimationFrame: any;
    let originalCancelAnimationFrame: any;

    beforeEach(() => {
      mockCtx = {
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        arc: vi.fn(),
        fillRect: vi.fn(),
      };
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockCtx as any);

      originalRequestAnimationFrame = window.requestAnimationFrame;
      originalCancelAnimationFrame = window.cancelAnimationFrame;
    });

    afterEach(() => {
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      vi.restoreAllMocks();
    });

    it("renders null when active is false", () => {
      const { container } = render(<Confetti active={false} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders canvas element, animates particles, handles resize, and triggers onComplete", () => {
      const onComplete = vi.fn();
      let animCallback: any = null;
      let frameId = 1;

      window.requestAnimationFrame = vi.fn().mockImplementation((cb) => {
        animCallback = cb;
        return frameId++;
      });
      window.cancelAnimationFrame = vi.fn();

      const { container, unmount } = render(
        <Confetti active={true} duration={100} onComplete={onComplete} />,
      );

      const canvas = container.querySelector("canvas");
      expect(canvas).not.toBeNull();

      // Trigger animation frames relative to current performance.now()
      expect(animCallback).toBeTypeOf("function");
      const baseNow = performance.now();
      act(() => {
        animCallback(baseNow + 20); // progress = 20 / 100 = 0.2
      });

      // Trigger frame with progress > 0.6 (fade out)
      act(() => {
        animCallback(baseNow + 75); // progress = 75 / 100 = 0.75
      });

      // Trigger final frame with progress >= 1.0 (completion)
      act(() => {
        animCallback(baseNow + 250); // progress >= 1.0
      });
      expect(onComplete).toHaveBeenCalled();

      // Trigger resize event
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      // Unmount to trigger cleanup
      unmount();
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });
  });
});

