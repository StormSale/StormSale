/**
 * B2C Affiliate Real-Time Earnings Toast Notifications Engine (#453)
 *
 * Handles:
 * - Real-time WebSocket and Server-Sent Events (SSE) listeners for ReferralSaleConfirmed events.
 * - Stacking toast queue management with strict 5-second auto-dismissal and manual dismiss.
 * - Audio chime synthesis and user preference toggle to mute notification sounds.
 */

import { maskRefereeAddress } from "./referralTree";

export interface ReferralSaleConfirmedEvent {
  eventId: string;
  eventType: "ReferralSaleConfirmed";
  affiliateAddress: string;
  referralAddress: string;
  referralAlias?: string;
  saleAmountXlm: number;
  commissionAmountXlm: number;
  overrideAmountXlm?: number;
  tier: 1 | 2;
  campaignId?: string;
  campaignName?: string;
  txHash?: string;
  timestamp?: string;
}

export interface EarningsToast {
  id: string;
  event: ReferralSaleConfirmedEvent;
  title: string;
  message: string;
  commissionAmountXlm: number;
  tier: 1 | 2;
  durationMs: number;
  createdAt: number;
  dismissed: boolean;
  txHash?: string;
}

export const EARNINGS_SOUND_STORAGE_KEY = "stormsale_earnings_sound_muted";
export const DEFAULT_TOAST_DURATION_MS = 5000;
export const DEFAULT_MAX_STACKED_TOASTS = 5;

export interface SoundManagerOptions {
  storageKey?: string;
  audioContextFactory?: () => AudioContext | null;
}

/**
 * Manages audio chime alerts and user sound preferences for real-time earnings toasts.
 */
export class EarningsSoundManager {
  private storageKey: string;
  private audioContext: AudioContext | null = null;
  private customAudioFactory?: () => AudioContext | null;
  private playCount: number = 0;
  private listeners: Set<(muted: boolean) => void> = new Set();

  constructor(options?: SoundManagerOptions) {
    this.storageKey = options?.storageKey ?? EARNINGS_SOUND_STORAGE_KEY;
    this.customAudioFactory = options?.audioContextFactory;
  }

  isMuted(): boolean {
    if (typeof localStorage === "undefined") return false;
    try {
      const val = localStorage.getItem(this.storageKey);
      return val === "true";
    } catch {
      return false;
    }
  }

  setMuted(muted: boolean): void {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(this.storageKey, muted ? "true" : "false");
      } catch {
        // Storage disabled or blocked
      }
    }
    this.notifyListeners(muted);
  }

  toggleMute(): boolean {
    const next = !this.isMuted();
    this.setMuted(next);
    return next;
  }

  getPlayCount(): number {
    return this.playCount;
  }

  resetPlayCount(): void {
    this.playCount = 0;
  }

  subscribe(listener: (muted: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(muted: boolean): void {
    this.listeners.forEach((l) => l(muted));
  }

  playChime(): boolean {
    if (this.isMuted()) {
      return false;
    }

    this.playCount++;

    try {
      if (this.customAudioFactory) {
        const ctx = this.customAudioFactory();
        if (ctx) {
          this.synthesizeTone(ctx);
          return true;
        }
      }

      const AudioCtx =
        typeof window !== "undefined"
          ? window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          : null;

      if (AudioCtx) {
        if (!this.audioContext || this.audioContext.state === "closed") {
          this.audioContext = new AudioCtx();
        }
        this.synthesizeTone(this.audioContext);
        return true;
      }
    } catch {
      // Audio autoplay policy prevented playback; sound still attempted
    }

    return true;
  }

  private synthesizeTone(ctx: AudioContext): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 chime
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5 chime
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Ignore oscillator errors in sandbox/headless runtimes
    }
  }
}

export const defaultSoundManager = new EarningsSoundManager();

export interface ToastQueueOptions {
  maxVisibleToasts?: number;
  defaultDurationMs?: number;
  soundManager?: EarningsSoundManager;
  onToastAdded?: (toast: EarningsToast) => void;
  onToastDismissed?: (toastId: string) => void;
}

/**
 * Manages toast queueing, auto-dismissal timers (5s), and FIFO stacking limits.
 */
