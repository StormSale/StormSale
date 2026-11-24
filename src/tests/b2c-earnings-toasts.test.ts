// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

import {
  EarningsSoundManager,
  EarningsToastQueue,
  EarningsStreamListener,
  type ReferralSaleConfirmedEvent,
  type EarningsToast,
  EARNINGS_SOUND_STORAGE_KEY,
} from "../lib/b2cEarningsToasts";
import { B2CEarningsToasts } from "../components/affiliate/B2CEarningsToasts";

// Mock WebSocket implementation for unit test streaming
class MockWebSocket {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  readyState = 1;
  closed = false;

  close() {
    this.readyState = 3;
    this.closed = true;
    this.onclose?.();
  }

  emitMessage(data: unknown) {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    this.onmessage?.({ data: serialized } as MessageEvent);
  }

  emitError(err: Error) {
    this.onerror?.(err);
  }
}

// Mock EventSource implementation for unit test SSE streaming
class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  readyState = 1;
  closed = false;

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    const list = (this.listeners.get(type) || []).filter((l) => l !== listener);
    this.listeners.set(type, list);
  }

  close() {
    this.readyState = 2;
    this.closed = true;
  }

  emitMessage(data: unknown, eventType?: string) {
    const serialized = typeof data === "string" ? data : JSON.stringify(data);
    const event = { data: serialized } as MessageEvent;
    if (eventType && this.listeners.has(eventType)) {
      this.listeners.get(eventType)?.forEach((fn) => fn(event));
    } else {
      this.onmessage?.(event);
    }
  }

  emitError(err: Error) {
    this.onerror?.(err);
  }
}

