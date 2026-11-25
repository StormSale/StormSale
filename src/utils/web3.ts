export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

export interface EvmSigner {
  getAddress: () => Promise<string>;
  provider: Eip1193Provider;
}

export const BLOCKDAG_CHAIN_ID = "0x413";

export const BLOCKDAG_CHAIN_PARAMS = {
  chainId: BLOCKDAG_CHAIN_ID,
  chainName: "BlockDAG Primordial",
  nativeCurrency: { name: "BDAG", symbol: "BDAG", decimals: 18 },
  rpcUrls: ["https://rpc.blockdag.network"],
  blockExplorerUrls: ["https://explorer.blockdag.network"],
};

const NAME_TTL_MS = 10 * 60 * 1000;
const nameCache = new Map<string, { value: string | null; at: number }>();

export function isBlockdagChain(chainId: string | null | undefined): boolean {
  return (chainId ?? "").toLowerCase() === BLOCKDAG_CHAIN_ID;
}

export function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return ethereum?.request ? ethereum : null;
}

export function createSigner(provider: Eip1193Provider, address: string): EvmSigner {
  return {
    provider,
    getAddress: async () => address,
  };
}

export async function addBlockdagChain(provider: Eip1193Provider): Promise<string> {
  await provider.request({
    method: "wallet_addEthereumChain",
    params: [BLOCKDAG_CHAIN_PARAMS],
  });
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BLOCKDAG_CHAIN_ID }],
    });
  } catch {
    // Some wallets switch as part of wallet_addEthereumChain.
  }
  const chainId = await provider.request({ method: "eth_chainId" });
  return typeof chainId === "string" ? chainId : "";
}

function readCache(key: string): string | null | undefined {
  const hit = nameCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > NAME_TTL_MS) {
    nameCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key: string, value: string | null): void {
  nameCache.set(key, { value, at: Date.now() });
}

export function clearNamingCache(): void {
  nameCache.clear();
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isNamingServiceName(value: unknown): value is string {
  return typeof value === "string" && (value.endsWith(".eth") || value.endsWith(".bdag"));
}

/** Resolve a .eth or .bdag name. Repeat lookups use the in-memory cache. */
export async function resolveName(
  name: string,
  request: Eip1193Provider["request"],
): Promise<string | null> {
  const normalized = name.trim().toLowerCase();
  if (!isNamingServiceName(normalized)) return null;
  const cached = readCache(`name:${normalized}`);
  if (cached !== undefined) return cached;
  const method = normalized.endsWith(".bdag") ? "bdag_resolveName" : "eth_resolveName";
  try {
    const result = await request({ method, params: [normalized] });
    const address = isAddress(result) ? result : null;
    writeCache(`name:${normalized}`, address);
    if (address) writeCache(`addr:${address.toLowerCase()}`, normalized);
    return address;
  } catch {
    writeCache(`name:${normalized}`, null);
    return null;
  }
}

/** Reverse-lookup a primary .eth or .bdag name. Failures are cached so the RPC is not retried immediately. */
export async function lookupPrimaryName(
  address: string,
  request?: Eip1193Provider["request"],
): Promise<string | null> {
  const key = `addr:${address.trim().toLowerCase()}`;
  const cached = readCache(key);
  if (cached !== undefined) return cached;
  if (!request || !address.startsWith("0x")) {
    writeCache(key, null);
    return null;
  }
  try {
    const result = await request({ method: "eth_lookupAddress", params: [address] });
    const name = isNamingServiceName(result) ? result.toLowerCase() : null;
    writeCache(key, name);
    return name;
  } catch {
    writeCache(key, null);
    return null;
  }
}
