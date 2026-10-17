type Request =
  | { id: number; type: "generateAESKey" }
  | { id: number; type: "encryptPayload"; payload: object; aesKey: CryptoKey }
  | { id: number; type: "decryptPayload"; encryptedPayload: string; aesKey: CryptoKey }
  | { id: number; type: "wrapAESKey"; aesKey: CryptoKey; publicKey: string }
  | { id: number; type: "unwrapAESKey"; wrappedKey: string; privateKey: string };

type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();

function getWorker(): Worker {
  if (typeof worker !== "undefined" && worker) return worker;
  worker = new Worker(new URL("./crypto.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", (event: MessageEvent<Response>) => {
    const data = event.data;
    const handler = pending.get(data.id);
    if (!handler) return;
    pending.delete(data.id);
    if (data.ok) {
      handler.resolve(data.result);
    } else {
      handler.reject(new Error(data.error));
    }
  });
  worker.addEventListener("error", (event: ErrorEvent) => {
    const error = new Error(event.message || "Crypto worker error");
    for (const handler of pending.values()) {
      handler.reject(error);
    }
    pending.clear();
  });
  return worker;
}

function call<T>(request: Omit<Request, "id">): Promise<T> {
  const w = getWorker();
  const id = ++requestId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...request, id } as Request);
  });
}

export async function generateAESKey(): Promise<CryptoKey> {
  return call<CryptoKey>({ type: "generateAESKey" });
}

export async function encryptPayload(payload: object, aesKey: CryptoKey): Promise<string> {
  return call<string>({ type: "encryptPayload", payload, aesKey });
}

export async function wrapAESKey(aesKey: CryptoKey, publicKey: string): Promise<string> {
  return call<string>({ type: "wrapAESKey", aesKey, publicKey });
}

export async function unwrapAESKey(wrappedKey: string, privateKey: string): Promise<CryptoKey> {
  return call<CryptoKey>({ type: "unwrapAESKey", wrappedKey, privateKey });
}

export async function decryptPayload(
  encryptedPayload: string,
  aesKey: CryptoKey,
): Promise<object> {
  return call<object>({ type: "decryptPayload", encryptedPayload, aesKey });
}

// Helper to get a "mock" public key from a wallet address
export async function getPublicKeyForAddress(address: string): Promise<string> {
  // In a real app, this might come from a different contract,
  // a signature-based lookup, or MetaMask's encryption methods.
  console.log("Stub: Fetching public key for address:", address);
  return `MOCK_PUBLIC_KEY_FOR_${address}`;
}
