/**
 * StormSale Client Rate Limiter & Burst Request Backoff Interceptor (#472)
 *
 * Provides:
 * 1. Token-bucket algorithm limiting requests to max 10 calls per second per endpoint.
 * 2. HTTP 429 Too Many Requests response interception triggering user countdown modal ("Please wait 4s").
 * 3. Automatic queueing and re-dispatch of throttled requests after backoff timer elapses.
 */

export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold (burst size). Default: 10 */
  capacity?: number;
  /** Number of tokens refilled per second. Default: 10 */
  refillRate?: number;
  /** Optional custom time provider (for deterministic tests) */
  now?: () => number;
}

/**
 * Token Bucket implementation enforcing a burst limit and continuous refill.
 */
export class TokenBucket {
  readonly capacity: number;
  readonly refillRate: number;
  private tokens: number;
  private lastRefill: number;
  private now: () => number;

  constructor(options: TokenBucketOptions = {}) {
    this.capacity = options.capacity ?? 10;
    this.refillRate = options.refillRate ?? 10;
    this.now = options.now ?? (() => Date.now());
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  private refill(): void {
    const currentTime = this.now();
    const elapsedSeconds = Math.max(0, (currentTime - this.lastRefill) / 1000);
    if (elapsedSeconds > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRate);
      this.lastRefill = currentTime;
    }
  }

  /**
   * Attempts to consume `count` tokens.
   * Returns true if tokens were available and consumed, false otherwise.
   */
  tryConsume(count = 1): boolean {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /**
   * Returns current available tokens.
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Returns milliseconds until `count` tokens will be available.
   */
  getWaitTimeMs(count = 1): number {
    this.refill();
    if (this.tokens >= count) return 0;
    const needed = count - this.tokens;
    return Math.ceil((needed / this.refillRate) * 1000);
  }

  /**
   * Resets bucket tokens.
   */
  reset(tokens = this.capacity): void {
    this.tokens = Math.min(this.capacity, Math.max(0, tokens));
    this.lastRefill = this.now();
  }
}

/**
 * Registry maintaining isolated token buckets per endpoint.
 */
export class RateLimiterRegistry {
  private buckets: Map<string, TokenBucket> = new Map();
  private defaultCapacity: number;
  private defaultRefillRate: number;
  private now: () => number;

  constructor(options: TokenBucketOptions = {}) {
    this.defaultCapacity = options.capacity ?? 10;
    this.defaultRefillRate = options.refillRate ?? 10;
    this.now = options.now ?? (() => Date.now());
  }

  getBucket(endpoint: string): TokenBucket {
    let bucket = this.buckets.get(endpoint);
    if (!bucket) {
      bucket = new TokenBucket({
        capacity: this.defaultCapacity,
        refillRate: this.defaultRefillRate,
        now: this.now,
      });
      this.buckets.set(endpoint, bucket);
    }
    return bucket;
  }

  tryConsume(endpoint: string, count = 1): boolean {
    return this.getBucket(endpoint).tryConsume(count);
  }

  getAvailableTokens(endpoint: string): number {
    return this.getBucket(endpoint).getAvailableTokens();
  }

  getWaitTimeMs(endpoint: string, count = 1): number {
    return this.getBucket(endpoint).getWaitTimeMs(count);
  }

  reset(endpoint?: string): void {
    if (endpoint) {
      this.buckets.get(endpoint)?.reset();
    } else {
      this.buckets.forEach((bucket) => bucket.reset());
      this.buckets.clear();
    }
  }
}

export interface RateLimitNotification {
  endpoint: string;
  retryAfterSeconds: number;
  message: string;
  source: "client_burst" | "server_429";
}

export interface QueuedRequestItem {
  id: string;
  endpoint: string;
  execute: () => Promise<Response>;
  resolve: (res: Response | PromiseLike<Response>) => void;
  reject: (err: unknown) => void;
  scheduledTime: number;
}

export interface RateLimiterInterceptorOptions {
  limiter?: RateLimiterRegistry;
  capacity?: number;
  refillRate?: number;
  defaultBackoffSeconds?: number;
  autoQueue?: boolean;
  maxQueueSize?: number;
  onRateLimit?: (event: RateLimitNotification) => void;
  onRateLimitResolved?: (endpoint: string) => void;
  fetchFn?: typeof fetch;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Fetch interceptor that enforces token-bucket rate limits, intercepts HTTP 429
 * responses to notify user countdown modals, and automatically queues and re-dispatches
 * throttled requests after the backoff window elapses.
 */
export class RateLimiterInterceptor {
  readonly limiter: RateLimiterRegistry;
  readonly defaultBackoffSeconds: number;
  readonly autoQueue: boolean;
  readonly maxQueueSize: number;

