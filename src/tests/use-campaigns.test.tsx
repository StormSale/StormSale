import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import ReactDOM from "react-dom/client";
import {
  useCampaigns,
  INITIAL_CAMPAIGNS,
  filterCampaigns,
  isLowEscrowCampaign,
  getStoredCampaigns,
  setStoredCampaigns,
  type Campaign,
  type UseCampaignsOptions,
  type UseCampaignsResult,
} from "../hooks/useCampaigns";

// Minimal mock DOM for React 19 testing in node environment
class MockElement {
  nodeType = 1;
  nodeName: string;
  tagName: string;
  children: MockElement[] = [];
  ownerDocument: any;
  style = {};

  constructor(name = "div") {
    this.nodeName = name.toUpperCase();
    this.tagName = name;
    this.ownerDocument = (globalThis as any).document;
  }
  appendChild(child: MockElement) {
    this.children.push(child);
    return child;
  }
  removeChild(child: MockElement) {
    return child;
  }
  insertBefore(child: MockElement) {
    this.children.push(child);
    return child;
  }
  setAttribute() {}
  removeAttribute() {}
  addEventListener() {}
  removeEventListener() {}
}

function setupMockDOM() {
  (globalThis as any).Element = MockElement;
  (globalThis as any).HTMLElement = MockElement;
  (globalThis as any).HTMLIFrameElement = class extends MockElement {};
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

  const eventListeners: Record<string, Set<EventListener>> = {};

  const mockDoc = {
    nodeType: 9,
    createElement: (tag: string) => new MockElement(tag),
    createTextNode: () => ({ nodeType: 3, nodeName: "#text" }),
    createComment: () => ({ nodeType: 8, nodeName: "#comment" }),
    addEventListener: (event: string, cb: EventListener) => {
      if (!eventListeners[event]) eventListeners[event] = new Set();
      eventListeners[event].add(cb);
    },
    removeEventListener: (event: string, cb: EventListener) => {
      eventListeners[event]?.delete(cb);
    },
    activeElement: null,
    ownerDocument: null,
    defaultView: globalThis,
  };

  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };

  (globalThis as any).window = {
    addEventListener: (event: string, cb: EventListener) => {
      if (!eventListeners[event]) eventListeners[event] = new Set();
      eventListeners[event].add(cb);
    },
    removeEventListener: (event: string, cb: EventListener) => {
      eventListeners[event]?.delete(cb);
    },
    dispatchEvent: (ev: { type: string }) => {
      eventListeners[ev.type]?.forEach((cb) => cb(ev as any));
      return true;
    },
    localStorage: mockLocalStorage,
  };

  (globalThis as any).document = mockDoc;
}

/**
 * Custom renderHook harness utilizing ReactDOM.createRoot and React.act
 */
