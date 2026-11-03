import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  useSegmentStormSale,
  hasAnalyticsConsent,
  setAnalyticsConsent,
  initializeAnalyticsOnce,
  resetAnalyticsSessionForTesting,
  trackCampaignViewedEvent,
  trackOrderCompletedEvent,
  dispatchCDPTrack,
  ANALYTICS_CONSENT_STORAGE_KEY,
  type UseSegmentStormSaleReturn,
} from "../hooks/useSegmentStormSale";

// In-memory localStorage polyfill for Node.js Vitest environment
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

describe("useSegmentStormSale Hook & CDP Dispatcher Suite", () => {
  const originalWindow = globalThis.window;
  let mockStorage: MockLocalStorage;
  let mockSegmentTrack: any;
  let mockRudderTrack: any;

  beforeEach(() => {
    resetAnalyticsSessionForTesting();
    mockStorage = new MockLocalStorage();
    mockSegmentTrack = vi.fn();
    mockRudderTrack = vi.fn();

    const mockWindow: any = {
      localStorage: mockStorage,
      analytics: {
        track: mockSegmentTrack,
        load: vi.fn(),
        page: vi.fn(),
        identify: vi.fn(),
      },
      rudderanalytics: {
        track: mockRudderTrack,
        load: vi.fn(),
        page: vi.fn(),
        identify: vi.fn(),
      },
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    (globalThis as any).window = mockWindow;
    (globalThis as any).localStorage = mockStorage;
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    delete (globalThis as any).localStorage;
    resetAnalyticsSessionForTesting();
    vi.restoreAllMocks();
  });

  describe("Consent Gating Policy", () => {
    it("does not fire events when consent is not given (consent = false)", () => {
      setAnalyticsConsent(false);
      expect(hasAnalyticsConsent()).toBe(false);

      const tracked = trackCampaignViewedEvent({
        campaignId: "camp_1",
        campaignName: "Test Campaign",
        commissionRate: 10,
      });

      expect(tracked).toBe(false);
      expect(mockSegmentTrack).not.toHaveBeenCalled();
      expect(mockRudderTrack).not.toHaveBeenCalled();
    });

    it("does not fire events when consent storage key is missing", () => {
      mockStorage.removeItem(ANALYTICS_CONSENT_STORAGE_KEY);
      expect(hasAnalyticsConsent()).toBe(false);

      const tracked = trackOrderCompletedEvent({
        orderId: "ord_1",
        campaignId: "camp_1",
        revenue: 100,
        affiliateAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
      });

      expect(tracked).toBe(false);
      expect(mockSegmentTrack).not.toHaveBeenCalled();
      expect(mockRudderTrack).not.toHaveBeenCalled();
    });

    it("allows events to fire when consent is granted", () => {
      setAnalyticsConsent(true);
      expect(hasAnalyticsConsent()).toBe(true);

      const tracked = trackCampaignViewedEvent({
        campaignId: "camp_10",
        campaignName: "Growth Campaign",
        category: "SaaS",
        commissionRate: 20,
      });

      expect(tracked).toBe(true);
      expect(mockSegmentTrack).toHaveBeenCalledTimes(1);
      expect(mockRudderTrack).toHaveBeenCalledTimes(1);
    });

    it("updates consent dynamically via setAnalyticsConsent", () => {
      expect(hasAnalyticsConsent()).toBe(false);

      // Attempt tracking without consent -> fails
      const trackedBefore = trackCampaignViewedEvent({
        campaignId: "camp_1",
        campaignName: "Pre-consent Camp",
        commissionRate: 5,
      });
      expect(trackedBefore).toBe(false);
      expect(mockSegmentTrack).not.toHaveBeenCalled();

      // Grant consent dynamically
      setAnalyticsConsent(true);
      expect(hasAnalyticsConsent()).toBe(true);

      // Track again -> succeeds
      const trackedAfter = trackCampaignViewedEvent({
        campaignId: "camp_1",
        campaignName: "Post-consent Camp",
        commissionRate: 5,
      });
      expect(trackedAfter).toBe(true);
      expect(mockSegmentTrack).toHaveBeenCalledTimes(1);
      expect(mockRudderTrack).toHaveBeenCalledTimes(1);
    });
  });

  describe("Event Payload Integrity & Dual Dispatch", () => {
    beforeEach(() => {
      setAnalyticsConsent(true);
    });

    it("fires Campaign Viewed with correct mapped properties and identical call shapes", () => {
      const result = trackCampaignViewedEvent({
        campaignId: "CAMP_99",
        campaignName: "StormSale Summer Boost",
        category: "Affiliate Marketing",
        commissionRate: 15.5,
      });

      expect(result).toBe(true);

      const expectedEvent = "Campaign Viewed";
      const expectedProps = {
        campaign_id: "CAMP_99",
        campaign_name: "StormSale Summer Boost",
        category: "Affiliate Marketing",
        commission_rate: 15.5,
      };

      // Both Segment and RudderStack must receive identical call shapes
      expect(mockSegmentTrack).toHaveBeenCalledWith(expectedEvent, expectedProps);
      expect(mockRudderTrack).toHaveBeenCalledWith(expectedEvent, expectedProps);
    });

    it("fires Order Completed with correct mapped properties, XLM currency, and hashed affiliate ID", () => {
      const rawAffiliate = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

      const result = trackOrderCompletedEvent({
        orderId: "TX_SOROBAN_9091",
        campaignId: "CAMP_99",
        revenue: "420.50",
        affiliateAddress: rawAffiliate,
      });

      expect(result).toBe(true);
      expect(mockSegmentTrack).toHaveBeenCalledTimes(1);
      expect(mockRudderTrack).toHaveBeenCalledTimes(1);

      const segmentCall = mockSegmentTrack.mock.calls[0];
      const rudderCall = mockRudderTrack.mock.calls[0];

      // Verify identical event names
      expect(segmentCall[0]).toBe("Order Completed");
      expect(rudderCall[0]).toBe("Order Completed");

      // Verify identical mapped properties
      expect(segmentCall[1]).toEqual(rudderCall[1]);

      const payload = segmentCall[1];
      expect(payload.order_id).toBe("TX_SOROBAN_9091");
      expect(payload.campaign_id).toBe("CAMP_99");
      expect(payload.revenue).toBe(420.5);
      expect(payload.currency).toBe("XLM");

      // Verify SHA-256 hash length & format
      expect(payload.affiliate_id).toMatch(/^[a-f0-9]{64}$/);

      // CRITICAL SECURITY ASSERTION: Raw wallet address is never present in any payload
      expect(JSON.stringify(payload)).not.toContain(rawAffiliate);
    });

    it("prevents execution if payload fails PII validation", () => {
      expect(() => {
        dispatchCDPTrack("Custom Event", {
          walletAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        });
      }).toThrow(/PII Violation/);

      expect(mockSegmentTrack).not.toHaveBeenCalled();
      expect(mockRudderTrack).not.toHaveBeenCalled();
    });
  });

  describe("Session Singleton Initialization", () => {
    it("does not initialize SDKs if consent is absent", () => {
      setAnalyticsConsent(false);
      const status = initializeAnalyticsOnce();
      expect(status.segment).toBe(false);
      expect(status.rudderstack).toBe(false);
    });

    it("initializes only once per session", () => {
      setAnalyticsConsent(true);

      const firstCall = initializeAnalyticsOnce();
      const secondCall = initializeAnalyticsOnce();

      expect(firstCall).toEqual(secondCall);
    });
  });

  describe("useSegmentStormSale React Hook in Component Context", () => {
    it("renders inside a React component and exposes tracking methods", () => {
      setAnalyticsConsent(true);

      let hookOutput: UseSegmentStormSaleReturn | null = null;

      function TestHarness() {
        hookOutput = useSegmentStormSale();
        return React.createElement("div", null, "Hook Mounted");
      }

      renderToString(React.createElement(TestHarness));

      expect(hookOutput).not.toBeNull();
      expect(hookOutput!.hasConsent).toBe(true);
      expect(typeof hookOutput!.trackCampaignViewed).toBe("function");
      expect(typeof hookOutput!.trackOrderCompleted).toBe("function");
      expect(typeof hookOutput!.trackCustomEvent).toBe("function");
      expect(typeof hookOutput!.setConsent).toBe("function");

      // Calling track through hook delegates cleanly
      const tracked = hookOutput!.trackCampaignViewed({
        campaignId: "HOOK_CAMP",
        campaignName: "Hook Test",
        commissionRate: 5,
      });

      expect(tracked).toBe(true);
      expect(mockSegmentTrack).toHaveBeenCalledWith(
        "Campaign Viewed",
        expect.objectContaining({
          campaign_id: "HOOK_CAMP",
          campaign_name: "Hook Test",
        }),
      );
    });
  });
});
