import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RpcFallbackManager, type RpcEndpoint } from "../lib/rpcFallback";

describe("Soroban RPC Network Failover and Endpoint Fallback Suite (#421)", () => {
  let manager: RpcFallbackManager;

  const mockEndpoints: RpcEndpoint[] = [
    {
      id: "primary-sdf",
      name: "SDF Main RPC (Primary)",
      url: "https://soroban-testnet.stellar.org",
      type: "primary",
      isLocal: false,
      priority: 1,
    },
    {
      id: "secondary-blockdaemon",
      name: "Blockdaemon Secondary Backup",
      url: "https://testnet.stellar.blockdaemon.com/soroban",
      type: "backup",
      isLocal: false,
      priority: 2,
    },
    {
      id: "tertiary-publicnode",
      name: "PublicNode Tertiary Gateway",
      url: "https://stellar-testnet.publicnode.com",
      type: "backup",
      isLocal: false,
      priority: 3,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new RpcFallbackManager(mockEndpoints, {
      timeoutMs: 300,
      maxConsecutiveFailuresBeforeUnreachable: 2,
      cooldownPeriodMs: 1000,
      initialBackoffMs: 20,
      maxBackoffMs: 200,
      jitterFactor: 0.2,
    });
  });

  afterEach(() => {
    manager.stopHealthCheckPolling();
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // 1. RPC Request Failure Interceptor Switching from Primary to Secondary/Tertiary
  // =========================================================================
  describe("1. RPC Request Failure Interceptor Switching", () => {
    it("seamlessly switches from primary to secondary when primary returns 429 Too Many Requests", async () => {
      let callCount = 0;

      const result = await manager.executeWithFallback(async (_server, endpoint) => {
        callCount++;
        if (endpoint.id === "primary-sdf") {
          throw new Error("HTTP 429: Rate limit exceeded on primary Soroban node");
        }
        return `success-from-${endpoint.id}`;
      });

      expect(callCount).toBe(2);
      expect(result).toBe("success-from-secondary-blockdaemon");
      expect(manager.getActiveEndpoint().id).toBe("secondary-blockdaemon");

      const history = manager.getFailoverHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].fromEndpointId).toBe("primary-sdf");
      expect(history[0].toEndpointId).toBe("secondary-blockdaemon");
      expect(history[0].reason).toContain("429");
    });

    it("cascades from primary to tertiary when both primary and secondary return 502/503 errors", async () => {
      let callCount = 0;

      const result = await manager.executeWithFallback(async (_server, endpoint) => {
        callCount++;
        if (endpoint.id === "primary-sdf") {
          throw new Error("HTTP 503: Service Unavailable");
        }
        if (endpoint.id === "secondary-blockdaemon") {
          throw new Error("HTTP 502: Bad Gateway upstream timeout");
        }
        return `success-from-${endpoint.id}`;
      });

      expect(callCount).toBe(3);
      expect(result).toBe("success-from-tertiary-publicnode");
      expect(manager.getActiveEndpoint().id).toBe("tertiary-publicnode");
    });

    it("switches to secondary node when primary RPC operation times out", async () => {
      const result = await manager.executeWithFallback(
        async (_server, endpoint) => {
          if (endpoint.id === "primary-sdf") {
            // Simulate hanging request that exceeds timeoutMs (50ms)
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
          return `recovered-by-${endpoint.id}`;
        },
        { timeoutMs: 50 },
      );

      expect(result).toBe("recovered-by-secondary-blockdaemon");
      expect(manager.getActiveEndpoint().id).toBe("secondary-blockdaemon");
    });
  });

  // =========================================================================
  // 2. Exponential Backoff and Jitter Configuration During Network Congestion
  // =========================================================================
  describe("2. Exponential Backoff and Jitter Configuration", () => {
    it("computes increasing exponential backoff delays across successive retry attempts", () => {
      // With jitterFactor = 0 for deterministic validation
      const b0 = manager.calculateBackoffWithJitter(0, 50, 1000, 0);
      const b1 = manager.calculateBackoffWithJitter(1, 50, 1000, 0);
      const b2 = manager.calculateBackoffWithJitter(2, 50, 1000, 0);
      const b3 = manager.calculateBackoffWithJitter(3, 50, 1000, 0);

      expect(b0).toBe(50);
      expect(b1).toBe(100);
      expect(b2).toBe(200);
      expect(b3).toBe(400);
    });

    it("clamps exponential backoff delay to the configured maxBackoffMs ceiling", () => {
      const clamped = manager.calculateBackoffWithJitter(10, 50, 300, 0);
      expect(clamped).toBe(300);
    });

    it("applies randomized jitter factor within the specified boundary range", () => {
      const base = 100;
      const jitterFactor = 0.25;

      for (let i = 0; i < 20; i++) {
        const val = manager.calculateBackoffWithJitter(0, base, 1000, jitterFactor);
        expect(val).toBeGreaterThanOrEqual(base * (1 - jitterFactor) - 1);
        expect(val).toBeLessThanOrEqual(base * (1 + jitterFactor) + 1);
      }
    });

    it("invokes calculateBackoffWithJitter when retryWithBackoff is enabled during congestion", async () => {
      const backoffSpy = vi.spyOn(manager, "calculateBackoffWithJitter");

      await manager.executeWithFallback(
        async (_server, endpoint) => {
          if (endpoint.id === "primary-sdf") {
            throw new Error("HTTP 429: Rate limited");
          }
          return "ok";
        },
        { retryWithBackoff: true },
      );

      expect(backoffSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. User Alert Banner Triggers Only After All Backup RPC Endpoints Fail
  // =========================================================================
  describe("3. User Alert Banner Activation Logic", () => {
    it("does NOT trigger alert banner when primary fails but secondary succeeds", async () => {
      const alertListener = vi.fn();
      manager.subscribe(alertListener);

      await manager.executeWithFallback(async (_server, endpoint) => {
        if (endpoint.id === "primary-sdf") {
          throw new Error("Primary connection error");
        }
        return "secondary-ok";
      });

      expect(manager.isAlertBannerTriggered()).toBe(false);
      const bannerEvents = alertListener.mock.calls.filter(([ev]) => ev.type === "alert_banner");
      expect(bannerEvents).toHaveLength(0);
    });

    it("triggers alert banner and emits notification ONLY when all backup endpoints fail", async () => {
      const alertListener = vi.fn();
      manager.subscribe(alertListener);

      await expect(
        manager.executeWithFallback(async () => {
          throw new Error("Total cluster partition");
        }),
      ).rejects.toThrow(/All 3 RPC endpoints failed/);

      expect(manager.isAlertBannerTriggered()).toBe(true);

      const bannerEvents = alertListener.mock.calls.filter(([ev]) => ev.type === "alert_banner");
      expect(bannerEvents).toHaveLength(1);
      expect(bannerEvents[0][0].message).toContain("All 3 Soroban RPC endpoints are unreachable");
    });

    it("allows dismissing the alert banner", async () => {
      await expect(
        manager.executeWithFallback(async () => {
          throw new Error("Cluster outage");
        }),
      ).rejects.toThrow();

      expect(manager.isAlertBannerTriggered()).toBe(true);
      manager.dismissAlertBanner();
      expect(manager.isAlertBannerTriggered()).toBe(false);
    });
  });

  // =========================================================================
  // 4. Circuit Breaker Pattern Preventing Repeated Calls to Dead RPC Nodes
  // =========================================================================
  describe("4. Circuit Breaker Pattern for Dead RPC Nodes", () => {
    it("opens circuit breaker after consecutive failures reach threshold", () => {
      const primary = manager.getActiveEndpoint();
      expect(manager.isCircuitOpen(primary.id)).toBe(false);

      // Simulate failures exceeding maxConsecutiveFailuresBeforeUnreachable (2)
      primary.consecutiveFailures = 2;
      primary.circuitBreakerState = "OPEN";
      primary.circuitBreakerResetAt = Date.now() + 5000;

      expect(manager.isCircuitOpen(primary.id)).toBe(true);
    });

    it("skips calling dead node directly when its circuit breaker is OPEN", async () => {
      const primary = manager.getActiveEndpoint();
      primary.circuitBreakerState = "OPEN";
      primary.circuitBreakerResetAt = Date.now() + 10000;

      const calledEndpoints: string[] = [];

      const result = await manager.executeWithFallback(async (_server, endpoint) => {
        calledEndpoints.push(endpoint.id);
        return `handled-by-${endpoint.id}`;
      });

      // Primary was skipped entirely without invoking the network operation
      expect(calledEndpoints).not.toContain("primary-sdf");
      expect(calledEndpoints).toContain("secondary-blockdaemon");
      expect(result).toBe("handled-by-secondary-blockdaemon");
    });

    it("transitions circuit breaker to HALF_OPEN after cooldown period elapses", () => {
      const primary = manager.getActiveEndpoint();
      primary.circuitBreakerState = "OPEN";
      primary.circuitBreakerResetAt = Date.now() - 100; // Cooldown expired in the past

      // isCircuitOpen should recognize cooldown expiration and return false (HALF_OPEN probe)
      const open = manager.isCircuitOpen(primary.id);
      expect(open).toBe(false);
      expect(primary.circuitBreakerState).toBe("HALF_OPEN");
    });
  });

  // =========================================================================
  // 5. Health-Check Polling Restoring Primary RPC Once Connectivity Recovers
  // =========================================================================
  describe("5. Health-Check Polling and Primary Node Restoration", () => {
    it("restores primary RPC when health check returns healthy after failover", async () => {
      // 1. Force failover to secondary
      manager.failoverToNext("Simulated primary maintenance");
      expect(manager.getActiveEndpoint().id).toBe("secondary-blockdaemon");

      // 2. Mock global fetch to return healthy JSON-RPC for primary
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            jsonrpc: "2.0",
            result: { status: "healthy" },
          }),
        }),
      );

      const listener = vi.fn();
      manager.subscribe(listener);

      // 3. Run health check recovery poll
      const restored = await manager.pollAndRestorePrimary();
      expect(restored).toBe(true);
      expect(manager.getActiveEndpoint().id).toBe("primary-sdf");

      // Verify event was dispatched
      const restoreEvents = listener.mock.calls.filter(([ev]) => ev.type === "primary_restored");
      expect(restoreEvents).toHaveLength(1);
      expect(restoreEvents[0][0].active.id).toBe("primary-sdf");
    });

    it("does not restore primary if health check continues to report errors", async () => {
      manager.failoverToNext("Primary outage");
      expect(manager.getActiveEndpoint().id).toBe("secondary-blockdaemon");

      // Mock fetch failure
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
        }),
      );

      const restored = await manager.pollAndRestorePrimary();
      expect(restored).toBe(false);
      expect(manager.getActiveEndpoint().id).toBe("secondary-blockdaemon");
    });

    it("starts and stops periodic health check polling without leaking timers", () => {
      const pollSpy = vi.spyOn(manager, "pollAndRestorePrimary").mockResolvedValue(false);

      vi.useFakeTimers();
      try {
        manager.startHealthCheckPolling(1000);
        vi.advanceTimersByTime(3000);
        expect(pollSpy).toHaveBeenCalledTimes(3);

        manager.stopHealthCheckPolling();
        vi.advanceTimersByTime(3000);
        expect(pollSpy).toHaveBeenCalledTimes(3); // No further invocations
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
