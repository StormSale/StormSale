import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Account, Keypair, Networks, Operation, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

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
  let serverDomain = "";

  for (const op of tx.operations) {
    if (op.type === "manageData") {
      if (op.name === "client_domain") {
        clientDomain = op.value?.toString() || "";
      } else if (op.name.endsWith(" auth")) {
        serverDomain = op.name.slice(0, -" auth".length);
      }
    }
  }

  const expectedDomain = expectedHomeDomain || expectedServerDomain;
  if (serverDomain !== expectedDomain) {
    throw new Error(
      `Challenge home domain "${serverDomain}" does not match expected "${expectedDomain}"`,
    );
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

  function buildChallenge(homeDomain: string, timebounds: { minTime: number; maxTime: number }) {
    const serverKp = Keypair.random();
    const clientKp = Keypair.random();
    const tx = new TransactionBuilder(new Account(serverKp.publicKey(), "-1"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
      timebounds,
    })
      .addOperation(
        Operation.manageData({
          name: `${homeDomain} auth`,
          value: "a".repeat(64),
          source: clientKp.publicKey(),
        }),
      )
      .addOperation(
        Operation.manageData({
          name: "client_domain",
          value: "wallet.example.com",
          source: clientKp.publicKey(),
        }),
      )
      .build();
    tx.sign(serverKp);
    return tx.toEnvelope().toXDR("base64");
  }

  it("decodes SEP-0010 challenge transaction and verifies valid timebounds", () => {
    const now = Math.floor(Date.now() / 1000);
    const xdr = buildChallenge("auth.stormsale.io", { minTime: now - 60, maxTime: now + 300 });

    const parsed = parseSep10Challenge(xdr, "auth.stormsale.io");
    expect(parsed.timebounds.minTime).toBe(now - 60);
    expect(parsed.timebounds.maxTime).toBe(now + 300);
    expect(parsed.clientDomain).toBe("wallet.example.com");

    const expiredXdr = buildChallenge("auth.stormsale.io", { minTime: now - 900, maxTime: now - 600 });
    expect(() => parseSep10Challenge(expiredXdr, "auth.stormsale.io")).toThrow(/timebounds/);
  });

  it("verifies client validation that challenge domain matches expected backend domain", () => {
    const xdr = buildChallenge("auth.stormsale.io", { minTime: 0, maxTime: 9999999999 });

    const parsed = parseSep10Challenge(xdr, "auth.stormsale.io");
    expect(parsed.serverDomain).toBe("auth.stormsale.io");

    expect(() => {
      parseSep10Challenge(xdr, "malicious-domain.com");
    }).toThrow(/does not match expected/);
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