  private onRateLimit?: (event: RateLimitNotification) => void;
  private onRateLimitResolved?: (endpoint: string) => void;
  private fetchFn: typeof fetch;
  private now: () => number;
  private setTimer: (fn: () => void, ms: number) => unknown;
  private clearTimer: (handle: unknown) => void;

  private queues: Map<string, QueuedRequestItem[]> = new Map();
  private activeBackoffs: Map<string, { timer: unknown; resumeTime: number }> = new Map();
  private nextRequestId = 1;

  constructor(options: RateLimiterInterceptorOptions = {}) {
    this.limiter =
      options.limiter ??
      new RateLimiterRegistry({
        capacity: options.capacity ?? 10,
        refillRate: options.refillRate ?? 10,
        now: options.now,
      });
    this.defaultBackoffSeconds = options.defaultBackoffSeconds ?? 4;
    this.autoQueue = options.autoQueue ?? true;
    this.maxQueueSize = options.maxQueueSize ?? 100;
    this.onRateLimit = options.onRateLimit;
    this.onRateLimitResolved = options.onRateLimitResolved;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /**
   * Normalizes an endpoint identifier from request URL, string, or Request object.
   */
  normalizeEndpoint(input: RequestInfo | URL): string {
    if (typeof input === "string") {
      try {
        const parsed = new URL(input, "http://localhost");
        return parsed.pathname;
      } catch {
        return input.split("?")[0];
      }
    }
    if (input instanceof URL) {
      return input.pathname;
    }
    if (typeof Request !== "undefined" && input instanceof Request) {
      try {
        const parsed = new URL(input.url);
        return parsed.pathname;
      } catch {
        return input.url;
      }
    }
    return String(input);
  }

  /**
   * Parses the Retry-After header: either integer seconds or HTTP-date.
   */
  parseRetryAfter(headerValue: string | null): number {
    if (!headerValue) return this.defaultBackoffSeconds;
    const seconds = parseInt(headerValue.trim(), 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds;
    }
    const dateMs = Date.parse(headerValue);
    if (!isNaN(dateMs)) {
      const diffSec = Math.ceil((dateMs - this.now()) / 1000);
      return Math.max(1, diffSec);
    }
    return this.defaultBackoffSeconds;
  }

  /**
   * Checks if an endpoint is currently undergoing backoff.
   */
  isEndpointInBackoff(endpoint: string): boolean {
    const entry = this.activeBackoffs.get(endpoint);
    if (!entry) return false;
    if (this.now() >= entry.resumeTime) {
      this.activeBackoffs.delete(endpoint);
      return false;
    }
    return true;
  }

  /**
   * Returns remaining backoff seconds for an endpoint, or 0 if not in backoff.
   */
  getRemainingBackoffSeconds(endpoint: string): number {
    const entry = this.activeBackoffs.get(endpoint);
    if (!entry) return 0;
    const remainingMs = entry.resumeTime - this.now();
    return Math.max(0, Math.ceil(remainingMs / 1000));
  }

  /**
   * Emits rate limit notification with countdown message.
   */
  private triggerNotification(
    endpoint: string,
    retryAfterSeconds: number,
    source: "client_burst" | "server_429",
  ): void {
    const message = `Please wait ${retryAfterSeconds}s`;
    this.onRateLimit?.({
      endpoint,
      retryAfterSeconds,
      message,
      source,
    });
  }

  /**
   * Enqueues a throttled request and schedules its re-dispatch once backoff finishes.
   */
  private enqueueRequest(
    endpoint: string,
    execute: () => Promise<Response>,
    delayMs: number,
  ): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const queue = this.queues.get(endpoint) || [];
      if (queue.length >= this.maxQueueSize) {
        return reject(
          new Error(`Rate limit queue capacity reached (${this.maxQueueSize}) for ${endpoint}`),
        );
      }

      const reqItem: QueuedRequestItem = {
        id: `req-${this.nextRequestId++}`,
        endpoint,
        execute,
        resolve,
        reject,
        scheduledTime: this.now() + delayMs,
      };

      queue.push(reqItem);
      this.queues.set(endpoint, queue);

      // If no backoff timer is active for this endpoint, start one
      if (!this.activeBackoffs.has(endpoint)) {
        this.scheduleQueueDrain(endpoint, delayMs);
      }
    });
  }

