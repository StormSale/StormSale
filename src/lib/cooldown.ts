/**
 * Double-click protection for transaction buttons.
 *
 * Every transaction button used to guard itself with `disabled={isLoading}`.
 * That cannot stop a fast double-click: `setIsLoading(true)` only takes effect
 * on the next render, so a second click that lands before it runs the handler
 * again and submits a second transaction. And re-enabling the button the
 * instant a transaction resolves lets the user fire another one straight away.
 *
 * This guard is checked **synchronously**, inside the click itself, so the
 * second click is refused before any handler runs. Once taken, it stays locked
 * until both are true:
 *   - the click's action has settled (an async handler's promise resolved or
 *     rejected), and
 *   - at least `cooldownMs` has passed since the click.
 *
 * It holds no React state of its own; `onChange` tells the component when to
 * re-render its locked / unlocked look.
 */

/** The lockout every transaction button gets: two seconds. */
export const TRANSACTION_COOLDOWN_MS = 2000;

export interface CooldownGuardOptions {
  cooldownMs?: number;
  /** Called whenever the lock changes, with the new state. */
  onChange?: (locked: boolean) => void;
  /** Injectable for tests. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface CooldownGuard {
  /** Take the lock for a click. False if it is already held: refuse the click. */
  tryAcquire(): boolean;
  /** The click's action has settled; unlock once the cooldown has also run out. */
  settle(): void;
  isLocked(): boolean;
  /** Stop any pending unlock timer (on unmount). */
  dispose(): void;
}

export function createCooldownGuard(options: CooldownGuardOptions = {}): CooldownGuard {
  const cooldownMs = Math.max(0, options.cooldownMs ?? TRANSACTION_COOLDOWN_MS);
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let locked = false;
  let acquiredAt = 0;
  let timer: unknown = null;

  const setLocked = (value: boolean) => {
    if (locked === value) return;
    locked = value;
    options.onChange?.(value);
  };

  return {
    tryAcquire() {
      if (locked) return false;
      acquiredAt = now();
      setLocked(true);
      return true;
    },
    settle() {
      if (!locked) return;
      if (timer !== null) clearTimer(timer);
      const remaining = cooldownMs - (now() - acquiredAt);
      if (remaining <= 0) {
        timer = null;
        setLocked(false);
        return;
      }
      timer = setTimer(() => {
        timer = null;
        setLocked(false);
      }, remaining);
    },
    isLocked: () => locked,
    dispose() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

/** The parts of a click event the guard touches. */
export interface GuardableEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { then?: unknown }).then === "function";

/**
 * Run a click through the guard.
 *
 * A refused click is cancelled outright: `preventDefault` also cancels a
 * submit button's form submission (including Enter-key submission, which the
 * browser delivers as a click on the default button), and `stopPropagation`
 * keeps any parent handler from seeing it.
 *
 * Returns whether the click was allowed.
 */
export function runGuardedClick<E extends GuardableEvent>(
  guard: CooldownGuard,
  event: E,
  handler?: (event: E) => unknown,
): boolean {
  if (!guard.tryAcquire()) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
  let result: unknown;
  try {
    result = handler?.(event);
  } catch (err) {
    guard.settle();
    throw err;
  }
  if (isThenable(result)) {
    // The lock is held for the whole transaction, however long it takes, and
    // released (subject to the cooldown) whether it succeeds or fails.
    // A rejection is re-thrown after settling, so it still surfaces exactly
    // as it would without the guard instead of being swallowed here.
    Promise.resolve(result).then(
      () => guard.settle(),
      (err: unknown) => {
        guard.settle();
        throw err;
      },
    );
  } else {
    guard.settle();
  }
  return true;
}
