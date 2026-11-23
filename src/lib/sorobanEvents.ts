/**
 * src/lib/sorobanEvents.ts
 *
 * Real-Time Soroban RPC Event Streaming Engine with Exponential Backoff
 * and Tab Visibility-Aware Polling (Issue #123).
 */

export type StreamingStatus = "Connected" | "Polling" | "Reconnecting";

export interface SorobanStreamEvent {
  id: string;
  type: "contract" | "diagnostic" | "system";
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  topic: string[];
  value: any;
  topicName?: string;
}

export interface SorobanEventEngineOptions {
  rpcUrl?: string;
  contractId?: string;
  startLedger?: number;
  basePollingIntervalMs?: number;
  maxBackgroundIntervalMs?: number;
  maxBackoffMs?: number;
  initialBackoffMs?: number;
  topicFilters?: string[];
  onEvent?: (event: SorobanStreamEvent) => void;
  onStatusChange?: (status: StreamingStatus) => void;
  onRevalidate?: () => void;
  fetchFn?: typeof fetch;
}

export const DEFAULT_TOPIC_FILTERS = ["create_campaign", "log_sale", "claim_payout"];
export const DEFAULT_POLL_INTERVAL_MS = 3000;
export const DEFAULT_MAX_BACKGROUND_MS = 30000; // 30s max backoff when blurred
export const DEFAULT_MAX_BACKOFF_MS = 30000;
export const DEFAULT_INITIAL_BACKOFF_MS = 1000;

/**
 * Calculates exponential backoff with a cap and deterministic/proportional jitter.
 */
export function computeExponentialBackoff(
  retryCount: number,
  initialMs = DEFAULT_INITIAL_BACKOFF_MS,
  maxMs = DEFAULT_MAX_BACKOFF_MS,
): number {
  if (retryCount <= 0) return initialMs;
  const exponential = initialMs * Math.pow(2, retryCount);
  return Math.min(exponential, maxMs);
}

/**
 * Extracts human-readable topic name from raw Soroban event topic strings.
 */
export function parseEventTopicName(topics: string[]): string | undefined {
  if (!topics || topics.length === 0) return undefined;
  for (const topic of topics) {
    for (const filter of DEFAULT_TOPIC_FILTERS) {
      if (topic.toLowerCase().includes(filter.toLowerCase())) {
        return filter;
      }
    }
  }
  return topics[0];
}

/**
 * Filters incoming events against configured topic filters.
 */
export function filterMatchingEvents(
  events: SorobanStreamEvent[],
  allowedTopics: string[],
): SorobanStreamEvent[] {
  if (!allowedTopics || allowedTopics.length === 0) return events;
  const normalizedAllowed = allowedTopics.map((t) => t.toLowerCase());

  return events.filter((e) => {
    if (e.topicName && normalizedAllowed.includes(e.topicName.toLowerCase())) {
      return true;
    }
    return e.topic?.some((t) =>
      normalizedAllowed.some((target) => t.toLowerCase().includes(target)),
    );
  });
}

/**
 * Engine managing live event polling with exponential backoff and tab visibility adjustment.
 */
export class SorobanEventStreamEngine {
  private rpcUrl: string;
  private contractId?: string;
  private startLedger: number;
  private baseIntervalMs: number;
  private maxBackgroundMs: number;
  private maxBackoffMs: number;
  private initialBackoffMs: number;
  private topicFilters: string[];
  private onEvent?: (event: SorobanStreamEvent) => void;
  private onStatusChange?: (status: StreamingStatus) => void;
  private onRevalidate?: () => void;
  private fetchFn: typeof fetch;

  private status: StreamingStatus = "Connected";
  private isRunning = false;
  private retryCount = 0;
  private timeoutId: any = null;
  private isTabBlurred = false;
  private seenEventIds = new Set<string>();