  /**
   * Schedules draining of queued requests for an endpoint.
   */
  private scheduleQueueDrain(endpoint: string, delayMs: number): void {
    const resumeTime = this.now() + delayMs;
    const timer = this.setTimer(() => {
      this.activeBackoffs.delete(endpoint);
      this.drainQueue(endpoint);
      this.onRateLimitResolved?.(endpoint);
    }, delayMs);

    this.activeBackoffs.set(endpoint, { timer, resumeTime });
  }

  /**
   * Drains and re-dispatches queued requests for an endpoint.
   */
  private async drainQueue(endpoint: string): Promise<void> {
    const queue = this.queues.get(endpoint);
    if (!queue || queue.length === 0) {
      this.queues.delete(endpoint);
      return;
    }

    // Process queued requests
    const itemsToProcess = [...queue];
    this.queues.set(endpoint, []);

    for (const item of itemsToProcess) {
      try {
        const response = await item.execute();
        item.resolve(response);
      } catch (err) {
        item.reject(err);
      }
    }
  }

  /**
   * Intercepted fetch entrypoint.
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const endpoint = this.normalizeEndpoint(input);

    // 1. If currently backing off on this endpoint
    if (this.isEndpointInBackoff(endpoint)) {
      if (this.autoQueue) {
        const remainingSec = this.getRemainingBackoffSeconds(endpoint);
        const remainingMs = remainingSec * 1000;
        return this.enqueueRequest(endpoint, () => this.fetch(input, init), remainingMs);
      }
      return new Response(
        JSON.stringify({ error: `Too Many Requests. Please wait ${this.getRemainingBackoffSeconds(endpoint)}s` }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(this.getRemainingBackoffSeconds(endpoint)),
          },
        },
      );
    }

    // 2. Client-side Token Bucket Guard (Max 10 calls per second per endpoint)
    if (!this.limiter.tryConsume(endpoint, 1)) {
      const waitMs = this.limiter.getWaitTimeMs(endpoint, 1);
      const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
      this.triggerNotification(endpoint, retryAfterSeconds, "client_burst");

      if (this.autoQueue) {
        return this.enqueueRequest(endpoint, () => this.fetch(input, init), waitMs);
      }

      return new Response(
        JSON.stringify({
          error: `Client rate limit reached. Please wait ${retryAfterSeconds}s`,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }

    // 3. Dispatch Network Request
    const response = await this.fetchFn(input, init);

    // 4. Intercept HTTP 429 Too Many Requests response from backend
    if (response.status === 429) {
      const retryAfterSeconds = this.parseRetryAfter(response.headers.get("Retry-After"));
      this.triggerNotification(endpoint, retryAfterSeconds, "server_429");

      if (this.autoQueue) {
        const delayMs = retryAfterSeconds * 1000;
        return this.enqueueRequest(endpoint, () => this.fetch(input, init), delayMs);
      }
    }

    return response;
  }

  /**
   * Helper to inspect the current queue length for an endpoint.
   */
  getQueueLength(endpoint: string): number {
    return this.queues.get(endpoint)?.length ?? 0;
  }

  /**
   * Clears pending queues and cancels active backoff timers.
   */
  clear(): void {
    for (const [, entry] of this.activeBackoffs) {
      this.clearTimer(entry.timer);
    }
    this.activeBackoffs.clear();

    for (const [, queue] of this.queues) {
      for (const item of queue) {
        item.reject(new Error("RateLimiterInterceptor queue cleared"));
      }
    }
    this.queues.clear();
    this.limiter.reset();
  }
}
