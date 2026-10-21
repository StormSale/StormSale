// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleDisconnect } from "../hooks/useIdleDisconnect";

// Short thresholds keep the fake-timer advances readable:
// warning opens after 6s idle, disconnect after 10s.
const TIMEOUT_MS = 10_000;
const WARNING_MS = 4_000;
const KEY = "test_last_active_timestamp";

function setup(isConnected = true) {
  const onDisconnect = vi.fn();
  const onExtend = vi.fn();
  const hook = renderHook(
    ({ connected }) =>
      useIdleDisconnect({
        isConnected: connected,
        timeoutMs: TIMEOUT_MS,
        warningMs: WARNING_MS,
        storageKey: KEY,
        onDisconnect,
        onExtend,
      }),
    { initialProps: { connected: isConnected } },
  );
  return { ...hook, onDisconnect, onExtend };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useIdleDisconnect hook lifecycle (#83)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("stamps the shared activity timestamp when the wallet connects", () => {
    setup(true);
    expect(localStorage.getItem(KEY)).toBe(String(Date.now()));
  });

  it("opens the warning at the threshold and keeps it open while counting down", () => {
    const { result } = setup();

    advance(5_000);
    expect(result.current.isWarningOpen).toBe(false);

    advance(1_000);
    expect(result.current.isWarningOpen).toBe(true);
    expect(result.current.remainingSeconds).toBe(4);

    // Regression: opening the warning used to reset the timer, so the next
    // poll closed it again and the session never expired.
    advance(1_000);
    expect(result.current.isWarningOpen).toBe(true);
    expect(result.current.remainingSeconds).toBe(3);
  });

  it("disconnects exactly once when the idle timeout expires", () => {
    const { result, onDisconnect } = setup();

    advance(TIMEOUT_MS);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(result.current.isWarningOpen).toBe(false);

    advance(5_000);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps the session alive while the user is active", () => {
    const { result, onDisconnect } = setup();

    for (let i = 0; i < 4; i++) {
      advance(4_000);
      act(() => {
        window.dispatchEvent(new Event("mousemove"));
      });
    }

    expect(result.current.isWarningOpen).toBe(false);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("ignores passive activity once the warning is open", () => {
    const { result, onDisconnect } = setup();

    advance(6_000);
    expect(result.current.isWarningOpen).toBe(true);

    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });
    advance(4_000);

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("extendSession closes the warning and restarts the timer", () => {
    const { result, onExtend, onDisconnect } = setup();

    advance(6_000);
    expect(result.current.isWarningOpen).toBe(true);

    act(() => {
      result.current.extendSession();
    });
    expect(result.current.isWarningOpen).toBe(false);
    expect(onExtend).toHaveBeenCalledTimes(1);

    advance(5_000);
    expect(result.current.isWarningOpen).toBe(false);
    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("does not let a stale timestamp from another tab rewind the timer", () => {
    const { result } = setup();

    advance(3_000);
    act(() => {
      window.dispatchEvent(new Event("mousemove"));
    });

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: KEY, newValue: String(Date.now() - 9_000) }),
      );
    });
    advance(1_000);

    expect(result.current.isWarningOpen).toBe(false);
  });

  it("closes the warning when another tab reports fresh activity", () => {
    const { result } = setup();

    advance(6_000);
    expect(result.current.isWarningOpen).toBe(true);

    act(() => {
      const now = String(Date.now());
      localStorage.setItem(KEY, now);
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, newValue: now }));
    });
    advance(1_000);

    expect(result.current.isWarningOpen).toBe(false);
  });

  it("only exposes the window test helper in development builds", () => {
    const dev = setup();
    expect(typeof window.__triggerIdleWarningTest).toBe("function");
    dev.unmount();
    expect(window.__triggerIdleWarningTest).toBeUndefined();

    vi.stubEnv("DEV", false);
    setup();
    expect(window.__triggerIdleWarningTest).toBeUndefined();
  });
});
