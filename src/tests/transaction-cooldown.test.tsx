import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { Button } from "../components/ui/button";
import {
  TRANSACTION_COOLDOWN_MS,
  createCooldownGuard,
  runGuardedClick,
  type GuardableEvent,
} from "../lib/cooldown";

/** Node's process, reached without pulling Node types into the app tsconfig. */
const nodeProcess = (
  globalThis as unknown as {
    process: {
      on(event: "unhandledRejection", fn: (reason: unknown) => void): void;
      off(event: "unhandledRejection", fn: (reason: unknown) => void): void;
    };
  }
).process;

const click = (): GuardableEvent & { prevented: boolean; stopped: boolean } => {
  const e = {
    prevented: false,
    stopped: false,
    preventDefault() {
      e.prevented = true;
    },
    stopPropagation() {
      e.stopped = true;
    },
  };
  return e;
};

describe("Transaction button double-click protection", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe("2-second cooldown", () => {
    it("is two seconds", () => {
      expect(TRANSACTION_COOLDOWN_MS).toBe(2000);
    });

    it("refuses a second click inside the cooldown, before its handler runs", () => {
      const guard = createCooldownGuard();
      const handler = vi.fn();

      expect(runGuardedClick(guard, click(), handler)).toBe(true);
      const second = click();
      expect(runGuardedClick(guard, second, handler)).toBe(false);

      expect(handler).toHaveBeenCalledTimes(1);
      // Cancelled outright: no form submission, no parent handler.
      expect(second.prevented).toBe(true);
      expect(second.stopped).toBe(true);
    });

    it("refuses a burst of rapid clicks, sending one transaction", () => {
      const guard = createCooldownGuard();
      const handler = vi.fn();
      for (let i = 0; i < 10; i++) runGuardedClick(guard, click(), handler);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("unlocks exactly when the 2s are up, not before", () => {
      const guard = createCooldownGuard();
      runGuardedClick(guard, click(), () => undefined);

      vi.advanceTimersByTime(1999);
      expect(guard.isLocked()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(guard.isLocked()).toBe(false);
      expect(runGuardedClick(guard, click(), () => undefined)).toBe(true);
    });

    it("holds the full 2s even when the transaction returns fast", async () => {
      const guard = createCooldownGuard();
      runGuardedClick(guard, click(), () => Promise.resolve("tx-hash"));
      await vi.advanceTimersByTimeAsync(10); // the promise has settled
      expect(guard.isLocked()).toBe(true);
      await vi.advanceTimersByTimeAsync(TRANSACTION_COOLDOWN_MS);
      expect(guard.isLocked()).toBe(false);
    });

    it("holds the lock for as long as a slow transaction is still running", async () => {
      const guard = createCooldownGuard();
      let finish!: () => void;
      runGuardedClick(guard, click(), () => new Promise<void>((r) => (finish = r)));

      await vi.advanceTimersByTimeAsync(10_000);
      expect(guard.isLocked()).toBe(true); // 10s in, still awaiting the wallet

      finish();
      await vi.advanceTimersByTimeAsync(0);
      expect(guard.isLocked()).toBe(false); // cooldown already long past
    });

    it("releases after a failed transaction too, and still surfaces the error", async () => {
      // Real timers: Node reports an unhandled rejection only on a real turn
      // of the event loop, which fake timers would never give it.
      vi.useRealTimers();
      const guard = createCooldownGuard({ cooldownMs: 20 });
      const failure = new Error("User declined transaction");
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      nodeProcess.on("unhandledRejection", onUnhandled);
      try {
        runGuardedClick(guard, click(), () => Promise.reject(failure));
        await new Promise((r) => setTimeout(r, 60));
        expect(guard.isLocked()).toBe(false);
        expect(unhandled).toContain(failure);
      } finally {
        nodeProcess.off("unhandledRejection", onUnhandled);
      }
    });

    it("releases after a handler that throws synchronously, and rethrows", () => {
      const guard = createCooldownGuard();
      expect(() =>
        runGuardedClick(guard, click(), () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      vi.advanceTimersByTime(TRANSACTION_COOLDOWN_MS);
      expect(guard.isLocked()).toBe(false);
    });

    it("guards a click with no handler (a form's submit button)", () => {
      const guard = createCooldownGuard();
      expect(runGuardedClick(guard, click())).toBe(true);
      const second = click();
      expect(runGuardedClick(guard, second)).toBe(false);
      expect(second.prevented).toBe(true); // the second submit is cancelled
    });

    it("reports lock changes so the button can re-render", () => {
      const onChange = vi.fn();
      const guard = createCooldownGuard({ onChange });
      runGuardedClick(guard, click(), () => undefined);
      expect(onChange).toHaveBeenLastCalledWith(true);
      vi.advanceTimersByTime(TRANSACTION_COOLDOWN_MS);
      expect(onChange).toHaveBeenLastCalledWith(false);
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it("honours a custom cooldown and stops its timer on dispose", () => {
      const onChange = vi.fn();
      const guard = createCooldownGuard({ cooldownMs: 500, onChange });
      runGuardedClick(guard, click(), () => undefined);
      guard.dispose();
      vi.advanceTimersByTime(5000);
      // Disposed (unmounted): no state update fires after the fact.
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("visual loading lockout", () => {
    it("renders a loading button disabled and busy", () => {
      const html = renderToString(
        <Button cooldown loading>
          Launch Campaign
        </Button>,
      );
      expect(html).toMatch(/ disabled=""/);
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('data-state="loading"');
      expect(html).toContain("Launch Campaign");
    });

    it("leaves an idle transaction button enabled and not busy", () => {
      const html = renderToString(<Button cooldown>Claim Single</Button>);
      expect(html).not.toMatch(/ disabled=""/);
      expect(html).not.toContain("aria-busy");
      expect(html).not.toContain("data-state");
    });

    it("keeps an explicitly disabled button disabled", () => {
      const html = renderToString(
        <Button cooldown disabled>
          Join Campaign
        </Button>,
      );
      expect(html).toMatch(/ disabled=""/);
      expect(html).not.toContain("aria-busy");
    });

    it("changes nothing for buttons that do not opt in", () => {
      const html = renderToString(<Button variant="outline">Filter</Button>);
      expect(html).not.toContain("aria-busy");
      expect(html).not.toMatch(/ disabled=""/);
    });
  });
});
