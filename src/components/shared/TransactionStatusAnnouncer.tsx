import React from "react";

export type TransactionAnnouncementStatus =
  "idle" | "submitting" | "queued" | "confirmed" | "failed" | "critical";

export interface TransactionAnnouncement {
  id?: string;
  status: TransactionAnnouncementStatus;
  transactionHash?: string;
  amount?: string | number;
  assetCode?: string;
  description?: string;
  error?: string;
}

export interface TransactionAnnouncementText {
  polite: string;
  assertive: string;
}

const STATUS_LABELS: Record<TransactionAnnouncementStatus, string> = {
  idle: "",
  submitting: "Submitting transaction.",
  queued: "Transaction queued for confirmation.",
  confirmed: "Transaction confirmed.",
  failed: "Transaction failed.",
  critical: "Critical transaction error.",
};

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export function buildTransactionAnnouncementText(
  announcement: TransactionAnnouncement,
): TransactionAnnouncementText {
  if (announcement.status === "idle") {
    return { polite: "", assertive: "" };
  }

  const hash = announcement.transactionHash?.trim();
  const amount = announcement.amount;
  const details = [
    amount !== undefined && amount !== ""
      ? `Amount: ${amount}${announcement.assetCode ? ` ${announcement.assetCode}` : ""}.`
      : "",
    hash ? `Transaction hash: ${hash}.` : "Transaction hash pending.",
    announcement.description ? `Details: ${announcement.description}.` : "",
    announcement.error ? `Reason: ${announcement.error}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const message = `${STATUS_LABELS[announcement.status]} ${details}`.trim();
  const isError = announcement.status === "failed" || announcement.status === "critical";

  return isError ? { polite: "", assertive: message } : { polite: message, assertive: "" };
}

export type TransactionStatusAnnouncerProps = TransactionAnnouncement;

export const TransactionStatusAnnouncer: React.FC<TransactionStatusAnnouncerProps> = ({
  id,
  status = "idle",
  transactionHash,
  amount,
  assetCode,
  description,
  error,
}) => {
  const { polite, assertive } = buildTransactionAnnouncementText({
    status,
    transactionHash,
    amount,
    assetCode,
    description,
    error,
  });

  const renderMessage = (text: string, channel: "polite" | "assertive") =>
    text ? (
      <span
        key={`${channel}-${id ?? "idle"}`}
        data-testid={`transaction-announcement-${channel}-message`}
      >
        {text}
      </span>
    ) : null;

  return (
    <div data-testid="transaction-status-announcer" data-status={status} style={visuallyHidden}>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions text"
        data-testid="transaction-announcement-polite"
      >
        {renderMessage(polite, "polite")}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-relevant="additions text"
        data-testid="transaction-announcement-assertive"
      >
        {renderMessage(assertive, "assertive")}
      </div>
    </div>
  );
};