  constructor(options: SorobanEventEngineOptions = {}) {
    this.rpcUrl = options.rpcUrl || "https://soroban-testnet.stellar.org";
    this.contractId = options.contractId;
    this.startLedger = options.startLedger || 0;
    this.baseIntervalMs = options.basePollingIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    this.maxBackgroundMs = options.maxBackgroundIntervalMs || DEFAULT_MAX_BACKGROUND_MS;
    this.maxBackoffMs = options.maxBackoffMs || DEFAULT_MAX_BACKOFF_MS;
    this.initialBackoffMs = options.initialBackoffMs || DEFAULT_INITIAL_BACKOFF_MS;
    this.topicFilters = options.topicFilters || DEFAULT_TOPIC_FILTERS;
    this.onEvent = options.onEvent;
    this.onStatusChange = options.onStatusChange;
    this.onRevalidate = options.onRevalidate;
    this.fetchFn =
      options.fetchFn ||
      (typeof fetch !== "undefined" ? fetch.bind(globalThis) : async () => ({}) as any);

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  public getStatus(): StreamingStatus {
    return this.status;
  }

  public getRetryCount(): number {
    return this.retryCount;
  }

  public isBackgrounded(): boolean {
    return this.isTabBlurred;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.retryCount = 0;

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.isTabBlurred = document.hidden;
    }

    this.setStatus("Polling");
    this.poll();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  public reconnect(): void {
    this.retryCount = 0;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.setStatus("Polling");
    this.poll();
  }

  private handleVisibilityChange(): void {
    if (typeof document === "undefined") return;
    const wasBlurred = this.isTabBlurred;
    this.isTabBlurred = document.hidden;

    // When returning to foreground from background, immediately resume active poll
    if (wasBlurred && !this.isTabBlurred && this.isRunning) {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.poll();
    }
  }

  private setStatus(newStatus: StreamingStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.onStatusChange?.(newStatus);
    }
  }

  public async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.setStatus("Polling");
      const filters = this.contractId ? [{ type: "contract", contractIds: [this.contractId] }] : [];

      const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "getEvents",
        params: [
          {
            startLedger: this.startLedger,
            filters,
            pagination: { limit: 50 },
          },
        ],
      };

      const response = await this.fetchFn(this.rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`RPC responded with status ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || "Failed to fetch events from Soroban RPC");
      }

      const rawEvents: any[] = data.result?.events || [];
      const newEvents: SorobanStreamEvent[] = [];

      for (const ev of rawEvents) {
        const id = ev.id || `${ev.ledger}-${ev.topic?.join(":")}`;
        if (!this.seenEventIds.has(id)) {
          this.seenEventIds.add(id);
          const parsed: SorobanStreamEvent = {
            id,
            type: ev.type || "contract",
            ledger: ev.ledger,
            ledgerClosedAt: ev.ledgerClosedAt || new Date().toISOString(),
            contractId: ev.contractId || this.contractId || "",
            topic: ev.topic || [],
            value: ev.value,
            topicName: parseEventTopicName(ev.topic || []),
          };
          newEvents.push(parsed);

          if (ev.ledger && ev.ledger >= this.startLedger) {
            this.startLedger = ev.ledger + 1;
          }
        }
      }

      // Filter events by requested topics
      const matching = filterMatchingEvents(newEvents, this.topicFilters);

      // On successful poll, reset retry count and mark Connected
      this.retryCount = 0;
      this.setStatus("Connected");

      if (matching.length > 0) {
        for (const event of matching) {
          this.onEvent?.(event);
        }
        // Trigger lightweight query re-validation
        this.onRevalidate?.();
      }

      this.scheduleNextPoll(false);
    } catch (err) {
      this.retryCount++;
      this.setStatus("Reconnecting");
      this.scheduleNextPoll(true);
    }
  }

  private scheduleNextPoll(isError: boolean): void {
    if (!this.isRunning) return;

    let delay: number;
    if (isError) {
      delay = computeExponentialBackoff(this.retryCount, this.initialBackoffMs, this.maxBackoffMs);
    } else if (this.isTabBlurred) {
      // Blurred background tab: back off up to 30s
      delay = Math.min(this.maxBackgroundMs, this.baseIntervalMs * 6);
    } else {
      delay = this.baseIntervalMs;
    }

    this.timeoutId = setTimeout(() => {
      this.poll();
    }, delay);
  }
}
