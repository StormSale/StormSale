/**
 * Telemetry Event Schema Validation & Error Reporting (#482)
 *
 * Implements standard schema validation (using Zod) for client-side telemetry events,
 * auto-flushing batch queue (every 5 seconds or upon 20 accumulated events),
 * and page unload flush using the Navigator Beacon API (navigator.sendBeacon).
 */

import { z } from "zod";

export const TelemetryCategoryEnum = z.enum([
  "fraud",
  "performance",
  "interaction",
  "security",
  "infra",
  "navigation",
]);

export const TelemetrySeverityEnum = z.enum(["info", "warn", "error", "critical"]);

export const TelemetryEventSchema = z.object({
  id: z.string().min(1, "Telemetry event id is required"),
  name: z.string().min(1, "Telemetry event name is required"),
  category: TelemetryCategoryEnum,
  timestamp: z.union([z.number(), z.string().datetime(), z.string().min(1)]),
  properties: z.record(z.unknown()).default({}),
  context: z
    .object({
      sessionId: z.string().optional(),
      userId: z.string().optional(),
      userAgent: z.string().optional(),
      url: z.string().optional(),
      environment: z.string().optional(),
    })
    .optional(),
  severity: TelemetrySeverityEnum.default("info"),
});

export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryCategory = z.infer<typeof TelemetryCategoryEnum>;
export type TelemetrySeverity = z.infer<typeof TelemetrySeverityEnum>;

export interface ValidationSuccess {
  success: true;
  data: TelemetryEvent;
}

export interface ValidationFailure {
  success: false;
  errors: z.ZodIssue[];
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates raw event data against the standard TelemetryEventSchema.
 */
export function validateTelemetryEvent(raw: unknown): ValidationResult {
  const result = TelemetryEventSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.issues,
    message: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}

export interface TelemetryQueueOptions {
  batchSize?: number; // default: 20
  flushIntervalMs?: number; // default: 5000ms (5 seconds)
  endpoint?: string;
  onDispatch?: (batch: TelemetryEvent[]) => Promise<boolean> | boolean;
  onError?: (error: Error, rawEvent?: unknown) => void;
}

/**
 * Batched telemetry dispatch queue with auto-flush and unload beacon integration.
 */
export class TelemetryBatchQueue {
  public readonly batchSize: number;
  public readonly flushIntervalMs: number;
  public readonly endpoint: string;
  private queue: TelemetryEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private onDispatch?: (batch: TelemetryEvent[]) => Promise<boolean> | boolean;
  private onError?: (error: Error, rawEvent?: unknown) => void;
  private unloadListener: (() => void) | null = null;

  constructor(options: TelemetryQueueOptions = {}) {
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 5000;
    this.endpoint = options.endpoint ?? "/api/telemetry";
    this.onDispatch = options.onDispatch;
    this.onError = options.onError;

    this.startTimer();
    this.setupUnloadHandler();
  }

  private startTimer(): void {
    if (typeof setInterval !== "undefined") {
      this.timer = setInterval(() => {
        if (this.queue.length > 0) {
          this.flush();
        }
      }, this.flushIntervalMs);
    }
  }

  private setupUnloadHandler(): void {
    if (typeof window === "undefined") return;

    const handleUnload = () => {
      this.flushBeacon();
    };

    window.addEventListener("beforeunload", handleUnload);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          this.flushBeacon();
        }
      });
    }

    this.unloadListener = handleUnload;
  }

  /**
   * Enqueues an event after validating its schema.
   * If validation fails, rejects event and invokes error reporter.
   * If accumulated events reach batchSize (20), flushes immediately.
   */
  public enqueue(rawEvent: unknown): boolean {
    const validation = validateTelemetryEvent(rawEvent);
    if (!validation.success) {
      const err = new Error(`Telemetry event validation failed: ${validation.message}`);
      if (this.onError) {
        this.onError(err, rawEvent);
      }
      return false;
    }

    this.queue.push(validation.data);

    if (this.queue.length >= this.batchSize) {
      this.flush();
    }

    return true;
  }

  /**
   * Flushes current batch of queued telemetry events.
   */
  public async flush(): Promise<TelemetryEvent[]> {
    if (this.queue.length === 0) return [];

    const batch = [...this.queue];
    this.queue = [];

    if (this.onDispatch) {
      try {
        await this.onDispatch(batch);
      } catch (err) {
        if (this.onError) {
          this.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    return batch;
  }

  /**
   * Dispatches pending events using navigator.sendBeacon during page unload.
   */
  public flushBeacon(): boolean {
    if (this.queue.length === 0) return true;

    const batch = [...this.queue];
    this.queue = [];
    const payload = JSON.stringify({ events: batch });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        return navigator.sendBeacon(this.endpoint, payload);
      } catch {
        return false;
      }
    }

    return false;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getQueuedEvents(): TelemetryEvent[] {
    return [...this.queue];
  }

  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof window !== "undefined" && this.unloadListener) {
      window.removeEventListener("beforeunload", this.unloadListener);
      this.unloadListener = null;
    }
    this.queue = [];
  }
}
