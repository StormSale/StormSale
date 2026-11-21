/**
 * Chart Performance and Animation Utilities (Issue #507)
 *
 * Provides requestAnimationFrame animation loop controller, 100ms debounced
 * resize handling, and canvas resource cleanup to prevent memory leaks.
 */

export interface ChartAnimationController {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
  getFrameCount: () => number;
  getAverageFps: () => number;
}

/**
 * Creates an animation controller driving chart renders via requestAnimationFrame
 * and tracking frame rate metrics.
 */
export function createChartAnimationLoop(
  onFrame: (deltaTime: number, timestamp: number) => void,
): ChartAnimationController {
  let isRunning = false;
  let rafId: number | null = null;
  let lastTimestamp = 0;
  let frameCount = 0;
  let totalDelta = 0;

  const tick = (now: number) => {
    if (!isRunning) return;

    const delta = lastTimestamp === 0 ? 16.6 : Math.max(0, now - lastTimestamp);
    lastTimestamp = now;

    frameCount++;
    totalDelta += delta;
    onFrame(delta, now);

    rafId = requestAnimationFrame(tick);
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;
    lastTimestamp = 0;
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    isRunning = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return {
    start,
    stop,
    isRunning: () => isRunning,
    getFrameCount: () => frameCount,
    getAverageFps: () => (frameCount > 0 && totalDelta > 0 ? (frameCount / totalDelta) * 1000 : 0),
  };
}

/**
 * Debounces chart redraws on window resize to 100ms to preserve frame rate.
 */
export function createDebouncedResizeHandler(
  onRedraw: () => void,
  debounceMs = 100,
): {
  attach: () => void;
  detach: () => void;
  trigger: () => void;
} {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const handleResize = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      onRedraw();
      timerId = null;
    }, debounceMs);
  };

  const attach = () => {
    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
    }
  };

  const detach = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", handleResize);
    }
  };

  return {
    attach,
    detach,
    trigger: handleResize,
  };
}

/**
 * Manages canvas lifecycle and resource destruction to ensure zero memory leaks.
 */
export class CanvasChartMemoryManager {
  private activeCanvases = new Set<HTMLCanvasElement>();
  private activeContexts = new Set<CanvasRenderingContext2D>();

  /**
   * Registers a canvas and context for managed lifecycle tracking.
   */
  public register(canvas: HTMLCanvasElement, ctx?: CanvasRenderingContext2D | null): void {
    this.activeCanvases.add(canvas);
    if (ctx) {
      this.activeContexts.add(ctx);
    }
  }

  /**
   * Explicitly disposes canvas backing store and clears 2D state.
   */
  public dispose(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      this.activeContexts.delete(ctx);
    }
    // Reclaim memory by releasing pixel buffer
    canvas.width = 0;
    canvas.height = 0;
    this.activeCanvases.delete(canvas);
  }

  public getActiveCount(): number {
    return this.activeCanvases.size;
  }

  public getActiveContextCount(): number {
    return this.activeContexts.size;
  }

  public clearAll(): void {
    for (const canvas of this.activeCanvases) {
      this.dispose(canvas);
    }
    this.activeCanvases.clear();
    this.activeContexts.clear();
  }
}
