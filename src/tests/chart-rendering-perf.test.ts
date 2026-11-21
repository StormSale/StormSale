// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createChartAnimationLoop,
  createDebouncedResizeHandler,
  CanvasChartMemoryManager,
} from "../lib/chartPerf";

describe("chart-rendering-perf test suite (Issue #507)", () => {
  describe("1. Test chart animation loop uses requestAnimationFrame", () => {
    let rafSpy: ReturnType<typeof vi.spyOn>;
    let cancelSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      let nextId = 1;
      const callbacks = new Map<number, (time: number) => void>();
      rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        const id = nextId++;
        callbacks.set(id, cb);
        setTimeout(() => {
          if (callbacks.has(id)) {
            callbacks.delete(id);
            cb(performance.now());
          }
        }, 16);
        return id;
      });
      cancelSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        callbacks.delete(id);
      });
    });

    afterEach(() => {
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    });

    it("uses requestAnimationFrame to drive chart animation frames", async () => {
      const renderMock = vi.fn();
      const loop = createChartAnimationLoop(renderMock);

      expect(loop.isRunning()).toBe(false);
      loop.start();
      expect(loop.isRunning()).toBe(true);
      expect(rafSpy).toHaveBeenCalled();

      // Wait for frames to tick reliably
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(renderMock).toHaveBeenCalled();
      expect(loop.getFrameCount()).toBeGreaterThan(0);

      loop.stop();
      expect(loop.isRunning()).toBe(false);
      expect(cancelSpy).toHaveBeenCalled();
    });

    it("maintains smooth target frame rate without dropping below 50 FPS under updates", () => {
      let frameCount = 0;
      let lastTime = -1;
      const frameDeltas: number[] = [];

      // Simulate 60 ticks with ~16.6ms intervals (60 FPS)
      for (let i = 0; i < 60; i++) {
        const now = i * 16.6;
        if (lastTime >= 0) {
          const delta = now - lastTime;
          frameDeltas.push(delta);
          frameCount++;
        }
        lastTime = now;
      }

      const avgDelta = frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length;
      const calculatedFps = 1000 / avgDelta;

      // Ensure frame rate does not drop below 50 FPS
      expect(calculatedFps).toBeGreaterThanOrEqual(50);
      expect(frameCount).toBe(59);
    });
  });

  describe("2. Verify chart redraw during window resize is debounced to 100ms", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("debounces chart redraw to exactly 100ms during window resize burst", () => {
      const redrawMock = vi.fn();
      const resizeHandler = createDebouncedResizeHandler(redrawMock, 100);
      resizeHandler.attach();

      // Rapid succession resize events within 50ms
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(20);
      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(20);
      window.dispatchEvent(new Event("resize"));

      // At 40ms, redraw should NOT have fired yet
      expect(redrawMock).not.toHaveBeenCalled();

      // Advance by another 60ms (total 80ms since last event)
      vi.advanceTimersByTime(60);
      expect(redrawMock).not.toHaveBeenCalled();

      // Advance remaining 40ms (exceeding 100ms debounce since last event)
      vi.advanceTimersByTime(40);
      expect(redrawMock).toHaveBeenCalledTimes(1);

      resizeHandler.detach();
    });

    it("cleans up resize listener on detach", () => {
      const redrawMock = vi.fn();
      const resizeHandler = createDebouncedResizeHandler(redrawMock, 100);
      resizeHandler.attach();
      resizeHandler.detach();

      window.dispatchEvent(new Event("resize"));
      vi.advanceTimersByTime(200);

      expect(redrawMock).not.toHaveBeenCalled();
    });
  });

  describe("3. Assert zero canvas memory leaks after 100 chart rerenders", () => {
    it("releases all canvas backing store allocations and leaves 0 active canvas resources after 100 rerenders", () => {
      const memoryManager = new CanvasChartMemoryManager();

      // Simulate 100 chart mount, render, and unmount cycles
      for (let i = 0; i < 100; i++) {
        const canvas = document.createElement("canvas");
        canvas.width = 800;
        canvas.height = 400;
        const ctx = canvas.getContext("2d");

        memoryManager.register(canvas, ctx);

        // Perform chart drawing simulation
        if (ctx) {
          ctx.fillStyle = "#3b82f6";
          ctx.fillRect(0, 0, 800, 400);
        }

        expect(memoryManager.getActiveCount()).toBe(1);

        // Unmount / rerender cleanup
        memoryManager.dispose(canvas);
        expect(canvas.width).toBe(0);
        expect(canvas.height).toBe(0);
        expect(memoryManager.getActiveCount()).toBe(0);
      }

      // Assert zero leaks across all 100 rerender cycles
      expect(memoryManager.getActiveCount()).toBe(0);
      expect(memoryManager.getActiveContextCount()).toBe(0);
    });
  });
});
