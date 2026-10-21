import { rpc } from "@stellar/stellar-sdk";
import { STELLAR_CONFIG } from "../config/stellar";

/* =========================================================================
   1. TYPES & INTERFACES FOR RPC NODES & SILENT FAILOVER
   ========================================================================= */

export type RpcNodeType = "primary" | "local" | "blockdag" | "backup";
export type RpcHealthStatus = "healthy" | "degraded" | "unreachable" | "untested";

export interface RpcEndpoint {
  id: string;
  name: string;
  url: string;
  type: RpcNodeType;
  isLocal: boolean;
  priority: number;
  description?: string;
  networkPassphrase?: string;
}

export interface RpcEndpointStatus extends RpcEndpoint {
  status: RpcHealthStatus;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  consecutiveFailures: number;
  totalRequests: number;
  failedRequests: number;
}

export interface RpcFailoverEvent {
  id: string;
  timestamp: string;
  fromEndpointId: string;
  fromUrl: string;
  toEndpointId: string;
  toUrl: string;
  reason: string;
  durationMs?: number;
}

export interface RpcManagerOptions {
  timeoutMs: number;
  maxConsecutiveFailuresBeforeUnreachable: number;
  cooldownPeriodMs: number;
}

export interface FallbackExecutionOptions {
  timeoutMs?: number;
  silent?: boolean;
}

/* =========================================================================
   2. DEFAULT RPC & HORIZON NODE POOLS (INCLUDING BLOCKDAG & LOCAL NODES)
   ========================================================================= */

const isPublicNetwork = STELLAR_CONFIG.network.toUpperCase() === "PUBLIC";
const defaultPassphrase = STELLAR_CONFIG.networkPassphrase;

export function buildDefaultRpcNodes(): RpcEndpoint[] {
  if (isPublicNetwork) {
    return [
      {
        id: "sdf-public",
        name: "Stellar SDF Mainnet (Primary)",
        url: STELLAR_CONFIG.rpcUrl || "https://soroban-rpc.mainnet.stellar.org",
        type: "primary",
        isLocal: false,
        priority: 1,
        description: "Official Stellar Development Foundation public mainnet node",
        networkPassphrase: defaultPassphrase,
      },
      {
        id: "blockdaemon-public",
        name: "Blockdaemon Soroban Mainnet",
        url: "https://mainnet.stellar.blockdaemon.com/soroban",
        type: "backup",
        isLocal: false,
        priority: 2,
        description: "Enterprise resilient backup RPC provider",
        networkPassphrase: defaultPassphrase,
      },
      {
        id: "publicnode-public",
        name: "PublicNode Mainnet Gateway",
        url: "https://stellar.publicnode.com",
        type: "backup",
        isLocal: false,
        priority: 3,
        description: "Community distributed load-balanced Soroban RPC",
        networkPassphrase: defaultPassphrase,
      },
    ];
  }

  // Default Testnet pool
  const testnetNodes: RpcEndpoint[] = [
    {
      id: "sdf-testnet",
      name: "Stellar SDF Testnet (Primary)",
      url: STELLAR_CONFIG.rpcUrl || "https://soroban-testnet.stellar.org",
      type: "primary",
      isLocal: false,
      priority: 1,
      description: "Official Stellar Development Foundation public testnet node",
      networkPassphrase: defaultPassphrase,
    },
    {
      id: "blockdaemon-testnet",
      name: "Blockdaemon Soroban RPC",
      url: "https://testnet.stellar.blockdaemon.com/soroban",
      type: "backup",
      isLocal: false,
      priority: 2,
      description: "Enterprise resilient backup RPC provider",
      networkPassphrase: defaultPassphrase,
    },
    {
      id: "publicnode-testnet",
      name: "PublicNode Soroban Gateway",
      url: "https://stellar-testnet.publicnode.com",
      type: "backup",
      isLocal: false,
      priority: 3,
      description: "Community distributed load-balanced Soroban RPC",
      networkPassphrase: defaultPassphrase,
    },
  ];

  // In development environments or localhost, include local standalone node
  const isDevEnvironment =
    Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) ||
    (typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) ||
    (typeof process !== "undefined" && process.env?.NODE_ENV === "test");

  if (isDevEnvironment) {
    testnetNodes.push({
      id: "local-node",
      name: "Local Node RPC (BlockDAG / Standalone)",
      url: "http://localhost:8000/soroban/rpc",
      type: "local",
      isLocal: true,
      priority: 4,
      description: "Local standalone Soroban & BlockDAG developer container node",
      networkPassphrase: defaultPassphrase,
    });
  }

  // BlockDAG network testnet gateway
  testnetNodes.push({
    id: "blockdag-testnet",
    name: "BlockDAG Gateway RPC Node",
    url: "https://rpc.blockdag.network",
    type: "blockdag",
    isLocal: false,
    priority: 5,
    description: "BlockDAG high-throughput DAG network testnet gateway",
    networkPassphrase: defaultPassphrase,
  });

  return testnetNodes;
}