function renderHookHelper(options?: UseCampaignsOptions | string) {
  let latestResult!: UseCampaignsResult;

  function TestHookConsumer() {
    latestResult = useCampaigns(options);
    return null;
  }

  const container = new MockElement();
  const root = ReactDOM.createRoot(container as any);

  return {
    async mount() {
      await act(async () => {
        root.render(React.createElement(TestHookConsumer));
      });
    },
    async rerender() {
      await act(async () => {
        root.render(React.createElement(TestHookConsumer));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
    },
    get result() {
      return latestResult;
    },
  };
}

describe("Centralized useCampaigns Data Hook Suite (#70)", () => {
  beforeEach(() => {
    setupMockDOM();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. Initial Load & Type Safety
  describe("Initial Load & Type Safety", () => {
    it("returns empty array when cache is empty", async () => {
      const harness = renderHookHelper();
      await harness.mount();

      // Wait for effects to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { campaigns, isLoading, error, refetch } = harness.result;
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      expect(typeof refetch).toBe("function");
      expect(Array.isArray(campaigns)).toBe(true);
      expect(campaigns).toEqual([]);

      await harness.unmount();
    });

    it("loads campaigns with loading state transitioning to false when seeded", async () => {
      setStoredCampaigns(INITIAL_CAMPAIGNS);
      const harness = renderHookHelper();
      await harness.mount();

      // Wait for effects to settle
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { campaigns, isLoading, error, refetch } = harness.result;
      expect(isLoading).toBe(false);
      expect(error).toBeNull();
      expect(typeof refetch).toBe("function");
      expect(Array.isArray(campaigns)).toBe(true);
      expect(campaigns.length).toBe(INITIAL_CAMPAIGNS.length);

      // Verify every campaign strictly adheres to Campaign interface
      for (const c of campaigns) {
        expect(typeof c.id).toBe("string");
        expect(typeof c.name).toBe("string");
        expect(["Active", "Paused", "Completed"]).toContain(c.status);
        expect(typeof c.commissionRate).toBe("number");
        expect(typeof c.clearingPeriod).toBe("string");
        expect(typeof c.totalSales).toBe("number");
        expect(typeof c.totalRevenue).toBe("string");
        expect(typeof c.totalCommissions).toBe("string");
        expect(typeof c.affiliates).toBe("number");
        expect(typeof c.contractAddress).toBe("string");
        expect(typeof c.escrowInitial).toBe("number");
        expect(typeof c.escrowBalance).toBe("number");
      }

      await harness.unmount();
    });
  });

  // 2. Auto-refresh on new block
  describe("Auto-refresh on new block / ledger", () => {
    it("subscribes to block events on Web3 provider and cleans up on unmount", async () => {
      let blockHandler: (() => void) | null = null;
      const mockProvider = {
        on: vi.fn((event: string, cb: () => void) => {
          if (event === "block") blockHandler = cb;
        }),
        removeListener: vi.fn(),
        off: vi.fn(),
      };

      const useWeb3Module = await import("../hooks/useWeb3");
      const spy = vi.spyOn(useWeb3Module, "useWeb3").mockReturnValue({
        provider: mockProvider,
      } as any);

      let fetchCount = 0;
      const customFetcher = vi.fn(async () => {
        fetchCount++;
        return INITIAL_CAMPAIGNS;
      });

      const harness = renderHookHelper({ customFetcher });
      await harness.mount();

      expect(mockProvider.on).toHaveBeenCalledWith("block", expect.any(Function));
      expect(fetchCount).toBe(1);

      // Trigger block callback from provider
      if (blockHandler) {
        await act(async () => {
          (blockHandler as () => void)();
          await new Promise((r) => setTimeout(r, 10));
        });
      }
      expect(fetchCount).toBe(2);

      // Unmount and verify cleanup
      await harness.unmount();
      expect(
        mockProvider.removeListener.mock.calls.length + mockProvider.off.mock.calls.length,
      ).toBeGreaterThan(0);

      spy.mockRestore();
    });

    it("subscribes to window block fallback events and cleans up on unmount", async () => {
      let fetchCount = 0;
      const customFetcher = vi.fn(async () => {
        fetchCount++;
        return INITIAL_CAMPAIGNS;
      });

      const harness = renderHookHelper({ customFetcher });
      await harness.mount();

      expect(fetchCount).toBe(1);

      await act(async () => {
        (globalThis as any).window.dispatchEvent({ type: "block" });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(fetchCount).toBe(2);

      await harness.unmount();
      (globalThis as any).window.dispatchEvent({ type: "block" });
      expect(fetchCount).toBe(2);
    });

    it("triggers re-fetch when stormsale:campaigns-updated event is dispatched", async () => {
      let fetchCount = 0;
      const customFetcher = vi.fn(async () => {
        fetchCount++;
        return INITIAL_CAMPAIGNS;
      });

      const harness = renderHookHelper({ customFetcher });
      await harness.mount();

      expect(fetchCount).toBe(1);

      await act(async () => {
        (globalThis as any).window.dispatchEvent({ type: "stormsale:campaigns-updated" });
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(fetchCount).toBe(2);

      await harness.unmount();
    });
  });

  // 3. Error state handling
  describe("Error State Handling", () => {
    it("handles custom fetcher / contract exceptions gracefully", async () => {
      const testError = new Error("Soroban RPC connection refused");
      const failingFetcher = vi.fn(async () => {
        throw testError;
      });

      const harness = renderHookHelper({ customFetcher: failingFetcher });
      await harness.mount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(harness.result.isLoading).toBe(false);
      expect(harness.result.error).toBe(testError);
      expect(harness.result.campaigns).toEqual([]);

      await harness.unmount();
    });
  });

  // 4. Role Support & Filtering
  describe("Role Support & Filtering", () => {
    beforeEach(() => {
      setStoredCampaigns(INITIAL_CAMPAIGNS);
    });

    it("filters active campaigns for affiliate role", async () => {
      const harness = renderHookHelper("affiliate");
      await harness.mount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { campaigns } = harness.result;
      expect(campaigns.length).toBeGreaterThan(0);
      for (const c of campaigns) {
        expect(["Active", "Paused"]).toContain(c.status);
      }

      await harness.unmount();
    });

    it("filters low escrow campaigns when status is LowEscrow (< 10% balance)", async () => {
      const harness = renderHookHelper({ status: "LowEscrow" });
      await harness.mount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { campaigns } = harness.result;
      expect(campaigns.length).toBe(2);
      expect(campaigns.map((c) => c.id).sort()).toEqual(["2", "3"]);

      for (const c of campaigns) {
        expect(c.escrowBalance / c.escrowInitial).toBeLessThan(0.1);
        expect(c.escrowBalance).toBeGreaterThan(0);
        expect(c.status).not.toBe("Completed");
      }

      await harness.unmount();
    });

    it("filters paused campaigns when status is Paused", async () => {
      const harness = renderHookHelper({ status: "Paused" });
      await harness.mount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { campaigns } = harness.result;
      expect(campaigns.every((c) => c.status === "Paused")).toBe(true);

      await harness.unmount();
    });

    it("filters campaigns by search keyword", async () => {
      const harness = renderHookHelper({ search: "Gadgets" });
      await harness.mount();

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const { campaigns } = harness.result;
      expect(campaigns.length).toBe(1);
      expect(campaigns[0].name).toBe("Tech Gadgets Pro");

      await harness.unmount();
    });
  });

  // 5. Manual refetch
  describe("Manual Refetch Trigger", () => {
    it("re-executes data fetch when refetch() is imperatively called", async () => {
      let callCount = 0;
      const customFetcher = vi.fn(async () => {
        callCount++;
        return INITIAL_CAMPAIGNS;
      });

      const harness = renderHookHelper({ customFetcher });
      await harness.mount();

      expect(callCount).toBe(1);

      await act(async () => {
        await harness.result.refetch();
      });

      expect(callCount).toBe(2);

      await harness.unmount();
    });
  });

  // 6. Standalone filter helpers
  describe("Pure Filter Utilities", () => {
    it("isLowEscrowCampaign identifies campaigns accurately", () => {
      const healthy = INITIAL_CAMPAIGNS.find((c) => c.id === "1")!;
      const low1 = INITIAL_CAMPAIGNS.find((c) => c.id === "2")!;
      const completed = INITIAL_CAMPAIGNS.find((c) => c.id === "4")!;

      expect(isLowEscrowCampaign(healthy)).toBe(false);
      expect(isLowEscrowCampaign(low1)).toBe(true);
      expect(isLowEscrowCampaign(completed)).toBe(false);
    });

    it("filterCampaigns filters by advertiser address", () => {
      const filtered = filterCampaigns(INITIAL_CAMPAIGNS, {
        role: "advertiser",
        advertiserAddress: "NON_EXISTENT_ADDRESS",
      });
      // Mock campaigns have GASTORMSALE7...
      expect(filtered.length).toBe(0);
    });
  });

  // 7. Storage persistence & caching
  describe("Storage Persistence", () => {
    it("returns empty array when localStorage is empty", () => {
      const retrieved = getStoredCampaigns();
      expect(retrieved).toEqual([]);
    });

    it("stores and retrieves campaigns in localStorage", () => {
      const customCampaigns: Campaign[] = [
        {
          id: "99",
          name: "Test Persisted Campaign",
          status: "Active",
          commissionRate: 20,
          clearingPeriod: "5 Days",
          totalSales: 10,
          totalRevenue: "$1,000",
          totalCommissions: "$200",
          affiliates: 2,
          createdAt: "2026-10-18",
          contractAddress: "CTEST...9999",
          escrowInitial: 1000,
          escrowBalance: 800,
        },
      ];

      setStoredCampaigns(customCampaigns);
      const retrieved = getStoredCampaigns();
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].id).toBe("99");
      expect(retrieved[0].name).toBe("Test Persisted Campaign");
    });
  });
});
