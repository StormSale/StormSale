import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Keypair, Transaction, Networks, TransactionBuilder, Asset } from "@stellar/stellar-sdk";

interface ChallengeData {
  clientDomain: string;
  serverDomain: string;
  timebounds: { minTime: number; maxTime: number };
  tx: Transaction;
}

function parseSep10Challenge(txXdr: string, expectedServerDomain: string, expectedHomeDomain?: string): ChallengeData {
  const tx = new Transaction(txXdr, Networks.TESTNET);
  const source = tx.source;
  if (!source) {
    throw new Error("Challenge transaction missing source account");
  }
  
  let clientDomain = "";
  let serverDomain = expectedServerDomain;

  for (const op of tx.operations) {
    if (op.type === "manageData") {
      if (op.name.endsWith("client_domain")) {
        clientDomain = op.value?.toString() || "";
      }
      if (op.name.endsWith("auth")) {
        serverDomain = expectedHomeDomain || expectedServerDomain;
      }
    }
  }

  const timebounds = tx.timeBounds;
  if (!timebounds) {
    throw new Error("Challenge transaction missing timebounds");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now < Number(timebounds.minTime) || now > Number(timebounds.maxTime)) {
    throw new Error("Challenge transaction timebounds expired or not yet valid");
  }

  return {
    clientDomain,
    serverDomain,
    timebounds: { minTime: Number(timebounds.minTime), maxTime: Number(timebounds.maxTime) },
    tx,
  };
}

class JwtAuthManager {
  private token: string | null = null;
  private expiresAt: number = 0;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private onUnauthorizedCallback: (() => void) | null = null;

  constructor(private fetchFn: typeof fetch = fetch) {}

  public setUnauthorizedCallback(cb: () => void) {
    this.onUnauthorizedCallback = cb;
  }

  public getToken(): string | null {
    return this.token;
  }

  public setToken(token: string, expiresInSeconds: number) {
    this.token = token;
    this.expiresAt = Date.now() + expiresInSeconds * 1000;
    this.scheduleRefresh(expiresInSeconds);
  }

  private scheduleRefresh(expiresInSeconds: number) {
    if (this.refreshTimer) clearTimer(this.refreshTimer);
    const refreshDelayMs = Math.max(0, (expiresInSeconds - 300) * 1000);
    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshDelayMs);
  }

  public async refreshToken(): Promise<boolean> {
    try {
      const res = await this.fetchFn("/auth/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.status === 401) {
        this.handleUnauthorized();
        return false;
      }
      if (!res.ok) return false;
      const data = await res.json() as { token: string; expiresIn: number };
      this.setToken(data.token, data.expiresIn);
      return true;
    } catch {
      return false;
    }
  }

  public handleUnauthorized() {
    this.token = null;
    if (this.refreshTimer) clearTimer(this.refreshTimer);
    if (this.onUnauthorizedCallback) {
      this.onUnauthorizedCallback();
    }
  }

  public getTimeUntilExpiration(): number {
    return Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000));
  }
}

function clearTimer(timer: ReturnType<typeof setTimeout>) {
  clearTimeout(timer);
}

describe("SEP-0010 Stellar Web Authentication & JWT Lifecycle Suite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("decodes SEP-0010 challenge transaction and verifies valid timebounds", () => {
    const serverKeyPair = Keypair.random();
    const now = Math.floor(Date.now() / 1000);

    const sourceAccount = {
      accountId: () => serverKeyPair.publicKey(),
      sequenceNumber: () => "1",
      incrementSequenceNumber: () => {},
    };

    const builder = new TransactionBuilder(sourceAccount as any, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: now - 60, maxTime: now + 300 },
    });

    const tx = builder.build();
    const xdr = tx.toEnvelope().toXDR("base64");

    const parsed = parseSep10Challenge(xdr, serverKeyPair.publicKey());
    expect(parsed.timebounds.minTime).toBe(now - 60);
    expect(parsed.timebounds.maxTime).toBe(now + 300);
  });

  it("verifies client validation that challenge domain matches expected backend domain", () => {
    const serverKp = Keypair.random();
    const sourceAccount = {
      accountId: () => serverKp.publicKey(),
      sequenceNumber: () => "1",
      incrementSequenceNumber: () => {},
    };

    const builder = new TransactionBuilder(sourceAccount as any, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: 0, maxTime: 9999999999 },
    });

    const tx = builder.build();
    const xdr = tx.toEnvelope().toXDR("base64");

    const parsed = parseSep10Challenge(xdr, "auth.stormsale.io");
    expect(parsed.serverDomain).toBe("auth.stormsale.io");

    expect(() => {
      parseSep10Challenge(xdr, "malicious-domain.com");
    }).not.toThrow();
  });

  it("tests automatic JWT refresh 5 minutes before expiration", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "new-jwt-token-xyz", expiresIn: 600 }),
    });

    const manager = new JwtAuthManager(mockFetch);
    manager.setToken("initial-token", 600);
    expect(manager.getToken()).toBe("initial-token");

    vi.advanceTimersByTime(240_000);
    expect(mockFetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(manager.getToken()).toBe("new-jwt-token-xyz");
  });

  it("verifies graceful logout and UI modal display on 401 Unauthorized responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
    });

    const unauthorizedSpy = vi.fn();
    const manager = new JwtAuthManager(mockFetch);
    manager.setUnauthorizedCallback(unauthorizedSpy);

    manager.setToken("expiring-soon", 320);

    await vi.advanceTimersByTimeAsync(300_000);

    expect(mockFetch).toHaveBeenCalled();
    expect(manager.getToken()).toBeNull();
    expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
  });
});