export const DEFAULT_RPC_NODES: RpcEndpoint[] = buildDefaultRpcNodes();

export function buildDefaultHorizonNodes(): string[] {
  const nodes = [
    STELLAR_CONFIG.horizonUrl ||
      (isPublicNetwork ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"),
  ];

  if (isPublicNetwork) {
    nodes.push("https://horizon.blockdaemon.com");
  } else {
    nodes.push("https://horizon.testnet.stellar.blockdaemon.com");
    const isDev =
      Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) ||
      (typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"));
    if (isDev) {
      nodes.push("http://localhost:8000");
    }
  }
  return nodes;
}

export const DEFAULT_HORIZON_NODES: string[] = buildDefaultHorizonNodes();

/* =========================================================================
   3. RPC FALLBACK MANAGER IMPLEMENTATION
   ========================================================================= */

export class RpcFallbackManager {
  private endpoints: Map<string, RpcEndpointStatus> = new Map();
  private activeEndpointId: string;
  private failoverHistory: RpcFailoverEvent[] = [];
  private listeners: Set<
    (event: {
      type: "failover" | "health_check" | "active_changed";
      active: RpcEndpointStatus;
      endpoints: RpcEndpointStatus[];
      eventDetails?: RpcFailoverEvent;
    }) => void
  > = new Set();
  private options: RpcManagerOptions;

  constructor(
    initialEndpoints: RpcEndpoint[] = DEFAULT_RPC_NODES,
    options: Partial<RpcManagerOptions> = {},
  ) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 4000,
      maxConsecutiveFailuresBeforeUnreachable: options.maxConsecutiveFailuresBeforeUnreachable ?? 3,
      cooldownPeriodMs: options.cooldownPeriodMs ?? 30000,
    };

    // Initialize endpoints
    initialEndpoints.forEach((ep) => {
      this.endpoints.set(ep.id, {
        ...ep,
        status: "untested",
        latencyMs: null,
        lastCheckedAt: null,
        consecutiveFailures: 0,
        totalRequests: 0,
        failedRequests: 0,
      });
    });

    // Default active endpoint is the highest priority one (lowest priority number)
    const sorted = [...this.endpoints.values()].sort((a, b) => a.priority - b.priority);
    this.activeEndpointId = sorted[0]?.id || "sdf-testnet";
  }

  /**
   * Retrieves the configured timeout in milliseconds for RPC operations.
   */
  public getTimeoutMs(): number {
    return this.options.timeoutMs;
  }

  /**
   * Retrieves the currently active RPC endpoint status.
   */
  public getActiveEndpoint(): RpcEndpointStatus {
    const active = this.endpoints.get(this.activeEndpointId);
    if (!active) {
      const fallback = [...this.endpoints.values()][0];
      return (
        fallback || {
          id: "default",
          name: "Default RPC",
          url: STELLAR_CONFIG.rpcUrl,
          type: "primary",
          isLocal: false,
          priority: 1,
          status: "untested",
          latencyMs: null,
          lastCheckedAt: null,
          consecutiveFailures: 0,
          totalRequests: 0,
          failedRequests: 0,
        }
      );
    }
    return active;
  }

  /**
   * Retrieves all registered RPC endpoints with their health and performance status.
   */
  public getAllEndpoints(): RpcEndpointStatus[] {
    return [...this.endpoints.values()].sort((a, b) => a.priority - b.priority);
  }

  /**
   * Retrieves the history of automatic or manual failover events.
   */
  public getFailoverHistory(): RpcFailoverEvent[] {
    return [...this.failoverHistory];
  }

  /**
   * Instantiates and returns a configured Soroban rpc.Server for the active endpoint.
   */
  public getActiveRpcServer(): rpc.Server {
    const endpoint = this.getActiveEndpoint();
    return new rpc.Server(endpoint.url, {
      allowHttp: endpoint.url.startsWith("http://"),
    });
  }

  /**
   * Manually sets the active RPC endpoint by ID or URL.
   */
  public setActiveEndpoint(idOrUrl: string): RpcEndpointStatus {
    let target = this.endpoints.get(idOrUrl);
    if (!target) {
      target = [...this.endpoints.values()].find((ep) => ep.url === idOrUrl);
    }

    if (!target) {
      throw new Error(`RPC Endpoint '${idOrUrl}' not found in registry.`);
    }

    const previousId = this.activeEndpointId;
    this.activeEndpointId = target.id;

    if (previousId !== target.id) {
      this.notifyListeners({
        type: "active_changed",
        active: target,
        endpoints: this.getAllEndpoints(),
      });
    }

    return target;
  }

  /**
   * Dynamically registers a new RPC endpoint (e.g. local developer node or private BlockDAG RPC).
   */
  public addEndpoint(
    endpoint: Omit<RpcEndpoint, "priority"> & { priority?: number },
  ): RpcEndpointStatus {
    const priority = endpoint.priority ?? this.endpoints.size + 1;
    const newEndpoint: RpcEndpointStatus = {
      ...endpoint,
      priority,
      status: "untested",
      latencyMs: null,
      lastCheckedAt: null,
      consecutiveFailures: 0,
      totalRequests: 0,
      failedRequests: 0,
    };

    this.endpoints.set(endpoint.id, newEndpoint);
    this.notifyListeners({
      type: "active_changed",
      active: this.getActiveEndpoint(),
      endpoints: this.getAllEndpoints(),
    });

    return newEndpoint;
  }

  /**
   * Removes an RPC endpoint by ID.
   */
  public removeEndpoint(id: string): boolean {
    if (this.activeEndpointId === id) {
      this.failoverToNext("Active endpoint removed");
    }
    const removed = this.endpoints.delete(id);
    if (removed) {
      this.notifyListeners({
        type: "active_changed",
        active: this.getActiveEndpoint(),
        endpoints: this.getAllEndpoints(),
      });
    }
    return removed;
  }

  /**
   * Silently triggers a failover to the next healthiest RPC node in priority order.
   */
  public failoverToNext(reason: string = "Connection timeout or failure"): RpcEndpointStatus {
    const current = this.getActiveEndpoint();
    const sorted = this.getAllEndpoints();

    // Select candidate that is not the current one, preferring healthy or untested nodes
    const candidates = sorted.filter((ep) => ep.id !== current.id);
    const nextCandidate =
      candidates.find((ep) => ep.status === "healthy" || ep.status === "untested") ||
      candidates.find((ep) => ep.status === "degraded") ||
      candidates[0] ||
      current;

    const previousEndpoint = { ...current };
    this.activeEndpointId = nextCandidate.id;

    // Record failover event
    const failoverEvent: RpcFailoverEvent = {
      id: "fo_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      fromEndpointId: previousEndpoint.id,
      fromUrl: previousEndpoint.url,
      toEndpointId: nextCandidate.id,
      toUrl: nextCandidate.url,
      reason,
    };
    this.failoverHistory.unshift(failoverEvent);
    if (this.failoverHistory.length > 50) {
      this.failoverHistory.pop();
    }

    console.warn(
      `[RPC Silent Failover] Node "${previousEndpoint.name}" failed: ${reason}. Silently failed over to "${nextCandidate.name}" (${nextCandidate.url}).`,
    );

    this.notifyListeners({
      type: "failover",
      active: nextCandidate,
      endpoints: this.getAllEndpoints(),
      eventDetails: failoverEvent,
    });

    return nextCandidate;
  }

  /**
   * Measures latency and health of a single RPC endpoint.
   */
  public async checkEndpointHealth(
    idOrUrl: string,
    timeoutMs?: number,
  ): Promise<RpcEndpointStatus> {
    const ep =
      this.endpoints.get(idOrUrl) || [...this.endpoints.values()].find((e) => e.url === idOrUrl);

    if (!ep) {
      throw new Error(`Endpoint '${idOrUrl}' not found.`);
    }

    const tMs = timeoutMs ?? this.options.timeoutMs;
    const startTime = Date.now();

    try {
      // Live JSON-RPC getHealth probe with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), tMs);
      let body: { result?: { status?: string } } | null = null;

      try {
        const response = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getHealth",
            params: null,
          }),
          signal: controller.signal,
        });

        body = response.ok ? await response.json() : null;
      } finally {
        clearTimeout(timeoutId);
      }

      const latencyMs = Date.now() - startTime;

      if (body?.result?.status === "healthy") {
        ep.status = "healthy";
        ep.latencyMs = latencyMs;
        ep.consecutiveFailures = 0;
      } else {
        ep.consecutiveFailures += 1;
        ep.status =
          ep.consecutiveFailures >= this.options.maxConsecutiveFailuresBeforeUnreachable
            ? "unreachable"
            : "degraded";
        ep.latencyMs = latencyMs;
      }
    } catch {
      ep.consecutiveFailures += 1;
      ep.status =
        ep.consecutiveFailures >= this.options.maxConsecutiveFailuresBeforeUnreachable
          ? "unreachable"
          : "degraded";
      ep.latencyMs = null;
    }

    ep.lastCheckedAt = new Date().toISOString();
    this.notifyListeners({
      type: "health_check",
      active: this.getActiveEndpoint(),
      endpoints: this.getAllEndpoints(),
    });

    return ep;
  }

  /**
   * Probes all registered RPC endpoints in parallel and updates their status.
   */
  public async checkAllHealth(timeoutMs?: number): Promise<RpcEndpointStatus[]> {
    const promises = this.getAllEndpoints().map((ep) =>
      this.checkEndpointHealth(ep.id, timeoutMs).catch(() => ep),
    );
    await Promise.all(promises);
    return this.getAllEndpoints();
  }

  /**
   * Executes a Soroban RPC operation with automated, silent failover on timeout or error.
   */
  public async executeWithFallback<T>(
    operation: (server: rpc.Server, endpoint: RpcEndpointStatus) => Promise<T>,
    options: FallbackExecutionOptions = {},
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const allEndpoints = this.getAllEndpoints();
    const maxAttempts = allEndpoints.length;
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxAttempts) {
      const activeEndpoint = this.getActiveEndpoint();
      activeEndpoint.totalRequests += 1;
      const server = new rpc.Server(activeEndpoint.url, {
        allowHttp: activeEndpoint.url.startsWith("http://"),
      });

      try {
        // Enforce connection timeout
        const operationPromise = operation(server, activeEndpoint);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(`RPC node '${activeEndpoint.name}' timed out after ${timeoutMs}ms.`),
              ),
            timeoutMs,
          );
        });

        let result: T;
        try {
          result = await Promise.race([operationPromise, timeoutPromise]);
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }

        // Success: record healthy state
        activeEndpoint.status = "healthy";
        activeEndpoint.consecutiveFailures = 0;
        return result;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;
        attempts += 1;
        activeEndpoint.failedRequests += 1;
        activeEndpoint.consecutiveFailures += 1;
        activeEndpoint.status =
          activeEndpoint.consecutiveFailures >= this.options.maxConsecutiveFailuresBeforeUnreachable
            ? "unreachable"
            : "degraded";

        // Silent failover to next node if more attempts remain
        if (attempts < maxAttempts) {
          const reason = error.message || "Connection timeout or failure";
          this.failoverToNext(reason);
        }
      }
    }

    throw new Error(
      `All ${maxAttempts} RPC endpoints failed. Last error: ${lastError?.message || lastError}`,
    );
  }

  /**
   * Executes a Horizon REST request with automatic silent failover across Horizon endpoints.
   */
  public async executeHorizonFetchWithFallback(
    pathBuilder: (horizonBaseUrl: string) => string,
    init?: RequestInit,
    options: FallbackExecutionOptions = {},
  ): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const horizonNodes = DEFAULT_HORIZON_NODES;
    let lastError: Error | null = null;

    for (const horizonUrl of horizonNodes) {
      const cleanUrl = horizonUrl.replace(/\/+$/, "");
      const fullUrl = pathBuilder(cleanUrl);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(fullUrl, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        if (response.ok || response.status === 404) {
          return response;
        }
        throw new Error(`Horizon node returned HTTP ${response.status}`);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        lastError = error;
        console.warn(
          `[Horizon Fallback] Node "${horizonUrl}" failed. Silently trying next node...`,
        );
      }
    }

    throw new Error(`All Horizon endpoints failed. Last error: ${lastError?.message || lastError}`);
  }

  /**
   * Resets all health statuses and consecutive failure counters.
   */
  public resetStatus(): void {
    this.endpoints.forEach((ep) => {
      ep.status = "untested";
      ep.latencyMs = null;
      ep.consecutiveFailures = 0;
      ep.failedRequests = 0;
      ep.totalRequests = 0;
    });
    this.failoverHistory = [];
    this.notifyListeners({
      type: "active_changed",
      active: this.getActiveEndpoint(),
      endpoints: this.getAllEndpoints(),
    });
  }

  /**
   * Subscribes to RPC manager failover and health check events.
   */
  public subscribe(
    listener: (event: {
      type: "failover" | "health_check" | "active_changed";
      active: RpcEndpointStatus;
      endpoints: RpcEndpointStatus[];
      eventDetails?: RpcFailoverEvent;
    }) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: {
    type: "failover" | "health_check" | "active_changed";
    active: RpcEndpointStatus;
    endpoints: RpcEndpointStatus[];
    eventDetails?: RpcFailoverEvent;
  }): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in RPC fallback listener:", err);
      }
    });
  }
}

// Global Singleton Instance for StormSale application runtime
export const rpcFallbackManager = new RpcFallbackManager();
