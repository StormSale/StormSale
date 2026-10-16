import { useWeb3 as useWebContext } from "../context/WebContext";

export const useWeb3 = useWebContext;

export interface TransactionPollingState {
  isPolling: boolean;
  attempts: number;
  error: Error | null;
  confirmed: boolean;
}

export interface TransactionPollingOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onTimeout?: () => void;
}

export const useTransactionPolling = (
  _txHash: string | null,
  _options?: TransactionPollingOptions
): TransactionPollingState => ({
  isPolling: false,
  attempts: 0,
  error: null,
  confirmed: false,
});