export class EarningsToastQueue {
  private toasts: EarningsToast[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private maxVisible: number;
  private defaultDuration: number;
  private soundManager: EarningsSoundManager;
  private listeners: Set<(toasts: EarningsToast[]) => void> = new Set();
  private onToastAdded?: (toast: EarningsToast) => void;
  private onToastDismissed?: (toastId: string) => void;

  constructor(options?: ToastQueueOptions) {
    this.maxVisible = options?.maxVisibleToasts ?? DEFAULT_MAX_STACKED_TOASTS;
    this.defaultDuration = options?.defaultDurationMs ?? DEFAULT_TOAST_DURATION_MS;
    this.soundManager = options?.soundManager ?? defaultSoundManager;
    this.onToastAdded = options?.onToastAdded;
    this.onToastDismissed = options?.onToastDismissed;
  }

  enqueue(event: ReferralSaleConfirmedEvent): EarningsToast {
    const id = `earnings-toast-${event.eventId || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const maskedRef = maskRefereeAddress(event.referralAddress);
    const aliasOrMasked = event.referralAlias ? `${event.referralAlias} (${maskedRef})` : maskedRef;
    const isTier1 = event.tier === 1;

    const title = isTier1 ? "Referral Sale Confirmed!" : "Sub-Affiliate Override Confirmed!";
    const message = isTier1
      ? `You earned +${event.commissionAmountXlm.toFixed(2)} XLM from referral ${aliasOrMasked}.`
      : `You earned +${(event.overrideAmountXlm ?? event.commissionAmountXlm).toFixed(2)} XLM override from Tier 2 referral ${aliasOrMasked}.`;

    const toast: EarningsToast = {
      id,
      event,
      title,
      message,
      commissionAmountXlm: event.commissionAmountXlm,
      tier: event.tier,
      durationMs: this.defaultDuration,
      createdAt: Date.now(),
      dismissed: false,
      txHash: event.txHash,
    };

    // Stacking: add to top/front of queue
    this.toasts = [toast, ...this.toasts];

    // Enforce max visible stacking capacity: auto-dismiss overflow from tail
    if (this.toasts.length > this.maxVisible) {
      const overflow = this.toasts.slice(this.maxVisible);
      this.toasts = this.toasts.slice(0, this.maxVisible);
      overflow.forEach((t) => this.clearTimer(t.id));
    }

    // Play chime sound unless muted
    this.soundManager.playChime();

    // Schedule 5-second auto-dismissal
    this.scheduleAutoDismiss(id, this.defaultDuration);

    this.notifyListeners();
    this.onToastAdded?.(toast);

    return toast;
  }

  dismiss(toastId: string): void {
    this.clearTimer(toastId);
    const initialLen = this.toasts.length;
    this.toasts = this.toasts.filter((t) => t.id !== toastId);

    if (this.toasts.length !== initialLen) {
      this.notifyListeners();
      this.onToastDismissed?.(toastId);
    }
  }

  clear(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
    this.toasts = [];
    this.notifyListeners();
  }

  getToasts(): EarningsToast[] {
    return [...this.toasts];
  }

  getSoundManager(): EarningsSoundManager {
    return this.soundManager;
  }

  subscribe(listener: (toasts: EarningsToast[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = this.getToasts();
    this.listeners.forEach((l) => l(snapshot));
  }

  private scheduleAutoDismiss(toastId: string, durationMs: number): void {
    this.clearTimer(toastId);
    const timer = setTimeout(() => {
      this.dismiss(toastId);
    }, durationMs);
    this.timers.set(toastId, timer);
  }

  private clearTimer(toastId: string): void {
    const existing = this.timers.get(toastId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(toastId);
    }
  }
}

export interface StreamListenerOptions {
  affiliateAddress?: string;
  queue?: EarningsToastQueue;
  onEvent?: (event: ReferralSaleConfirmedEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Real-Time WebSocket and Server-Sent Events (SSE) Listener for ReferralSaleConfirmed events.
 */
export class EarningsStreamListener {
  private targetAddress?: string;
  private queue?: EarningsToastQueue;
  private onEventCallback?: (event: ReferralSaleConfirmedEvent) => void;
  private onErrorCallback?: (error: Error) => void;
  private activeWs?: WebSocket | any;
  private activeEventSource?: EventSource | any;
  private isConnected: boolean = false;

  constructor(options?: StreamListenerOptions) {
    this.targetAddress = options?.affiliateAddress?.trim().toUpperCase();
    this.queue = options?.queue;
    this.onEventCallback = options?.onEvent;
    this.onErrorCallback = options?.onError;
  }

  setAffiliateAddress(address?: string): void {
    this.targetAddress = address ? address.trim().toUpperCase() : undefined;
  }

  getAffiliateAddress(): string | undefined {
    return this.targetAddress;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Attaches listener to a WebSocket instance or URL.
   */
  connectWebSocket(wsOrUrl: WebSocket | string | any): void {
    this.disconnect();

    let ws: WebSocket | any;
    if (typeof wsOrUrl === "string") {
      if (typeof WebSocket === "undefined") {
        throw new Error("WebSocket runtime not available.");
      }
      ws = new WebSocket(wsOrUrl);
    } else {
      ws = wsOrUrl;
    }

    this.activeWs = ws;
    this.isConnected = true;

    ws.onmessage = (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    };

    ws.onclose = () => {
      this.isConnected = false;
    };

    ws.onerror = (err: any) => {
      this.onErrorCallback?.(err instanceof Error ? err : new Error("WebSocket stream error"));
    };
  }

  /**
   * Attaches listener to a Server-Sent Events (SSE) EventSource instance or URL.
   */
  connectSSE(esOrUrl: EventSource | string | any): void {
    this.disconnect();

    let es: EventSource | any;
    if (typeof esOrUrl === "string") {
      if (typeof EventSource === "undefined") {
        throw new Error("EventSource runtime not available.");
      }
      es = new EventSource(esOrUrl);
    } else {
      es = esOrUrl;
    }

    this.activeEventSource = es;
    this.isConnected = true;

    const messageHandler = (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    };

    es.onmessage = messageHandler;

    if (typeof es.addEventListener === "function") {
      es.addEventListener("ReferralSaleConfirmed", messageHandler);
    }

    es.onerror = (err: any) => {
      this.onErrorCallback?.(err instanceof Error ? err : new Error("SSE stream error"));
    };
  }

  /**
   * Parses and processes incoming stream messages.
   */
  handleRawMessage(data: unknown): void {
    try {
      let payload: any;
      if (typeof data === "string") {
        payload = JSON.parse(data);
      } else {
        payload = data;
      }

      if (!payload || typeof payload !== "object") return;

      const eventType = payload.eventType || payload.type || payload.event;
      if (eventType !== "ReferralSaleConfirmed") return;

      const event = this.normalizeEvent(payload);
      if (!event) return;

      // Filter by affiliate address if configured
      if (this.targetAddress && event.affiliateAddress.toUpperCase() !== this.targetAddress) {
        return;
      }

      this.queue?.enqueue(event);
      this.onEventCallback?.(event);
    } catch (err) {
      this.onErrorCallback?.(
        err instanceof Error ? err : new Error("Failed to process event payload"),
      );
    }
  }

  /**
   * Dispatches a local in-memory event directly (for testing and local simulations).
   */
  dispatchLocalEvent(event: ReferralSaleConfirmedEvent): void {
    if (event.eventType !== "ReferralSaleConfirmed") return;

    if (this.targetAddress && event.affiliateAddress.toUpperCase() !== this.targetAddress) {
      return;
    }

    this.queue?.enqueue(event);
    this.onEventCallback?.(event);
  }

  disconnect(): void {
    if (this.activeWs) {
      try {
        if (typeof this.activeWs.close === "function") {
          this.activeWs.close();
        }
      } catch {}
      this.activeWs = null;
    }

    if (this.activeEventSource) {
      try {
        if (typeof this.activeEventSource.close === "function") {
          this.activeEventSource.close();
        }
      } catch {}
      this.activeEventSource = null;
    }

    this.isConnected = false;
  }

  private normalizeEvent(payload: any): ReferralSaleConfirmedEvent | null {
    const affiliateAddress = payload.affiliateAddress || payload.affiliate;
    const referralAddress = payload.referralAddress || payload.refereeAddress || payload.referee;
    const saleAmount = Number(payload.saleAmountXlm ?? payload.saleAmount ?? payload.amount ?? 0);
    const commissionAmount = Number(
      payload.commissionAmountXlm ?? payload.commissionAmount ?? payload.commission ?? 0,
    );
    const tier = Number(payload.tier) === 2 ? 2 : 1;

    if (!affiliateAddress || !referralAddress) {
      return null;
    }

    return {
      eventId: payload.eventId || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      eventType: "ReferralSaleConfirmed",
      affiliateAddress: String(affiliateAddress),
      referralAddress: String(referralAddress),
      referralAlias: payload.referralAlias ? String(payload.referralAlias) : undefined,
      saleAmountXlm: Number.isFinite(saleAmount) ? saleAmount : 0,
      commissionAmountXlm: Number.isFinite(commissionAmount) ? commissionAmount : 0,
      overrideAmountXlm:
        payload.overrideAmountXlm !== undefined ? Number(payload.overrideAmountXlm) : undefined,
      tier,
      campaignId: payload.campaignId ? String(payload.campaignId) : undefined,
      campaignName: payload.campaignName ? String(payload.campaignName) : undefined,
      txHash: payload.txHash ? String(payload.txHash) : undefined,
      timestamp: payload.timestamp ? String(payload.timestamp) : new Date().toISOString(),
    };
  }
}
