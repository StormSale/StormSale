import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type {
  TransactionAnnouncement,
  TransactionAnnouncementStatus,
} from "../components/shared/TransactionStatusAnnouncer";
import { TransactionStatusAnnouncer } from "../components/shared/TransactionStatusAnnouncer";

export type TransactionAnnouncementInput = Omit<TransactionAnnouncement, "id">;

export interface TransactionAnnouncementContextValue {
  announcement: TransactionAnnouncement;
  announceTransaction: (announcement: TransactionAnnouncementInput) => void;
  clearAnnouncement: () => void;
}

const idleAnnouncement: TransactionAnnouncement = { status: "idle" };

const defaultContextValue: TransactionAnnouncementContextValue = {
  announcement: idleAnnouncement,
  announceTransaction: () => undefined,
  clearAnnouncement: () => undefined,
};

export const TransactionAnnouncementContext =
  createContext<TransactionAnnouncementContextValue>(defaultContextValue);

export const TransactionAnnouncementProvider: React.FC<{ readonly children: React.ReactNode }> = ({
  children,
}) => {
  const [announcement, setAnnouncement] = useState<TransactionAnnouncement>(idleAnnouncement);

  const announceTransaction = useCallback((input: TransactionAnnouncementInput) => {
    const id = `tx-announcement-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAnnouncement({ ...input, id });
  }, []);

  const clearAnnouncement = useCallback(() => setAnnouncement(idleAnnouncement), []);

  const value = useMemo(
    () => ({ announcement, announceTransaction, clearAnnouncement }),
    [announcement, announceTransaction, clearAnnouncement],
  );

  return (
    <TransactionAnnouncementContext.Provider value={value}>
      {children}
      <TransactionStatusAnnouncer {...announcement} />
    </TransactionAnnouncementContext.Provider>
  );
};

export const useTransactionAnnouncer = (): TransactionAnnouncementContextValue =>
  useContext(TransactionAnnouncementContext);

export type { TransactionAnnouncementStatus };
