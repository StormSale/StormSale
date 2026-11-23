// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TransactionStatusAnnouncer } from "../components/shared/TransactionStatusAnnouncer";
import {
  TransactionAnnouncementProvider,
  useTransactionAnnouncer,
} from "../context/TransactionAnnouncementContext";

afterEach(cleanup);

const TX_HASH = "0x9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e";
const AMOUNT = "125.5";
const ASSET_CODE = "XLM";

const politeRegion = () => screen.getByTestId("transaction-announcement-polite");
const assertiveRegion = () => screen.getByTestId("transaction-announcement-assertive");

describe("[A11y] Transaction status ARIA live announcements (#512)", () => {
  it("mounts both live regions before any transaction status is reported", () => {
    render(<TransactionStatusAnnouncer status="idle" />);

    const polite = politeRegion();
    const assertive = assertiveRegion();

    expect(polite.getAttribute("aria-live")).toBe("polite");
    expect(polite.getAttribute("role")).toBe("status");
    expect(polite.getAttribute("aria-atomic")).toBe("true");
    expect(assertive.getAttribute("aria-live")).toBe("assertive");
    expect(assertive.getAttribute("role")).toBe("alert");
    expect(assertive.getAttribute("aria-atomic")).toBe("true");
    expect(polite.textContent).toBe("");
    expect(assertive.textContent).toBe("");
  });

  it("updates the polite region when a transaction enters the confirmation queue", () => {
    const { rerender } = render(
      <TransactionStatusAnnouncer
        status="submitting"
        amount={AMOUNT}
        assetCode={ASSET_CODE}
        description="Log sale for Campaign #42"
      />,
    );

    expect(politeRegion().textContent).toContain("Submitting transaction.");
    expect(assertiveRegion().textContent).toBe("");

    rerender(
      <TransactionStatusAnnouncer
        status="queued"
        transactionHash={TX_HASH}
        amount={AMOUNT}
        assetCode={ASSET_CODE}
        description="Log sale for Campaign #42"
      />,
    );

    const announcement = politeRegion().textContent ?? "";
    expect(announcement).toContain("Transaction queued for confirmation.");
    expect(announcement).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);
    expect(announcement).toContain(TX_HASH);
    expect(assertiveRegion().textContent).toBe("");
  });

  it("announces transaction failures through the assertive region", () => {
    const { rerender } = render(
      <TransactionStatusAnnouncer
        status="queued"
        transactionHash={TX_HASH}
        amount={AMOUNT}
        assetCode={ASSET_CODE}
      />,
    );

    expect(assertiveRegion().textContent).toBe("");

    rerender(
      <TransactionStatusAnnouncer
        status="failed"
        transactionHash={TX_HASH}
        amount={AMOUNT}
        assetCode={ASSET_CODE}
        error="HostError: insufficient balance"
      />,
    );

    const announcement = assertiveRegion().textContent ?? "";
    expect(announcement).toContain("Transaction failed.");
    expect(announcement).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);
    expect(announcement).toContain(TX_HASH);
    expect(announcement).toContain("HostError: insufficient balance");
    expect(politeRegion().textContent).toBe("");
  });

  it("announces critical transaction errors through the assertive region", () => {
    render(
      <TransactionStatusAnnouncer
        status="critical"
        transactionHash={TX_HASH}
        amount={AMOUNT}
        assetCode={ASSET_CODE}
        error="Sequence desynchronization could not be recovered"
      />,
    );

    const announcement = assertiveRegion().textContent ?? "";
    expect(announcement).toContain("Critical transaction error.");
    expect(announcement).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);
    expect(announcement).toContain(TX_HASH);
    expect(announcement).toContain("Sequence desynchronization could not be recovered");
    expect(politeRegion().textContent).toBe("");
  });

  it.each(["submitting", "queued", "confirmed"] as const)(
    "includes the transaction hash and amount in the polite %s announcement",
    (status) => {
      render(
        <TransactionStatusAnnouncer
          status={status}
          transactionHash={TX_HASH}
          amount={AMOUNT}
          assetCode={ASSET_CODE}
        />,
      );

      expect(politeRegion().textContent).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);
      expect(politeRegion().textContent).toContain(`Transaction hash: ${TX_HASH}`);
      expect(assertiveRegion().textContent).toBe("");
    },
  );

  it.each(["failed", "critical"] as const)(
    "includes the transaction hash and amount in the assertive %s announcement",
    (status) => {
      render(
        <TransactionStatusAnnouncer
          status={status}
          transactionHash={TX_HASH}
          amount={AMOUNT}
          assetCode={ASSET_CODE}
        />,
      );

      expect(assertiveRegion().textContent).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);
      expect(assertiveRegion().textContent).toContain(`Transaction hash: ${TX_HASH}`);
      expect(politeRegion().textContent).toBe("");
    },
  );

  it("publishes status changes to the live regions through the announcement provider", () => {
    const AnnouncementTrigger = () => {
      const { announceTransaction, clearAnnouncement } = useTransactionAnnouncer();

      return (
        <>
          <button
            type="button"
            onClick={() =>
              announceTransaction({
                status: "queued",
                transactionHash: TX_HASH,
                amount: AMOUNT,
                assetCode: ASSET_CODE,
              })
            }
          >
            Queue transaction
          </button>
          <button
            type="button"
            onClick={() =>
              announceTransaction({
                status: "failed",
                transactionHash: TX_HASH,
                amount: AMOUNT,
                assetCode: ASSET_CODE,
                error: "Ledger rejected the transaction",
              })
            }
          >
            Fail transaction
          </button>
          <button type="button" onClick={clearAnnouncement}>
            Clear announcement
          </button>
        </>
      );
    };

    render(
      <TransactionAnnouncementProvider>
        <AnnouncementTrigger />
      </TransactionAnnouncementProvider>,
    );

    expect(politeRegion().textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Queue transaction" }));
    expect(politeRegion().textContent).toContain("Transaction queued for confirmation.");
    expect(politeRegion().textContent).toContain(TX_HASH);
    expect(politeRegion().textContent).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);

    fireEvent.click(screen.getByRole("button", { name: "Fail transaction" }));
    expect(assertiveRegion().textContent).toContain("Transaction failed.");
    expect(assertiveRegion().textContent).toContain(TX_HASH);
    expect(assertiveRegion().textContent).toContain(`Amount: ${AMOUNT} ${ASSET_CODE}`);
    expect(politeRegion().textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Clear announcement" }));
    expect(assertiveRegion().textContent).toBe("");
  });

  it.each([
    { status: "queued", channel: "polite", button: "Announce queued" },
    { status: "failed", channel: "assertive", button: "Announce failed" },
  ] as const)(
    "replaces the $channel message node when the same $status announcement is repeated",
    ({ status, channel, button }) => {
      const RepeatTrigger = () => {
        const { announceTransaction } = useTransactionAnnouncer();

        return (
          <button
            type="button"
            onClick={() =>
              announceTransaction({
                status,
                transactionHash: TX_HASH,
                amount: AMOUNT,
                assetCode: ASSET_CODE,
                ...(status === "failed" ? { error: "Ledger rejected the transaction" } : {}),
              })
            }
          >
            {button}
          </button>
        );
      };

      render(
        <TransactionAnnouncementProvider>
          <RepeatTrigger />
        </TransactionAnnouncementProvider>,
      );

      const trigger = screen.getByRole("button", { name: button });
      fireEvent.click(trigger);
      const firstMessage = screen.getByTestId(`transaction-announcement-${channel}-message`);
      const firstText = firstMessage.textContent;

      fireEvent.click(trigger);
      const secondMessage = screen.getByTestId(`transaction-announcement-${channel}-message`);

      expect(secondMessage.textContent).toBe(firstText);
      expect(secondMessage).not.toBe(firstMessage);
      expect(
        screen.getByTestId(`transaction-announcement-${channel}`).contains(secondMessage),
      ).toBe(true);
    },
  );
});
