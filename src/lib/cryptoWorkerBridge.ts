import {
  decryptPayload as decryptOnMainThread,
  encryptPayload as encryptOnMainThread,
  generateAESKey as generateOnMainThread,
  unwrapAESKey as unwrapOnMainThread,
  wrapAESKey as wrapOnMainThread,
} from "./crypto";
import type { CryptoWorkerRequest, CryptoWorkerResponse } from "./cryptoWorkerProtocol";

type PendingRequest = {
  resolve(value: CryptoKey | object | string): void;
  reject(error: Error): void;
};

class CryptoWorkerBridge {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private failed = false;

  constructor() {
    this.worker = new Worker(new URL("./crypto.worker.ts", import.meta.url), {
      type: "module",
      name: "stormsale-crypto",
    });
    this.worker.onmessage = (event: MessageEvent<CryptoWorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.error) pending.reject(new Error(response.error));
      else if (response.result !== undefined) pending.resolve(response.result);
      else pending.reject(new Error("Crypto worker returned an empty response."));
    };
    this.worker.onerror = () => this.fail(new Error("Crypto worker failed."));
    this.worker.onmessageerror = () => this.fail(new Error("Crypto worker response was invalid."));
  }

  get isFailed(): boolean {
    return this.failed;
  }

  request(request: Omit<CryptoWorkerRequest, "id">): Promise<CryptoKey | object | string> {
    if (this.failed) return Promise.reject(new Error("Crypto worker is unavailable."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ ...request, id } satisfies CryptoWorkerRequest);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("Crypto worker request failed."));
      }
    });
  }

  private fail(error: Error): void {
    if (this.failed) return;
    this.failed = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.worker.terminate();
  }
}

let bridge: CryptoWorkerBridge | undefined;

function getBridge(): CryptoWorkerBridge | undefined {
  if (typeof Worker === "undefined") return undefined;
  if (!bridge || bridge.isFailed) bridge = new CryptoWorkerBridge();
  return bridge;
}

export async function generateAESKey(): Promise<CryptoKey> {
  const worker = getBridge();
  return worker
    ? (worker.request({ operation: "generate-key" }) as Promise<CryptoKey>)
    : generateOnMainThread();
}

export async function encryptPayload(payload: object, key: CryptoKey): Promise<string> {
  const worker = getBridge();
  return worker
    ? (worker.request({ operation: "encrypt", payload, key }) as Promise<string>)
    : encryptOnMainThread(payload, key);
}

export async function decryptPayload(encryptedPayload: string, key: CryptoKey): Promise<object> {
  const worker = getBridge();
  return worker
    ? (worker.request({ operation: "decrypt", encryptedPayload, key }) as Promise<object>)
    : decryptOnMainThread(encryptedPayload, key);
}

export async function wrapAESKey(key: CryptoKey, identifier: string): Promise<string> {
  const worker = getBridge();
  return worker
    ? (worker.request({ operation: "wrap-key", key, identifier }) as Promise<string>)
    : wrapOnMainThread(key, identifier);
}

export async function unwrapAESKey(wrappedKey: string, identifier: string): Promise<CryptoKey> {
  const worker = getBridge();
  return worker
    ? (worker.request({ operation: "unwrap-key", wrappedKey, identifier }) as Promise<CryptoKey>)
    : unwrapOnMainThread(wrappedKey, identifier);
}
