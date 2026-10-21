import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RpcFallbackManager,
  DEFAULT_RPC_NODES,
  DEFAULT_HORIZON_NODES,
  type RpcEndpoint,
} from "../lib/rpcFallback";

describe("RpcFallbackManager & Silent Node Redundancy (#109)", () => {
  let manager: RpcFallbackManager;

  const mockNodes: RpcEndpoint[] = [
    {
      id: "primary-sdf",
      name: "SDF Testnet (Primary)",
      url: "https://soroban-testnet.stellar.org",
      type: "primary",
      isLocal: false,
      priority: 1,
    },
    {
      id: "local-node",
      name: "Local Node (BlockDAG / Standalone)",
      url: "http://localhost:8000/soroban/rpc",
      type: "local",
      isLocal: true,
      priority: 2,
    },
    {
      id: "blockdag-gateway",
      name: "BlockDAG Gateway",
      url: "https://rpc.blockdag.network",
      type: "blockdag",
      isLocal: false,
      priority: 3,
    },
    {
      id: "backup-publicnode",
      name: "PublicNode Backup",
      url: "https://stellar-testnet.publicnode.com",
      type: "backup",
      isLocal: false,
      priority: 4,
    },
  ];

  beforeEach(() => {
    manager = new RpcFallbackManager(mockNodes, {
      timeoutMs: 500,
      maxConsecutiveFailuresBeforeUnreachable: 2,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Initialization & Default Pools", () => {
    it("loads default endpoints including Local Node and BlockDAG", () => {
      expect(DEFAULT_RPC_NODES.length).toBeGreaterThanOrEqual(4);
      const defaultMgr = new RpcFallbackManager();
      const endpoints = defaultMgr.getAllEndpoints();

      expect(endpoints.length).toBeGreaterThanOrEqual(4);
      expect(endpoints.some((e) => e.isLocal && e.url.includes("localhost:8000"))).toBe(true);
      expect(endpoints.some((e) => e.type === "blockdag")).toBe(true);
      expect(endpoints.some((e) => e.type === "primary")).toBe(true);
    });

    it("sets the highest priority node as active by default", () => {
      const active = manager.getActiveEndpoint();
      expect(active.id).toBe("primary-sdf");
      expect(active.priority).toBe(1);
    });

    it("verifies default Horizon nodes list includes localhost standalone", () => {
      expect(DEFAULT_HORIZON_NODES).toContain("http://localhost:8000");
    });
  });

  describe("Active Endpoint Management & Manual Selection", () => {
    it("switches active endpoint by ID", () => {
      const switched = manager.setActiveEndpoint("local-node");
      expect(switched.id).toBe("local-node");
      expect(manager.getActiveEndpoint().id).toBe("local-node");
    });

    it("switches active endpoint by URL", () => {
      const switched = manager.setActiveEndpoint("https://rpc.blockdag.network");
      expect(switched.id).toBe("blockdag-gateway");
      expect(manager.getActiveEndpoint().id).toBe("blockdag-gateway");
    });

    it("throws when switching to an unknown endpoint", () => {
      expect(() => manager.setActiveEndpoint("non-existent")).toThrow(
        /RPC Endpoint 'non-existent' not found/,
      );
    });

    it("creates an rpc.Server configured for the active endpoint", () => {
      manager.setActiveEndpoint("local-node");
      const server = manager.getActiveRpcServer();
      expect(server).toBeDefined();
    });
  });

  describe("Adding & Removing Dynamic Endpoints", () => {
    it("adds a custom local node and makes it available in the pool", () => {
      const custom = manager.addEndpoint({
        id: "custom-local",
        name: "Developer Docker Node",
        url: "http://127.0.0.1:8001/soroban/rpc",
        type: "local",
        isLocal: true,
      });

      expect(custom.id).toBe("custom-local");
      expect(manager.getAllEndpoints().some((e) => e.id === "custom-local")).toBe(true);
    });

    it("removes an endpoint, triggering failover if the removed node was active", () => {
      manager.setActiveEndpoint("primary-sdf");
      expect(manager.getActiveEndpoint().id).toBe("primary-sdf");

      const removed = manager.removeEndpoint("primary-sdf");
      expect(removed).toBe(true);
      expect(manager.getActiveEndpoint().id).not.toBe("primary-sdf");
      expect(manager.getFailoverHistory().length).toBeGreaterThan(0);
    });
  });

  describe("Silent Failover Rotation & Event Auditing", () => {
    it("silently fails over to next candidate and records failover audit trail", () => {
      expect(manager.getActiveEndpoint().id).toBe("primary-sdf");

      const next = manager.failoverToNext("Simulated connection timeout");
      expect(next.id).toBe("local-node");
      expect(manager.getActiveEndpoint().id).toBe("local-node");

      const history = manager.getFailoverHistory();
      expect(history.length).toBe(1);
      expect(history[0].fromEndpointId).toBe("primary-sdf");
      expect(history[0].toEndpointId).toBe("local-node");
      expect(history[0].reason).toBe("Simulated connection timeout");
      expect(history[0].timestamp).toBeDefined();
    });

    it("notifies subscribed listeners on failover and active change", () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      manager.failoverToNext("Test reason");
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "failover",
          active: expect.objectContaining({ id: "local-node" }),
        }),
      );

      unsubscribe();
      manager.failoverToNext("Another reason");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("Automated Failover Execution (executeWithFallback)", () => {
    it("executes successfully on primary node without failover if healthy", async () => {
      const op = vi.fn().mockResolvedValue("SUCCESS_PAYLOAD");
      const result = await manager.executeWithFallback(op);

      expect(result).toBe("SUCCESS_PAYLOAD");
      expect(op).toHaveBeenCalledTimes(1);
      expect(manager.getActiveEndpoint().id).toBe("primary-sdf");
      expect(manager.getActiveEndpoint().status).toBe("healthy");
    });

    it("silently fails over to Local Node / BlockDAG when primary node times out or fails", async () => {
      let callCount = 0;
      const op = vi.fn().mockImplementation(async (_server, endpoint) => {
        callCount++;
        if (endpoint.id === "primary-sdf") {
          throw new Error("ETIMEDOUT: Connection refused by upstream node");
        }
        return `SUCCESS_FROM_${endpoint.id}`;
      });

      const result = await manager.executeWithFallback(op);

      expect(result).toBe("SUCCESS_FROM_local-node");
      expect(callCount).toBe(2);
      expect(manager.getActiveEndpoint().id).toBe("local-node");

      // Verify failover event was recorded silently
      const history = manager.getFailoverHistory();
      expect(history.length).toBe(1);
      expect(history[0].fromEndpointId).toBe("primary-sdf");
      expect(history[0].toEndpointId).toBe("local-node");
    });

    it("throws descriptive error when all registered nodes fail", async () => {
      const failingOp = vi.fn().mockRejectedValue(new Error("Global network partition"));

      await expect(manager.executeWithFallback(failingOp)).rejects.toThrow(
        /All 4 RPC endpoints failed/,
      );

      expect(failingOp).toHaveBeenCalledTimes(4);
    });

    it("fails over to next node when operation hangs and exceeds timeoutMs", async () => {
      let callCount = 0;
      const hangingOp = vi.fn().mockImplementation(async (_server, endpoint) => {
        callCount++;
        if (endpoint.id === "primary-sdf") {
          return new Promise((resolve) => setTimeout(() => resolve("LATE_RESULT"), 400));
        }
        return `FAST_FROM_${endpoint.id}`;
      });

      const fastManager = new RpcFallbackManager(mockNodes, { timeoutMs: 50 });
      const result = await fastManager.executeWithFallback(hangingOp);

      expect(result).toBe("FAST_FROM_local-node");
      expect(callCount).toBe(2);
      expect(fastManager.getActiveEndpoint().id).toBe("local-node");
    });
  });

  describe("Health Check & Latency Probing", () => {
    it("checks single endpoint health with healthy JSON-RPC response", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "healthy" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", mockFetch);

      const ep = await manager.checkEndpointHealth("local-node");
      expect(ep.status).toBe("healthy");
      expect(ep.latencyMs).toBeTypeOf("number");
      expect(ep.lastCheckedAt).toBeDefined();
      expect(ep.consecutiveFailures).toBe(0);
    });

    it("marks endpoint degraded on non-healthy JSON-RPC result or HTTP error", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { status: "syncing" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", mockFetch);

      const ep = await manager.checkEndpointHealth("local-node");
      expect(ep.status).toBe("degraded");
      expect(ep.consecutiveFailures).toBe(1);
    });

    it("marks endpoint unreachable after consecutive failures exceed threshold", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      vi.stubGlobal("fetch", mockFetch);

      await manager.checkEndpointHealth("local-node");
      const epUnreachable = await manager.checkEndpointHealth("local-node");

      expect(epUnreachable.status).toBe("unreachable");
      expect(epUnreachable.consecutiveFailures).toBeGreaterThanOrEqual(2);
      expect(epUnreachable.latencyMs).toBeNull();
    });

    it("checks all endpoints health in parallel with mocked fetch", async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: { status: "healthy" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );
      vi.stubGlobal("fetch", mockFetch);

      const all = await manager.checkAllHealth();
      expect(all.length).toBe(4);
      all.forEach((ep) => {
        expect(ep.status).toBe("healthy");
        expect(ep.lastCheckedAt).toBeDefined();
      });
    });

    it("resets status and counters with resetStatus()", async () => {
      const mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: { status: "healthy" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );
      vi.stubGlobal("fetch", mockFetch);

      await manager.checkAllHealth();
      manager.failoverToNext("Testing reset");
      expect(manager.getFailoverHistory().length).toBe(1);

      manager.resetStatus();
      expect(manager.getFailoverHistory().length).toBe(0);
      expect(manager.getActiveEndpoint().status).toBe("untested");
      expect(manager.getActiveEndpoint().consecutiveFailures).toBe(0);
    });
  });

  describe("Horizon Silent Fallback (executeHorizonFetchWithFallback)", () => {
    it("silently retries across multiple Horizon endpoints if first fails", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("504 Gateway Timeout"));
        }
        return Promise.resolve(new Response(JSON.stringify({ balances: [] }), { status: 200 }));
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await manager.executeHorizonFetchWithFallback((base) => `${base}/accounts/test`);
      expect(res.ok).toBe(true);
      expect(callCount).toBeGreaterThanOrEqual(2);
    });
  });
});