describe("B2C Affiliate Real-Time Earnings Toast Notifications Suite (#453)", () => {
  const AFFILIATE_WALLET = "GASTORMMASTER000000000000000000000000000000000000000000000392";
  const OTHER_AFFILIATE_WALLET = "GASTORMOTHER0000000000000000000000000000000000000000000000392";
  const REFEREE_WALLET = "GABESTORMSALE7SUBAFFILIATE10000000000000000000000000000000392";

  let sampleEventTier1: ReferralSaleConfirmedEvent;
  let sampleEventTier2: ReferralSaleConfirmedEvent;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();

    sampleEventTier1 = {
      eventId: "evt-tier1-101",
      eventType: "ReferralSaleConfirmed",
      affiliateAddress: AFFILIATE_WALLET,
      referralAddress: REFEREE_WALLET,
      referralAlias: "Alice Merchant",
      saleAmountXlm: 250,
      commissionAmountXlm: 20,
      tier: 1,
      campaignId: "camp-summer-launch",
      campaignName: "Summer Sale 2026",
      txHash: "0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
      timestamp: "2026-11-22T10:00:00.000Z",
    };

    sampleEventTier2 = {
      eventId: "evt-tier2-202",
      eventType: "ReferralSaleConfirmed",
      affiliateAddress: AFFILIATE_WALLET,
      referralAddress: REFEREE_WALLET,
      referralAlias: "Charlie Micro-Seller",
      saleAmountXlm: 500,
      commissionAmountXlm: 10,
      overrideAmountXlm: 10,
      tier: 2,
      campaignId: "camp-tier2-growth",
      campaignName: "Downstream Boost",
      txHash: "0x9999888877776666555544443333222211110000fffffeeeeddddccccbbbbaaaa",
      timestamp: "2026-11-22T10:05:00.000Z",
    };
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("1. Notification Toast Triggers on ReferralSaleConfirmed Event", () => {
    it("enqueues a toast notification when a valid ReferralSaleConfirmed event arrives", () => {
      const queue = new EarningsToastQueue();
      const toast = queue.enqueue(sampleEventTier1);

      expect(toast).toBeDefined();
      expect(toast.event.eventType).toBe("ReferralSaleConfirmed");
      expect(toast.title).toBe("Referral Sale Confirmed!");
      expect(toast.commissionAmountXlm).toBe(20);
      expect(toast.tier).toBe(1);
      expect(toast.message).toContain("Alice Merchant");
      expect(toast.message).toContain("GAB...392");
      expect(toast.message).toContain("+20.00 XLM");
      expect(queue.getToasts()).toHaveLength(1);
    });

    it("formats Tier 2 passive override events with specific override messaging", () => {
      const queue = new EarningsToastQueue();
      const toast = queue.enqueue(sampleEventTier2);

      expect(toast.title).toBe("Sub-Affiliate Override Confirmed!");
      expect(toast.tier).toBe(2);
      expect(toast.message).toContain("Tier 2 referral");
      expect(toast.message).toContain("+10.00 XLM override");
      expect(toast.message).toContain("GAB...392");
    });

    it("triggers toasts via WebSocket stream connection on ReferralSaleConfirmed message", () => {
      const queue = new EarningsToastQueue();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        queue,
      });

      const mockWs = new MockWebSocket();
      listener.connectWebSocket(mockWs);
      expect(listener.getIsConnected()).toBe(true);

      // Emit incoming WebSocket event
      mockWs.emitMessage({
        eventType: "ReferralSaleConfirmed",
        affiliateAddress: AFFILIATE_WALLET,
        referralAddress: REFEREE_WALLET,
        saleAmountXlm: 100,
        commissionAmountXlm: 8,
        tier: 1,
        txHash: "0xtest123",
      });

      const toasts = queue.getToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].commissionAmountXlm).toBe(8);
      expect(toasts[0].txHash).toBe("0xtest123");

      listener.disconnect();
      expect(listener.getIsConnected()).toBe(false);
      expect(mockWs.closed).toBe(true);
    });

    it("triggers toasts via Server-Sent Events (SSE) EventSource connection", () => {
      const queue = new EarningsToastQueue();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        queue,
      });

      const mockEs = new MockEventSource();
      listener.connectSSE(mockEs);
      expect(listener.getIsConnected()).toBe(true);

      // Emit incoming SSE message
      mockEs.emitMessage(
        {
          eventType: "ReferralSaleConfirmed",
          affiliateAddress: AFFILIATE_WALLET,
          referralAddress: REFEREE_WALLET,
          saleAmountXlm: 300,
          commissionAmountXlm: 24,
          tier: 1,
        },
        "ReferralSaleConfirmed",
      );

      const toasts = queue.getToasts();
      expect(toasts).toHaveLength(1);
      expect(toasts[0].commissionAmountXlm).toBe(24);

      listener.disconnect();
      expect(mockEs.closed).toBe(true);
    });

    it("filters out events directed to other affiliate wallet addresses", () => {
      const queue = new EarningsToastQueue();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        queue,
      });

      const mockWs = new MockWebSocket();
      listener.connectWebSocket(mockWs);

      // Event for a different affiliate
      mockWs.emitMessage({
        eventType: "ReferralSaleConfirmed",
        affiliateAddress: OTHER_AFFILIATE_WALLET,
        referralAddress: REFEREE_WALLET,
        saleAmountXlm: 500,
        commissionAmountXlm: 40,
        tier: 1,
      });

      expect(queue.getToasts()).toHaveLength(0);

      // Event for current affiliate
      mockWs.emitMessage({
        eventType: "ReferralSaleConfirmed",
        affiliateAddress: AFFILIATE_WALLET,
        referralAddress: REFEREE_WALLET,
        saleAmountXlm: 500,
        commissionAmountXlm: 40,
        tier: 1,
      });

      expect(queue.getToasts()).toHaveLength(1);
    });

    it("safely ignores non-referral events and malformed JSON payloads without errors", () => {
      const queue = new EarningsToastQueue();
      const onError = vi.fn();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        queue,
        onError,
      });

      const mockWs = new MockWebSocket();
      listener.connectWebSocket(mockWs);

      // Different event type
      mockWs.emitMessage({ eventType: "UserLoggedIn", userId: "u-1" });
      expect(queue.getToasts()).toHaveLength(0);

      // Malformed JSON string
      mockWs.emitMessage("INVALID_JSON_OBJECT{{{");
      expect(queue.getToasts()).toHaveLength(0);
      expect(onError).toHaveBeenCalled();

      // Empty / null object
      mockWs.emitMessage(null);
      expect(queue.getToasts()).toHaveLength(0);

      // Missing required addresses
      mockWs.emitMessage({ eventType: "ReferralSaleConfirmed" });
      expect(queue.getToasts()).toHaveLength(0);
    });

    it("supports direct local event dispatching through dispatchLocalEvent", () => {
      const queue = new EarningsToastQueue();
      const onEvent = vi.fn();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        queue,
        onEvent,
      });

      listener.dispatchLocalEvent(sampleEventTier1);

      expect(onEvent).toHaveBeenCalledWith(sampleEventTier1);
      expect(queue.getToasts()).toHaveLength(1);
    });
  });

  describe("2. Verify Toast Stacking and Auto-Dismissal After 5 Seconds", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("auto-dismisses timed toast notifications after exactly 5 seconds (5000ms)", () => {
      const queue = new EarningsToastQueue({ defaultDurationMs: 5000 });
      const toast = queue.enqueue(sampleEventTier1);

      expect(queue.getToasts()).toHaveLength(1);
      expect(queue.getToasts()[0].id).toBe(toast.id);

      // Advance by 3 seconds: toast should still be present
      vi.advanceTimersByTime(3000);
      expect(queue.getToasts()).toHaveLength(1);

      // Advance by 1.9 seconds (4.9s total): still present
      vi.advanceTimersByTime(1900);
      expect(queue.getToasts()).toHaveLength(1);

      // Advance past 5000ms threshold: toast must be auto-dismissed
      vi.advanceTimersByTime(200);
      expect(queue.getToasts()).toHaveLength(0);
    });

    it("stacks multiple incoming referral toasts up to configured maximum capacity", () => {
      const maxVisible = 3;
      const queue = new EarningsToastQueue({ maxVisibleToasts: maxVisible });

      // Enqueue 4 toasts rapidly
      const t1 = queue.enqueue({ ...sampleEventTier1, eventId: "evt-1" });
      const t2 = queue.enqueue({ ...sampleEventTier1, eventId: "evt-2" });
      const t3 = queue.enqueue({ ...sampleEventTier1, eventId: "evt-3" });
      const t4 = queue.enqueue({ ...sampleEventTier1, eventId: "evt-4" });

      const currentToasts = queue.getToasts();
      // Should clamp to maxVisible (3), dropping the oldest (t1)
      expect(currentToasts).toHaveLength(maxVisible);
      expect(currentToasts[0].id).toBe(t4.id);
      expect(currentToasts[1].id).toBe(t3.id);
      expect(currentToasts[2].id).toBe(t2.id);
      expect(currentToasts.some((t) => t.id === t1.id)).toBe(false);
    });

    it("allows immediate manual dismissal of individual toasts before 5-second timeout", () => {
      const onDismissed = vi.fn();
      const queueWithCallback = new EarningsToastQueue({ onToastDismissed: onDismissed });

      const t1 = queueWithCallback.enqueue({ ...sampleEventTier1, eventId: "evt-1" });
      const t2 = queueWithCallback.enqueue({ ...sampleEventTier1, eventId: "evt-2" });

      expect(queueWithCallback.getToasts()).toHaveLength(2);

      // Manually dismiss t1
      queueWithCallback.dismiss(t1.id);
      expect(queueWithCallback.getToasts()).toHaveLength(1);
      expect(queueWithCallback.getToasts()[0].id).toBe(t2.id);
      expect(onDismissed).toHaveBeenCalledWith(t1.id);

      // Advancing timer should not error and should dismiss remaining t2 after 5s
      vi.advanceTimersByTime(5000);
      expect(queueWithCallback.getToasts()).toHaveLength(0);
    });

    it("clears all active toasts and dismiss timers when clear() is invoked", () => {
      const queue = new EarningsToastQueue();
      queue.enqueue({ ...sampleEventTier1, eventId: "evt-1" });
      queue.enqueue({ ...sampleEventTier1, eventId: "evt-2" });

      expect(queue.getToasts()).toHaveLength(2);

      queue.clear();
      expect(queue.getToasts()).toHaveLength(0);

      // Timers should be cleared cleanly without triggers
      vi.advanceTimersByTime(10000);
      expect(queue.getToasts()).toHaveLength(0);
    });
  });

  describe("3. Test User Preference Toggle to Mute Notification Sounds", () => {
    it("plays audio chime on ReferralSaleConfirmed when sound is enabled", () => {
      const soundManager = new EarningsSoundManager();
      expect(soundManager.isMuted()).toBe(false);

      const chimePlayed = soundManager.playChime();
      expect(chimePlayed).toBe(true);
      expect(soundManager.getPlayCount()).toBe(1);
    });

    it("toggles mute setting, persists in localStorage, and suppresses audio chime", () => {
      const soundManager = new EarningsSoundManager();

      // Default: unmuted
      expect(soundManager.isMuted()).toBe(false);

      // Toggle to muted
      const mutedState = soundManager.toggleMute();
      expect(mutedState).toBe(true);
      expect(soundManager.isMuted()).toBe(true);
      expect(localStorage.getItem(EARNINGS_SOUND_STORAGE_KEY)).toBe("true");

      // Attempt chime while muted -> must return false and not increment playCount
      const chimePlayed = soundManager.playChime();
      expect(chimePlayed).toBe(false);
      expect(soundManager.getPlayCount()).toBe(0);

      // Toggle back to unmuted
      soundManager.toggleMute();
      expect(soundManager.isMuted()).toBe(false);
      expect(localStorage.getItem(EARNINGS_SOUND_STORAGE_KEY)).toBe("false");

      // Chime should now play
      expect(soundManager.playChime()).toBe(true);
      expect(soundManager.getPlayCount()).toBe(1);
    });

    it("notifies sound setting subscribers when mute state changes", () => {
      const soundManager = new EarningsSoundManager();
      const listener = vi.fn();

      const unsubscribe = soundManager.subscribe(listener);
      soundManager.setMuted(true);
      expect(listener).toHaveBeenCalledWith(true);

      soundManager.setMuted(false);
      expect(listener).toHaveBeenCalledWith(false);

      unsubscribe();
      soundManager.setMuted(true);
      expect(listener).toHaveBeenCalledTimes(2); // No extra calls after unsubscribe
    });

    it("uses custom AudioContext factory to synthesize chime tones when available", () => {
      const mockOscillator = {
        type: "",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      const mockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      const mockAudioContext = {
        currentTime: 0,
        createOscillator: () => mockOscillator,
        createGain: () => mockGain,
        destination: {},
        state: "running",
      } as unknown as AudioContext;

      const soundManager = new EarningsSoundManager({
        audioContextFactory: () => mockAudioContext,
      });

      const played = soundManager.playChime();
      expect(played).toBe(true);
      expect(mockOscillator.start).toHaveBeenCalled();
      expect(mockOscillator.stop).toHaveBeenCalledWith(0.35);
    });
  });

  describe("4. React Component Integration & Interactive Toast Stack UI", () => {
    it("renders the B2CEarningsToasts component with stacked toasts and progress bars", () => {
      const queue = new EarningsToastQueue();
      const soundManager = new EarningsSoundManager();

      render(
        React.createElement(B2CEarningsToasts, {
          affiliateAddress: AFFILIATE_WALLET,
          queue,
          soundManager,
        }),
      );

      expect(screen.getByTestId("earnings-toast-container")).toBeDefined();
      expect(screen.getByTestId("toggle-mute-sound")).toBeDefined();

      // Enqueue toast
      act(() => {
        queue.enqueue(sampleEventTier1);
      });

      expect(screen.getByTestId("earnings-toast-title").textContent).toBe(
        "Referral Sale Confirmed!",
      );
      expect(screen.getByTestId("earnings-toast-tier").textContent).toBe("Tier 1 Direct");
      expect(screen.getByTestId("earnings-toast-amount").textContent).toContain("+20.00 XLM");
      expect(screen.getByTestId("toast-progress-bar")).toBeDefined();
    });

    it("interactively mutes and unmutes sounds via the UI toggle button", () => {
      const soundManager = new EarningsSoundManager();

      render(
        React.createElement(B2CEarningsToasts, {
          soundManager,
        }),
      );

      const muteBtn = screen.getByTestId("toggle-mute-sound");
      expect(muteBtn.getAttribute("aria-pressed")).toBe("false");
      expect(muteBtn.textContent).toContain("Sounds Active");

      // Click to mute
      fireEvent.click(muteBtn);
      expect(muteBtn.getAttribute("aria-pressed")).toBe("true");
      expect(muteBtn.textContent).toContain("Sounds Muted");
      expect(soundManager.isMuted()).toBe(true);

      // Click to unmute
      fireEvent.click(muteBtn);
      expect(muteBtn.getAttribute("aria-pressed")).toBe("false");
      expect(muteBtn.textContent).toContain("Sounds Active");
      expect(soundManager.isMuted()).toBe(false);
    });

    it("manually dismisses a toast through the UI close button", () => {
      const queue = new EarningsToastQueue();

      render(
        React.createElement(B2CEarningsToasts, {
          queue,
        }),
      );

      let toast: EarningsToast;
      act(() => {
        toast = queue.enqueue(sampleEventTier1);
      });

      const dismissBtn = screen.getByTestId(`dismiss-toast-${toast!.id}`);
      expect(dismissBtn).toBeDefined();

      fireEvent.click(dismissBtn);

      expect(screen.queryByTestId(`earnings-toast-${toast!.id}`)).toBeNull();
      expect(queue.getToasts()).toHaveLength(0);
    });

    it("receives live events from attached stream listener and renders stacked badges", () => {
      const queue = new EarningsToastQueue();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        queue,
      });

      render(
        React.createElement(B2CEarningsToasts, {
          affiliateAddress: AFFILIATE_WALLET,
          queue,
          streamListener: listener,
        }),
      );

      const mockWs = new MockWebSocket();
      listener.connectWebSocket(mockWs);

      act(() => {
        mockWs.emitMessage(sampleEventTier1);
        mockWs.emitMessage(sampleEventTier2);
      });

      const toasts = screen.getAllByTestId("earnings-toast-title");
      expect(toasts).toHaveLength(2);
      expect(toasts[0].textContent).toBe("Sub-Affiliate Override Confirmed!");
      expect(toasts[1].textContent).toBe("Referral Sale Confirmed!");
    });
  });

  describe("5. Stream Error Handling, Address Getters, and Sound Utilities", () => {
    it("handles stream errors on WebSocket and EventSource without throwing", () => {
      const onError = vi.fn();
      const listener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        onError,
      });

      const mockWs = new MockWebSocket();
      listener.connectWebSocket(mockWs);
      mockWs.emitError(new Error("Simulated WebSocket dropped"));
      expect(onError).toHaveBeenCalled();

      const mockEs = new MockEventSource();
      listener.connectSSE(mockEs);
      mockEs.emitError(new Error("Simulated SSE network failure"));
      expect(onError).toHaveBeenCalledTimes(2);

      listener.disconnect();
    });

    it("verifies affiliate address getter, setter, and sound manager references", () => {
      const soundManager = new EarningsSoundManager();
      const queue = new EarningsToastQueue({ soundManager });
      expect(queue.getSoundManager()).toBe(soundManager);

      const listener = new EarningsStreamListener({ affiliateAddress: AFFILIATE_WALLET });
      expect(listener.getAffiliateAddress()).toBe(AFFILIATE_WALLET);

      listener.setAffiliateAddress("GASTORMNEW00000000000000000000000000000000000000000000000392");
      expect(listener.getAffiliateAddress()).toBe(
        "GASTORMNEW00000000000000000000000000000000000000000000000392",
      );

      // dispatchLocalEvent ignores event when targetAddress does not match
      const localOnEvent = vi.fn();
      const filteringListener = new EarningsStreamListener({
        affiliateAddress: AFFILIATE_WALLET,
        onEvent: localOnEvent,
      });
      filteringListener.dispatchLocalEvent({
        ...sampleEventTier1,
        affiliateAddress: OTHER_AFFILIATE_WALLET,
      });
      expect(localOnEvent).not.toHaveBeenCalled();

      // Reset play count
      soundManager.playChime();
      expect(soundManager.getPlayCount()).toBe(1);
      soundManager.resetPlayCount();
      expect(soundManager.getPlayCount()).toBe(0);
    });
  });
});
