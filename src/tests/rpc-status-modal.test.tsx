import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { RpcStatusModal } from "../components/shared/RpcStatusModal";
import type { RpcEndpointStatus, RpcFailoverEvent } from "../lib/rpcFallback";

vi.mock("../hooks/useWeb3", () => ({
  useWeb3: vi.fn(),
}));

import { useWeb3 } from "../hooks/useWeb3";

describe("RpcStatusModal Component & Accessibility (#109)", () => {
  const mockEndpoints: RpcEndpointStatus[] = [
    {
      id: "sdf-testnet",
      name: "Stellar SDF Testnet (Primary)",
      url: "https://soroban-testnet.stellar.org",
      type: "primary",
      isLocal: false,
      priority: 1,
      status: "healthy",
      latencyMs: 42,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      totalRequests: 10,
      failedRequests: 0,
    },
    {
      id: "local-node",
      name: "Local Node RPC (BlockDAG / Standalone)",
      url: "http://localhost:8000/soroban/rpc",
      type: "local",
      isLocal: true,
      priority: 2,
      status: "degraded",
      latencyMs: null,
      lastCheckedAt: new Date().toISOString(),
      consecutiveFailures: 1,
      totalRequests: 2,
      failedRequests: 1,
    },
  ];

  const mockFailoverHistory: RpcFailoverEvent[] = [
    {
      id: "fo-1",
      timestamp: new Date().toISOString(),
      fromEndpointId: "sdf-testnet",
      fromUrl: "https://soroban-testnet.stellar.org",
      toEndpointId: "local-node",
      toUrl: "http://localhost:8000/soroban/rpc",
      reason: "Simulated connection timeout",
    },
  ];

  const baseWeb3Context = {
    isRpcModalOpen: true,
    closeRpcModal: vi.fn(),
    activeRpcEndpoint: mockEndpoints[0],
    rpcEndpoints: mockEndpoints,
    rpcFailoverHistory: mockFailoverHistory,
    rpcTimeoutMs: 3500,
    switchRpcEndpoint: vi.fn(),
    simulateRpcFailover: vi.fn(),
    checkRpcHealth: vi.fn(),
    addCustomRpcEndpoint: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWeb3).mockReturnValue(baseWeb3Context as unknown as ReturnType<typeof useWeb3>);
  });

  it("does not render when isRpcModalOpen is false", () => {
    vi.mocked(useWeb3).mockReturnValue({
      ...baseWeb3Context,
      isRpcModalOpen: false,
    } as unknown as ReturnType<typeof useWeb3>);

    const html = renderToString(<RpcStatusModal />);
    expect(html).toBe("");
  });

  it("renders with role='dialog', aria-modal='true', and accessible title", () => {
    const html = renderToString(<RpcStatusModal />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="rpc-status-modal-title"');
    expect(html).toContain('id="rpc-status-modal-title"');
    expect(html).toContain("Soroban &amp; BlockDAG RPC Health");
  });

  it("provides accessible close button with type='button' and aria-label", () => {
    const html = renderToString(<RpcStatusModal />);

    // Verify type="button" and aria-label="Close RPC status" on the same button element
    expect(html).toMatch(/<button\b[^>]*\btype="button"[^>]*\baria-label="Close RPC status"[^>]*>/);
  });

  it("displays dynamic timeout from rpcTimeoutMs and active node status", () => {
    const html = renderToString(<RpcStatusModal />);

    expect(html).toContain("Timeout:");
    expect(html).toContain("3500");
    expect(html).toContain("Stellar SDF Testnet (Primary)");
    expect(html).toMatch(/42\s*(<!--.*?-->)?\s*ms/);
    expect(html).toContain("Silent Failover Active");
  });

  it("displays service interruption warning when all endpoints are unreachable", () => {
    const allUnreachableEndpoints: RpcEndpointStatus[] = mockEndpoints.map((ep) => ({
      ...ep,
      status: "unreachable",
    }));

    vi.mocked(useWeb3).mockReturnValue({
      ...baseWeb3Context,
      activeRpcEndpoint: allUnreachableEndpoints[0],
      rpcEndpoints: allUnreachableEndpoints,
    } as unknown as ReturnType<typeof useWeb3>);

    const html = renderToString(<RpcStatusModal />);

    expect(html).toContain("Infrastructure • Service Interrupted");
    expect(html).toContain("All RPC Nodes Unreachable");
  });
});
