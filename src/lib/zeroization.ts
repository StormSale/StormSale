/**
 * Sensitive Data Zeroization and Memory Clearance Utilities (Issue #510)
 *
 * Implements strict memory zeroization, storage sensitive data audit,
 * and ephemeral clipboard clearance to prevent memory dump exploitation.
 */

export type TypedArray =
  | Uint8Array
  | Int8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

/**
 * Overwrites all bytes of a typed array, DataView, or ArrayBuffer with zeros.
 */
export function zeroize(
  target: ArrayBufferView | ArrayBuffer | null | undefined,
): boolean {
  if (!target) return false;

  if (target instanceof ArrayBuffer) {
    new Uint8Array(target).fill(0);
    return true;
  }

  if (ArrayBuffer.isView(target)) {
    if (
      target instanceof Uint8Array ||
      target instanceof Int8Array ||
      target instanceof Uint8ClampedArray ||
      target instanceof Int16Array ||
      target instanceof Uint16Array ||
      target instanceof Int32Array ||
      target instanceof Uint32Array ||
      target instanceof Float32Array ||
      target instanceof Float64Array ||
      target instanceof BigInt64Array ||
      target instanceof BigUint64Array
    ) {
      target.fill(0 as never);
      return true;
    }

    // Fallback for DataView or custom views
    new Uint8Array(target.buffer, target.byteOffset, target.byteLength).fill(0);
    return true;
  }

  return false;
}

/**
 * Executes a callback with a sensitive buffer and guarantees that the buffer
 * is zeroized in memory immediately upon completion (even if an error throws).
 */
export function withZeroization<T, B extends TypedArray>(
  buffer: B,
  action: (buf: B) => T,
): T {
  try {
    return action(buffer);
  } finally {
    zeroize(buffer);
  }
}

/**
 * Async version of withZeroization.
 */
export async function withZeroizationAsync<T, B extends TypedArray>(
  buffer: B,
  action: (buf: B) => Promise<T>,
): Promise<T> {
  try {
    return await action(buffer);
  } finally {
    zeroize(buffer);
  }
}

/**
 * Patterns that identify sensitive private keys, secret seeds, and mnemonics.
 */
export const SENSITIVE_PATTERNS = [
  /\bS[A-Z0-9]{55}\b/, // Stellar private/secret key (56 chars, starting with 'S')
  /\b(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}\b/i, // BIP-39 12-24 word mnemonic phrase
  /"(?:privateKey|secretSeed|seed|mnemonic|private_key)"\s*:\s*"[^"]+"/i,
  /secret_key|private_key|mnemonic_phrase/i,
];

/**
 * Returns true if the string matches any sensitive credential pattern.
 */
export function containsSensitiveData(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Audits a Storage object (localStorage or sessionStorage) ensuring no
 * plaintext private key, secret seed, or mnemonic is stored.
 */
export function auditStorageForSensitiveData(storage: Storage): {
  clean: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key) continue;
    const value = storage.getItem(key) ?? "";
    if (containsSensitiveData(key)) {
      violations.push(`Sensitive credential pattern found in storage key: "${key}"`);
    }
    if (containsSensitiveData(value)) {
      violations.push(`Sensitive credential pattern found in storage value for key: "${key}"`);
    }
  }
  return {
    clean: violations.length === 0,
    violations,
  };
}

/**
 * Asserts that neither localStorage nor sessionStorage contains sensitive
 * private keys, seeds, or mnemonics. Throws an error if any violation is detected.
 */
export function assertNoSensitiveDataStored(): void {
  const scopes: { name: string; storage: Storage }[] = [];

  const g = typeof window !== "undefined" ? window : globalThis;
  if ((g as unknown as { localStorage?: Storage }).localStorage) {
    scopes.push({ name: "localStorage", storage: (g as unknown as { localStorage: Storage }).localStorage });
  }
  if ((g as unknown as { sessionStorage?: Storage }).sessionStorage) {
    scopes.push({ name: "sessionStorage", storage: (g as unknown as { sessionStorage: Storage }).sessionStorage });
  }

  for (const { name, storage } of scopes) {
    const { clean, violations } = auditStorageForSensitiveData(storage);
    if (!clean) {
      throw new Error(`Sensitive data storage violation in ${name}:\n${violations.join("\n")}`);
    }
  }
}

export interface ClipboardClearanceHandle {
  clear: () => Promise<void>;
  cancel: () => void;
}

/**
 * Copies a sensitive token or key to the system clipboard and schedules an
 * automatic memory clearance wipe after the given duration (defaults to 60 seconds).
 */
export async function copySensitiveToClipboard(
  text: string,
  timeoutMs = 60_000,
): Promise<ClipboardClearanceHandle> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }

  let isCleared = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const clear = async () => {
    if (isCleared) return;
    isCleared = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText("");
      } catch {
        // Clipboard may be unavailable or focus lost in background
      }
    }
  };

  const cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  timerId = setTimeout(() => {
    void clear();
  }, timeoutMs);

  return { clear, cancel };
}
